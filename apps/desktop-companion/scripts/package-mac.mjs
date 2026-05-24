import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "electron-builder";

import { probeMacDmgSupport } from "../../../tools/verification/scripts/runtime-support.mjs";
import { copyFileWithRetry, copyPathWithRetry } from "./copy-with-retry.mjs";
import {
  buildDesktopCompanionBuilderBaseConfig
} from "./electron-builder-config.mjs";
import { getMacDistributionArtifactInfo } from "./package-artifact-layout.mjs";
import {
  getPackageVariantMeta,
  hasCliFlag,
  parsePackageVariantArg,
  runBuildForVariant
} from "./package-variant.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const thisFilePath = fileURLToPath(import.meta.url);
const appDir = path.resolve(__dirname, "..");
const rootInstallersDir = path.resolve(appDir, "..", "..", "installers");
const currentArch = process.arch === "arm64" ? "arm64" : "x64";

const VALID_MAC_PACKAGE_TARGETS = new Set(["dir", "dmg", "zip"]);
export const MAC_SIGN_IDENTITY_ENV_NAME = "SCRATCH_AI_MAC_SIGN_IDENTITY";

export function resolveMacBuildCacheEnv(env = process.env, tempDir = os.tmpdir()) {
  const nextEnv = { ...env };
  nextEnv.ELECTRON_CACHE = nextEnv.ELECTRON_CACHE || path.join(tempDir, "scratchai-electron-cache");
  nextEnv.ELECTRON_BUILDER_CACHE =
    nextEnv.ELECTRON_BUILDER_CACHE || path.join(tempDir, "scratchai-electron-builder-cache");
  return nextEnv;
}

export function getMacBundleOutputDirName(arch = currentArch) {
  return arch === "arm64" ? "mac-arm64" : "mac";
}

export function parseMacPackageTargetArg(argv, defaultTarget = "dir") {
  const rawArg = argv.find((arg) => arg.startsWith("--target="));
  const target = rawArg ? rawArg.slice("--target=".length).trim() : defaultTarget;

  if (!VALID_MAC_PACKAGE_TARGETS.has(target)) {
    throw new Error(`Unsupported macOS package target "${target}". Expected one of: dir, dmg, zip.`);
  }

  return target;
}

export function getMacPackageArtifactInfo(variant, target) {
  const variantMeta = getPackageVariantMeta(variant);
  const distributionInfo = getMacDistributionArtifactInfo(variant);
  if (target === "dir") {
    return {
      target,
      outputDirName: `release-mac${variantMeta.outputDirSuffix}`,
      bundleFileName: "ScratchDesktopCompanion.app",
      distributionBundleFileName: distributionInfo.appBundleName
    };
  }

  if (target === "zip") {
    return {
      target,
      outputDirName: `release-zip${variantMeta.outputDirSuffix}`,
      artifactFileName: `${variantMeta.artifactBaseName}.zip`,
      distributionFileName: distributionInfo.zipFileName,
      bundleFileName: "ScratchDesktopCompanion.app"
    };
  }

  return {
    target,
    outputDirName: `release-dmg${variantMeta.outputDirSuffix}`,
    artifactFileName: `${variantMeta.artifactBaseName}.dmg`,
    distributionFileName: distributionInfo.dmgFileName,
    bundleFileName: "ScratchDesktopCompanion.app"
  };
}

export function buildMacBuilderConfig({
  appDir,
  outputDir,
  target,
  env = process.env,
  arch = currentArch
}) {
  const signingIdentity = typeof env[MAC_SIGN_IDENTITY_ENV_NAME] === "string"
    ? env[MAC_SIGN_IDENTITY_ENV_NAME].trim()
    : "";
  const config = {
    ...buildDesktopCompanionBuilderBaseConfig({
      appDir,
      outputDir
    }),
    mac: {
      category: "public.app-category.education",
      icon: path.join(appDir, "buildResources", "ScratchDesktop.icns"),
      identity: signingIdentity || null,
      target: [
        {
          target,
          arch: [arch]
        }
      ]
    }
  };

  return config;
}

export async function copyMacDirBundleToInstallers({
  outputDir,
  rootInstallersDir,
  bundleFileName,
  distributionBundleFileName,
  arch = currentArch
}) {
  await copyPathWithRetry(
    path.join(outputDir, getMacBundleOutputDirName(arch), bundleFileName),
    path.join(rootInstallersDir, distributionBundleFileName)
  );
}

async function main() {
  const target = parseMacPackageTargetArg(process.argv);
  const variant = parsePackageVariantArg(process.argv);
  const variantMeta = getPackageVariantMeta(variant);
  const artifactInfo = getMacPackageArtifactInfo(variant, target);
  const outputDir = path.join(appDir, artifactInfo.outputDirName);
  const buildEnv = resolveMacBuildCacheEnv(process.env);

  process.env.ELECTRON_CACHE = buildEnv.ELECTRON_CACHE;
  process.env.ELECTRON_BUILDER_CACHE = buildEnv.ELECTRON_BUILDER_CACHE;
  await mkdir(process.env.ELECTRON_CACHE, { recursive: true });
  await mkdir(process.env.ELECTRON_BUILDER_CACHE, { recursive: true });

  if (!hasCliFlag(process.argv, "--skip-build")) {
    runBuildForVariant(appDir, variant);
  }

  if (target === "dmg") {
    const dmgSupport = probeMacDmgSupport({
      tempDir: process.env.ELECTRON_BUILDER_CACHE ?? process.env.ELECTRON_CACHE ?? os.tmpdir()
    });
    if (!dmgSupport.supported) {
      const message = `Skipping macOS dmg build (${variantMeta.displayName}): ${dmgSupport.reason}`;
      if (hasCliFlag(process.argv, "--require-dmg")) {
        throw new Error(message);
      }
      process.stdout.write(`${message}\n`);
      return;
    }
  }

  const config = buildMacBuilderConfig({
    appDir,
    outputDir,
    target,
    env: process.env
  });

  if (target === "dmg" || target === "zip") {
    config.mac.artifactName = `${variantMeta.artifactBaseName}.\${ext}`;
  }

  await build({
    projectDir: appDir,
    targets: undefined,
    config
  });

  if (!hasCliFlag(process.argv, "--skip-installers-copy")) {
    await mkdir(rootInstallersDir, { recursive: true });

    if (target === "dir") {
      await copyMacDirBundleToInstallers({
        outputDir,
        rootInstallersDir,
        bundleFileName: artifactInfo.bundleFileName,
        distributionBundleFileName: artifactInfo.distributionBundleFileName
      });
    } else {
      await copyFileWithRetry(
        path.join(outputDir, artifactInfo.artifactFileName),
        path.join(rootInstallersDir, artifactInfo.distributionFileName)
      );
    }
  }

  process.stdout.write(`macOS ${target} build (${variantMeta.displayName}) written to ${outputDir}\n`);
  if (!hasCliFlag(process.argv, "--skip-installers-copy")) {
    if (target === "dir") {
      process.stdout.write(
        `macOS app copied to root installers folder: ${path.join(rootInstallersDir, artifactInfo.distributionBundleFileName)}\n`
      );
    } else {
      process.stdout.write(
        `macOS ${target} copied to root installers folder: ${path.join(rootInstallersDir, artifactInfo.distributionFileName)}\n`
      );
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFilePath) {
  await main();
}
