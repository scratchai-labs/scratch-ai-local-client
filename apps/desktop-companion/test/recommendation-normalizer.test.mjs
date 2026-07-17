import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCoachRecommendation } from "../dist/recommendation-normalizer.js";

function createOptions(overrides = {}) {
  const snapshot = {
    title: "Normalizer contract",
    currentTarget: "Cat",
    toolboxCategories: ["事件", "变量", "运算", "外观"],
    loadedExtensions: [],
    programAreaModules: [],
    sprites: [
      {
        name: "Cat",
        isStage: false,
        blockCount: 1,
        variables: [
          { id: "score", name: "score", value: 0, isCloud: false }
        ],
        scripts: [
          {
            spriteName: "Cat",
            event: "when green flag clicked",
            blockSequence: ["当绿旗被点击"],
            blockOpcodes: ["event_whenflagclicked"]
          }
        ]
      }
    ],
    blocks: [],
    globalVariables: [
      { id: "score", name: "score", value: 0, isCloud: false }
    ],
    detectedConcepts: ["event", "data"],
    updatedAt: "2026-07-17T00:00:00.000Z"
  };

  return {
    snapshot,
    currentTargetPrograms: ["当绿旗被点击"],
    programAreaModules: [],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "把 score 加 1 后说出来",
    buildFallbackResponse: () => ({
      answerText: "fallback",
      recommendedBlocks: [],
      nextStep: "fallback",
      detectedIssues: []
    }),
    ...overrides
  };
}

test("recommendation normalizer strips Scratch metadata and normalizes nested params", () => {
  const result = normalizeCoachRecommendation(
    {
      summary: "先更新分数，再说出来。",
      recommendation: {
        root: {
          opcode: "data_setvariableto",
          category: "变量",
          label: "将变量设为",
          reason: "更新 score",
          fields: { VARIABLE: ["score", "score"] },
          inputs: { VALUE: [2, "operator-add"] },
          params: {
            variable: "score",
            value: {
              opcode: "operator_add",
              params: {
                left: {
                  opcode: "data_variable",
                  params: { variable: "score" }
                },
                right: 1
              }
            },
            ignoredInternalKey: "must be removed"
          },
          next: {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说 2 秒",
            reason: "",
            params: {
              messageVariable: {
                opcode: "operator_join",
                params: {
                  left: "得分：",
                  right: {
                    opcode: "data_variable",
                    params: { variable: "score" }
                  }
                }
              }
            }
          }
        }
      }
    },
    createOptions()
  );

  assert.deepEqual(result, {
    answerText: "先更新分数，再说出来。",
    recommendation: {
      root: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "将变量设为",
        reason: "更新 score",
        params: {
          variable: "score",
          value: "(score + 1)"
        },
        next: {
          opcode: "looks_sayforsecs",
          category: "外观",
          label: "说 2 秒",
          reason: "说 2 秒",
          params: {
            message: "得分：score"
          }
        }
      }
    },
    recommendedBlocks: [
      {
        opcode: "data_setvariableto",
        category: "变量",
        label: "将变量设为",
        reason: "更新 score",
        params: {
          variable: "score",
          value: "(score + 1)"
        }
      },
      {
        opcode: "looks_sayforsecs",
        category: "外观",
        label: "说 2 秒",
        reason: "说 2 秒",
        params: {
          message: "得分：score"
        }
      }
    ],
    nextStep: "先更新分数，再说出来。",
    detectedIssues: []
  });
});

test("recommendation normalizer delegates incomplete summary-only responses to fallback", () => {
  let fallbackCalls = 0;
  const fallbackResponse = {
    answerText: "先完成一个可运行的小步骤。",
    recommendedBlocks: [],
    nextStep: "先完成一个可运行的小步骤。",
    detectedIssues: []
  };

  const result = normalizeCoachRecommendation(
    { summary: "继续完善作品。" },
    createOptions({
      buildFallbackResponse: () => {
        fallbackCalls += 1;
        return fallbackResponse;
      }
    })
  );

  assert.equal(fallbackCalls, 1);
  assert.equal(result, fallbackResponse);
});

test("recommendation normalizer promotes valid math output and enriches its accumulator reason", () => {
  const options = createOptions({
    goal: "1+2+3...+100 求和并说出结果",
    currentTargetPrograms: ["当绿旗被点击 -> 将 s 设为 0 -> 重复执行 100 次"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 2 },
      { id: "control", label: "控制", blockCount: 1 }
    ]
  });
  options.snapshot.globalVariables = [
    { id: "s", name: "s", value: 0, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  options.snapshot.sprites[0].variables = options.snapshot.globalVariables;
  options.snapshot.sprites[0].blockCount = 4;
  options.snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 s 设为 0", "将 i 设为 1", "重复执行 100 次"],
    blockOpcodes: [
      "event_whenflagclicked",
      "data_setvariableto",
      "data_setvariableto",
      "control_repeat"
    ]
  };

  const result = normalizeCoachRecommendation(
    {
      summary: "循环后输出总和。",
      recommendation: {
        root: {
          opcode: "motion_movesteps",
          category: "运动",
          label: "移动 10 步",
          reason: "让角色移动",
          next: {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说 2 秒",
            reason: "输出结果"
          }
        }
      }
    },
    options
  );

  assert.equal(result.recommendation.root.opcode, "looks_sayforsecs");
  assert.equal(result.recommendedBlocks.length, 1);
  assert.match(result.recommendation.root.reason, /s 变量/);
});
