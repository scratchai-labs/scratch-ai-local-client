import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop release workflow packages Windows and macOS artifacts for PRs and main pushes", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/release-desktop.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /pull_request:\s*\n\s*paths:/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /-\s*"tsconfig\.base\.json"/);

  assert.match(workflow, /windows:\s*\n[\s\S]*runs-on:\s*windows-2022/);
  assert.doesNotMatch(workflow, /windows:\s*\n[\s\S]*runs-on:\s*windows-latest/);
  assert.doesNotMatch(workflow, /windows:\s*\n[\s\S]*runs-on:\s*windows-2025/);
  assert.doesNotMatch(workflow, /windows:\s*\n[\s\S]*runs-on:\s*windows-2025-vs2026/);
  assert.match(workflow, /windows:\s*\n[\s\S]*npm run package:win:bundle/);
  assert.match(workflow, /windows:\s*\n[\s\S]*name:\s*scratch-desktop-companion-windows/);

  assert.match(workflow, /macos:\s*\n[\s\S]*runs-on:\s*macos-latest/);
  assert.match(workflow, /macos:\s*\n[\s\S]*npm run package:mac:zip/);
  assert.match(workflow, /macos:\s*\n[\s\S]*npm run package:mac:dmg/);
  assert.match(workflow, /macos:\s*\n[\s\S]*name:\s*scratch-desktop-companion-macos/);
});

test("desktop release workflow uses Node 24-based GitHub actions runtimes", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/release-desktop.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(workflow, /actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/);
});
