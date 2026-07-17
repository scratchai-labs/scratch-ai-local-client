import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor() {
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.hidden = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get("click")?.();
  }
}

function createSettingsDom() {
  const ids = [
    "settings-status",
    "settings-custom-ai-api-key",
    "settings-save-custom-ai-api-key-button",
    "settings-test-custom-ai-api-key-button",
    "settings-clear-custom-ai-api-key-button",
    "settings-custom-ai-model",
    "settings-save-custom-ai-model-button",
    "settings-ai-hint-trigger-mode",
    "settings-save-ai-hint-trigger-mode-button",
    "settings-error",
    "settings-feedback"
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement()]));
  return {
    elements,
    document: {
      getElementById(id) {
        return elements.get(id) ?? null;
      }
    }
  };
}

function createState(overrides = {}) {
  return {
    status: "connected",
    statusText: "已连接到 Scratch Desktop",
    aiConfigured: true,
    aiCustomKeyConfigured: true,
    aiStatus: "idle",
    aiModel: "deepseek-v4-flash",
    aiHintTriggerMode: "auto",
    ...overrides
  };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("settings keeps clear-key disabled after the saved key is cleared", async () => {
  const { document, elements } = createSettingsDom();
  let stateListener = null;
  const clearedState = createState({
    aiConfigured: false,
    aiCustomKeyConfigured: false
  });

  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = {
    setTimeout(callback) {
      callback();
      return 0;
    },
    desktopCompanionApi: {
      getInitialState: async () => createState(),
      onStateChange(listener) {
        stateListener = listener;
        return () => {};
      },
      clearCustomAiApiKey: async () => {
        stateListener?.(clearedState);
      }
    }
  };

  try {
    await import(`../dist/settings-renderer.js?clear-key-test=${Date.now()}`);
    await flushPromises();

    const clearButton = elements.get("settings-clear-custom-ai-api-key-button");
    assert.equal(clearButton.disabled, false);

    clearButton.click();
    await flushPromises();

    assert.equal(clearButton.disabled, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
