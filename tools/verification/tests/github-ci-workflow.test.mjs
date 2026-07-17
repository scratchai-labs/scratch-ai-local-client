import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("ci workflow keeps cross-platform workspace checks on the expected matrix", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /workspace-check:/);
  assert.match(workflow, /-\s*ubuntu-latest/);
  assert.match(workflow, /-\s*windows-2022/);
  assert.doesNotMatch(workflow, /-\s*windows-latest/);
  assert.doesNotMatch(workflow, /-\s*windows-2025/);
  assert.doesNotMatch(workflow, /-\s*windows-2025-vs2026/);
  assert.match(workflow, /-\s*macos-latest/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run test/);
});

test("ci workflow uses Node 24-based GitHub actions runtimes", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.doesNotMatch(workflow, /actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
});

test("ci runs the isolated Electron mock UI smoke only on macOS", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /name:\s*Desktop companion mock UI smoke \(macOS\)/);
  assert.match(
    workflow,
    /name:\s*Desktop companion mock UI smoke \(macOS\)[\s\S]*?if:\s*runner\.os == 'macOS'[\s\S]*?timeout-minutes:\s*5[\s\S]*?run:\s*npm run desktop:test:ui:smoke/
  );
  assert.match(
    workflow,
    /name:\s*Recommendation render contract \(Ubuntu\)[\s\S]*?if:\s*runner\.os == 'Linux'[\s\S]*?run:\s*xvfb-run -a npm run test:recommendation-render-contract/
  );
});
