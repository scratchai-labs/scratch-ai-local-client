import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeRuntimeLogText } from "../dist/runtime-log.js";

test("sanitizeRuntimeLogText masks DeepSeek-style API keys in messages and error stacks", () => {
  const raw = [
    "saving key sk-1234567890abcdef",
    "Authorization: Bearer sk-live-secret-value",
    "Error: failed with apiKey=sk-custom-demo"
  ].join("\n");

  const sanitized = sanitizeRuntimeLogText(raw);

  assert.equal(sanitized.includes("sk-1234567890abcdef"), false);
  assert.equal(sanitized.includes("sk-live-secret-value"), false);
  assert.equal(sanitized.includes("sk-custom-demo"), false);
  assert.match(sanitized, /sk-\*\*\*/);
});

test("sanitizeRuntimeLogText masks bearer headers and JSON secret fields", () => {
  const sanitized = sanitizeRuntimeLogText(
    'Authorization: Bearer sk-live-secret-value {"apiKey":"sk-json-secret","token":"plain-token-value"}'
  );

  assert.equal(sanitized.includes("sk-live-secret-value"), false);
  assert.equal(sanitized.includes("sk-json-secret"), false);
  assert.equal(sanitized.includes("plain-token-value"), false);
  assert.match(sanitized, /Authorization: Bearer \*\*\*/);
  assert.match(sanitized, /"apiKey":"\*\*\*"/);
  assert.match(sanitized, /"token":"\*\*\*"/);
});
