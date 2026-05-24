import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScratchExecutableCandidates,
  findScratchExecutableCandidatesFromShortcuts,
  resolveScratchExecutableSelection
} from "../dist/scratch-executable-finder.js";

test("buildScratchExecutableCandidates covers common Windows install locations", () => {
  const candidates = buildScratchExecutableCandidates({
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\Teacher\\AppData\\Local"
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

test("resolveScratchExecutableSelection accepts a direct Scratch executable path", async () => {
  const calls = [];
  const resolved = await resolveScratchExecutableSelection("C:\\Scratch 3\\Scratch 3.exe", {
    access: async (filePath) => {
      calls.push(filePath);
    }
  });

  assert.equal(resolved, "C:\\Scratch 3\\Scratch 3.exe");
  assert.deepEqual(calls, ["C:\\Scratch 3\\Scratch 3.exe"]);
});

test("resolveScratchExecutableSelection resolves a Windows shortcut target", async () => {
  const calls = [];
  const resolved = await resolveScratchExecutableSelection("C:\\Desktop\\Scratch 3.lnk", {
    access: async (filePath) => {
      calls.push(filePath);
    },
    readShortcutLink: () => ({
      target: "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe"
    })
  });

  assert.equal(resolved, "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe");
  assert.deepEqual(calls, ["C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe"]);
});

test("resolveScratchExecutableSelection rejects a non-Scratch shortcut target", async () => {
  await assert.rejects(
    () =>
      resolveScratchExecutableSelection("C:\\Desktop\\Scratch 3.lnk", {
        access: async () => {},
        readShortcutLink: () => ({
          target: "C:\\Tools\\not-scratch.exe"
        })
      }),
    /请选择 Scratch Desktop 的 Scratch\.exe 或 Scratch 3\.exe/
  );
});

test("findScratchExecutableCandidatesFromShortcuts returns unique valid Scratch targets", async () => {
  const existing = new Set([
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe",
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\scratch-desktop\\Scratch.exe"
  ]);
  const shortcutTargets = {
    "C:\\Desktop\\Scratch 3.lnk": {
      target: "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe"
    },
    "C:\\Desktop\\Scratch duplicate.lnk": {
      target: "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe"
    },
    "C:\\Desktop\\Scratch portable.lnk": {
      target: "C:\\Users\\Teacher\\AppData\\Local\\Programs\\scratch-desktop\\Scratch.exe"
    },
    "C:\\Desktop\\Scratch broken.lnk": {
      target: "C:\\Tools\\broken.exe"
    }
  };

  const candidates = await findScratchExecutableCandidatesFromShortcuts(["C:\\Desktop"], {
    readdir: async () => [
      "Scratch 3.lnk",
      "Scratch duplicate.lnk",
      "Scratch portable.lnk",
      "Scratch broken.lnk",
      "notes.txt"
    ],
    access: async (filePath) => {
      if (!existing.has(filePath)) {
        throw new Error("missing");
      }
    },
    readShortcutLink: (shortcutPath) => shortcutTargets[shortcutPath]
  });

  assert.deepEqual(candidates, [
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\Scratch 3\\Scratch 3.exe",
    "C:\\Users\\Teacher\\AppData\\Local\\Programs\\scratch-desktop\\Scratch.exe"
  ]);
});
