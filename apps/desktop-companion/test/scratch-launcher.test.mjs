import test from "node:test";
import assert from "node:assert/strict";

import { buildScratchLaunchArgs, normalizeScratchLaunchLocale } from "../dist/scratch-launcher.js";

test("ScratchLauncher reuses a previously observed Scratch language", () => {
  const args = buildScratchLaunchArgs(39000, "ko");

  assert.deepEqual(args, ["--remote-debugging-port=39000", "--lang=ko"]);
});

test("ScratchLauncher omits language when no Scratch language was observed", () => {
  assert.deepEqual(buildScratchLaunchArgs(39000), ["--remote-debugging-port=39000"]);
});

test("normalizeScratchLaunchLocale maps Scratch locale ids to Chromium language args", () => {
  assert.equal(normalizeScratchLaunchLocale("zh-cn"), "zh-CN");
  assert.equal(normalizeScratchLaunchLocale("zh_TW"), "zh-TW");
  assert.equal(normalizeScratchLaunchLocale("pt-br"), "pt-BR");
  assert.equal(normalizeScratchLaunchLocale("ko"), "ko");
});
