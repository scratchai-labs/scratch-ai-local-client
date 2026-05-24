import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop companion start scripts use the repo-local Electron CLI", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );

  assert.equal(
    packageJson.scripts.start,
    "node ../../node_modules/electron/cli.js dist/main.js"
  );
  assert.equal(
    packageJson.scripts.dev,
    "node build.mjs && node ../../node_modules/electron/cli.js dist/main.js"
  );
  assert.equal(
    packageJson.scripts["package:mac:zip"],
    "node scripts/package-mac.mjs --target=zip"
  );
});
