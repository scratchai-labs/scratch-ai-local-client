import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("readonly Scratch workspace renderer does not hard-code simplified Chinese", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /ScratchMsgs\.setLocale\("zh-cn"\)/);
  assert.match(source, /getReadonlyScratchLocale/);
});

test("readonly Scratch workspace renderer normalizes document locale for scratch-blocks", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.match(source, /documentElement\.lang\.trim\(\)\.toLowerCase\(\)/);
});

test("readonly Scratch workspace renderer moves official XML coordinates into view", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.match(source, /function moveTopLevelBlocksIntoView/);
  assert.match(source, /workspace\.getTopBlocks\(false\)/);
  assert.match(source, /block\.moveBy\(dx, dy\)/);
  assert.match(source, /moveTopLevelBlocksIntoView\(workspace\)/);
});

test("readonly Scratch workspace renderer normalizes official workspace XML namespace", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.match(source, /OFFICIAL_SCRATCH_WORKSPACE_XML_NAMESPACE/);
  assert.match(source, /BLOCKLY_WORKSPACE_XML_NAMESPACE/);
  assert.match(source, /normalizeScratchWorkspaceXml/);
  assert.match(source, /replaceAll\(\s*OFFICIAL_SCRATCH_WORKSPACE_XML_NAMESPACE,\s*BLOCKLY_WORKSPACE_XML_NAMESPACE\s*\)/);
});

test("readonly Scratch workspace renderer treats empty deserialization as a failure", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.match(source, /assertWorkspaceRendered/);
  assert.match(source, /workspace\.getTopBlocks\(false\)\.length/);
  assert.match(source, /scratch workspace XML did not create visible blocks/);
  assert.match(source, /assertWorkspaceRendered\(host, workspace\)/);
});

test("readonly Scratch workspace renderer checks success after sizing blocks", async () => {
  const source = await readFile(new URL("../src/renderer/scratch-workspace-renderer.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /ScratchBlocks\.clearWorkspaceAndLoadFromXml\(parsedXml, workspace\);[\s\S]*moveTopLevelBlocksIntoView\(workspace\);[\s\S]*resizeWorkspaceHost\(host, workspace\);[\s\S]*assertWorkspaceRendered\(host, workspace\);/
  );
});
