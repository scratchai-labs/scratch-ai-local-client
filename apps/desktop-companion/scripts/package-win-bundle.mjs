import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { copyFileWithRetry, copyPathWithRetry } from "./copy-with-retry.mjs";
import { getWindowsDistributionArtifactInfo } from "./package-artifact-layout.mjs";
import {
  PACKAGED_KEY_MODE_ENV_NAME,
  getPackageVariantMeta,
  resolvePackagedDeepSeekConfig,
  runBuildForVariant
} from "./package-variant.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const thisFilePath = fileURLToPath(import.meta.url);
const appDir = path.resolve(__dirname, "..");
const bundleRootDir = path.join(appDir, "release-bundles");
const rootInstallersDir = path.resolve(appDir, "..", "..", "installers");

function formatTimestampPart(value) {
  return String(value).padStart(2, "0");
}

function getBundleTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = formatTimestampPart(now.getMonth() + 1);
  const day = formatTimestampPart(now.getDate());
  const hour = formatTimestampPart(now.getHours());
  const minute = formatTimestampPart(now.getMinutes());
  const second = formatTimestampPart(now.getSeconds());
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

export function getSourceConfigPath() {
  return path.join(appDir, "src", "main", "deepseek.config.json");
}

export function getArtifactBuildInfo(kind, variant) {
  const variantMeta = getPackageVariantMeta(variant);
  const distributionInfo = getWindowsDistributionArtifactInfo(variant);
  const outputDirName =
    kind === "installer"
      ? `release-installer${variantMeta.outputDirSuffix}`
      : `release-single${variantMeta.outputDirSuffix}`;
  const artifactFileName =
    kind === "installer"
      ? `${variantMeta.artifactBaseName}-setup.exe`
      : `${variantMeta.artifactBaseName}-portable.exe`;
  const bundleFileName =
    kind === "installer"
      ? distributionInfo.installerFileName
      : distributionInfo.portableFileName;
  const scriptFileName =
    kind === "installer" ? "package-win-installer.mjs" : "package-win-single.mjs";
  const outputDir = path.join(appDir, outputDirName);

  return {
    kind,
    variant,
    artifactFileName,
    bundleFileName,
    outputDir,
    outputPath: path.join(outputDir, artifactFileName),
    scriptPath: path.join(__dirname, scriptFileName),
    rootArtifactPath: path.join(rootInstallersDir, bundleFileName),
    unpackedSourcePath:
      kind === "portable" ? path.join(outputDir, "win-unpacked") : null,
    rootUnpackedPath:
      kind === "portable"
        ? path.join(rootInstallersDir, distributionInfo.unpackedDirName)
        : null
  };
}

export function buildBundleSubprocessArgs(buildInfo) {
  return [
    buildInfo.scriptPath,
    `--variant=${buildInfo.variant}`,
    "--skip-build",
    "--skip-installers-copy"
  ];
}

function ensureWithKeyVariantCanBuild(sourceConfig) {
  resolvePackagedDeepSeekConfig(sourceConfig, {
    ...process.env,
    [PACKAGED_KEY_MODE_ENV_NAME]: "with-key"
  });
}

async function getSha256(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function getReleaseSummaryLines({ generatedAt, bundleDir, artifacts }) {
  return [
    "# Scratch AI 教练桌面工具 Release Notes",
    "",
    `- Generated at: ${generatedAt}`,
    `- Bundle directory: \`${bundleDir}\``,
    `- Current flow: 选择 Scratch 软件 -> 打开已选 Scratch -> 连接当前作品 -> 生成下一步提示`,
    "",
    "## Included artifacts",
    ...artifacts.map(
      (artifact) => `- \`${artifact.bundleFileName}\` (${artifact.variant}, ${artifact.kind})`
    )
  ];
}

export async function main() {
  const sourceConfig = JSON.parse(await readFile(getSourceConfigPath(), "utf8"));

  ensureWithKeyVariantCanBuild(sourceConfig);

  const bundleTimestamp = getBundleTimestamp();
  const bundleDir = path.join(bundleRootDir, bundleTimestamp);

  await mkdir(bundleDir, { recursive: true });
  await mkdir(rootInstallersDir, { recursive: true });

  const buildPlan = [
    { kind: "installer", variant: "no-key" },
    { kind: "portable", variant: "no-key" },
    { kind: "installer", variant: "with-key" },
    { kind: "portable", variant: "with-key" }
  ];

  const artifacts = [];

  for (const variant of ["no-key", "with-key"]) {
    runBuildForVariant(appDir, variant);

    for (const kind of ["installer", "portable"]) {
      const buildInfo = getArtifactBuildInfo(kind, variant);

      execFileSync(process.execPath, buildBundleSubprocessArgs(buildInfo), {
        cwd: appDir,
        stdio: "inherit",
        env: process.env
      });

      const bundleArtifactPath = path.join(bundleDir, buildInfo.bundleFileName);

      await copyFileWithRetry(buildInfo.outputPath, bundleArtifactPath);
      await copyFileWithRetry(buildInfo.outputPath, buildInfo.rootArtifactPath);

      if (buildInfo.unpackedSourcePath && buildInfo.rootUnpackedPath) {
        await copyPathWithRetry(buildInfo.unpackedSourcePath, buildInfo.rootUnpackedPath);
      }

      const sha256 = await getSha256(bundleArtifactPath);

      artifacts.push({
        kind,
        variant,
        sourceFileName: buildInfo.artifactFileName,
        bundleFileName: buildInfo.bundleFileName,
        buildOutputDir: buildInfo.outputDir,
        bundlePath: bundleArtifactPath,
        rootArtifactPath: buildInfo.rootArtifactPath,
        rootUnpackedPath: buildInfo.rootUnpackedPath,
        sha256
      });
    }
  }

  const generatedAt = new Date().toISOString();

  await writeFile(
    path.join(bundleDir, "manifest.json"),
    `${JSON.stringify(
      {
        generatedAt,
        bundleDir,
        rootInstallersDir,
        buildPlan,
        artifacts
      },
      null,
      2
    )}\n`
  );

  const sha256Lines = artifacts.map(
    (artifact) => `${artifact.sha256} *${artifact.bundleFileName}`
  );
  const releaseNotes = `${getReleaseSummaryLines({
    generatedAt,
    bundleDir,
    artifacts
  }).join("\n")}\n`;

  await writeFile(path.join(bundleDir, "SHA256SUMS.txt"), `${sha256Lines.join("\n")}\n`);
  await writeFile(path.join(bundleDir, "RELEASE-NOTES.md"), releaseNotes);
  await writeFile(
    path.join(rootInstallersDir, "SHA256SUMS.txt"),
    `${sha256Lines.join("\n")}\n`
  );
  await writeFile(path.join(rootInstallersDir, "RELEASE-NOTES.md"), releaseNotes);

  process.stdout.write(`Bundle written to ${bundleDir}\n`);
  process.stdout.write(`Latest distributables copied to ${rootInstallersDir}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFilePath) {
  await main();
}
