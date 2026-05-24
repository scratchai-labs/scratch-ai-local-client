import { lstat, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "..");

const EXACT_PATHS = [
  "node_modules",
  "packages/shared/node_modules",
  "tools/verification/node_modules",
  "apps/desktop-companion/node_modules",
  "apps/desktop-companion/dist",
  "apps/desktop-companion/release-single",
  "apps/desktop-companion/release-installer",
  "apps/desktop-companion/release-bundles",
  "tools/verification/artifacts",
  "tools/verification/generated"
];

const PREFIX_MATCHES = [
  {
    relativeDir: "apps/desktop-companion",
    prefix: "release-mac"
  },
  {
    relativeDir: "apps/desktop-companion",
    prefix: "release-dmg"
  },
  {
    relativeDir: "tools/verification",
    prefix: "tmp-"
  },
  {
    relativeDir: "tools/verification",
    prefix: "last-"
  }
];

function getRelativePath(repoRoot, absolutePath) {
  const relativePath = path.relative(repoRoot, absolutePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : absolutePath;
}

function isPngFile(entryName) {
  return entryName.toLowerCase().endsWith(".png");
}

async function collectChildrenMatchingPrefix(repoRoot, relativeDir, prefix) {
  const absoluteDir = path.join(repoRoot, relativeDir);

  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.name.startsWith(prefix))
      .map(entry => path.join(absoluteDir, entry.name));
  } catch {
    return [];
  }
}

async function pathExists(absolutePath) {
  try {
    await lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function collectPngScreenshots(repoRoot) {
  const screenshotsDir = path.join(repoRoot, "docs", "assets", "screenshots");

  try {
    const entries = await readdir(screenshotsDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && isPngFile(entry.name))
      .map(entry => path.join(screenshotsDir, entry.name));
  } catch {
    return [];
  }
}

async function collectInstallerArtifacts(repoRoot) {
  const installersDir = path.join(repoRoot, "installers");

  try {
    const entries = await readdir(installersDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.name !== ".gitkeep")
      .map(entry => path.join(installersDir, entry.name));
  } catch {
    return [];
  }
}

async function removePathWithRetry(absolutePath) {
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await rm(absolutePath, { recursive: true, force: true });
      return null;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  return lastError;
}

async function collectRemovalCandidates(repoRoot) {
  const candidates = new Map();

  for (const relativePath of EXACT_PATHS) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (await pathExists(absolutePath)) {
      candidates.set(absolutePath, relativePath);
    }
  }

  for (const match of PREFIX_MATCHES) {
    const matches = await collectChildrenMatchingPrefix(repoRoot, match.relativeDir, match.prefix);
    for (const absolutePath of matches) {
      candidates.set(absolutePath, getRelativePath(repoRoot, absolutePath));
    }
  }

  const screenshots = await collectPngScreenshots(repoRoot);
  for (const absolutePath of screenshots) {
    candidates.set(absolutePath, getRelativePath(repoRoot, absolutePath));
  }

  const installers = await collectInstallerArtifacts(repoRoot);
  for (const absolutePath of installers) {
    candidates.set(absolutePath, getRelativePath(repoRoot, absolutePath));
  }

  return [...candidates.entries()]
    .map(([absolutePath, relativePath]) => ({ absolutePath, relativePath }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function cleanupWorkspace({
  repoRoot = defaultRepoRoot,
  dryRun = false,
  log = message => process.stdout.write(`${message}\n`)
} = {}) {
  const candidates = await collectRemovalCandidates(repoRoot);
  const removedPaths = [];
  const failedPaths = [];

  for (const candidate of candidates) {
    if (dryRun) {
      log(`[dry-run] remove ${candidate.relativePath}`);
      removedPaths.push(candidate.relativePath);
      continue;
    }

    const removeError = await removePathWithRetry(candidate.absolutePath);
    if (removeError) {
      failedPaths.push(candidate.relativePath);
      log(
        `[warning] Could not remove ${candidate.relativePath} after multiple attempts: ${removeError.message}`
      );
      continue;
    }

    removedPaths.push(candidate.relativePath);
    log(`[removed] ${candidate.relativePath}`);
  }

  if (dryRun) {
    log("Dry run finished.");
  } else if (failedPaths.length > 0) {
    if (removedPaths.length > 0) {
      log(`Removed ${removedPaths.length} generated workspace artifact(s).`);
    }
    log(`Still locked or unavailable: ${failedPaths.join(", ")}`);
  } else if (removedPaths.length === 0) {
    log("No generated workspace artifacts were found.");
  } else {
    log(`Removed ${removedPaths.length} generated workspace artifact(s).`);
  }

  return {
    removedPaths,
    failedPaths,
    dryRun
  };
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const dryRun = argv.has("--dry-run");
  const result = await cleanupWorkspace({ dryRun });
  if (!dryRun && result.failedPaths.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
