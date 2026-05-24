import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {build} from 'electron-builder';
import {copyFileWithRetry, copyPathWithRetry} from './copy-with-retry.mjs';
import {
    buildDesktopCompanionBuilderBaseConfig
} from './electron-builder-config.mjs';
import {getWindowsDistributionArtifactInfo} from './package-artifact-layout.mjs';
import {getPackageVariantMeta, hasCliFlag, parsePackageVariantArg, runBuildForVariant} from './package-variant.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const thisFilePath = fileURLToPath(import.meta.url);
const appDir = path.resolve(__dirname, '..');
const iconPath = path.join(appDir, 'buildResources', 'ScratchDesktop.ico');
export function buildWindowsPortableBuilderConfig({
    appDir,
    outputDir,
    iconPath,
    artifactBaseName
}) {
    return {
        ...buildDesktopCompanionBuilderBaseConfig({
            appDir,
            outputDir
        }),
        win: {
            icon: iconPath,
            target: [
                {
                    target: 'portable',
                    arch: ['x64']
                }
            ]
        },
        artifactName: `${artifactBaseName}-portable.\${ext}`
    };
}

async function main() {
    const variant = parsePackageVariantArg(process.argv);
    const variantMeta = getPackageVariantMeta(variant);
    const distributionInfo = getWindowsDistributionArtifactInfo(variant);
    const outputDir = path.join(appDir, `release-single${variantMeta.outputDirSuffix}`);
    const portableFileName = `${variantMeta.artifactBaseName}-portable.exe`;
    const rootInstallersDir = path.resolve(appDir, '..', '..', 'installers');
    const rootPortablePath = path.join(rootInstallersDir, distributionInfo.portableFileName);
    const rootUnpackedPath = path.join(rootInstallersDir, distributionInfo.unpackedDirName);

    if (!hasCliFlag(process.argv, '--skip-build')) {
        runBuildForVariant(appDir, variant);
    }

    await build({
        projectDir: appDir,
        targets: undefined,
        config: buildWindowsPortableBuilderConfig({
            appDir,
            outputDir,
            iconPath,
            artifactBaseName: variantMeta.artifactBaseName
        })
    });

    if (!hasCliFlag(process.argv, '--skip-installers-copy')) {
        await mkdir(rootInstallersDir, {recursive: true});
        await copyFileWithRetry(path.join(outputDir, portableFileName), rootPortablePath);
        await copyPathWithRetry(path.join(outputDir, 'win-unpacked'), rootUnpackedPath);
    }

    process.stdout.write(`Portable build (${variantMeta.displayName}) written to ${outputDir}\n`);
    if (!hasCliFlag(process.argv, '--skip-installers-copy')) {
        process.stdout.write(`Portable copied to root installers folder: ${rootPortablePath}\n`);
        process.stdout.write(`win-unpacked copied to root installers folder: ${rootUnpackedPath}\n`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFilePath) {
    await main();
}
