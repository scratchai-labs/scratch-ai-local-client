import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesktopCompanionBuilderBaseConfig,
  resolveDesktopCompanionElectronDist,
  resolveElectronVersionFromPackageJson
} from "../scripts/electron-builder-config.mjs";
import { buildMacBuilderConfig } from "../scripts/package-mac.mjs";
import { buildWindowsInstallerBuilderConfig } from "../scripts/package-win-installer.mjs";
import { buildWindowsPortableBuilderConfig } from "../scripts/package-win-single.mjs";

const appDir = fileURLToPath(new URL("..", import.meta.url));

test("resolveElectronVersionFromPackageJson normalizes the workspace electron version", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(resolveElectronVersionFromPackageJson(packageJson), "41.3.0");
});

test("desktop companion electron-builder base config pins electronVersion for workspace installs", () => {
  const config = buildDesktopCompanionBuilderBaseConfig({
    appDir,
    outputDir: "/tmp/scratchai/apps/desktop-companion/release-test"
  });

  assert.equal(config.electronVersion, "41.3.0");
  assert.equal(config.publish, "never");
  assert.deepEqual(config.files, ["dist/**/*", "node_modules/**/*", "package.json"]);
});

test("resolveDesktopCompanionElectronDist points at the workspace root electron distribution", () => {
  assert.equal(
    resolveDesktopCompanionElectronDist("/repo/apps/desktop-companion"),
    path.resolve("/repo/apps/desktop-companion", "..", "..", "node_modules", "electron", "dist")
  );
});

test("buildMacBuilderConfig carries the pinned electronVersion", () => {
  const config = buildMacBuilderConfig({
    appDir,
    outputDir: "/tmp/scratchai/apps/desktop-companion/release-mac-no-key",
    target: "dir",
    env: {}
  });

  assert.equal(config.electronVersion, "41.3.0");
});

test("Windows portable and installer configs carry the pinned electronVersion", () => {
  const portableConfig = buildWindowsPortableBuilderConfig({
    appDir,
    outputDir: "/tmp/scratchai/apps/desktop-companion/release-single-no-key",
    iconPath: path.join(appDir, "buildResources", "ScratchDesktop.ico"),
    artifactBaseName: "ScratchDesktopCompanion"
  });
  const installerConfig = buildWindowsInstallerBuilderConfig({
    appDir,
    outputDir: "/tmp/scratchai/apps/desktop-companion/release-installer-no-key",
    iconPath: path.join(appDir, "buildResources", "ScratchDesktop.ico"),
    artifactBaseName: "ScratchDesktopCompanion"
  });

  assert.equal(portableConfig.electronVersion, "41.3.0");
  assert.equal(installerConfig.electronVersion, "41.3.0");
});
