import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  findScratchExecutableCandidates as findWindowsScratchExecutableCandidates,
  findScratchExecutableCandidatesFromShortcuts,
  resolveScratchExecutableSelection as resolveWindowsScratchExecutableSelection
} from "./scratch-executable-finder";
import type {
  ResolveScratchExecutableSelectionDependencies,
  ShortcutDetails,
  ShortcutSearchDependencies
} from "./scratch-executable-finder";

const USER_DATA_DIR_SEGMENTS = ["@scratch-ai", "desktop-companion"];
const MAC_SCRATCH_APP_NAMES = ["Scratch.app", "Scratch Desktop.app", "Scratch 3.app"];

interface MacSelectionDependencies {
  access?: typeof access;
  readFile?: typeof readFile;
  readdir?: typeof readdir;
}

export interface ScratchPlatformSupport {
  id: string;
  displayName: string;
  supported: boolean;
}

export interface ScratchPlatformAdapter extends ScratchPlatformSupport {
  selectionLabel: string;
  selectionDialogTitle: string;
  defaultAutomationScratchExecutablePath: string;
  getDefaultUserDataDir(appDataPath: string): string;
  getDialogDefaultPath(options: {
    currentScratchPath?: string;
    autoDetectedCandidates?: string[];
    desktopPath: string;
  }): string;
  findScratchExecutableCandidates(
    dependencies?: ShortcutSearchDependencies & {
      env?: NodeJS.ProcessEnv;
      homeDir?: string;
      desktopPath?: string;
      publicDesktopPath?: string;
    }
  ): Promise<string[]>;
  resolveScratchExecutableSelection(
    selectedPath: string,
    dependencies?: ResolveScratchExecutableSelectionDependencies & MacSelectionDependencies
  ): Promise<string>;
}

function buildDefaultUserDataDir(appDataPath: string) {
  return path.join(appDataPath, ...USER_DATA_DIR_SEGMENTS);
}

function dedupePaths(paths: string[]) {
  const deduped: string[] = [];
  for (const candidate of paths) {
    if (!deduped.includes(candidate)) {
      deduped.push(candidate);
    }
  }
  return deduped;
}

function resolvePlatformDisplayName(platform: string) {
  if (platform === "win32") {
    return "Windows";
  }

  if (platform === "darwin") {
    return "macOS";
  }

  if (platform === "linux") {
    return "Linux";
  }

  return platform;
}

export function resolveScratchPlatform(platform: string): ScratchPlatformSupport {
  return {
    id: platform,
    displayName: resolvePlatformDisplayName(platform),
    supported: platform === "win32" || platform === "darwin"
  };
}

function extractMacAppBundlePath(filePath?: string) {
  const normalized = typeof filePath === "string" ? filePath.trim() : "";
  if (!normalized) {
    return null;
  }

  const bundleMarkerIndex = normalized.toLowerCase().indexOf(".app");
  if (bundleMarkerIndex < 0) {
    return null;
  }

  return normalized.slice(0, bundleMarkerIndex + 4);
}

function buildMacExecutablePath(appBundlePath: string, executableName: string) {
  return path.posix.join(appBundlePath, "Contents", "MacOS", executableName);
}

function parseMacBundleExecutableName(infoPlistText: string) {
  const match = infoPlistText.match(/<key>\s*CFBundleExecutable\s*<\/key>\s*<string>([^<]+)<\/string>/i);
  return match?.[1]?.trim() || undefined;
}

async function readMacBundleExecutableName(appBundlePath: string, dependencies: MacSelectionDependencies) {
  const readFileImpl = dependencies.readFile ?? readFile;

  try {
    const infoPlistText = await readFileImpl(
      path.posix.join(appBundlePath, "Contents", "Info.plist"),
      "utf8"
    );
    return parseMacBundleExecutableName(infoPlistText);
  } catch {
    return undefined;
  }
}

function isMacScratchAppBundlePath(filePath: string) {
  const normalized = path.posix.basename(filePath).trim().toLowerCase();
  return normalized === "scratch.app" || normalized === "scratch desktop.app" || normalized === "scratch 3.app";
}

