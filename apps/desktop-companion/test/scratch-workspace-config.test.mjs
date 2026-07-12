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

test("scratch workspace fallback avoids replacing native blocks with plain block text", () => {
  assert.equal(
    resolveScratchWorkspaceFallbackText("当绿旗被点击"),
    "Scratch 积木暂时没有渲染出来，先看文字版：当绿旗被点击"
  );
  assert.equal(
    resolveScratchWorkspaceFallbackText("  重复执行  "),
    "Scratch 积木暂时没有渲染出来，先看文字版：重复执行"
  );
  assert.equal(resolveScratchWorkspaceFallbackText(""), "Scratch 积木正在刷新，请稍等一下。");
  assert.equal(resolveScratchWorkspaceFallbackText(undefined), "Scratch 积木正在刷新，请稍等一下。");
});
