import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createWorkflowConfig } from "../workflows/deepseek-teaching/config.mjs";

test("createWorkflowConfig defaults output into repo-local generated directory", () => {
  const cwd = path.join(path.sep, "tmp", "scratchai");
  const config = createWorkflowConfig(["node", "run-deepseek-teaching-workflow.mjs"], cwd);

  assert.equal(
    config.outputDir.startsWith(
      path.join(cwd, "tools", "verification", "generated", "DeepSeek-Scratch-教学工作流-")
    ),
    true
  );
});

test("createWorkflowConfig keeps explicit output overrides", () => {
  const cwd = path.join(path.sep, "tmp", "scratchai");
  const explicitOutputDir = path.join(path.sep, "tmp", "custom-output");
  const config = createWorkflowConfig(["node", "run-deepseek-teaching-workflow.mjs", `--output-dir=${explicitOutputDir}`], cwd);

  assert.equal(config.outputDir, explicitOutputDir);
});
