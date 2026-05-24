import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { cleanupWorkspace } from "./cleanup-workspace.mjs";

async function createWorkspaceFixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "scratchai-cleanup-"));

  await mkdir(path.join(repoRoot, "node_modules"), { recursive: true });
  await mkdir(path.join(repoRoot, "apps", "desktop-companion", "dist"), { recursive: true });
  await mkdir(path.join(repoRoot, "apps", "desktop-companion", "release-mac-no-key"), {
    recursive: true
  });
  await mkdir(path.join(repoRoot, "apps", "desktop-companion", "release-dmg-no-key"), {
    recursive: true
  });
  await mkdir(path.join(repoRoot, "tools/verification", "tmp-demo"), { recursive: true });
  await mkdir(path.join(repoRoot, "tools/verification", "artifacts"), { recursive: true });
  await mkdir(path.join(repoRoot, "docs", "assets", "screenshots"), { recursive: true });
  await mkdir(path.join(repoRoot, "installers"), { recursive: true });
  await mkdir(path.join(repoRoot, "apps", "desktop-companion", "src"), { recursive: true });

  await writeFile(path.join(repoRoot, "docs", "assets", "screenshots", "shot.png"), "png");
  await writeFile(path.join(repoRoot, "installers", "ScratchDesktopCompanion-mac.dmg"), "dmg");
  await writeFile(path.join(repoRoot, "installers", ".gitkeep"), "");
  await writeFile(path.join(repoRoot, "apps", "desktop-companion", "src", "main.ts"), "keep me");

  return repoRoot;
}

test("cleanupWorkspace dry-run reports generated artifacts without deleting them", async () => {
  const repoRoot = await createWorkspaceFixture();
  const logs = [];

  try {
    const result = await cleanupWorkspace({
      repoRoot,
      dryRun: true,
      log: entry => logs.push(entry)
    });

    assert.equal(result.failedPaths.length, 0);
    assert.ok(result.removedPaths.includes("node_modules"));
    assert.ok(result.removedPaths.includes("apps/desktop-companion/release-mac-no-key"));
    assert.ok(result.removedPaths.includes("apps/desktop-companion/release-dmg-no-key"));
    assert.ok(result.removedPaths.includes("tools/verification/artifacts"));
    assert.ok(result.removedPaths.includes("installers/ScratchDesktopCompanion-mac.dmg"));

    const keptSource = await readFile(
      path.join(repoRoot, "apps", "desktop-companion", "src", "main.ts"),
      "utf8"
    );
    assert.equal(keptSource, "keep me");
    assert.ok(logs.some(entry => entry.includes("[dry-run] remove node_modules")));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("cleanupWorkspace removes generated artifacts and preserves tracked placeholders", async () => {
  const repoRoot = await createWorkspaceFixture();

  try {
    const result = await cleanupWorkspace({ repoRoot });

    assert.equal(result.failedPaths.length, 0);

    await assert.rejects(() => readFile(path.join(repoRoot, "installers", "ScratchDesktopCompanion-mac.dmg")));

    const gitkeep = await readFile(path.join(repoRoot, "installers", ".gitkeep"), "utf8");
    const keptSource = await readFile(
      path.join(repoRoot, "apps", "desktop-companion", "src", "main.ts"),
      "utf8"
    );

    assert.equal(gitkeep, "");
    assert.equal(keptSource, "keep me");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("cleanupWorkspace skips missing paths instead of reporting fake removals", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "scratchai-cleanup-empty-"));
  const logs = [];

  try {
    await mkdir(path.join(repoRoot, "installers"), { recursive: true });
    await writeFile(path.join(repoRoot, "installers", ".gitkeep"), "");

    const result = await cleanupWorkspace({
      repoRoot,
      dryRun: true,
      log: entry => logs.push(entry)
    });

    assert.deepEqual(result.removedPaths, []);
    assert.equal(result.failedPaths.length, 0);
    assert.deepEqual(logs, ["Dry run finished."]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
