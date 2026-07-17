import { desktopCompanionStateSchema } from "@scratch-ai/shared";

import { DEFAULT_DEEPSEEK_MODEL, normalizeDeepSeekModel } from "../common/deepseek";
import { normalizeAiHintTriggerMode } from "../common/types";
import type { DesktopCompanionApi } from "../common/desktop-companion-api";
import type { DesktopCompanionState } from "../common/types";

declare global {
  interface Window {
    desktopCompanionApi?: DesktopCompanionApi;
  }
}

const statusElement = document.getElementById("settings-status");
const customAiApiKeyInput = document.getElementById("settings-custom-ai-api-key") as HTMLInputElement | null;
const saveCustomAiApiKeyButton = document.getElementById(
  "settings-save-custom-ai-api-key-button"
) as HTMLButtonElement | null;
const testCustomAiApiKeyButton = document.getElementById(
  "settings-test-custom-ai-api-key-button"
) as HTMLButtonElement | null;
const clearCustomAiApiKeyButton = document.getElementById(
  "settings-clear-custom-ai-api-key-button"
) as HTMLButtonElement | null;
const customAiModelSelect = document.getElementById("settings-custom-ai-model") as HTMLSelectElement | null;
const saveCustomAiModelButton = document.getElementById(
  "settings-save-custom-ai-model-button"
) as HTMLButtonElement | null;
const aiHintTriggerModeSelect = document.getElementById(
  "settings-ai-hint-trigger-mode"
) as HTMLSelectElement | null;
const saveAiHintTriggerModeButton = document.getElementById(
  "settings-save-ai-hint-trigger-mode-button"
) as HTMLButtonElement | null;
const errorElement = document.getElementById("settings-error");
const feedbackElement = document.getElementById("settings-feedback");

let latestState: DesktopCompanionState | null = null;
type PendingAction = "save-key" | "test-key" | "clear-key" | "save-model" | "save-hint-mode";
let pendingAction: PendingAction | null = null;

const actionButtons = [
  saveCustomAiApiKeyButton,
  testCustomAiApiKeyButton,
  clearCustomAiApiKeyButton,
  saveCustomAiModelButton,
  saveAiHintTriggerModeButton
];

function getDesktopCompanionApi() {
  if (!window.desktopCompanionApi) {
    throw new Error("预加载脚本没有就绪，请退出旧实例后重新打开设置窗口。");
  }
  return window.desktopCompanionApi;
}

function hideMessage(element: HTMLElement | null) {
  if (!element) {
    return;
  }
  element.textContent = "";
  element.hidden = true;
}

function clearMessages() {
  hideMessage(feedbackElement);
  hideMessage(errorElement);
}

function showMessage(message: string, kind: "error" | "success") {
  clearMessages();
  const target = kind === "error" ? errorElement : feedbackElement;
  if (!target) {
    return;
  }
  target.textContent = message;
  target.dataset.kind = kind;
  target.hidden = false;
}

function normalizeState(rawState: unknown): DesktopCompanionState {
  return desktopCompanionStateSchema.parse(rawState);
}

function renderControls() {
  const controlsLocked = latestState?.aiStatus === "loading" || pendingAction !== null;

  if (customAiApiKeyInput) {
    customAiApiKeyInput.disabled = controlsLocked;
  }

  for (const button of actionButtons) {
    if (button) {
      button.disabled = controlsLocked;
    }
  }

  if (clearCustomAiApiKeyButton) {
    clearCustomAiApiKeyButton.disabled = controlsLocked || !latestState?.aiCustomKeyConfigured;
  }

  if (customAiModelSelect) {
    customAiModelSelect.disabled = controlsLocked;
  }

  if (aiHintTriggerModeSelect) {
    aiHintTriggerModeSelect.disabled = controlsLocked;
  }

  if (saveCustomAiApiKeyButton) {
    saveCustomAiApiKeyButton.textContent = pendingAction === "save-key" ? "保存中…" : "保存 Key";
  }
  if (testCustomAiApiKeyButton) {
    testCustomAiApiKeyButton.textContent = pendingAction === "test-key" ? "测试中…" : "测试 Key";
  }
  if (clearCustomAiApiKeyButton) {
    clearCustomAiApiKeyButton.textContent = pendingAction === "clear-key" ? "清除中…" : "清除 Key";
  }
  if (saveCustomAiModelButton) {
    saveCustomAiModelButton.textContent = pendingAction === "save-model" ? "保存中…" : "保存模型";
  }
  if (saveAiHintTriggerModeButton) {
    saveAiHintTriggerModeButton.textContent = pendingAction === "save-hint-mode" ? "保存中…" : "保存触发方式";
  }
}

