import test from "node:test";
import assert from "node:assert/strict";

import { coachRecommendationResponseSchema, desktopCompanionStateSchema } from "../src/index.js";

test("parses one connected recommendation structure with exactly five blocks", () => {
  const response = coachRecommendationResponseSchema.parse({
    summary: "先问答案、保存答案，再判断是否猜对。",
    recommendation: {
      root: {
        opcode: "sensing_askandwait",
        category: "侦测",
        label: "询问并等待",
        reason: "先让玩家输入猜测。",
        params: {
          question: "你猜的数字是多少？"
        },
        next: {
          opcode: "data_setvariableto",
          category: "变量",
          label: "将变量设为",
          reason: "把回答保存到猜测变量。",
          params: {
            variable: "guess",
            value: "answer"
          },
          next: {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "判断猜测是否等于秘密数字。",
            condition: {
              opcode: "operator_equals",
              category: "运算",
              label: "等于",
              reason: "比较猜测和秘密数字。"
            },
            substack: {
              opcode: "looks_sayforsecs",
              category: "外观",
              label: "说 2 秒",
              reason: "猜对后给出反馈。"
            }
          }
        }
      }
    }
  });

  assert.equal(response.recommendation.root.opcode, "sensing_askandwait");
  assert.equal(response.recommendation.root.next.opcode, "data_setvariableto");
  assert.equal(response.recommendation.root.next.next.opcode, "control_if");
  assert.equal(response.recommendation.root.next.next.condition.opcode, "operator_equals");
  assert.equal(response.recommendation.root.next.next.substack.opcode, "looks_sayforsecs");
});

test("accepts constrained recommendation params for display defaults", () => {
  const response = coachRecommendationResponseSchema.parse({
    summary: "先把兔子数量算出来。",
    recommendation: {
      root: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "将变量设为",
        reason: "用公式求兔子数量。",
        params: {
          variable: "rabbits",
          value: "(feet - 2 * heads) / 2"
        }
      }
    }
  });

  assert.deepEqual(response.recommendation.root.params, {
    variable: "rabbits",
    value: "(feet - 2 * heads) / 2"
  });
});

test("accepts a completed-project summary without forcing recommended blocks", () => {
  const response = coachRecommendationResponseSchema.parse({
    summary: "你的作品已经完整，可以点击绿旗后用方向键控制 Cat 2。"
  });

  assert.equal(response.summary, "你的作品已经完整，可以点击绿旗后用方向键控制 Cat 2。");
  assert.equal(Object.hasOwn(response, "recommendation"), false);
});

test("rejects recommendation structures containing more than five blocks", () => {
  const result = coachRecommendationResponseSchema.safeParse({
    summary: "让角色先启动，再连续补很多动作。",
    recommendation: {
      root: {
        opcode: "event_whenflagclicked",
        category: "事件",
        label: "当绿旗被点击",
        reason: "给脚本一个开始时机。",
        next: {
          opcode: "motion_movesteps",
          category: "运动",
          label: "移动 10 步",
          reason: "2",
          next: {
            opcode: "motion_turnright",
            category: "运动",
            label: "右转 15 度",
            reason: "3",
            next: {
              opcode: "control_repeat",
              category: "控制",
              label: "重复执行",
              reason: "4",
              next: {
                opcode: "looks_sayforsecs",
                category: "外观",
                label: "说 2 秒",
                reason: "5",
                next: {
                  opcode: "data_setvariableto",
                  category: "变量",
                  label: "将变量设为",
                  reason: "6"
                }
              }
            }
          }
        }
      }
    }
  });

  assert.equal(result.success, false);
});

test("rejects extra fields and model-provided XML", () => {
  const withExtraField = coachRecommendationResponseSchema.safeParse({
    summary: "让角色移动。",
    recommendation: {
      root: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "先让角色动起来。",
        example: "移动 20 步"
      }
    }
  });
  const withRawXml = coachRecommendationResponseSchema.safeParse({
    summary: "让角色移动。",
    recommendation: {
      root: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "先让角色动起来。"
      },
      xml: "<xml><block type=\"motion_movesteps\" /></xml>"
    }
  });

  assert.equal(withExtraField.success, false);
  assert.equal(withRawXml.success, false);
});

test("rejects unknown recommendation params", () => {
  const result = coachRecommendationResponseSchema.safeParse({
    summary: "让角色移动。",
    recommendation: {
      root: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "先让角色动起来。",
        params: {
          script: "<block />"
        }
      }
    }
  });

  assert.equal(result.success, false);
});

test("desktop companion mock state accepts coach responses without detected issues", () => {
  const state = desktopCompanionStateSchema.parse({
    status: "connected",
    statusText: "已连接到 Scratch Desktop",
    aiCoachResponse: {
      answerText: "试着先让角色动起来。",
      recommendedBlocks: [],
      nextStep: "拖一个移动积木到脚本里。"
    }
  });

  assert.deepEqual(state.aiCoachResponse.detectedIssues, []);
});
