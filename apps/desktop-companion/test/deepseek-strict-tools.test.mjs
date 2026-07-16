import test from "node:test";
import assert from "node:assert/strict";

import {
  DEEPSEEK_COMPLETE_TOOL_NAME,
  DEEPSEEK_RECOMMENDATION_TOOL_NAME,
  DEEPSEEK_STRICT_TOOLS,
  buildDeepSeekStrictChatUrl,
  compileDeepSeekStrictNodes,
  extractDeepSeekStrictCandidate
} from "../dist/deepseek-strict-tools.js";

function node(id, opcode, parentId, relation, params = []) {
  return {
    id,
    parentId,
    relation,
    opcode,
    category: "测试",
    label: opcode,
    reason: `验证 ${opcode}`,
    params
  };
}

test("Strict recommendation schema uses flat explicit links without recursive refs", () => {
  const [completeTool, recommendationTool] = DEEPSEEK_STRICT_TOOLS;
  assert.equal(completeTool.function.name, DEEPSEEK_COMPLETE_TOOL_NAME);
  assert.equal(recommendationTool.function.name, DEEPSEEK_RECOMMENDATION_TOOL_NAME);
  assert.equal(completeTool.function.strict, true);
  assert.equal(recommendationTool.function.strict, true);

  const parameters = recommendationTool.function.parameters;
  assert.equal(Object.hasOwn(parameters, "$defs"), false);
  assert.equal(parameters.properties.nodes.type, "array");
  assert.deepEqual(
    parameters.properties.nodes.items.properties.relation.enum,
    ["root", "next", "condition", "substack", "substack2"]
  );
  assert.equal(
    parameters.properties.nodes.items.properties.opcode.enum.includes("control_forever"),
    true
  );
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

test("compileDeepSeekStrictNodes builds a legal forever substack", () => {
  const root = compileDeepSeekStrictNodes([
    node("loop", "control_forever", "", "root"),
    node("move", "motion_movesteps", "loop", "substack", [
      { name: "steps", value: "20" }
    ])
  ]);

  assert.deepEqual(root, {
    opcode: "control_forever",
    category: "测试",
    label: "control_forever",
    reason: "验证 control_forever",
    substack: {
      opcode: "motion_movesteps",
      category: "测试",
      label: "motion_movesteps",
      reason: "验证 motion_movesteps",
      params: { steps: "20" }
    }
  });
});

test("compileDeepSeekStrictNodes accepts key params and normalizes common MESSAGE casing", () => {
  const keyRoot = compileDeepSeekStrictNodes([
    node("key", "event_whenkeypressed", "", "root", [
      { name: "key", value: "right arrow" }
    ]),
    node("move", "motion_changexby", "key", "next", [
      { name: "steps", value: "speed" }
    ])
  ]);
  assert.equal(keyRoot.params.key, "right arrow");
  assert.equal(keyRoot.next.params.steps, "speed");

  const sayRoot = compileDeepSeekStrictNodes([
    node("say", "looks_sayforsecs", "", "root", [
      { name: "MESSAGE", value: "开始" }
    ])
  ]);
  assert.equal(sayRoot.params.message, "开始");
});

test("compileDeepSeekStrictNodes rejects terminal next and invalid condition links", () => {
  assert.throws(
    () => compileDeepSeekStrictNodes([
      node("loop", "control_forever", "", "root"),
      node("move", "motion_movesteps", "loop", "next")
    ]),
    /不允许使用 next/
  );
  assert.throws(
    () => compileDeepSeekStrictNodes([
      node("if", "control_if", "", "root"),
      node("move", "motion_movesteps", "if", "condition")
    ]),
    /不能放在 condition 位置/
  );
});

test("extractDeepSeekStrictCandidate compiles flat tool arguments", () => {
  const candidate = extractDeepSeekStrictCandidate({
    choices: [{
      message: {
        tool_calls: [{
          type: "function",
          function: {
            name: DEEPSEEK_RECOMMENDATION_TOOL_NAME,
            arguments: JSON.stringify({
              summary: "让角色持续移动。",
              nodes: [
                node("loop", "control_forever", "", "root"),
                node("move", "motion_movesteps", "loop", "substack", [
                  { name: "steps", value: "20" }
                ])
              ]
            })
          }
        }]
      }
    }]
  });
  assert.equal(candidate.summary, "让角色持续移动。");
  assert.equal(candidate.recommendation.root.opcode, "control_forever");
  assert.equal(candidate.recommendation.root.substack.params.steps, "20");
});

test("extractDeepSeekStrictCandidate rejects content-only JSON responses", () => {
  assert.throws(
    () => extractDeepSeekStrictCandidate({
      choices: [{ message: { content: '{"summary":"普通 JSON"}' } }]
    }),
    /没有调用严格推荐工具/
  );
});
