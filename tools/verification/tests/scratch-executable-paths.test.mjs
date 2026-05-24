import assert from "node:assert/strict";
import test from "node:test";

import { isSupportedScratchExecutablePath } from "../scripts/scratch-executable-paths.mjs";

test("accepts common Windows Scratch executable paths", () => {
  assert.equal(
    isSupportedScratchExecutablePath("C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe"),
    true
  );
  assert.equal(
    isSupportedScratchExecutablePath("C:\\Program Files\\Scratch 3\\Scratch.exe"),
    true
  );
});

test("accepts macOS Scratch executable paths inside app bundles", () => {
  assert.equal(
    isSupportedScratchExecutablePath("/Applications/Scratch 3.app/Contents/MacOS/Scratch 3"),
    true
  );
  assert.equal(
    isSupportedScratchExecutablePath("/Applications/Scratch.app/Contents/MacOS/Scratch"),
    true
  );
});

test("rejects non-executable app bundle paths", () => {
  assert.equal(isSupportedScratchExecutablePath("/Applications/Scratch 3.app"), false);
});
