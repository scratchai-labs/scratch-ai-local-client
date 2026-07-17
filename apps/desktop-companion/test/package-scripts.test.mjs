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

test("desktop companion exposes an isolated CI mock UI smoke command", async () => {
  const desktopPackage = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  const rootPackage = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8")
  );
  const command = desktopPackage.scripts["test:desktop-ui:ci"];

  assert.equal(
    rootPackage.scripts["desktop:test:ui:smoke"],
    "npm run test:desktop-ui:ci --workspace=@scratch-ai/desktop-companion"
  );
  assert.equal(typeof command, "string");
  assert.match(command, /verify-desktop-companion-ui\.mjs/);
  assert.match(command, /--mock-state-file="\$PWD\/\.\.\/\.\.\/tools\/verification\/fixtures\/desktop-companion-mock-state\.json"/);
  assert.match(command, /--timeout-ms=30000/);
  assert.match(command, /RUNNER_TEMP/);
  assert.match(command, /mktemp -d/);
  assert.match(command, /--screenshot="\$output_dir\//);
  assert.match(command, /--automation-scratch-path="\$output_dir\//);
  assert.match(command, /rm -rf \.\.\/\.\.\/tools\/verification\/tmp-desktop-companion-ui-userdata/);
  assert.match(command, /trap .*tmp-desktop-companion-ui-userdata/);
  assert.doesNotMatch(command, /docs\/assets\/screenshots/);
  assert.doesNotMatch(command, /real-e2e|verify-scratch-local|verify-scratch-bridge/);
});
