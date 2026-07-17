import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("settings page keeps Flash as the default model with Pro as the only upgrade option", async () => {
  const html = await readFile(new URL("../src/renderer/settings.html", import.meta.url), "utf8");

  assert.match(html, /<option value="deepseek-v4-flash" selected>deepseek-v4-flash<\/option>/);
  assert.match(html, /<option value="deepseek-v4-pro">deepseek-v4-pro<\/option>/);
  assert.doesNotMatch(html, /gpt-|claude-|gemini-/i);
});

test("settings page documents plaintext local key risk without showing keys or paths", async () => {
  const html = await readFile(new URL("../src/renderer/settings.html", import.meta.url), "utf8");

  assert.match(html, /明文保存在当前电脑/);
  assert.match(html, /当前系统用户可读写/);
  assert.match(html, /测试 Key/);
  assert.match(html, /settings-test-custom-ai-api-key-button/);
  assert.doesNotMatch(html, /sk-[A-Za-z0-9_-]+/);
  assert.doesNotMatch(html, /desktop-companion\.config\.json/);
});

test("settings page keeps auto hint mode as the visible default", async () => {
  const html = await readFile(new URL("../src/renderer/settings.html", import.meta.url), "utf8");

  assert.match(html, /<option value="auto" selected>自动刷新<\/option>/);
  assert.match(html, /<option value="manual">手动点击<\/option>/);
});

test("settings page exposes accessible feedback, strong keyboard focus, and clear Key action groups", async () => {
  const html = await readFile(new URL("../src/renderer/settings.html", import.meta.url), "utf8");

  assert.match(html, /id="settings-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="settings-feedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="settings-error"[^>]*role="alert"[^>]*aria-live="assertive"[^>]*aria-atomic="true"/);
  assert.match(html, /\.button:focus-visible,[\s\S]*input:focus-visible,[\s\S]*select:focus-visible\s*\{/);
  assert.match(html, /outline:\s*3px solid var\(--focus-ring\);/);
  assert.match(html, /class="key-action-groups"/);
  assert.match(html, /class="key-action-group verify"/);
  assert.match(html, /class="key-action-group save"/);
  assert.match(html, /class="key-action-group clear"/);
});
