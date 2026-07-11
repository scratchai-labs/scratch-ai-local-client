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
  assert.match(workflow, /tags:\s*\n\s*-\s*"v\*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_version:\s*\n\s*description:\s*"Release version, for example v0\.1\.0"/);
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

test("desktop release workflow publishes GitHub Release assets only for version releases", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/release-desktop.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
  assert.match(workflow, /should_publish:\s*\$\{\{\s*steps\.release\.outputs\.should_publish\s*\}\}/);
  assert.match(workflow, /version:\s*\$\{\{\s*steps\.release\.outputs\.version\s*\}\}/);
  assert.match(workflow, /\$\{\{\s*github\.ref_type\s*\}\}" == "tag"/);
  assert.match(workflow, /\$\{\{\s*github\.ref_name\s*\}\}" == v\*/);
  assert.match(workflow, /github\.event\.inputs\.release_version/);
  assert.match(workflow, /release_version must look like v0\.1\.0 or v0\.1\.0-beta\.1/);
  assert.match(workflow, /create-release:\s*\n[\s\S]*needs:\s*\[prepare, windows, macos\]/);
  assert.match(workflow, /create-release:\s*\n[\s\S]*if:\s*\$\{\{\s*needs\.prepare\.outputs\.should_publish == 'true'\s*\}\}/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(workflow, /tag_name:\s*\$\{\{\s*needs\.prepare\.outputs\.version\s*\}\}/);
  assert.match(workflow, /draft:\s*false/);
  assert.match(workflow, /prerelease:\s*\$\{\{\s*contains\(needs\.prepare\.outputs\.version, '-'\)\s*\}\}/);
  assert.match(workflow, /download-artifact@v7/);
  assert.match(workflow, /release-assets/);
  assert.match(workflow, /Stage Release Assets/);
  assert.match(workflow, /ScratchDesktopCompanion-portable\.exe/);
  assert.match(workflow, /ScratchDesktopCompanion-setup\.exe/);
  assert.match(workflow, /ScratchDesktopCompanion-mac\.zip/);
  assert.match(workflow, /ScratchDesktopCompanion-mac\.dmg/);
  assert.match(workflow, /wc -l\)" -eq 4/);
  assert.match(workflow, /Delete Existing Release/);
  assert.match(workflow, /gh release delete "\$\{\{\s*needs\.prepare\.outputs\.version\s*\}\}"/);
  assert.match(workflow, /--cleanup-tag=false --yes/);
  assert.match(workflow, /files:\s*release-upload\/\*/);
  assert.doesNotMatch(workflow, /files:\s*release-assets\/\*\*/);
  assert.doesNotMatch(workflow, /with-key/);
});

test("desktop release workflow uses Node 24-based GitHub actions runtimes", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/release-desktop.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /actions\/download-artifact@v7/);
  assert.doesNotMatch(workflow, /actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /actions\/download-artifact@v4/);
});
