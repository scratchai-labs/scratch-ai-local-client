import { readFileSync } from "node:fs";
import path from "node:path";

const SIMPLE_SEMVER_RANGE_PATTERN = /^[~^]?(\d+\.\d+\.\d+)$/;

export function resolveElectronVersionFromPackageJson(packageJson) {
  const rawVersion =
    packageJson?.devDependencies?.electron ?? packageJson?.dependencies?.electron ?? "";
  const normalizedVersion = typeof rawVersion === "string" ? rawVersion.trim() : "";
  const match = normalizedVersion.match(SIMPLE_SEMVER_RANGE_PATTERN);

  if (!match) {
    throw new Error(
      `Unsupported Electron version specifier "${normalizedVersion}". Expected a simple semver or caret/tilde range.`
    );
  }

  return match[1];
}

export function readDesktopCompanionPackageJson(appDir) {
  return JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
}

export function resolveDesktopCompanionElectronDist(appDir) {
  return path.resolve(appDir, "..", "..", "node_modules", "electron", "dist");
}

export function buildDesktopCompanionBuilderBaseConfig({
  appDir,
  outputDir,
  packageJson = readDesktopCompanionPackageJson(appDir)
}) {
  return {
    appId: "com.scratchai.desktopcompanion",
    productName: "ScratchDesktopCompanion",
    compression: "maximum",
    electronLanguages: ["zh-CN", "en-US"],
    directories: {
      output: outputDir
    },
    files: ["dist/**/*", "node_modules/**/*", "package.json"],
    extraMetadata: {
      main: "dist/main.js"
    },
    asar: true,
    electronVersion: resolveElectronVersionFromPackageJson(packageJson),
    electronDist: resolveDesktopCompanionElectronDist(appDir)
  };
}
