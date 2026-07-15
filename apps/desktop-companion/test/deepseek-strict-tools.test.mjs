import test from "node:test";
import assert from "node:assert/strict";

import {
  DEEPSEEK_COMPLETE_TOOL_NAME,
  DEEPSEEK_RECOMMENDATION_TOOL_NAME,
  DEEPSEEK_STRICT_TOOLS,
  buildDeepSeekStrictChatUrl,
  extractDeepSeekStrictCandidate
} from "../dist/deepseek-strict-tools.js";

test("Strict recommendation schema encodes Scratch terminal and condition relations", () => {
  const [completeTool, recommendationTool] = DEEPSEEK_STRICT_TOOLS;
  assert.equal(completeTool.function.name, DEEPSEEK_COMPLETE_TOOL_NAME);
  assert.equal(recommendationTool.function.name, DEEPSEEK_RECOMMENDATION_TOOL_NAME);
  assert.equal(completeTool.function.strict, true);
  assert.equal(recommendationTool.function.strict, true);

  const definitions = recommendationTool.function.parameters.$defs;
  assert.equal(Object.hasOwn(definitions.foreverNode.properties, "next"), false);
  assert.equal(Object.hasOwn(definitions.terminalNode.properties, "next"), false);
  assert.deepEqual(
    definitions.terminalNode.properties.opcode.enum.sort(),
    ["control_delete_this_clone", "control_stop"]
  );
  assert.equal(definitions.ifWithoutNext.properties.condition.$ref, "#/$defs/conditionNode");
  assert.equal(definitions.conditionNode.properties.opcode.enum.includes("operator_equals"), true);
  assert.equal(definitions.conditionNode.properties.opcode.enum.includes("operator_add"), false);
});

test("Strict endpoint appends beta exactly once", () => {
  assert.equal(
    buildDeepSeekStrictChatUrl("https://api.deepseek.com"),
    "https://api.deepseek.com/beta/chat/completions"
  );
  assert.equal(
    buildDeepSeekStrictChatUrl("https://api.deepseek.com/beta/"),
    "https://api.deepseek.com/beta/chat/completions"
  );
});

test("extractDeepSeekStrictCandidate converts parameter entries to the internal protocol", () => {
  const candidate = extractDeepSeekStrictCandidate({
    choices: [{
      message: {
        tool_calls: [{
          type: "function",
          function: {
            name: DEEPSEEK_RECOMMENDATION_TOOL_NAME,
            arguments: JSON.stringify({
              summary: "让角色持续移动。",
              recommendation: {
                root: {
                  opcode: "control_forever",
                  category: "控制",
                  label: "一直重复",
                  reason: "持续执行。",
                  params: [],
                  substack: {
                    opcode: "motion_movesteps",
                    category: "运动",
                    label: "移动 20 步",
                    reason: "每次向前移动。",
                    params: [{ name: "steps", value: "20" }]
                  }
                }
              }
            })
          }
        }]
      }
    }]
  });

  assert.deepEqual(candidate, {
    summary: "让角色持续移动。",
    recommendation: {
      root: {
        opcode: "control_forever",
        category: "控制",
        label: "一直重复",
        reason: "持续执行。",
        substack: {
          opcode: "motion_movesteps",
          category: "运动",
          label: "移动 20 步",
          reason: "每次向前移动。",
          params: { steps: "20" }
        }
      }
    }
  });
});

test("extractDeepSeekStrictCandidate rejects content-only JSON responses", () => {
  assert.throws(
    () => extractDeepSeekStrictCandidate({
      choices: [{ message: { content: '{"summary":"普通 JSON"}' } }]
    }),
    /没有调用严格推荐工具/
  );
});
