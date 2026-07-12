import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("readonly Scratch workspace renderer does not hard-code simplified Chinese", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /ScratchMsgs\.setLocale\("zh-cn"\)/);
  assert.match(source, /getReadonlyScratchLocale/);
});
