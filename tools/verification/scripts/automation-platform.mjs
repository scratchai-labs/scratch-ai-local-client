import { access } from "node:fs/promises";
import path from "node:path";

function pushCandidate(candidates, value) {
  if (!value) {
    return;
  }

  const normalized = value.trim();
  if (!normalized || candidates.includes(normalized)) {
    return;
  }

  candidates.push(normalized);
}

function pushWindowsScratchCandidate(candidates, baseDir, ...segments) {
  if (!baseDir) {
    return;
  }

  pushCandidate(candidates, path.win32.join(baseDir, ...segments));
}

function pushMacScratchCandidate(candidates, baseDir, appBundleName, executableName) {
  if (!baseDir) {
    return;
  }

  pushCandidate(candidates, path.posix.join(baseDir, appBundleName, "Contents", "MacOS", executableName));
}

export function buildAutomationScratchExecutableCandidates({
  platform = process.platform,
  env = process.env,
  homeDir = process.env.HOME
} = {}) {
  const candidates = [];

  if (platform === "darwin") {
    pushMacScratchCandidate(candidates, "/Applications", "Scratch.app", "Scratch");
    pushMacScratchCandidate(candidates, "/Applications", "Scratch Desktop.app", "Scratch Desktop");
    pushMacScratchCandidate(candidates, "/Applications", "Scratch 3.app", "Scratch 3");
    pushMacScratchCandidate(candidates, homeDir, "Applications/Scratch.app", "Scratch");
    pushMacScratchCandidate(candidates, homeDir, "Applications/Scratch Desktop.app", "Scratch Desktop");
    pushMacScratchCandidate(candidates, homeDir, "Applications/Scratch 3.app", "Scratch 3");
    return candidates;
  }

  pushWindowsScratchCandidate(candidates, env.ProgramFiles, "Scratch 3", "Scratch.exe");
  pushWindowsScratchCandidate(candidates, env.ProgramFiles, "Scratch 3", "Scratch 3.exe");
  pushWindowsScratchCandidate(candidates, env["ProgramFiles(x86)"], "Scratch 3", "Scratch.exe");
  pushWindowsScratchCandidate(candidates, env["ProgramFiles(x86)"], "Scratch 3", "Scratch 3.exe");
  pushWindowsScratchCandidate(candidates, env.LOCALAPPDATA, "Programs", "scratch-desktop", "Scratch.exe");
  pushWindowsScratchCandidate(candidates, env.LOCALAPPDATA, "Programs", "scratch-desktop", "Scratch 3.exe");
  pushWindowsScratchCandidate(candidates, env.LOCALAPPDATA, "Programs", "Scratch 3", "Scratch.exe");
  pushWindowsScratchCandidate(candidates, env.LOCALAPPDATA, "Programs", "Scratch 3", "Scratch 3.exe");
  return candidates;
}

export async function findDefaultAutomationScratchExecutablePath(options = {}) {
  const accessImpl = options.access ?? access;
  const candidates = buildAutomationScratchExecutableCandidates(options);

  for (const candidate of candidates) {
    try {
      await accessImpl(candidate);
      return candidate;
    } catch {
      // Ignore missing candidates.
    }
  }

  return null;
}

export function parseLatestScratchLaunchInfo(logContent) {
  const normalizedLogContent = typeof logContent === "string" ? logContent : "";
  const matches = Array.from(
    normalizedLogContent.matchAll(/Scratch launched pid=(\d+) port=(\d+)/g)
  );
  const latestMatch = matches.at(-1);

  if (!latestMatch) {
    return null;
  }

  return {
    pid: Number(latestMatch[1]),
    debugPort: Number(latestMatch[2])
  };
}
