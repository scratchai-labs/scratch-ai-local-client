import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { resolvePackagedDeepSeekConfig } from "./scripts/package-variant.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const enableSourceMaps = false;

const buildConfigs = [
  {
    entryPoints: [path.join(__dirname, "src/main/main.ts")],
    outfile: path.join(distDir, "main.js"),
    platform: "node",
    format: "esm",
    external: ["electron"]
  },
  {
    entryPoints: [path.join(__dirname, "src/renderer/preload.ts")],
    outfile: path.join(distDir, "preload.cjs"),
    platform: "node",
    format: "cjs",
    external: ["electron"]
  },
  {
    entryPoints: [path.join(__dirname, "src/renderer/renderer.ts")],
    outfile: path.join(distDir, "renderer.js"),
    platform: "browser",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/renderer/settings-renderer.ts")],
    outfile: path.join(distDir, "settings-renderer.js"),
    platform: "browser",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/renderer/renderer-view.ts")],
    outfile: path.join(distDir, "renderer-view.js"),
    platform: "browser",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/common/scratch-block-xml.ts")],
    outfile: path.join(distDir, "scratch-block-xml.js"),
    platform: "browser",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/common/scratch-workspace-config.ts")],
    outfile: path.join(distDir, "scratch-workspace-config.js"),
    platform: "browser",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/coach-service.ts")],
    outfile: path.join(distDir, "coach-service.js"),
    platform: "node",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/deepseek-config.ts")],
    outfile: path.join(distDir, "deepseek-config.js"),
    platform: "node",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/state-store.ts")],
    outfile: path.join(distDir, "state-store.js"),
    platform: "node",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/session-manager.ts")],
    outfile: path.join(distDir, "session-manager.js"),
    platform: "node",
    format: "esm",
    external: ["electron"]
  },
  {
    entryPoints: [path.join(__dirname, "src/main/project-url-loader.ts")],
    outfile: path.join(distDir, "project-url-loader.js"),
    platform: "node",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/scratch-remote-debugger.ts")],
    outfile: path.join(distDir, "scratch-remote-debugger.js"),
    platform: "node",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/platform-adapter.ts")],
    outfile: path.join(distDir, "platform-adapter.js"),
    platform: "node",
    format: "esm"
  },
  {
    entryPoints: [path.join(__dirname, "src/main/scratch-executable-finder.ts")],
    outfile: path.join(distDir, "scratch-executable-finder.js"),
    platform: "node",
    format: "esm"
  }
];

async function copyStatic() {
  const html = await readFile(path.join(__dirname, "src/renderer/index.html"), "utf8");
  const settingsHtml = await readFile(path.join(__dirname, "src/renderer/settings.html"), "utf8");
  const deepSeekConfigRaw = await readFile(
    path.join(__dirname, "src/main/deepseek.config.json"),
    "utf8"
  );
  const sourceDeepSeekConfig = JSON.parse(deepSeekConfigRaw);
  const packagedDeepSeekConfig = resolvePackagedDeepSeekConfig(sourceDeepSeekConfig, process.env);
  await writeFile(path.join(distDir, "index.html"), html);
  await writeFile(path.join(distDir, "settings.html"), settingsHtml);
  await writeFile(
    path.join(distDir, "deepseek.config.json"),
    `${JSON.stringify(packagedDeepSeekConfig.config, null, 2)}\n`
  );
  await cp(path.join(__dirname, "src/assets"), path.join(distDir, "assets"), { recursive: true });
  await cp(
    path.join(__dirname, "..", "..", "node_modules", "scratch-blocks", "media"),
    path.join(distDir, "assets", "scratch-blocks-media"),
    { recursive: true }
  );
  process.stdout.write(
    `Packaged DeepSeek config mode=${packagedDeepSeekConfig.mode} configured=${packagedDeepSeekConfig.configured ? "yes" : "no"}\n`
  );
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await Promise.all(
  buildConfigs.map((config) =>
    build({
      bundle: true,
      sourcemap: enableSourceMaps,
      target: "es2022",
      ...config
    })
  )
);
await copyStatic();