function isMacScratchExecutablePath(filePath: string) {
  const normalized = path.posix.basename(filePath).trim().toLowerCase();
  return normalized === "scratch" || normalized === "scratch desktop" || normalized === "scratch 3";
}

export async function resolveMacAppBundleExecutable(
  appBundlePath: string,
  dependencies: MacSelectionDependencies = {}
) {
  const readdirImpl = dependencies.readdir ?? readdir;
  const accessImpl = dependencies.access ?? access;
  const normalizedBundlePath = appBundlePath.trim();
  const macOsDir = path.posix.join(normalizedBundlePath, "Contents", "MacOS");

  let entries: string[];
  try {
    entries = await readdirImpl(macOsDir);
  } catch {
    throw new Error("这个 Scratch 应用包里没有可启动程序，请重新选择。");
  }

  const fileEntries = entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("."));

  if (fileEntries.length === 0) {
    throw new Error("这个 Scratch 应用包里没有可启动程序，请重新选择。");
  }

  const preferredExecutableName = await readMacBundleExecutableName(normalizedBundlePath, dependencies);
  const prioritizedEntries = [
    preferredExecutableName,
    ...fileEntries.filter((entry) => isMacScratchExecutablePath(entry)),
    ...fileEntries
  ].filter((entry, index, values): entry is string => Boolean(entry) && values.indexOf(entry) === index);

  for (const entry of prioritizedEntries) {
    const executablePath = buildMacExecutablePath(normalizedBundlePath, entry);
    try {
      await accessImpl(executablePath);
      return executablePath;
    } catch {
      // Try the next matching entry.
    }
  }

  throw new Error("选中的 Scratch 软件不存在，请重新选择。");
}

async function findMacScratchExecutableCandidates(
  dependencies: Pick<MacSelectionDependencies, "access" | "readdir" | "readFile"> & {
    homeDir?: string;
  } = {}
) {
  const accessImpl = dependencies.access ?? access;
  const homeDir = dependencies.homeDir?.trim();
  const appBundleCandidates = [
    ...MAC_SCRATCH_APP_NAMES.map((name) => path.posix.join("/Applications", name)),
    ...(homeDir ? MAC_SCRATCH_APP_NAMES.map((name) => path.posix.join(homeDir, "Applications", name)) : [])
  ];

  const executableCandidates: string[] = [];

  for (const appBundlePath of appBundleCandidates) {
    try {
      await accessImpl(appBundlePath);
    } catch {
      continue;
    }

    try {
      executableCandidates.push(await resolveMacAppBundleExecutable(appBundlePath, dependencies));
    } catch {
      // Ignore broken app bundles during auto-detection.
    }
  }

  return dedupePaths(executableCandidates);
}

function getMacSelectionRootPath(filePath?: string) {
  const appBundlePath = extractMacAppBundlePath(filePath);
  if (appBundlePath) {
    return appBundlePath;
  }

  if (filePath?.trim()) {
    return path.dirname(filePath);
  }

  return undefined;
}

function createWindowsPlatformAdapter(): ScratchPlatformAdapter {
  return {
    ...resolveScratchPlatform("win32"),
    selectionLabel: "Scratch.exe 或 Scratch 3.exe",
    selectionDialogTitle: "选择老师机上的 Scratch 可执行文件（Scratch.exe / Scratch 3.exe）或桌面快捷方式",
    defaultAutomationScratchExecutablePath: "C:\\Automation\\Scratch 3.exe",
    getDefaultUserDataDir(appDataPath: string) {
      return buildDefaultUserDataDir(appDataPath);
    },
    getDialogDefaultPath({ currentScratchPath, autoDetectedCandidates, desktopPath }) {
      return (
        (currentScratchPath?.trim() ? path.dirname(currentScratchPath) : undefined) ||
        (autoDetectedCandidates?.[0] ? path.dirname(autoDetectedCandidates[0]) : undefined) ||
        desktopPath
      );
    },
    async findScratchExecutableCandidates(dependencies = {}) {
      const candidates = await findWindowsScratchExecutableCandidates(dependencies.env);
      const desktopShortcutDirectories = [dependencies.desktopPath].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      );

      if (dependencies.publicDesktopPath?.trim()) {
        desktopShortcutDirectories.push(dependencies.publicDesktopPath.trim());
      }

      const shortcutCandidates = await findScratchExecutableCandidatesFromShortcuts(
        desktopShortcutDirectories,
        dependencies
      );

      return dedupePaths([...candidates, ...shortcutCandidates]);
    },
    async resolveScratchExecutableSelection(selectedPath: string, dependencies = {}) {
      return await resolveWindowsScratchExecutableSelection(selectedPath, dependencies);
    }
  };
}

