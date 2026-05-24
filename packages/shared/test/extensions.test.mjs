import test from "node:test";
import assert from "node:assert/strict";

import {
  getDisplayLabelForOpcode,
  getExtensionIdForOpcode,
  getModuleIdForOpcode,
  getUsedExtensionsFromProject,
  projectJsonToSnapshot,
  summarizeProgramAreaModulesFromBlocks,
  summarizeProgramAreaModulesFromProject
} from "../src/index.js";

test("maps Scratch opcodes to extension ids and module ids", () => {
  assert.equal(getExtensionIdForOpcode("pen_clear"), "pen");
  assert.equal(getExtensionIdForOpcode("motion_movesteps"), null);
  assert.equal(getModuleIdForOpcode("motion_movesteps"), "motion");
  assert.equal(getModuleIdForOpcode("music_playDrumForBeats"), "music");
  assert.equal(getModuleIdForOpcode("argument_reporter_string_number"), "procedures");
});

test("summarizes current program area modules from blocks", () => {
  const modules = summarizeProgramAreaModulesFromBlocks({
    a: { opcode: "motion_movesteps", shadow: false },
    b: { opcode: "motion_turnright", shadow: false },
    c: { opcode: "looks_sayforsecs", shadow: false },
    d: { opcode: "operator_add", shadow: true },
    e: { opcode: "pen_clear", shadow: false }
  });

  assert.deepEqual(modules, [
    { id: "motion", label: "运动", blockCount: 2 },
    { id: "pen", label: "画笔", blockCount: 1 },
    { id: "looks", label: "外观", blockCount: 1 }
  ]);
});

test("summarizes current target program area modules from a project", () => {
  const project = {
    targets: [
      {
        id: "stage",
        name: "Stage",
        isStage: true,
        blocks: {}
      },
      {
        id: "sprite-a",
        name: "Cat",
        isStage: false,
        blocks: {
          a: { opcode: "motion_movesteps", shadow: false },
          b: { opcode: "looks_sayforsecs", shadow: false }
        }
      },
      {
        id: "sprite-b",
        name: "Ball",
        isStage: false,
        blocks: {
          c: { opcode: "sound_playuntildone", shadow: false }
        }
      }
    ]
  };

  assert.deepEqual(
    summarizeProgramAreaModulesFromProject(project, { id: "sprite-b" }),
    [{ id: "sound", label: "声音", blockCount: 1 }]
  );
});

test("extracts used extensions from project JSON", () => {
  const project = {
    targets: [
      {
        blocks: {
          a: { opcode: "pen_clear" },
          b: { opcode: "translate_getViewerLanguage" }
        }
      }
    ],
    monitors: [{ opcode: "music_getTempo" }],
    extensions: ["music", "pen"]
  };

  assert.deepEqual(getUsedExtensionsFromProject(project), ["music", "pen", "translate"]);
});

test("builds a project snapshot with program area modules", () => {
  const snapshot = projectJsonToSnapshot(
    {
      targets: [
        {
          id: "stage",
          name: "Stage",
          isStage: true,
          variables: {
            score: ["Score", 0]
          },
          blocks: {}
        },
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          variables: {
            local: ["Local", 10]
          },
          blocks: {
            top: {
              opcode: "event_whenflagclicked",
              next: "move",
              shadow: false,
              topLevel: true
            },
            move: {
              opcode: "motion_movesteps",
              next: null,
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    },
    {
      currentTargetId: "sprite-a",
      toolboxCategories: ["运动", "事件"],
      loadedExtensions: ["music"],
      goal: "让小猫动起来"
    }
  );

  assert.equal(snapshot.currentTarget, "Cat");
  assert.deepEqual(snapshot.programAreaModules, [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "motion", label: "运动", blockCount: 1 }
  ]);
  assert.deepEqual(snapshot.loadedExtensions, ["music"]);
  assert.equal(snapshot.globalVariables[0].name, "Score");
  assert.equal(snapshot.blocks[0].label, "当绿旗被点击");
  assert.deepEqual(snapshot.sprites[1].scripts[0].blockSequence, ["当绿旗被点击", "移动 10 步"]);
});

test("builds a project snapshot with nested stack blocks inside control blocks", () => {
  const snapshot = projectJsonToSnapshot(
    {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            hat: {
              opcode: "event_whenflagclicked",
              next: "repeat",
              shadow: false,
              topLevel: true,
              inputs: {}
            },
            repeat: {
              opcode: "control_repeat",
              next: null,
              shadow: false,
              topLevel: false,
              inputs: {
                SUBSTACK: [2, "move"]
              }
            },
            move: {
              opcode: "motion_movesteps",
              next: null,
              shadow: false,
              topLevel: false,
              inputs: {}
            }
          }
        }
      ]
    },
    {
      currentTargetId: "sprite-a"
    }
  );

  assert.deepEqual(snapshot.sprites[0].scripts[0].blockSequence, [
    "当绿旗被点击",
    "重复执行",
    "移动 10 步"
  ]);
});

test("localizes effect and size related Scratch opcodes with field values", () => {
  assert.equal(
    getDisplayLabelForOpcode("looks_changeeffectby", {
      EFFECT: ["COLOR", null]
    }),
    "将颜色特效增加"
  );
  assert.equal(
    getDisplayLabelForOpcode("looks_seteffectto", {
      EFFECT: ["GHOST", null]
    }),
    "将虚像特效设为"
  );
  assert.equal(getDisplayLabelForOpcode("looks_cleargraphiceffects"), "清除图形特效");
});
