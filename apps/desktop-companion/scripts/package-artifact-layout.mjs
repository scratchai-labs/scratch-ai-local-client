import { getPackageVariantMeta } from "./package-variant.mjs";

export function getWindowsDistributionArtifactInfo(variant) {
  const variantMeta = getPackageVariantMeta(variant);

  return {
    portableFileName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-portable.exe"
        : `${variantMeta.artifactBaseName}-portable.exe`,
    installerFileName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-setup.exe"
        : `${variantMeta.artifactBaseName}-setup.exe`,
    unpackedDirName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-win-unpacked"
        : `${variantMeta.artifactBaseName}-win-unpacked`,
    directoryBundleDirName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-win32-x64"
        : `${variantMeta.artifactBaseName}-win32-x64`
  };
}

export function getMacDistributionArtifactInfo(variant) {
  const variantMeta = getPackageVariantMeta(variant);

  return {
    appBundleName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-mac.app"
        : `${variantMeta.artifactBaseName}-mac.app`,
    zipFileName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-mac.zip"
        : `${variantMeta.artifactBaseName}-mac.zip`,
    dmgFileName:
      variant === "no-key"
        ? "ScratchDesktopCompanion-mac.dmg"
        : `${variantMeta.artifactBaseName}-mac.dmg`
  };
}
