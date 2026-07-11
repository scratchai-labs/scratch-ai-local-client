import test from "node:test";
import assert from "node:assert/strict";

import { buildScratchLaunchArgs } from "../dist/scratch-launcher.js";

test("ScratchLauncher only passes the debug port and leaves Scratch language untouched", () => {
  const args = buildScratchLaunchArgs(39000);

  assert.deepEqual(args, ["--remote-debugging-port=39000"]);
  assert.equal(args.some((arg) => arg.startsWith("--lang=")), false);
});
