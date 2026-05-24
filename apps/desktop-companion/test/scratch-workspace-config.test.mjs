import test from "node:test";
import assert from "node:assert/strict";

import {
  SCRATCH_WORKSPACE_MEDIA_PATH,
  READONLY_WORKSPACE_SCALE,
  createReadonlyWorkspaceOptions,
  resolveScratchWorkspaceFallbackText
} from "../dist/scratch-workspace-config.js";

test("readonly workspace options use local media assets and reduced scale", () => {
  const options = createReadonlyWorkspaceOptions({
    scratchTheme: "classic-theme",
    theme: { name: "readonly-theme" }
  });

  assert.equal(options.media, SCRATCH_WORKSPACE_MEDIA_PATH);
  assert.equal("pathToMedia" in options, false);
  assert.equal(READONLY_WORKSPACE_SCALE, 0.64);
  assert.equal(options.zoom.startScale, READONLY_WORKSPACE_SCALE);
  assert.equal(options.zoom.minScale, READONLY_WORKSPACE_SCALE);
  assert.equal(options.zoom.maxScale, READONLY_WORKSPACE_SCALE);
  assert.ok(READONLY_WORKSPACE_SCALE < 1);
});

test("scratch workspace fallback text prefers provided label and has a safe default", () => {
  assert.equal(resolveScratchWorkspaceFallbackText("当绿旗被点击"), "当绿旗被点击");
  assert.equal(resolveScratchWorkspaceFallbackText("  重复执行  "), "重复执行");
  assert.equal(resolveScratchWorkspaceFallbackText(""), "积木暂时无法渲染");
  assert.equal(resolveScratchWorkspaceFallbackText(undefined), "积木暂时无法渲染");
});
