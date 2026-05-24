import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutomationScratchExecutableCandidates,
  parseLatestScratchLaunchInfo
} from "../scripts/automation-platform.mjs";

test("buildAutomationScratchExecutableCandidates covers common Windows install locations", () => {
  const candidates = buildAutomationScratchExecutableCandidates({
    platform: "win32",
    env: {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\Teacher\\AppData\\Local"
    }
  });

  assert.deepEqual(candidates, [
    "C:\\Program Files\\Scratch 3\\Scratch.exe",
    "C:\\Program Files\\Scratch 3\\Scratch 3.exe",
    "C:\\Program Files (x86)\\Scratch 3\\Scratch.exe",
    "C:\\Program Files (x86)\\Scratch 3\\Scratch 3.exe",
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\scratch-desktop\\Scratch.exe",
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\scratch-desktop\\Scratch 3.exe",
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch.exe",
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe"
  ]);
});

test("buildAutomationScratchExecutableCandidates covers common macOS app bundles", () => {
  const candidates = buildAutomationScratchExecutableCandidates({
    platform: "darwin",
    homeDir: "/Users/teacher"
  });

  assert.deepEqual(candidates, [
    "/Applications/Scratch.app/Contents/MacOS/Scratch",
    "/Applications/Scratch Desktop.app/Contents/MacOS/Scratch Desktop",
    "/Applications/Scratch 3.app/Contents/MacOS/Scratch 3",
    "/Users/teacher/Applications/Scratch.app/Contents/MacOS/Scratch",
    "/Users/teacher/Applications/Scratch Desktop.app/Contents/MacOS/Scratch Desktop",
    "/Users/teacher/Applications/Scratch 3.app/Contents/MacOS/Scratch 3"
  ]);
});

test("parseLatestScratchLaunchInfo returns the latest pid and debug port from companion logs", () => {
  const parsed = parseLatestScratchLaunchInfo(`
[2026-05-05T13:00:00.000Z] Scratch launched pid=100 port=9333 path="C:\\Scratch 3.exe"
[2026-05-05T13:01:00.000Z] Scratch launched pid=200 port=9444 path="/Applications/Scratch 3.app/Contents/MacOS/Scratch 3"
  `);

  assert.deepEqual(parsed, {
    pid: 200,
    debugPort: 9444
  });
});
