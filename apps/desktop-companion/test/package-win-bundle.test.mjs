import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function probeBundleModule() {
  const script = [
    "import path from 'node:path';",
    "import { pathToFileURL } from 'node:url';",
    "const moduleUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'package-win-bundle.mjs')).href;",
    "const mod = await import(moduleUrl);",
    "const portableBuild = mod.getArtifactBuildInfo('portable', 'with-key');",
    "const installerBuild = mod.getArtifactBuildInfo('installer', 'no-key');",
    "process.stdout.write(JSON.stringify({",
    "  exportKeys: Object.keys(mod).sort(),",
    "  portableArgs: mod.buildBundleSubprocessArgs(portableBuild),",
    "  installerArgs: mod.buildBundleSubprocessArgs(installerBuild),",
    "  portableBundleFileName: portableBuild.bundleFileName,",
    "  portableRootUnpackedPath: portableBuild.rootUnpackedPath,",
    "  sourceConfigPath: mod.getSourceConfigPath()",
    "}));"
  ].join("\n");

  const { stdout } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: appDir
    }
  );

  return JSON.parse(stdout);
}

test("package-win-bundle can be imported for planning without executing packaging work", async () => {
  const result = await probeBundleModule();

  assert.deepEqual(result.exportKeys, [
    "buildBundleSubprocessArgs",
    "getArtifactBuildInfo",
    "getSourceConfigPath",
    "main"
  ]);
});

test("package-win-bundle child build args skip redundant installer copies", async () => {
  const result = await probeBundleModule();

  assert.deepEqual(result.portableArgs.slice(1), [
    "--variant=with-key",
    "--skip-build",
    "--skip-installers-copy"
  ]);
  assert.deepEqual(result.installerArgs.slice(1), [
    "--variant=no-key",
    "--skip-build",
    "--skip-installers-copy"
  ]);
});

test("package-win-bundle portable artifacts expose the root win-unpacked target", async () => {
  const result = await probeBundleModule();

  assert.equal(result.portableBundleFileName, "ScratchDesktopCompanion-with-key-portable.exe");
  assert.match(
    result.portableRootUnpackedPath,
    /ScratchDesktopCompanion-with-key-win-unpacked$/
  );
});

test("package-win-bundle resolves the checked-in DeepSeek config path from src/main", async () => {
  const result = await probeBundleModule();

  assert.match(result.sourceConfigPath, /src[\\\\/]main[\\\\/]deepseek\.config\.json$/);
});
