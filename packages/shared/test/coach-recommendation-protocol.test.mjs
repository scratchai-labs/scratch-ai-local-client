import test from "node:test";
import assert from "node:assert/strict";

import { coachRecommendationResponseSchema } from "../src/index.js";

test("parses one connected recommendation structure with at most three blocks", () => {
  const response = coachRecommendationResponseSchema.parse({
    summary: "让角色碰到目标时给出反馈。",
    recommendation: {
      root: {
        opcode: "control_if",
        category: "控制",
        label: "如果...那么",
        reason: "先让角色会判断。",
        condition: {
          opcode: "sensing_touchingobject",
          category: "侦测",
          label: "碰到...？",
          reason: "检查角色是否碰到目标。"
        },
        substack: {
          opcode: "looks_sayforsecs",
          category: "外观",
          label: "说 2 秒",
          reason: "让判断结果容易看见。"
        }
      }
    }
  });

  assert.equal(response.recommendation.root.opcode, "control_if");
  assert.equal(response.recommendation.root.condition.opcode, "sensing_touchingobject");
  assert.equal(response.recommendation.root.substack.opcode, "looks_sayforsecs");
});

test("rejects recommendation structures containing more than three blocks", () => {
  const result = coachRecommendationResponseSchema.safeParse({
    summary: "让角色先启动，再移动、判断并反馈。",
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
          reason: "先让角色动起来。",
          next: {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "让角色会判断。",
            substack: {
              opcode: "looks_sayforsecs",
              category: "外观",
              label: "说 2 秒",
              reason: "给出可见反馈。"
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