function createMacPlatformAdapter(): ScratchPlatformAdapter {
  return {
    ...resolveScratchPlatform("darwin"),
    selectionLabel: "Scratch.app 或 Scratch Desktop.app",
    selectionDialogTitle: "选择老师机上的 Scratch 应用（Scratch.app / Scratch Desktop.app）",
    defaultAutomationScratchExecutablePath: "/Applications/Scratch.app/Contents/MacOS/Scratch",
    getDefaultUserDataDir(appDataPath: string) {
      return buildDefaultUserDataDir(appDataPath);
    },
    getDialogDefaultPath({ currentScratchPath, autoDetectedCandidates, desktopPath }) {
      return (
        getMacSelectionRootPath(currentScratchPath) ||
        getMacSelectionRootPath(autoDetectedCandidates?.[0]) ||
        desktopPath
      );
    },
    async findScratchExecutableCandidates(dependencies = {}) {
      return await findMacScratchExecutableCandidates(dependencies);
    },
    async resolveScratchExecutableSelection(selectedPath: string, dependencies = {}) {
      const normalizedSelection = selectedPath.trim();
      if (!normalizedSelection) {
        throw new Error("请选择 Scratch.app、Scratch Desktop.app，或它们应用包里的可执行文件。");
      }

      const accessImpl = dependencies.access ?? access;
      const appBundlePath = extractMacAppBundlePath(normalizedSelection);

      if (appBundlePath) {
        if (!isMacScratchAppBundlePath(appBundlePath)) {
          throw new Error("请选择 Scratch.app、Scratch Desktop.app，或它们应用包里的可执行文件。");
        }

        return await resolveMacAppBundleExecutable(appBundlePath, dependencies);
      }

      if (!isMacScratchExecutablePath(normalizedSelection)) {
        throw new Error("请选择 Scratch.app、Scratch Desktop.app，或它们应用包里的可执行文件。");
      }

      try {
        await accessImpl(normalizedSelection);
      } catch {
        throw new Error("选中的 Scratch 软件不存在，请重新选择。");
      }

      return normalizedSelection;
    }
  };
}

function createUnsupportedPlatformAdapter(platform: string): ScratchPlatformAdapter {
  const support = resolveScratchPlatform(platform);
  return {
    ...support,
    selectionLabel: "Scratch Desktop",
    selectionDialogTitle: "选择 Scratch Desktop",
    defaultAutomationScratchExecutablePath: "",
    getDefaultUserDataDir(appDataPath: string) {
      return buildDefaultUserDataDir(appDataPath);
    },
    getDialogDefaultPath({ desktopPath }) {
      return desktopPath;
    },
    async findScratchExecutableCandidates() {
      return [];
    },
    async resolveScratchExecutableSelection() {
      throw new Error(`当前版本暂不支持 ${support.displayName}。`);
    }
  };
}

export function createScratchPlatformAdapter(platform: string): ScratchPlatformAdapter {
  if (platform === "win32") {
    return createWindowsPlatformAdapter();
  }

  if (platform === "darwin") {
    return createMacPlatformAdapter();
  }

  return createUnsupportedPlatformAdapter(platform);
}
