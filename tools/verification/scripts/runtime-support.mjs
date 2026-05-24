import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function probeElectronBinarySupport(
  binaryPath,
  { spawnSyncImpl = spawnSync, timeoutMs = 5000 } = {}
) {
  const result = spawnSyncImpl(binaryPath, ["--version"], {
    stdio: "ignore",
    timeout: timeoutMs
  });

  if (result?.error) {
    return {
      supported: false,
      reason: `Failed to execute Electron binary: ${result.error.message}`
    };
  }

  if (result?.status === 0) {
    return {
      supported: true
    };
  }

  if (result?.signal === "SIGABRT") {
    return {
      supported: false,
      reason: "Electron aborts before startup in this environment.",
      signal: result.signal
    };
  }

  return {
    supported: false,
    reason: `Electron binary exited before startup (status=${String(result?.status ?? "unknown")}, signal=${String(result?.signal ?? "none")}).`,
    status: result?.status ?? undefined,
    signal: result?.signal ?? undefined
  };
}

export function probeMacDmgSupport({
  spawnSyncImpl = spawnSync,
  tempDir = os.tmpdir(),
  platform = process.platform,
  osRelease = os.release()
} = {}) {
  if (platform !== "darwin") {
    return {
      supported: false,
      reason: "DMG builds require macOS."
    };
  }

  const darwinMajorVersion = Number.parseInt(String(osRelease).split(".")[0] ?? "", 10);
  if (Number.isFinite(darwinMajorVersion) && darwinMajorVersion < 22) {
    return {
      supported: false,
      reason: "DMG builds require Darwin 22 / macOS 13 or newer in this environment."
    };
  }

  const preferredTempDir = normalizeText(tempDir) || os.tmpdir();
  const probeTempRoot =
    [preferredTempDir, os.tmpdir()].find((candidate) => normalizeText(candidate) && fs.existsSync(candidate)) ??
    null;

  if (!probeTempRoot) {
    return {
      supported: false,
      reason: `No usable temporary directory is available for the DMG probe (requested: ${preferredTempDir}).`
    };
  }

  const probeDir = fs.mkdtempSync(path.join(probeTempRoot, "scratchai-dmg-probe-"));
  const sourceDir = path.join(probeDir, "src");
  const dmgPath = path.join(probeDir, "probe.dmg");

  try {
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "probe.txt"), "probe", "utf8");

    const result = spawnSyncImpl("hdiutil", ["create", "-fs", "HFS+", "-srcfolder", sourceDir, dmgPath], {
      encoding: "utf8"
    });

    if (result?.error) {
      return {
        supported: false,
        reason: `Failed to execute hdiutil: ${result.error.message}`
      };
    }

    if (result?.status === 0) {
      return {
        supported: true
      };
    }

    const output = [normalizeText(result?.stdout), normalizeText(result?.stderr)].filter(Boolean).join("\n");
    if (/Device not configured/i.test(output)) {
      return {
        supported: false,
        reason: "hdiutil cannot create DMG images in this environment (Device not configured)."
      };
    }

    return {
      supported: false,
      reason: output || `hdiutil failed with status ${String(result?.status ?? "unknown")}.`
    };
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}
