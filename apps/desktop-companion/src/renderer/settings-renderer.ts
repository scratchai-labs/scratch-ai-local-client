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

function getDesktopCompanionApi() {
  if (!window.desktopCompanionApi) {
    throw new Error("预加载脚本没有就绪，请退出旧实例后重新打开设置窗口。");
  }
  return window.desktopCompanionApi;
}

function showMessage(message: string, kind: "error" | "success") {
  if (feedbackElement) {
    feedbackElement.textContent = message;
    feedbackElement.dataset.kind = kind;
    feedbackElement.hidden = false;
  }

  if (errorElement) {
    errorElement.textContent = kind === "error" ? message : "";
    errorElement.hidden = kind !== "error";
  }
}

function clearError() {
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.hidden = true;
  }
}

function normalizeState(rawState: unknown): DesktopCompanionState {
  return desktopCompanionStateSchema.parse(rawState);
}

function renderState(state: DesktopCompanionState) {
  if (statusElement) {
    statusElement.textContent = state.aiConfigured
      ? "已检测到本机可用 DeepSeek Key"
      : "当前还没有保存本机 DeepSeek Key";
  }

  if (customAiApiKeyInput) {
    customAiApiKeyInput.disabled = state.aiStatus === "loading";
  }

  if (saveCustomAiApiKeyButton) {
    saveCustomAiApiKeyButton.disabled = state.aiStatus === "loading";
  }

  if (clearCustomAiApiKeyButton) {
    clearCustomAiApiKeyButton.disabled = state.aiStatus === "loading" || !state.aiCustomKeyConfigured;
  }

  if (customAiModelSelect) {
    customAiModelSelect.disabled = state.aiStatus === "loading";
    customAiModelSelect.value = normalizeDeepSeekModel(state.aiCustomModel ?? state.aiModel);
  }

  if (saveCustomAiModelButton) {
    saveCustomAiModelButton.disabled = state.aiStatus === "loading";
  }

  if (aiHintTriggerModeSelect) {
    aiHintTriggerModeSelect.disabled = state.aiStatus === "loading";
    aiHintTriggerModeSelect.value = normalizeAiHintTriggerMode(state.aiHintTriggerMode);
  }

  if (saveAiHintTriggerModeButton) {
    saveAiHintTriggerModeButton.disabled = state.aiStatus === "loading";
  }
}

saveCustomAiApiKeyButton?.addEventListener("click", () => {
  saveCustomAiApiKeyButton.disabled = true;
  const apiKey = customAiApiKeyInput?.value?.trim() ?? "";

  void Promise.resolve()
    .then(() => {
      clearError();
      if (!apiKey) {
        throw new Error("请先输入自定义 DeepSeek API Key。");
      }

      return getDesktopCompanionApi().saveCustomAiApiKey(apiKey);
    })
    .then(() => {
      if (customAiApiKeyInput) {
        customAiApiKeyInput.value = "";
      }

      showMessage("已保存本机 DeepSeek API Key。", "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "保存自定义 DeepSeek API Key 失败，请查看日志。", "error");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (saveCustomAiApiKeyButton) {
          saveCustomAiApiKeyButton.disabled = false;
        }
      }, 400);
    });
});

clearCustomAiApiKeyButton?.addEventListener("click", () => {
  clearCustomAiApiKeyButton.disabled = true;

  void Promise.resolve()
    .then(() => {
      clearError();
      return getDesktopCompanionApi().clearCustomAiApiKey();
    })
    .then(() => {
      if (customAiApiKeyInput) {
        customAiApiKeyInput.value = "";
      }

      showMessage("已清除本机 DeepSeek API Key，后续会自动使用基础提示。", "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "清除自定义 DeepSeek API Key 失败，请查看日志。", "error");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (clearCustomAiApiKeyButton) {
          clearCustomAiApiKeyButton.disabled = false;
        }
      }, 400);
    });
});

saveCustomAiModelButton?.addEventListener("click", () => {
  saveCustomAiModelButton.disabled = true;
  const model = normalizeDeepSeekModel(customAiModelSelect?.value);

  void Promise.resolve()
    .then(() => {
      clearError();
      return getDesktopCompanionApi().saveCustomAiModel(model);
    })
    .then(() => {
      showMessage(`已保存模型：${model}。`, "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "保存模型失败，请查看日志。", "error");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (saveCustomAiModelButton) {
          saveCustomAiModelButton.disabled = false;
        }
      }, 400);
    });
});

saveAiHintTriggerModeButton?.addEventListener("click", () => {
  saveAiHintTriggerModeButton.disabled = true;
  const mode = normalizeAiHintTriggerMode(aiHintTriggerModeSelect?.value);
  const modeLabel = mode === "manual" ? "手动点击" : "自动刷新";

  void Promise.resolve()
    .then(() => {
      clearError();
      return getDesktopCompanionApi().saveAiHintTriggerMode(mode);
    })
    .then(() => {
      showMessage(`已保存下一步提示触发方式：${modeLabel}。`, "success");
    })
    .catch((error) => {
      showMessage(error instanceof Error ? error.message : "保存下一步提示触发方式失败，请查看日志。", "error");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (saveAiHintTriggerModeButton) {
          saveAiHintTriggerModeButton.disabled = false;
        }
      }, 400);
    });
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
