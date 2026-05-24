import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

import {
  MAC_SIGN_IDENTITY_ENV_NAME,
  buildMacBuilderConfig,
  copyMacDirBundleToInstallers,
  getMacPackageArtifactInfo,
  parseMacPackageTargetArg,
  resolveMacBuildCacheEnv
} from "../scripts/package-mac.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function detectRelativeSymlinkSupport(prefix) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    const targetDir = path.join(rootDir, "target");
    const linkPath = path.join(rootDir, "link");

    await mkdir(targetDir, { recursive: true });
    await symlink("target", linkPath, "dir");
    const target = await readlink(linkPath);

    return {
      supported: target === "target"
    };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("parseMacPackageTargetArg defaults to dir", () => {
  assert.equal(parseMacPackageTargetArg(["node", "package-mac.mjs"]), "dir");
});

test("parseMacPackageTargetArg accepts zip as a supported archive target", () => {
  assert.equal(parseMacPackageTargetArg(["node", "package-mac.mjs", "--target=zip"]), "zip");
});

test("getMacPackageArtifactInfo builds dmg names without colliding with Windows artifacts", () => {
  assert.deepEqual(getMacPackageArtifactInfo("no-key", "dmg"), {
    target: "dmg",
    outputDirName: "release-dmg-no-key",
    artifactFileName: "ScratchDesktopCompanion-no-key.dmg",
    distributionFileName: "ScratchDesktopCompanion-mac.dmg",
    bundleFileName: "ScratchDesktopCompanion.app"
  });
});

test("getMacPackageArtifactInfo builds zip names for GitHub artifact distribution", () => {
  assert.deepEqual(getMacPackageArtifactInfo("no-key", "zip"), {
    target: "zip",
    outputDirName: "release-zip-no-key",
    artifactFileName: "ScratchDesktopCompanion-no-key.zip",
    distributionFileName: "ScratchDesktopCompanion-mac.zip",
    bundleFileName: "ScratchDesktopCompanion.app"
  });
});

test("getMacPackageArtifactInfo exposes the root app bundle name for dir targets", () => {
  assert.deepEqual(getMacPackageArtifactInfo("no-key", "dir"), {
    target: "dir",
    outputDirName: "release-mac-no-key",
    bundleFileName: "ScratchDesktopCompanion.app",
    distributionBundleFileName: "ScratchDesktopCompanion-mac.app"
  });
});

test("getMacPackageArtifactInfo keeps with-key variants explicit", () => {
  assert.deepEqual(getMacPackageArtifactInfo("with-key", "dmg"), {
    target: "dmg",
    outputDirName: "release-dmg-with-key",
    artifactFileName: "ScratchDesktopCompanion-with-key.dmg",
    distributionFileName: "ScratchDesktopCompanion-with-key-mac.dmg",
    bundleFileName: "ScratchDesktopCompanion.app"
  });
});

test("buildMacBuilderConfig disables signing by default for internal macOS builds", () => {
  const config = buildMacBuilderConfig({
    appDir,
    outputDir: "/tmp/scratchai/apps/desktop-companion/release-mac-no-key",
    target: "dir",
    env: {}
  });

  assert.equal(config.mac.identity, null);
  assert.equal(
    config.mac.icon,
    path.join(appDir, "buildResources", "ScratchDesktop.icns")
  );
});

test("buildMacBuilderConfig allows explicit signing identity overrides", () => {
  const config = buildMacBuilderConfig({
    appDir,
    outputDir: "/tmp/scratchai/apps/desktop-companion/release-dmg-with-key",
    target: "dmg",
    env: {
      [MAC_SIGN_IDENTITY_ENV_NAME]: "Apple Development: Example (ABCDE12345)"
    }
  });

  assert.equal(config.mac.identity, "Apple Development: Example (ABCDE12345)");
});

test("resolveMacBuildCacheEnv provides writable temp cache defaults", () => {
  const env = resolveMacBuildCacheEnv({}, "/private/tmp");

  assert.equal(env.ELECTRON_CACHE, path.join("/private/tmp", "scratchai-electron-cache"));
  assert.equal(env.ELECTRON_BUILDER_CACHE, path.join("/private/tmp", "scratchai-electron-builder-cache"));
});

test("copyMacDirBundleToInstallers preserves relative framework symlinks in the copied app bundle", async (t) => {
  if (process.platform === "win32") {
    return t.skip("Windows runner does not provide stable macOS app bundle symlink semantics.");
  }

  const symlinkSupport = await detectRelativeSymlinkSupport("package-mac-symlink-check-");
  if (!symlinkSupport.supported) {
    return t.skip(`relative symlinks are unavailable in this environment: ${symlinkSupport.reason ?? "unsupported"}`);
  }

  const rootDir = await mkdtemp(path.join(os.tmpdir(), "package-mac-copy-"));
  const outputDir = path.join(rootDir, "release-mac-no-key");
  const sourceBundleDir = path.join(outputDir, "mac-arm64", "ScratchDesktopCompanion.app");
  const frameworksDir = path.join(sourceBundleDir, "Contents", "Frameworks", "Electron Framework.framework");
  const targetBundleDir = path.join(rootDir, "installers", "ScratchDesktopCompanion-mac.app");

  await mkdir(path.join(frameworksDir, "Versions", "A"), { recursive: true });
  await writeFile(path.join(frameworksDir, "Versions", "A", "payload.txt"), "ok");
  await symlink("Versions/Current/payload.txt", path.join(frameworksDir, "Electron Framework"), "file");
  await symlink("A", path.join(frameworksDir, "Versions", "Current"), "dir");

  await copyMacDirBundleToInstallers({
    outputDir,
    rootInstallersDir: path.join(rootDir, "installers"),
    bundleFileName: "ScratchDesktopCompanion.app",
    distributionBundleFileName: "ScratchDesktopCompanion-mac.app",
    arch: "arm64"
  });

  assert.equal(
    String(
      await readlink(
        path.join(targetBundleDir, "Contents", "Frameworks", "Electron Framework.framework", "Electron Framework")
      )
    ).replace(/\\/g, "/"),
    "Versions/Current/payload.txt"
  );
  assert.equal(
    String(
      await readlink(
        path.join(targetBundleDir, "Contents", "Frameworks", "Electron Framework.framework", "Versions", "Current")
      )
    ).replace(/\\/g, "/"),
    "A"
  );
});
