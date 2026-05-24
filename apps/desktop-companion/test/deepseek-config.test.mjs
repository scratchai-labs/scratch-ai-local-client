import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { loadDeepSeekConfig } from "../dist/deepseek-config.js";

async function withTempConfig(config, run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "deepseek-config-test-"));
  const configPath = path.join(tempDir, "deepseek.config.json");

  try {
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    return await run(configPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function restoreEnv(originalValue) {
  if (typeof originalValue === "string") {
    process.env.DEEPSEEK_API_KEY = originalValue;
    return;
  }

  delete process.env.DEEPSEEK_API_KEY;
}

test("loadDeepSeekConfig prefers a saved custom key over env and packaged config", async () => {
  const originalEnvValue = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "sk-env-demo";

  try {
    await withTempConfig(
      {
        apiKey: "sk-packaged-demo",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com/",
        timeoutMs: "26000"
      },
      async (configPath) => {
        const config = await loadDeepSeekConfig(configPath, {
          customApiKey: "  sk-custom-demo  ",
          customModel: "deepseek-v4-flash"
        });

        assert.equal(config.configured, true);
        assert.equal(config.apiKey, "sk-custom-demo");
        assert.equal(config.source, "custom");
        assert.equal(config.customKeyConfigured, true);
        assert.equal(config.model, "deepseek-v4-flash");
        assert.equal(config.baseUrl, "https://api.deepseek.com");
        assert.equal(config.timeoutMs, 26000);
      }
    );
  } finally {
    restoreEnv(originalEnvValue);
  }
});

test("loadDeepSeekConfig ignores env and packaged apiKey when no custom key is saved", async () => {
  const originalEnvValue = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "  sk-env-demo  ";

  try {
    await withTempConfig(
      {
        apiKey: "sk-packaged-demo",
        model: "deepseek-v4-flash"
      },
      async (configPath) => {
        const config = await loadDeepSeekConfig(configPath);

        assert.equal(config.configured, false);
        assert.equal(config.apiKey, undefined);
        assert.equal(config.source, undefined);
        assert.equal(config.customKeyConfigured, false);
        assert.equal(config.model, "deepseek-v4-flash");
      }
    );
  } finally {
    restoreEnv(originalEnvValue);
  }
});

test("loadDeepSeekConfig keeps the DeepSeek V4 default model when no valid key is configured", async () => {
  const originalEnvValue = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  try {
    await withTempConfig(
      {
        apiKey: "PLEASE_FILL_DEEPSEEK_API_KEY"
      },
      async (configPath) => {
        const config = await loadDeepSeekConfig(configPath);

        assert.equal(config.configured, false);
        assert.equal(config.apiKey, undefined);
        assert.equal(config.source, undefined);
        assert.equal(config.customKeyConfigured, false);
        assert.equal(config.model, "deepseek-v4-flash");
        assert.equal(config.baseUrl, "https://api.deepseek.com");
        assert.equal(config.timeoutMs, 20000);
      }
    );
  } finally {
    restoreEnv(originalEnvValue);
  }
});

test("loadDeepSeekConfig prefers a saved custom model over packaged model even without a key", async () => {
  await withTempConfig(
    {
      apiKey: "PLEASE_FILL_DEEPSEEK_API_KEY",
      model: "deepseek-v4-pro"
    },
    async (configPath) => {
      const config = await loadDeepSeekConfig(configPath, {
        customModel: "deepseek-v4-flash"
      });

      assert.equal(config.configured, false);
      assert.equal(config.model, "deepseek-v4-flash");
      assert.equal(config.apiKey, undefined);
    }
  );
});
