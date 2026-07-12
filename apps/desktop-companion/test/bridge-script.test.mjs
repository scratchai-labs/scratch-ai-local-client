import test from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

async function readBridgeSource() {
  return readFile(new URL("../src/main/bridge-script.ts", import.meta.url), "utf8");
}

test("desktop bridge reads Scratch locale from official document language fallback", async () => {
  const script = await readBridgeSource();

  assert.match(script, /document\.documentElement\.lang/);
  assert.match(script, /vm\.getLocale/);
  assert.match(script, /state && state\.locales && state\.locales\.locale/);
});

test("desktop bridge observes Scratch language changes and posts a locale snapshot", async () => {
  const script = await readBridgeSource();

  assert.match(script, /MutationObserver/);
  assert.match(script, /language-changed/);
});

test("desktop bridge keeps Scratch reader helpers free of duplicate declarations", async () => {
  const script = await readBridgeSource();

  assert.doesNotMatch(script, /const queue = \[node\];\s*const queue = \[node\];/);
});

test("desktop bridge listens to official Scratch workspaceUpdate XML", async () => {
  const script = await readBridgeSource();

  assert.match(script, /workspaceUpdate/);
  assert.match(script, /currentTargetWorkspaceXmlList/);
  assert.match(script, /emitWorkspaceUpdate/);
});
