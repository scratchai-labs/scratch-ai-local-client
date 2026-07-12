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

test("main window keeps the student hint panel to one sentence without a separate next step", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<p id="ai-answer" class="status-line">/);
  assert.doesNotMatch(html, /id="ai-next-step"/);
  assert.doesNotMatch(html, /<strong>下一步：<\/strong>/);
});

test("main window defines Scratch-style block colors for the program and recommendation panels", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /--scratch-workspace-bg:/i);
  assert.match(html, /\.scratch-workspace-frame\s*\{/);
  assert.match(html, /\.scratch-workspace-inline\s*\{/);
  assert.match(html, /\.scratch-workspace-host\s*\{/);
});


test("current target program panel stacks scripts vertically and scrolls large collections", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<h2 id="current-target-programs-title">当前角色程序<\/h2>/);
  assert.match(html, /<section class="panel detail-panel program-panel">/);
  assert.match(html, /\.program-list\s*\{[\s\S]*max-height:/);
  assert.match(html, /\.program-list\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.match(html, /\.program-list\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(html, /\.scratch-workspace-frame\s*\{[\s\S]*overflow:\s*auto;/);
});

test("next-step hint panel uses compact spacing and a one-line heading row", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<section class="panel hint-panel">/);
  assert.match(html, /<div class="hint-heading">/);
  assert.match(html, /\.hint-panel\s*\{[\s\S]*padding:\s*10px 14px;/);
  assert.match(html, /\.hint-heading\s*\{[\s\S]*display:\s*flex;/);
});
