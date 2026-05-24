export function buildSettingsUiSnapshotExpression() {
  return `
(() => ({
  title: document.title,
  href: window.location.href,
  status: document.querySelector("#settings-status")?.textContent?.trim() ?? null,
  feedbackText: document.querySelector("#settings-feedback")?.textContent?.trim() ?? null,
  modelValue: document.querySelector("#settings-custom-ai-model") instanceof HTMLSelectElement
    ? document.querySelector("#settings-custom-ai-model").value
    : null,
  hintTriggerModeValue: document.querySelector("#settings-ai-hint-trigger-mode") instanceof HTMLSelectElement
    ? document.querySelector("#settings-ai-hint-trigger-mode").value
    : null,
  buttons: {
    save: document.querySelector("#settings-save-custom-ai-api-key-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-save-custom-ai-api-key-button").disabled
      : null,
    clear: document.querySelector("#settings-clear-custom-ai-api-key-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-clear-custom-ai-api-key-button").disabled
      : null,
    saveHintTriggerMode: document.querySelector("#settings-save-ai-hint-trigger-mode-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-save-ai-hint-trigger-mode-button").disabled
      : null
  }
}))()
    `.trim();
}

export function isSettingsUiReady(snapshot) {
  return snapshot?.title === "DeepSeek 设置" &&
    snapshot?.status !== "正在读取当前配置…" &&
    typeof snapshot?.modelValue === "string" &&
    snapshot.modelValue.length > 0 &&
    typeof snapshot?.hintTriggerModeValue === "string" &&
    snapshot.hintTriggerModeValue.length > 0 &&
    typeof snapshot?.buttons?.save === "boolean" &&
    snapshot.buttons.save === false &&
    typeof snapshot?.buttons?.saveHintTriggerMode === "boolean" &&
    snapshot.buttons.saveHintTriggerMode === false;
}
