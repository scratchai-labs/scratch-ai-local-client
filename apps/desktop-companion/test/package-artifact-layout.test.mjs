import test from "node:test";
import assert from "node:assert/strict";

test("package artifact layout exposes root distribution names for Windows and macOS", async () => {
  const layoutModule = await import("../scripts/package-artifact-layout.mjs").catch(() => null);

  assert.notEqual(layoutModule, null);
  assert.equal(typeof layoutModule.getWindowsDistributionArtifactInfo, "function");
  assert.equal(typeof layoutModule.getMacDistributionArtifactInfo, "function");

  assert.deepEqual(layoutModule.getWindowsDistributionArtifactInfo("no-key"), {
    portableFileName: "ScratchDesktopCompanion-portable.exe",
    installerFileName: "ScratchDesktopCompanion-setup.exe",
    unpackedDirName: "ScratchDesktopCompanion-win-unpacked",
    directoryBundleDirName: "ScratchDesktopCompanion-win32-x64"
  });

  assert.deepEqual(layoutModule.getMacDistributionArtifactInfo("no-key"), {
    appBundleName: "ScratchDesktopCompanion-mac.app",
    zipFileName: "ScratchDesktopCompanion-mac.zip",
    dmgFileName: "ScratchDesktopCompanion-mac.dmg"
  });

  assert.throws(
    () => layoutModule.getWindowsDistributionArtifactInfo("with-key"),
    /Unsupported package variant "with-key"/
  );
  assert.throws(
    () => layoutModule.getMacDistributionArtifactInfo("with-key"),
    /Unsupported package variant "with-key"/
  );
});
