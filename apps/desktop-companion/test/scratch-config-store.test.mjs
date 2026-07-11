import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";

import { ScratchExecutableConfigStore } from "../dist/scratch-config-store.js";

async function withTempStore(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "scratch-config-store-test-"));

  try {
    return await run({
      tempDir,
      configPath: path.join(tempDir, "desktop-companion.config.json"),
      store: new ScratchExecutableConfigStore(tempDir)
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function modeBits(stats) {
  return stats.mode & 0o777;
}

test("ScratchExecutableConfigStore writes POSIX configs with user-only permissions", async () => {
  await withTempStore(async ({ configPath, store }) => {
    await store.saveCustomAiApiKey("sk-test-secret");

    if (process.platform !== "win32") {
      assert.equal(modeBits(await stat(configPath)), 0o600);
    }
  });
});

test("ScratchExecutableConfigStore tightens permissions on existing configs", async () => {
  await withTempStore(async ({ configPath, store }) => {
    await writeFile(
      configPath,
      JSON.stringify({ customAiApiKey: "sk-old-secret", aiHintTriggerMode: "manual" }, null, 2),
      { encoding: "utf8", mode: 0o644 }
    );

    await store.saveScratchExecutablePath("/Applications/Scratch.app/Contents/MacOS/Scratch");

    if (process.platform !== "win32") {
      assert.equal(modeBits(await stat(configPath)), 0o600);
    }
  });
});

test("ScratchExecutableConfigStore removes the custom API key field when clearing", async () => {
  await withTempStore(async ({ configPath, store }) => {
    await store.saveCustomAiApiKey("sk-test-secret");
    await store.clearCustomAiApiKey();

    const rawConfig = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(Object.hasOwn(rawConfig, "customAiApiKey"), false);
  });
});

test("ScratchExecutableConfigStore saves the last observed Scratch locale", async () => {
  await withTempStore(async ({ configPath, store }) => {
    await store.saveScratchExecutablePath("/Applications/Scratch.app/Contents/MacOS/Scratch");
    await store.saveLastScratchLocale("ko");

    const rawConfig = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(rawConfig.lastScratchLocale, "ko");
    assert.equal((await store.load()).lastScratchLocale, "ko");
  });
});
