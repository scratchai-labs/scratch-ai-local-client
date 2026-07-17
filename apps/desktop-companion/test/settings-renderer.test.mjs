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
  const labels = {
    "settings-save-custom-ai-api-key-button": "保存 Key",
    "settings-test-custom-ai-api-key-button": "测试 Key",
    "settings-clear-custom-ai-api-key-button": "清除 Key",
    "settings-save-custom-ai-model-button": "保存模型",
    "settings-save-ai-hint-trigger-mode-button": "保存触发方式"
  };
  for (const [id, label] of Object.entries(labels)) {
    elements.get(id).textContent = label;
  }
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


function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function loadSettingsRenderer({ apiOverrides = {}, state = createState() } = {}) {
  const { document, elements } = createSettingsDom();
  let stateListener = null;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = {
    desktopCompanionApi: {
      getInitialState: async () => state,
      onStateChange(listener) {
        stateListener = listener;
        return () => {};
      },
      saveCustomAiApiKey: async () => {},
      testCustomAiApiKey: async () => "Key 可以使用。",
      clearCustomAiApiKey: async () => {},
      saveCustomAiModel: async () => {},
      saveAiHintTriggerMode: async () => {},
      ...apiOverrides
    }
  };

  await import(`../dist/settings-renderer.js?busy-state-test=${Date.now()}-${Math.random()}`);
  await flushPromises();

  return {
    elements,
    emitState(nextState) {
      stateListener?.(nextState);
    },
    cleanup() {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  };
}

const actionCases = [
  {
    name: "测试 Key",
    buttonId: "settings-test-custom-ai-api-key-button",
    method: "testCustomAiApiKey",
    busyLabel: "测试中…",
    inputValue: "sk-test",
    result: "Key 可以使用。"
  },
  {
    name: "保存 Key",
    buttonId: "settings-save-custom-ai-api-key-button",
    method: "saveCustomAiApiKey",
    busyLabel: "保存中…",
    inputValue: "sk-test"
  },
  {
    name: "清除 Key",
    buttonId: "settings-clear-custom-ai-api-key-button",
    method: "clearCustomAiApiKey",
    busyLabel: "清除中…",
    cleared: true
  },
  {
    name: "保存模型",
    buttonId: "settings-save-custom-ai-model-button",
    method: "saveCustomAiModel",
    busyLabel: "保存中…"
  },
  {
    name: "保存触发方式",
    buttonId: "settings-save-ai-hint-trigger-mode-button",
    method: "saveAiHintTriggerMode",
    busyLabel: "保存中…"
  }
];

const actionButtonIds = actionCases.map(({ buttonId }) => buttonId);

test("settings keeps every async action visibly busy and locked until it settles", async (t) => {
  for (const actionCase of actionCases) {
    await t.test(actionCase.name, async () => {
      const deferred = createDeferred();
      let emitState = () => {};
      const apiOverrides = {
        [actionCase.method]: () =>
          deferred.promise.then((result) => {
            if (actionCase.cleared) {
              emitState(
                createState({
                  aiConfigured: false,
                  aiCustomKeyConfigured: false
                })
              );
            }
            return result;
          })
      };
      const harness = await loadSettingsRenderer({ apiOverrides });
      emitState = harness.emitState;

      try {
        if (actionCase.inputValue) {
          harness.elements.get("settings-custom-ai-api-key").value = actionCase.inputValue;
        }

        const actionButton = harness.elements.get(actionCase.buttonId);
        actionButton.click();
        await flushPromises();

        assert.equal(actionButton.textContent, actionCase.busyLabel);
        for (const buttonId of actionButtonIds) {
          assert.equal(harness.elements.get(buttonId).disabled, true, `${buttonId} should stay disabled`);
        }
        assert.equal(harness.elements.get("settings-custom-ai-api-key").disabled, true);
        assert.equal(harness.elements.get("settings-custom-ai-model").disabled, true);
        assert.equal(harness.elements.get("settings-ai-hint-trigger-mode").disabled, true);

        deferred.resolve(actionCase.result);
        await flushPromises();

        assert.equal(actionButton.textContent, actionCase.name);
        for (const buttonId of actionButtonIds) {
          const shouldStayDisabled = Boolean(actionCase.cleared && buttonId === "settings-clear-custom-ai-api-key-button");
          assert.equal(harness.elements.get(buttonId).disabled, shouldStayDisabled, `${buttonId} restored incorrectly`);
        }
      } finally {
        harness.cleanup();
      }
    });
  }
});

test("settings restores the action label and controls after an async failure", async () => {
  const deferred = createDeferred();
  const harness = await loadSettingsRenderer({
    apiOverrides: {
      testCustomAiApiKey: () => deferred.promise
    }
  });

  try {
    const testButton = harness.elements.get("settings-test-custom-ai-api-key-button");
    testButton.click();
    await flushPromises();

    assert.equal(testButton.textContent, "测试中…");
    assert.equal(testButton.disabled, true);

    deferred.reject(new Error("Key 不能使用。"));
    await flushPromises();

    assert.equal(testButton.textContent, "测试 Key");
    assert.equal(testButton.disabled, false);
    assert.equal(harness.elements.get("settings-error").textContent, "Key 不能使用。");
    assert.equal(harness.elements.get("settings-error").hidden, false);
    assert.equal(harness.elements.get("settings-feedback").hidden, true);
  } finally {
    harness.cleanup();
  }
});
