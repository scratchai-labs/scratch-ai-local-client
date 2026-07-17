import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  escapeGitHubAnnotation,
  resolveCommandForPlatform,
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
  assert.match(result.stdout, /::error title=CI command failed::.*diagnostic line/);
});
