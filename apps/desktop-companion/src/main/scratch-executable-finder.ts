import { access, readdir } from "node:fs/promises";
import path from "node:path";

const SCRATCH_EXECUTABLE_FILE_NAMES = new Set(["scratch.exe", "scratch 3.exe"]);

export interface ShortcutDetails {
  target?: string;
}

export interface ResolveScratchExecutableSelectionDependencies {
  access?: typeof access;
  readShortcutLink?: (shortcutPath: string) => ShortcutDetails;
}

export interface ShortcutSearchDependencies extends ResolveScratchExecutableSelectionDependencies {
  readdir?: typeof readdir;
}

function pushCandidate(candidates: string[], value?: string | null) {
  if (!value) {
    return;
  }

  const normalized = value.trim();
  if (!normalized || candidates.includes(normalized)) {
    return;
  }

  candidates.push(normalized);
}

function pushScratchExecutableCandidate(candidates: string[], baseDir: string | undefined, ...segments: string[]) {
  if (!baseDir) {
    return;
  }

  pushCandidate(candidates, path.win32.join(baseDir, ...segments));
}

export function buildScratchExecutableCandidates(env: NodeJS.ProcessEnv = process.env) {
  const candidates: string[] = [];

  pushScratchExecutableCandidate(candidates, env.ProgramFiles, "Scratch 3", "Scratch.exe");
  pushScratchExecutableCandidate(candidates, env.ProgramFiles, "Scratch 3", "Scratch 3.exe");
  pushScratchExecutableCandidate(candidates, env["ProgramFiles(x86)"], "Scratch 3", "Scratch.exe");
  pushScratchExecutableCandidate(candidates, env["ProgramFiles(x86)"], "Scratch 3", "Scratch 3.exe");
  pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, "Programs", "scratch-desktop", "Scratch.exe");
  pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, "Programs", "scratch-desktop", "Scratch 3.exe");
  pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, "Programs", "Scratch 3", "Scratch.exe");
  pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, "Programs", "Scratch 3", "Scratch 3.exe");

  return candidates;
}

export function isScratchExecutablePath(filePath: string) {
  return SCRATCH_EXECUTABLE_FILE_NAMES.has(path.win32.basename(filePath).trim().toLowerCase());
}

export async function findScratchExecutableCandidates(env: NodeJS.ProcessEnv = process.env) {
  const candidates = buildScratchExecutableCandidates(env);
  const existing: string[] = [];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      existing.push(candidate);
    } catch {
      // Ignore missing files.
    }
  }

  return existing;
}

export async function resolveScratchExecutableSelection(
  selectedPath: string,
  dependencies: ResolveScratchExecutableSelectionDependencies = {}
) {
  const accessImpl = dependencies.access ?? access;
  const normalizedSelection = path.win32.normalize(selectedPath.trim());

  if (!normalizedSelection) {
    throw new Error("请选择 Scratch Desktop 的程序文件或快捷方式。");
  }

  let resolvedPath = normalizedSelection;
  if (normalizedSelection.toLowerCase().endsWith(".lnk")) {
    if (!dependencies.readShortcutLink) {
      throw new Error("当前环境不支持解析 Windows 快捷方式，请直接选择 Scratch.exe 或 Scratch 3.exe。");
    }

    let shortcutDetails: ShortcutDetails;
    try {
      shortcutDetails = dependencies.readShortcutLink(normalizedSelection);
    } catch {
      throw new Error("无法解析这个 Windows 快捷方式，请直接选择 Scratch.exe 或 Scratch 3.exe。");
    }

    if (!shortcutDetails.target?.trim()) {
      throw new Error("这个快捷方式没有指向有效程序，请直接选择 Scratch.exe 或 Scratch 3.exe。");
    }

    resolvedPath = path.win32.normalize(shortcutDetails.target.trim());
  }

  if (!isScratchExecutablePath(resolvedPath)) {
    throw new Error("请选择 Scratch Desktop 的 Scratch.exe 或 Scratch 3.exe，或指向它们的快捷方式。");
  }

  try {
    await accessImpl(resolvedPath);
  } catch {
    throw new Error("选中的 Scratch 软件不存在，请重新选择。");
  }

  return resolvedPath;
}

export async function findScratchExecutableCandidatesFromShortcuts(
  shortcutDirectories: string[],
  dependencies: ShortcutSearchDependencies
) {
  const readdirImpl = dependencies.readdir ?? readdir;
  const candidates: string[] = [];

  for (const directory of shortcutDirectories) {
    let files: string[];
    try {
      files = await readdirImpl(directory);
    } catch {
      continue;
    }

    for (const file of files) {
      const normalizedFile = file.trim().toLowerCase();
      if (!normalizedFile.endsWith(".lnk") || !normalizedFile.includes("scratch")) {
        continue;
      }

      const shortcutPath = path.win32.join(directory, file);
      try {
        const resolvedPath = await resolveScratchExecutableSelection(shortcutPath, dependencies);
        if (!candidates.includes(resolvedPath)) {
          candidates.push(resolvedPath);
        }
      } catch {
        // Ignore bad shortcuts during auto-detection.
      }
    }
  }

  return candidates;
}
