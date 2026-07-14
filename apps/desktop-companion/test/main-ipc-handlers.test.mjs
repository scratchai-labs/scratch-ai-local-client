import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("main process wires lesson goal IPC to SessionManager", async () => {
  const source = await readFile(new URL("../src/main/main.ts", import.meta.url), "utf8");

  assert.match(source, /async function handleSaveLessonGoal\(goal: string\)/);
  assert.match(source, /await sessionManager\?\.saveLessonGoal\(goal\);/);
  assert.match(source, /desktop-companion:save-lesson-goal/);
  assert.match(source, /await handleSaveLessonGoal\(goal\);/);
});
