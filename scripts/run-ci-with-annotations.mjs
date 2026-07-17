#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_TAIL_LINES = 200;
const MAX_ANNOTATION_CHARS = 60_000;

export function escapeGitHubAnnotation(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export function resolveCommandForPlatform(command, platform = process.platform) {
  if (platform === "win32" && ["npm", "npx"].includes(command.toLowerCase())) {
    return `${command}.cmd`;
  }
  return command;
}

export function buildSpawnOptions(platform = process.platform) {
  return {
    shell: platform === "win32",
    windowsHide: true
  };
}

export class TailBuffer {
  constructor(maxLines = DEFAULT_TAIL_LINES) {
    this.maxLines = maxLines;
    this.value = "";
  }

  append(chunk) {
    this.value += String(chunk);
    const lines = this.value.split(/\r?\n/);
    const hasTrailingNewline = /\r?\n$/.test(this.value);
    if (hasTrailingNewline) {
      lines.pop();
    }
    const retained = lines.slice(-this.maxLines);
    this.value = retained.join("\n") + (hasTrailingNewline ? "\n" : "");
  }

  toString() {
    return this.value.replace(/\r?\n$/, "");
  }
}

export async function runCommand(command, args, options = {}) {
  const tail = new TailBuffer(options.tailLines ?? DEFAULT_TAIL_LINES);
  const platform = options.platform ?? process.platform;
  const executable = resolveCommandForPlatform(command, platform);
  let child;
  try {
    child = (options.spawnFn ?? spawn)(executable, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      ...buildSpawnOptions(platform)
    });
  } catch (error) {
    tail.append(`${error.name}: ${error.message}\n`);
    return { exitCode: 1, tail: tail.toString() };
  }

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    tail.append(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    tail.append(chunk);
  });

  return await new Promise((resolve) => {
    child.on("error", (error) => {
      tail.append(`${error.name}: ${error.message}\n`);
      resolve({ exitCode: 1, tail: tail.toString() });
    });
    child.on("close", (code, signal) => {
      if (signal) {
        tail.append(`Command terminated by signal ${signal}\n`);
      }
      resolve({ exitCode: code ?? 1, tail: tail.toString() });
    });
  });
}

async function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("Usage: node scripts/run-ci-with-annotations.mjs <command> [...args]");
    return 2;
  }

  const result = await runCommand(command, args);
  if (result.exitCode !== 0) {
    const tail = result.tail.slice(-MAX_ANNOTATION_CHARS) || "Command failed without output.";
    console.log(`::error title=CI command failed::${escapeGitHubAnnotation(tail)}`);
  }
  return result.exitCode;
}

const isDirectInvocation = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  process.exitCode = await main(process.argv.slice(2));
}
