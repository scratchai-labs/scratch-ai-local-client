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
  assert.match(html, /\.hint-panel\s*\{[\s\S]*padding:\s*9px 12px;/);
  assert.match(html, /\.hint-heading\s*\{[\s\S]*display:\s*flex;/);
});

test("action and next-step panels use dense layouts to keep program scrolling local", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<section class="panel action-panel">/);
  assert.match(html, /<div class="action-heading">/);
  assert.match(html, /\.action-panel\s*\{[\s\S]*padding:\s*10px 12px;/);
  assert.match(html, /\.action-heading\s*\{[\s\S]*display:\s*grid;/);
  assert.match(html, /\.summary-card\s*\{[\s\S]*padding:\s*6px 9px;/);
  assert.match(html, /\.hint-panel\s*\{[\s\S]*padding:\s*9px 12px;/);
  assert.doesNotMatch(html, /DeepSeek Key 和“自动 \/ 手动提示”/);
});

test("lesson goal input uses its own full-width row below action buttons", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /<\/div>\s*<div class="lesson-goal-row">/);
  assert.match(html, /<span id="lesson-goal-help"/);
  assert.match(html, /aria-describedby="lesson-goal-help"/);
  assert.match(html, /\.action-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(128px,\s*1fr\)\);/);
  assert.match(html, /\.lesson-goal-row\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
  assert.match(html, /\.lesson-goal-row input\s*\{[\s\S]*min-height:\s*36px;/);
  assert.match(html, /\.lesson-goal-row input\s*\{[\s\S]*font-size:\s*var\(--text-note\);/);
  assert.doesNotMatch(html, /<div class="action-heading">[\s\S]*<div class="lesson-goal-row">[\s\S]*<\/div>\s*<\/div>\s*<div class="summary-grid compact">/);
});

test("lesson goal input stays enabled while saving and while AI hints load", async () => {
  const source = await readFile(new URL("../src/renderer/renderer.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /lessonGoalInput\.disabled\s*=\s*state\.aiStatus\s*===\s*"loading"/);
  assert.doesNotMatch(source, /lessonGoalInput\.disabled\s*=\s*true/);
});

test("main window announces dynamic status and errors with a strong keyboard focus ring", async () => {
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /id="status-summary"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /class="status-copy"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="error"[^>]*role="alert"[^>]*aria-live="assertive"[^>]*aria-atomic="true"/);
  assert.match(html, /\.button:focus-visible,[\s\S]*\.lesson-goal-row input:focus-visible\s*\{/);
  assert.match(html, /outline:\s*3px solid var\(--focus-ring\);/);
});
