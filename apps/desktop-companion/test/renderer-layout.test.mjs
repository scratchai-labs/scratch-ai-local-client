import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("main window shows the selected Scratch path in a visible summary row", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<span>已选 Scratch<\/span>/);
  assert.match(html, /<strong id="scratch-path">还没有选择<\/strong>/);
});

test("main window no longer shows the module summary panel", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /识别到的模块/);
  assert.doesNotMatch(html, /id="program-area-modules"/);
});

test("main window keeps current target programs and recommended blocks in an equal-width two-column row", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<div class="program-recommend-grid">/);
  assert.match(html, /<ul id="ai-recommended-blocks" class="list recommended-list"><\/ul>/);
  assert.match(html, /\.program-recommend-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.doesNotMatch(html, /\.program-recommend-grid\s*\{\s*grid-template-columns:\s*1fr;/);
});

test("main window defines Scratch-style block colors for the program and recommendation panels", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /--scratch-workspace-bg:/i);
  assert.match(html, /\.scratch-workspace-frame\s*\{/);
  assert.match(html, /\.scratch-workspace-inline\s*\{/);
  assert.match(html, /\.scratch-workspace-host\s*\{/);
});
