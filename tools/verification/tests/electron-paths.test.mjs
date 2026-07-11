import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultElectronBinaryPath } from "../scripts/electron-paths.mjs";

test("getDefaultElectronBinaryPath resolves the workspace root Electron install", () => {
  const workspaceRoot = path.join("repo", "scratch-ai-local-client");
  const electronPath = getDefaultElectronBinaryPath(workspaceRoot);

  assert.equal(electronPath.includes(path.join("apps", "desktop-companion", "node_modules")), false);
  assert.equal(electronPath.includes(path.join(workspaceRoot, "node_modules", "electron", "dist")), true);
});
