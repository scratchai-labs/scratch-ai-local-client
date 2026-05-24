import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import packager from '@electron/packager';
import {copyPathWithRetry} from './copy-with-retry.mjs';
import {getWindowsDistributionArtifactInfo} from './package-artifact-layout.mjs';
import {getPackageVariantMeta, hasCliFlag, parsePackageVariantArg, runBuildForVariant} from './package-variant.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const iconPath = path.join(appDir, 'buildResources', 'ScratchDesktop.ico');
const variant = parsePackageVariantArg(process.argv);
const variantMeta = getPackageVariantMeta(variant);
const distributionInfo = getWindowsDistributionArtifactInfo(variant);
const outputDir = path.join(appDir, `release${variantMeta.outputDirSuffix}`);
const rootInstallersDir = path.resolve(appDir, '..', '..', 'installers');
const packagedDirectoryName = 'ScratchDesktopCompanion-win32-x64';
const rootPackagedDirectoryPath = path.join(rootInstallersDir, distributionInfo.directoryBundleDirName);

if (!hasCliFlag(process.argv, '--skip-build')) {
    runBuildForVariant(appDir, variant);
}

await rm(outputDir, {recursive: true, force: true});

await packager({
    dir: appDir,
    out: outputDir,
    platform: 'win32',
    arch: 'x64',
    overwrite: true,
    asar: true,
    prune: false,
    icon: iconPath,
    executableName: 'ScratchDesktopCompanion',
    name: 'ScratchDesktopCompanion',
    ignore: [
        /\/release(?:-(?:single|installer))?(?:-(?:with-key|no-key))?($|\/)/,
        /\/test($|\/)/
    ]
});

process.stdout.write(`Packaged directory build (${variantMeta.displayName}) written to ${outputDir}\n`);
if (!hasCliFlag(process.argv, '--skip-installers-copy')) {
    await mkdir(rootInstallersDir, {recursive: true});
    await copyPathWithRetry(path.join(outputDir, packagedDirectoryName), rootPackagedDirectoryPath);
    process.stdout.write(`Packaged directory copied to root installers folder: ${rootPackagedDirectoryPath}\n`);
}
