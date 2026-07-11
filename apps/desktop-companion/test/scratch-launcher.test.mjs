import test from "node:test";
import assert from "node:assert/strict";

import { buildScratchLaunchArgs } from "../dist/scratch-launcher.js";

test("ScratchLauncher only adds the debug port and does not override Scratch language", () => {
  const args = buildScratchLaunchArgs(39000);

  assert.deepEqual(args, ["--remote-debugging-port=39000"]);
  assert.equal(args.some((arg) => arg.includes("lang")), false);
  assert.equal(args.some((arg) => arg.includes("locale")), false);
});