function beginAction(action: PendingAction) {
  if (pendingAction) {
    return false;
  }
  pendingAction = action;
  clearMessages();
  renderControls();
  return true;
}

function finishAction() {
  pendingAction = null;
  renderControls();
}

function renderState(state: DesktopCompanionState) {
  latestState = state;
  if (statusElement) {
    statusElement.textContent = state.aiConfigured
      ? "已检测到本机可用 DeepSeek Key"
      : "当前还没有保存本机 DeepSeek Key";
  }

  if (customAiModelSelect) {
    customAiModelSelect.value = normalizeDeepSeekModel(state.aiCustomModel ?? state.aiModel);
  }

  if (aiHintTriggerModeSelect) {
    aiHintTriggerModeSelect.value = normalizeAiHintTriggerMode(state.aiHintTriggerMode);
  }

  renderControls();
}

saveCustomAiApiKeyButton?.addEventListener("click", () => {
  if (!beginAction("save-key")) {
    return;
  }
  const apiKey = customAiApiKeyInput?.value?.trim() ?? "";

  void Promise.resolve()
    .then(() => {
      if (!apiKey) {
        throw new Error("请先输入自定义 DeepSeek API Key。");
      }

      return getDesktopCompanionApi().saveCustomAiApiKey(apiKey);
    })
    .then(() => {
      if (customAiApiKeyInput) {
        customAiApiKeyInput.value = "";
      }

      showMessage("已保存本机 DeepSeek API Key，并切换为手动点击提示。", "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "保存自定义 DeepSeek API Key 失败，请查看日志。", "error");
    })
    .finally(finishAction);
});

testCustomAiApiKeyButton?.addEventListener("click", () => {
  if (!beginAction("test-key")) {
    return;
  }
  const apiKey = customAiApiKeyInput?.value?.trim() ?? "";

  void Promise.resolve()
    .then(() => getDesktopCompanionApi().testCustomAiApiKey(apiKey || undefined))
    .then((message) => {
      showMessage(message, "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "测试 DeepSeek API Key 失败，请查看日志。", "error");
    })
    .finally(finishAction);
});

clearCustomAiApiKeyButton?.addEventListener("click", () => {
  if (!beginAction("clear-key")) {
    return;
  }

  void Promise.resolve()
    .then(() => getDesktopCompanionApi().clearCustomAiApiKey())
    .then(() => {
      if (customAiApiKeyInput) {
        customAiApiKeyInput.value = "";
      }

      showMessage("已清除本机 DeepSeek API Key。当前只会临时给一次基础提示，之后会提醒你先补 Key。", "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "清除自定义 DeepSeek API Key 失败，请查看日志。", "error");
    })
    .finally(finishAction);
});

saveCustomAiModelButton?.addEventListener("click", () => {
  if (!beginAction("save-model")) {
    return;
  }
  const model = normalizeDeepSeekModel(customAiModelSelect?.value);

  void Promise.resolve()
    .then(() => getDesktopCompanionApi().saveCustomAiModel(model))
    .then(() => {
      showMessage(`已保存模型：${model}。`, "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "保存模型失败，请查看日志。", "error");
    })
    .finally(finishAction);
});

saveAiHintTriggerModeButton?.addEventListener("click", () => {
  if (!beginAction("save-hint-mode")) {
    return;
  }
  const mode = normalizeAiHintTriggerMode(aiHintTriggerModeSelect?.value);
  const modeLabel = mode === "manual" ? "手动点击" : "自动刷新";

  void Promise.resolve()
    .then(() => getDesktopCompanionApi().saveAiHintTriggerMode(mode))
    .then(() => {
      showMessage(`已保存下一步提示触发方式：${modeLabel}。`, "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "保存下一步提示触发方式失败，请查看日志。", "error");
    })
    .finally(finishAction);
});

void Promise.resolve()
  .then(() => getDesktopCompanionApi().getInitialState())
  .then((rawState) => {
    renderState(normalizeState(rawState));
  })
  .catch((error) => {
    showMessage(error instanceof Error ? error.message : "设置窗口初始化失败，请重试。", "error");
  });

try {
  getDesktopCompanionApi().onStateChange((rawState) => {
    renderState(normalizeState(rawState));
  });
} catch (error) {
  showMessage(error instanceof Error ? error.message : "设置窗口状态监听失败，请重试。", "error");
}
