import test from "node:test";
import assert from "node:assert/strict";

import { projectScratchPayload } from "../dist/scratch-payload-projection.js";

function createCurrentState(overrides = {}) {
  return {
    status: "connected",
    statusText: "已连接到 Scratch Desktop",
    toolboxCategories: [],
    usedExtensions: [],
    loadedExtensions: [],
    programAreaModules: [],
    currentTargetPrograms: [],
    currentTargetScriptBlocks: [],
    currentTargetScriptXmlList: [],
    aiConfigured: false,
    aiCustomKeyConfigured: false,
    aiCustomModelConfigured: false,
    aiCustomPromptConfigured: false,
    aiHintTriggerMode: "auto",
    aiStatus: "idle",
    ...overrides
  };
}

function createProjectData() {
  return {
    targets: [
      {
        id: "sprite-a",
        name: "Cat",
        isStage: false,
        blocks: {
          hat: {
            opcode: "event_whenflagclicked",
            next: "move",
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
          },
          move: {
            opcode: "motion_movesteps",
            next: "pen",
            parent: "hat",
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
          },
          pen: {
            opcode: "pen_clear",
            next: null,
            parent: "move",
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
          }
        }
      }
    ]
  };
}

function createSnapshot() {
  return {
    currentTarget: "Cat",
    currentTargetId: "sprite-a",
    toolboxCategories: ["事件", "运动", "画笔"],
    loadedExtensions: ["pen"],
    programAreaModules: [],
    sprites: [
      {
        name: "Cat",
        isStage: false,
        blockCount: 3,
        variables: [],
        scripts: [
          {
            spriteName: "Cat",
            event: "当绿旗被点击",
            blockSequence: ["当绿旗被点击", "移动 10 步", "全部擦除"],
            blockOpcodes: ["event_whenflagclicked", "motion_movesteps", "pen_clear"]
          }
        ]
      }
    ],
    blocks: [],
    globalVariables: [],
    detectedConcepts: [],
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

test("projects a Scratch payload into one connected UI state patch", () => {
  const result = projectScratchPayload({
    payload: {
      source: "workspace-update",
      currentTargetId: "sprite-a",
      currentTargetName: "Cat",
      toolboxCategories: ["事件", "运动", "画笔"],
      loadedExtensions: ["pen", "pen"],
      projectData: createProjectData()
    },
    currentState: createCurrentState(),
    snapshot: createSnapshot()
  });

  assert.equal(result.source, "workspace-update");
  assert.equal(result.isHeartbeat, false);
  assert.deepEqual(result.loadedExtensions, ["pen"]);
  assert.deepEqual(result.usedExtensions, ["pen"]);
  assert.deepEqual(result.currentTargetPrograms, ["当绿旗被点击 -> 移动 10 步 -> 全部擦除"]);
  assert.deepEqual(
    result.currentTargetScriptBlocks[0].blocks.map((block) => block.opcode),
    ["event_whenflagclicked", "motion_movesteps", "pen_clear"]
  );
  assert.match(result.currentTargetScriptXmlList[0], /event_whenflagclicked/);
  assert.equal(result.hasMeaningfulPayload, true);
});

test("keeps the previous projection for heartbeat payloads without project data", () => {
  const currentState = createCurrentState({
    loadedExtensions: ["music"],
    usedExtensions: ["music"],
    programAreaModules: [{ id: "music", label: "音乐", blockCount: 1 }],
    currentTargetPrograms: ["当绿旗被点击 -> 播放鼓声"],
    currentTargetScriptBlocks: [{ blocks: [{ opcode: "music_playDrumForBeats", categoryId: "music", label: "播放鼓声" }] }],
    currentTargetScriptXmlList: ["<xml><block type=\"music_playDrumForBeats\" /></xml>"]
  });

  const result = projectScratchPayload({
    payload: {
      source: "heartbeat",
      currentTargetWorkspaceXmlList: ["<xml></xml>"]
    },
    currentState,
    snapshot: null
  });

  assert.equal(result.isHeartbeat, true);
  assert.deepEqual(result.loadedExtensions, currentState.loadedExtensions);
  assert.deepEqual(result.currentTargetPrograms, currentState.currentTargetPrograms);
  assert.deepEqual(result.currentTargetScriptXmlList, currentState.currentTargetScriptXmlList);
  assert.equal(result.hasMeaningfulPayload, true);
});
