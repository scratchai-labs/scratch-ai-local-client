import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScratchLaunchArgs,
  normalizeScratchLaunchLocale,
  resolvePreferredScratchLaunchLocale
} from "../dist/scratch-launcher.js";

test("ScratchLauncher passes the current app locale to Scratch", () => {
  const args = buildScratchLaunchArgs(39000, "zh-Hans-CN");

  assert.deepEqual(args, ["--remote-debugging-port=39000", "--lang=zh-CN"]);
  assert.equal(args.some((arg) => arg.includes("locale")), false);
});

test("ScratchLauncher maps Chinese script locales to Scratch-supported Chinese locales", () => {
  assert.equal(normalizeScratchLaunchLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeScratchLaunchLocale("zh-Hant-TW"), "zh-TW");
  assert.equal(normalizeScratchLaunchLocale("zh-HK"), "zh-TW");
});

test("ScratchLauncher keeps non-Chinese locales instead of forcing English", () => {
  assert.deepEqual(buildScratchLaunchArgs(39000, "ja-jp"), [
    "--remote-debugging-port=39000",
    "--lang=ja-JP"
  ]);
  assert.deepEqual(buildScratchLaunchArgs(39000, "fr"), [
    "--remote-debugging-port=39000",
    "--lang=fr"
  ]);
});

test("normalizeScratchLaunchLocale ignores empty locales", () => {
  assert.equal(normalizeScratchLaunchLocale(""), undefined);
  assert.equal(normalizeScratchLaunchLocale("  "), undefined);
  assert.equal(normalizeScratchLaunchLocale(undefined), undefined);
});

test("resolvePreferredScratchLaunchLocale prefers system language list before fallback locale", () => {
  assert.equal(resolvePreferredScratchLaunchLocale(["zh-Hans-CN", "en-US"], "en-US"), "zh-CN");
  assert.equal(resolvePreferredScratchLaunchLocale(["", "ja_JP"], "en-US"), "ja-JP");
  assert.equal(resolvePreferredScratchLaunchLocale([], "fr-fr"), "fr-FR");
});
