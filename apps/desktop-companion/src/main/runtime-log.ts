import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

let logFilePath: string | null = null;

const require = createRequire(import.meta.url);

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ""}`.trim();
  }
  return String(error);
}

export function initializeRuntimeLog() {
  const { app } = require("electron");
  const logDir = app.getPath("userData");
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, "desktop-companion.log");
  fs.appendFileSync(
    logFilePath,
    `\n[${new Date().toISOString()}] runtime log initialized\n`,
    "utf8"
  );
  return logFilePath;
}

export function getRuntimeLogPath() {
  return logFilePath;
}

export function writeRuntimeLog(message: string, error?: unknown) {
  const line = [`[${new Date().toISOString()}]`, message];
  if (error !== undefined) {
    line.push(toMessage(error));
  }

  try {
    if (logFilePath) {
      fs.appendFileSync(logFilePath, `${line.join(" ")}\n`, "utf8");
    }
  } catch {
    // Ignore log write failures to avoid breaking the app.
  }
}
