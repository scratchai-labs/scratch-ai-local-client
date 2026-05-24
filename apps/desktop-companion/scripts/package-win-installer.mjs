import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {build} from 'electron-builder';
import {copyFileWithRetry} from './copy-with-retry.mjs';
import {
    buildDesktopCompanionBuilderBaseConfig
} from './electron-builder-config.mjs';
import {getWindowsDistributionArtifactInfo} from './package-artifact-layout.mjs';
import {getPackageVariantMeta, hasCliFlag, parsePackageVariantArg, runBuildForVariant} from './package-variant.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const thisFilePath = fileURLToPath(import.meta.url);
const appDir = path.resolve(__dirname, '..');
const iconPath = path.join(appDir, 'buildResources', 'ScratchDesktop.ico');
export function buildWindowsInstallerBuilderConfig({
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
                    target: 'nsis',
                    arch: ['x64']
                }
            ]
        },
        nsis: {
            oneClick: false,
            perMachine: false,
            allowToChangeInstallationDirectory: true,
            installerIcon: iconPath,
            uninstallerIcon: iconPath,
            installerHeaderIcon: iconPath
        },
        artifactName: `${artifactBaseName}-setup.\${ext}`
    };
}

async function main() {
    const variant = parsePackageVariantArg(process.argv);
    const variantMeta = getPackageVariantMeta(variant);
    const distributionInfo = getWindowsDistributionArtifactInfo(variant);
    const outputDir = path.join(appDir, `release-installer${variantMeta.outputDirSuffix}`);
    const installerFileName = `${variantMeta.artifactBaseName}-setup.exe`;
    const rootInstallersDir = path.resolve(appDir, '..', '..', 'installers');
    const rootInstallerPath = path.join(rootInstallersDir, distributionInfo.installerFileName);

    if (!hasCliFlag(process.argv, '--skip-build')) {
        runBuildForVariant(appDir, variant);
    }

    await build({
        projectDir: appDir,
        targets: undefined,
        config: buildWindowsInstallerBuilderConfig({
            appDir,
            outputDir,
            iconPath,
            artifactBaseName: variantMeta.artifactBaseName
        })
    });

    if (!hasCliFlag(process.argv, '--skip-installers-copy') && !hasCliFlag(process.argv, '--skip-root-copy')) {
        await mkdir(rootInstallersDir, {recursive: true});
        await copyFileWithRetry(path.join(outputDir, installerFileName), rootInstallerPath);
    }

    process.stdout.write(`Installer build (${variantMeta.displayName}) written to ${outputDir}\n`);
    if (!hasCliFlag(process.argv, '--skip-installers-copy') && !hasCliFlag(process.argv, '--skip-root-copy')) {
        process.stdout.write(`Installer copied to root installers folder: ${rootInstallerPath}\n`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFilePath) {
    await main();
}
