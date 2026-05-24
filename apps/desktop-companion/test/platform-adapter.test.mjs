import test from "node:test";
import assert from "node:assert/strict";

import {
  createScratchPlatformAdapter,
  resolveMacAppBundleExecutable,
  resolveScratchPlatform
} from "../dist/platform-adapter.js";

test("resolveScratchPlatform marks Windows and macOS as supported", () => {
  assert.deepEqual(resolveScratchPlatform("win32"), {
    id: "win32",
    displayName: "Windows",
    supported: true
  });

  assert.deepEqual(resolveScratchPlatform("darwin"), {
    id: "darwin",
    displayName: "macOS",
    supported: true
  });
});

test("resolveScratchPlatform keeps Linux unsupported", () => {
  assert.deepEqual(resolveScratchPlatform("linux"), {
    id: "linux",
    displayName: "Linux",
    supported: false
  });
});

test("macOS adapter auto-detects common Scratch app bundle locations", async () => {
  const existing = new Set([
    "/Applications/Scratch.app",
    "/Applications/Scratch.app/Contents/MacOS/Scratch",
    "/Users/teacher/Applications/Scratch Desktop.app",
    "/Users/teacher/Applications/Scratch Desktop.app/Contents/MacOS/Scratch Desktop"
  ]);
  const adapter = createScratchPlatformAdapter("darwin");

  const candidates = await adapter.findScratchExecutableCandidates({
    homeDir: "/Users/teacher",
    access: async (filePath) => {
      if (!existing.has(filePath)) {
        throw new Error("missing");
      }
    },
    readdir: async (directoryPath) => {
      if (directoryPath === "/Applications/Scratch.app/Contents/MacOS") {
        return ["Scratch"];
      }

      if (directoryPath === "/Users/teacher/Applications/Scratch Desktop.app/Contents/MacOS") {
        return ["Scratch Desktop"];
      }

      throw new Error("missing");
    }
  });

  assert.deepEqual(candidates, [
    "/Applications/Scratch.app/Contents/MacOS/Scratch",
    "/Users/teacher/Applications/Scratch Desktop.app/Contents/MacOS/Scratch Desktop"
  ]);
});

test("resolveMacAppBundleExecutable prefers the bundle executable from Info.plist", async () => {
  const executable = await resolveMacAppBundleExecutable("/Applications/Scratch.app", {
    readFile: async () => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>CFBundleExecutable</key>
    <string>Scratch Desktop</string>
  </dict>
</plist>`,
    readdir: async () => ["Scratch", "Scratch Desktop"],
    access: async () => {}
  });

  assert.equal(executable, "/Applications/Scratch.app/Contents/MacOS/Scratch Desktop");
});

test("macOS adapter accepts a selected Scratch app bundle", async () => {
  const adapter = createScratchPlatformAdapter("darwin");
  const resolved = await adapter.resolveScratchExecutableSelection("/Applications/Scratch.app", {
    readFile: async () => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>CFBundleExecutable</key>
    <string>Scratch</string>
  </dict>
</plist>`,
    readdir: async () => ["Scratch"],
    access: async () => {}
  });

  assert.equal(resolved, "/Applications/Scratch.app/Contents/MacOS/Scratch");
});

test("macOS adapter rejects a non-Scratch app bundle", async () => {
  const adapter = createScratchPlatformAdapter("darwin");

  await assert.rejects(
    () =>
      adapter.resolveScratchExecutableSelection("/Applications/Calculator.app", {
        readdir: async () => ["Calculator"],
        access: async () => {}
      }),
    /请选择 Scratch\.app、Scratch Desktop\.app/
  );
});
