import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { copyPathWithRetry } from "../scripts/copy-with-retry.mjs";

async function detectRelativeSymlinkSupport(prefix) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    const targetDir = path.join(rootDir, "target");
    const linkPath = path.join(rootDir, "link");

    await mkdir(targetDir, { recursive: true });
    await symlink("target", linkPath, "dir");
    const target = await readlink(linkPath);

    return {
      supported: target === "target"
    };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("copyPathWithRetry preserves relative symlink targets inside copied directories", async (t) => {
  if (process.platform === "win32") {
    return t.skip("Windows runner does not provide stable relative symlink copy semantics in this check.");
  }

  const symlinkSupport = await detectRelativeSymlinkSupport("copy-path-with-retry-check-");
  if (!symlinkSupport.supported) {
    return t.skip(`relative symlinks are unavailable in this environment: ${symlinkSupport.reason ?? "unsupported"}`);
  }

  const rootDir = await mkdtemp(path.join(os.tmpdir(), "copy-path-with-retry-"));
  const sourceDir = path.join(rootDir, "source");
  const targetDir = path.join(rootDir, "target");

  await mkdir(path.join(sourceDir, "Versions", "A"), { recursive: true });
  await writeFile(path.join(sourceDir, "Versions", "A", "payload.txt"), "ok");
  await symlink("Versions/Current/payload.txt", path.join(sourceDir, "payload.txt"), "file");
  await symlink("A", path.join(sourceDir, "Versions", "Current"), "dir");

  await copyPathWithRetry(sourceDir, targetDir);

  assert.equal(
    String(await readlink(path.join(targetDir, "payload.txt"))).replace(/\\/g, "/"),
    "Versions/Current/payload.txt"
  );
  assert.equal(
    String(await readlink(path.join(targetDir, "Versions", "Current"))).replace(/\\/g, "/"),
    "A"
  );
});

test("copyPathWithRetry retries Windows directory copies without preserveTimestamps after EPERM", async () => {
  const cpCalls = [];
  const rmCalls = [];

  await copyPathWithRetry("C:\\source", "C:\\target", {
    attempts: 1,
    delayMs: 0,
    platform: "win32",
    lstatImpl: async () => ({
      isDirectory: () => true
    }),
    mkdirImpl: async () => {},
    rmImpl: async (...args) => {
      rmCalls.push(args);
    },
    cpImpl: async (_sourcePath, _targetPath, options) => {
      cpCalls.push(options);
      if (options.preserveTimestamps) {
        const error = new Error("utime not permitted");
        error.code = "EPERM";
        throw error;
      }
    }
  });

  assert.equal(cpCalls.length, 2);
  assert.equal(cpCalls[0].preserveTimestamps, true);
  assert.equal(cpCalls[1].preserveTimestamps, false);
  assert.equal(cpCalls[0].verbatimSymlinks, true);
  assert.equal(cpCalls[1].verbatimSymlinks, true);
  assert.equal(rmCalls.length, 2);
});
