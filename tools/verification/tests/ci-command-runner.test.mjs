import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildFailureAnnotations,
  buildSpawnOptions,
  escapeGitHubAnnotation,
  resolveCommandForPlatform,
  runCommand,
  TailBuffer
} from "../../../scripts/run-ci-with-annotations.mjs";

test("CI command runner escapes multiline GitHub annotations", () => {
  assert.equal(
    escapeGitHubAnnotation("first%\r\nsecond"),
    "first%25%0D%0Asecond"
  );
});

test("CI command runner resolves npm through npm.cmd on Windows", () => {
  assert.equal(resolveCommandForPlatform("npm", "win32"), "npm.cmd");
  assert.equal(resolveCommandForPlatform("npx", "win32"), "npx.cmd");
  assert.equal(resolveCommandForPlatform("node", "win32"), "node");
  assert.equal(resolveCommandForPlatform("npm", "linux"), "npm");
});

test("CI command runner retains only the configured output tail", () => {
  const tail = new TailBuffer(3);
  tail.append("one\ntwo\n");
  tail.append("three\nfour\n");
  assert.equal(tail.toString(), "two\nthree\nfour");
});

test("CI command runner emits the failed command output as one annotation", () => {
  const runnerUrl = fileURLToPath(new URL("../../../scripts/run-ci-with-annotations.mjs", import.meta.url));
  const result = spawnSync(
    process.execPath,
    [runnerUrl, process.execPath, "-e", "console.error('diagnostic line'); process.exit(7)"],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 7);
  assert.match(result.stderr, /diagnostic line/);
  assert.match(result.stdout, /::error title=CI command failed: final output::.*diagnostic line/);
});

test("CI command runner enables the Windows shell only for command shims", () => {
  assert.equal(buildSpawnOptions("win32", "npm.cmd").shell, true);
  assert.equal(buildSpawnOptions("win32", "tool.bat").shell, true);
  assert.equal(buildSpawnOptions("win32", "C:\\Program Files\\nodejs\\node.exe").shell, false);
  assert.equal(buildSpawnOptions("linux", "npm").shell, false);
});

test("CI command runner annotates synchronous spawn failures", async () => {
  const result = await runCommand(
    "npm",
    ["run", "test"],
    {
      platform: "win32",
      spawnFn() {
        throw new Error("spawn failed before child creation");
      }
    }
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.tail, /spawn failed before child creation/);
});


test("CI command runner keeps final output and TAP failure excerpts in separate bounded annotations", () => {
  const output = [
    ...Array.from({ length: 250 }, (_, index) => `before ${index}`),
    "not ok 17 - Windows path contract",
    "  ---",
    "  error: expected \\ but received /",
    "  failureType: testCodeFailure",
    "  ...",
    ...Array.from({ length: 250 }, (_, index) => `after ${index}`),
    "npm error Lifecycle script test failed"
  ].join("\n");

  const annotations = buildFailureAnnotations(output);

  assert.ok(annotations.length >= 2);
  assert.match(annotations[0].title, /final output/);
  assert.match(annotations[0].message, /npm error Lifecycle script test failed/);
  assert.ok(annotations.some((annotation) => /Windows path contract/.test(annotation.message)));
  assert.ok(annotations.every((annotation) => annotation.message.length <= 7_500));
});
