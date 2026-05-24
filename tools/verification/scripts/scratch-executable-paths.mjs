import path from "node:path";

const SUPPORTED_SCRATCH_EXECUTABLE_BASENAMES = new Set([
  "scratch.exe",
  "scratch 3.exe",
  "scratch",
  "scratch 3",
  "scratch desktop"
]);

function getCandidateBasenames(filePath) {
  const normalized = typeof filePath === "string" ? filePath.trim() : "";
  if (!normalized) {
    return [];
  }

  return [
    path.win32.basename(normalized),
    path.posix.basename(normalized)
  ]
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

export function isSupportedScratchExecutablePath(filePath) {
  return getCandidateBasenames(filePath).some((basename) =>
    SUPPORTED_SCRATCH_EXECUTABLE_BASENAMES.has(basename)
  );
}
