import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSettingsUiSnapshotExpression,
  isSettingsUiReady
} from "../scripts/desktop-companion-real-e2e-settings.mjs";

test("buildSettingsUiSnapshotExpression includes hint trigger mode controls", () => {
  const expression = buildSettingsUiSnapshotExpression();

  assert.match(expression, /#settings-ai-hint-trigger-mode/);
  assert.match(expression, /#settings-save-ai-hint-trigger-mode-button/);
  assert.match(expression, /#settings-feedback/);
});

test("isSettingsUiReady requires hint trigger mode state alongside existing settings fields", () => {
  assert.equal(
    isSettingsUiReady({
      title: "DeepSeek 设置",
      status: "当前还没有保存本机 DeepSeek Key",
      modelValue: "deepseek-v4-flash",
      hintTriggerModeValue: "auto",
      buttons: {
        save: false,
        clear: true,
        saveHintTriggerMode: false
      }
    }),
    true
  );

  assert.equal(
    isSettingsUiReady({
      title: "DeepSeek 设置",
      status: "当前还没有保存本机 DeepSeek Key",
      modelValue: "deepseek-v4-flash",
      buttons: {
        save: false,
        clear: true,
        saveHintTriggerMode: false
      }
    }),
    false
  );
});
