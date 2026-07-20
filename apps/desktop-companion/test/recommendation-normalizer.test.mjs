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

test("recommendation normalizer reuses locked variable names for equivalent new variables", () => {
  const result = normalizeCoachRecommendation(
    {
      summary: "继续完成累加循环。",
      recommendation: {
        root: {
          opcode: "control_repeat",
          category: "控制",
          label: "重复执行 100 次",
          reason: "重复累加",
          params: { repeatTimes: "100" },
          substack: {
            opcode: "data_changevariableby",
            category: "变量",
            label: "将求和增加计数",
            reason: "每次把计数加到求和",
            params: { variable: "求和", changeBy: "计数" },
            next: {
              opcode: "data_changevariableby",
              category: "变量",
              label: "将计数增加 1",
              reason: "计数器前进一位",
              params: { variable: "计数", changeBy: "1" }
            }
          }
        }
      }
    },
    createOptions({
      goal: "1+2+3...+100 求和",
      continuityContext: {
        previousRecommendationVariables: ["sum", "i"],
        lockedVariableBindings: [
          {
            meaning: "accumulator",
            preferredName: "sum",
            aliases: ["sum"],
            source: "previous-recommendation",
            confidence: "high"
          },
          {
            meaning: "counter",
            preferredName: "i",
            aliases: ["i"],
            source: "previous-recommendation",
            confidence: "high"
          }
        ]
      }
    })
  );

  assert.equal(result.recommendation.root.substack.params.variable, "sum");
  assert.equal(result.recommendation.root.substack.params.changeBy, "i");
  assert.equal(result.recommendation.root.substack.next.params.variable, "i");
  assert.match(result.recommendation.root.substack.label, /sum/);
  assert.match(result.recommendation.root.substack.reason, /sum/);
});

test("recommendation normalizer keeps equivalent variables that already exist in Scratch", () => {
  const options = createOptions({
    goal: "1+2+3...+100 求和",
    continuityContext: {
      previousRecommendationVariables: ["sum", "i"],
      lockedVariableBindings: [
        {
          meaning: "accumulator",
          preferredName: "sum",
          aliases: ["sum"],
          source: "previous-recommendation",
          confidence: "high"
        },
        {
          meaning: "counter",
          preferredName: "i",
          aliases: ["i"],
          source: "previous-recommendation",
          confidence: "high"
        }
      ]
    }
  });
  options.snapshot.globalVariables = [
    { id: "sum-cn", name: "求和", value: 0, isCloud: false },
    { id: "count-cn", name: "计数", value: 1, isCloud: false }
  ];
  options.snapshot.sprites[0].variables = options.snapshot.globalVariables;

  const result = normalizeCoachRecommendation(
    {
      summary: "继续完成累加循环。",
      recommendation: {
        root: {
          opcode: "data_changevariableby",
          category: "变量",
          label: "将求和增加计数",
          reason: "学生已经创建了这些变量",
          params: { variable: "求和", changeBy: "计数" }
        }
      }
    },
    options
  );

  assert.equal(result.recommendation.root.params.variable, "求和");
  assert.equal(result.recommendation.root.params.changeBy, "计数");
});

test("recommendation normalizer applies continuity beyond sum variables", () => {
  const result = normalizeCoachRecommendation(
    {
      summary: "答对后加分。",
      recommendation: {
        root: {
          opcode: "data_changevariableby",
          category: "变量",
          label: "将分数增加 1",
          reason: "答对时让分数加一",
          params: { variable: "分数", changeBy: "1" }
        }
      }
    },
    createOptions({
      goal: "做一道问答题，答对时 score 加 1",
      continuityContext: {
        previousRecommendationVariables: ["score"],
        lockedVariableBindings: [
          {
            meaning: "score",
            preferredName: "score",
            aliases: ["score"],
            source: "previous-recommendation",
            confidence: "high"
          }
        ]
      }
    })
  );

  assert.equal(result.recommendation.root.params.variable, "score");
  assert.match(result.recommendation.root.label, /score/);
});
