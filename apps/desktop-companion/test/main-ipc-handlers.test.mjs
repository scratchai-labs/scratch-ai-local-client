import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const IPC_CHANNELS = [
  "desktop-companion:get-state",
  "desktop-companion:retry",
  "desktop-companion:launch-scratch",
  "desktop-companion:open-settings",
  "desktop-companion:request-ai-hint",
  "desktop-companion:save-custom-ai-api-key",
  "desktop-companion:test-custom-ai-api-key",
  "desktop-companion:clear-custom-ai-api-key",
  "desktop-companion:save-custom-ai-model",
  "desktop-companion:save-ai-hint-trigger-mode",
  "desktop-companion:save-lesson-goal",
  "desktop-companion:save-custom-ai-prompt",
  "desktop-companion:clear-custom-ai-prompt",
  "desktop-companion:choose-scratch-executable"
];

async function loadDesktopIpcModule() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-ipc-test-"));
  const outfile = path.join(tempDir, "desktop-ipc.mjs");

  try {
    await build({
      entryPoints: [fileURLToPath(new URL("../src/main/desktop-ipc.ts", import.meta.url))],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      logLevel: "silent"
    });
    return await import(`${pathToFileURL(outfile).href}?cache=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createIpcMainProbe() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        assert.equal(handlers.has(channel), false, `duplicate IPC channel: ${channel}`);
        handlers.set(channel, handler);
      }
    },
    invoke(channel, ...args) {
      const handler = handlers.get(channel);
      assert.ok(handler, `missing IPC channel: ${channel}`);
      return handler({ sender: "renderer" }, ...args);
    }
  };
}

function createActionProbe(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => {
    calls.push([name, ...args]);
    return result;
  };

  return {
    calls,
    actions: {
      getState: () => ({ statusText: "connected" }),
      retry: record("retry"),
      launchScratch: record("launchScratch"),
      openSettings: record("openSettings"),
      requestAiHint: record("requestAiHint"),
      saveCustomAiApiKey: record("saveCustomAiApiKey"),
      testCustomAiApiKey: record("testCustomAiApiKey", "Key 可用"),
      clearCustomAiApiKey: record("clearCustomAiApiKey"),
      saveCustomAiModel: record("saveCustomAiModel"),
      saveAiHintTriggerMode: record("saveAiHintTriggerMode"),
      saveLessonGoal: record("saveLessonGoal"),
      saveCustomAiPrompt: record("saveCustomAiPrompt"),
      clearCustomAiPrompt: record("clearCustomAiPrompt"),
      chooseScratchExecutable: record(
        "chooseScratchExecutable",
        "/Applications/Scratch 3.app"
      ),
      ...overrides
    }
  };
}

const { registerDesktopIpcHandlers } = await loadDesktopIpcModule();

test("registerDesktopIpcHandlers registers the complete preload channel contract once", () => {
  const probe = createIpcMainProbe();
  const { actions } = createActionProbe();

  registerDesktopIpcHandlers(probe.ipcMain, actions);

  assert.deepEqual([...probe.handlers.keys()], IPC_CHANNELS);
});

test("Scratch and window IPC handlers forward actions and preserve return values", async () => {
  const probe = createIpcMainProbe();
  const state = { statusText: "ready" };
  const { actions, calls } = createActionProbe({ getState: () => state });
  registerDesktopIpcHandlers(probe.ipcMain, actions);

  assert.equal(await probe.invoke("desktop-companion:get-state"), state);
  await probe.invoke("desktop-companion:retry");
  await probe.invoke("desktop-companion:launch-scratch");
  await probe.invoke("desktop-companion:open-settings");
  assert.equal(
    await probe.invoke("desktop-companion:choose-scratch-executable"),
    "/Applications/Scratch 3.app"
  );

  assert.deepEqual(calls, [
    ["retry"],
    ["launchScratch"],
    ["openSettings"],
    ["chooseScratchExecutable"]
  ]);
});

test("AI and coaching IPC handlers forward renderer arguments", async () => {
  const probe = createIpcMainProbe();
  const { actions, calls } = createActionProbe();
  registerDesktopIpcHandlers(probe.ipcMain, actions);

  await probe.invoke("desktop-companion:request-ai-hint", "完善碰撞反馈");
  await probe.invoke("desktop-companion:save-custom-ai-api-key", "sk-test");
  assert.equal(await probe.invoke("desktop-companion:test-custom-ai-api-key"), "Key 可用");
  await probe.invoke("desktop-companion:clear-custom-ai-api-key");
  await probe.invoke("desktop-companion:save-custom-ai-model", "deepseek-chat");
  await probe.invoke("desktop-companion:save-ai-hint-trigger-mode", "manual");
  await probe.invoke("desktop-companion:save-lesson-goal", "完成追逐游戏");
  await probe.invoke("desktop-companion:save-custom-ai-prompt", "一次只提示一步");
  await probe.invoke("desktop-companion:clear-custom-ai-prompt");

  assert.deepEqual(calls, [
    ["requestAiHint", "完善碰撞反馈"],
    ["saveCustomAiApiKey", "sk-test"],
    ["testCustomAiApiKey", undefined],
    ["clearCustomAiApiKey"],
    ["saveCustomAiModel", "deepseek-chat"],
    ["saveAiHintTriggerMode", "manual"],
    ["saveLessonGoal", "完成追逐游戏"],
    ["saveCustomAiPrompt", "一次只提示一步"],
    ["clearCustomAiPrompt"]
  ]);
});

test("IPC handler rejects with the original dependency error", async () => {
  const probe = createIpcMainProbe();
  const expectedError = new Error("Scratch reconnect failed");
  const { actions } = createActionProbe({
    retry: async () => {
      throw expectedError;
    }
  });
  registerDesktopIpcHandlers(probe.ipcMain, actions);

  await assert.rejects(probe.invoke("desktop-companion:retry"), (error) => {
    assert.equal(error, expectedError);
    return true;
  });
});
