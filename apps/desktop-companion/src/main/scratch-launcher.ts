import { EventEmitter } from "node:events";
import { access } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

export type ScratchLaunchLocaleProvider = () => string | undefined;

export interface ScratchLaunchSession {
  pid: number;
  debugPort: number;
  scratchExecutablePath: string;
  args: string[];
  locale?: string;
  onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): () => void;
}

export function normalizeScratchLaunchLocale(locale?: string | null) {
  const normalized = String(locale ?? "").trim().replace("_", "-");
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split("-").filter(Boolean);
  const [language] = parts;
  if (!language) {
    return undefined;
  }

  if (language.toLowerCase() === "zh") {
    const hasTraditionalScriptOrRegion = parts
      .slice(1)
      .some((part) => ["hant", "tw", "hk", "mo"].includes(part.toLowerCase()));
    return hasTraditionalScriptOrRegion ? "zh-TW" : "zh-CN";
  }

  const region = parts.slice(1).find((part) => part.length === 2 || part.length === 3);
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

export function resolvePreferredScratchLaunchLocale(
  preferredLocales?: readonly (string | null | undefined)[],
  fallbackLocale?: string | null
) {
  const normalizedPreferredLocales = (preferredLocales ?? [])
    .map((locale) => normalizeScratchLaunchLocale(locale))
    .filter((locale): locale is string => Boolean(locale));
  const preferredChineseLocale = normalizedPreferredLocales.find((locale) => locale.startsWith("zh-"));
  const normalizedFallbackLocale = normalizeScratchLaunchLocale(fallbackLocale);
  if (normalizedFallbackLocale?.startsWith("en") && preferredChineseLocale) {
    return preferredChineseLocale;
  }
  if (normalizedFallbackLocale) {
    return normalizedFallbackLocale;
  }

  if (normalizedPreferredLocales.length > 0) {
    return normalizedPreferredLocales[0];
  }

  return undefined;
}

function parseMacOsAppleLanguages(rawOutput: string) {
  return rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"|"[,]?$/g, "").replace(/,$/, ""))
    .filter((line) => /^[a-z]{2,3}([_-][a-zA-Z0-9]+)*$/i.test(line));
}

export function readMacOsPreferredLanguages() {
  if (process.platform !== "darwin") {
    return [];
  }

  try {
    return parseMacOsAppleLanguages(execFileSync("defaults", ["read", "-g", "AppleLanguages"], {
      encoding: "utf8",
      timeout: 1000
    }));
  } catch {
    return [];
  }
}

export function createScratchLaunchLocaleProvider(
  preferredLocalesProvider: () => readonly (string | null | undefined)[] | undefined,
  fallbackLocaleProvider: () => string | undefined,
  macOsPreferredLanguagesProvider: () => readonly string[] = readMacOsPreferredLanguages
): ScratchLaunchLocaleProvider {
  return () => {
    const preferredLocales = [
      ...(preferredLocalesProvider() ?? []),
      ...macOsPreferredLanguagesProvider()
    ];
    return resolvePreferredScratchLaunchLocale(preferredLocales, fallbackLocaleProvider());
  };
}

export function buildScratchLaunchArgs(debugPort: number, locale?: string | null) {
  const args = [`--remote-debugging-port=${debugPort}`];
  const normalizedLocale = normalizeScratchLaunchLocale(locale);
  if (normalizedLocale) {
    args.push(`--lang=${normalizedLocale}`);
  }
  return args;
}

async function getAvailablePort() {
  const server = createServer();

  return await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a remote debugging port."));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

export class ScratchLauncher {
  constructor(
    private readonly localeProvider: ScratchLaunchLocaleProvider = () =>
      Intl.DateTimeFormat().resolvedOptions().locale
  ) {}

  async launch(scratchExecutablePath: string): Promise<ScratchLaunchSession> {
    await access(scratchExecutablePath);

    const debugPort = await getAvailablePort();
    const locale = this.localeProvider();
    const args = buildScratchLaunchArgs(debugPort, locale);
    const processEvents = new EventEmitter();
    const child = spawn(scratchExecutablePath, args, {
      cwd: path.dirname(scratchExecutablePath),
      stdio: "ignore",
      windowsHide: false
    });

    const pid = await new Promise<number>((resolve, reject) => {
      child.once("spawn", () => {
        if (!child.pid) {
          reject(new Error("Scratch process started without a pid."));
          return;
        }

        resolve(child.pid);
      });
      child.once("error", reject);
    });

    child.once("exit", (code, signal) => {
      processEvents.emit("exit", code, signal);
    });

    return {
      pid,
      debugPort,
      scratchExecutablePath,
      args,
      locale: normalizeScratchLaunchLocale(locale),
      onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void) {
        processEvents.on("exit", listener);
        return () => {
          processEvents.off("exit", listener);
        };
      }
    };
  }
}
