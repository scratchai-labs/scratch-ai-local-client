import test from "node:test";
import assert from "node:assert/strict";

import { validateBrief } from "../workflows/deepseek-teaching/core.mjs";
import { buildBriefDraftFromSummary, buildProjectSummary } from "../scripts/sb3-teaching-draft.mjs";

function createMockProject() {
  return {
    targets: [
      {
        isStage: true,
        name: "Stage",
        variables: {
          scoreVar: ["Score", 0]
        },
        lists: {},
        broadcasts: {
          broadcastLose: "Game Over",
          broadcastWin: "Win"
        },
        blocks: {
          stageFlag: {
            opcode: "event_whenflagclicked",
            next: "stageForever",
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
          },
          stageForever: {
            opcode: "control_forever",
            next: null,
            parent: "stageFlag",
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
          }
        },
        comments: {},
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100
      },
      {
        isStage: false,
        name: "Mouse1",
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {
          flag: {
            opcode: "event_whenflagclicked",
            next: "forever",
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
          },
          forever: {
            opcode: "control_forever",
            next: null,
            parent: "flag",
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
          },
          follow: {
            opcode: "motion_pointtowards",
            next: "move",
            parent: "forever",
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
          },
          move: {
            opcode: "motion_movesteps",
            next: null,
            parent: "follow",
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
          }
        },
        comments: {},
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100
      }
    ],
    monitors: [],
    extensions: [],
    meta: {
      semver: "3.0.0"
    }
  };
}

test("buildProjectSummary extracts readable broadcasts and target summaries", () => {
  const summary = buildProjectSummary(createMockProject(), {
    sourceFilePath: "C:\\Temp\\Cat and a Mouse.sb3"
  });

  assert.equal(summary.title, "Cat and a Mouse");
  assert.deepEqual(summary.broadcasts, ["Game Over", "Win"]);
  assert.deepEqual(summary.variables, ["Score"]);
  assert.equal(summary.targetSummaries[0].name, "Mouse1");
  assert.equal(summary.targetSummaries.at(-1).name, "Stage");
});

test("buildBriefDraftFromSummary returns a validator-compatible brief draft", () => {
  const summary = buildProjectSummary(createMockProject(), {
    sourceFilePath: "C:\\Temp\\Cat and a Mouse.sb3"
  });
  const brief = buildBriefDraftFromSummary(summary);
  const validation = validateBrief(brief);

  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(brief.title, "Cat and a Mouse");
  assert.equal(brief.roles.length, 2);
  assert.ok(
    brief.constraints.includes("当前 brief 为脚本自动生成的草稿，进入教学工作流前请老师逐项复核。")
  );
});
