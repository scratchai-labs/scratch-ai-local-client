import path from "node:path";

export function getDefaultElectronBinaryPath(workspaceRoot) {
  if (process.platform === "darwin") {
    return path.join(
      workspaceRoot,
      "apps",
      "desktop-companion",
      "node_modules",
      "electron",
      "dist",
      "Electron.app",
      "Contents",
      "MacOS",
      "Electron"
    );
  }

  return path.join(
    workspaceRoot,
    "apps",
    "desktop-companion",
    "node_modules",
    "electron",
    "dist",
    "electron.exe"
  );
}

export function getDefaultPackagedCompanionBinaryPath(workspaceRoot) {
  if (process.platform === "darwin") {
    const macOutputDirName = process.arch === "arm64" ? "mac-arm64" : "mac";
    return path.join(
      workspaceRoot,
      "apps",
      "desktop-companion",
      "release-mac",
      macOutputDirName,
      "ScratchDesktopCompanion.app",
      "Contents",
      "MacOS",
      "ScratchDesktopCompanion"
    );
  }

  return path.join(
    workspaceRoot,
    "apps",
    "desktop-companion",
    "release-single",
    "win-unpacked",
    "ScratchDesktopCompanion.exe"
  );
}

export function getDefaultAutomationScratchPath() {
  if (process.platform === "darwin") {
    return "/Applications/Scratch.app/Contents/MacOS/Scratch";
  }

  return "C:\\Automation\\Scratch 3.exe";
}
