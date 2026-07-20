import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVariableContinuityToNode,
  applyVariableContinuityToStructure,
  buildCoachingContinuityContext,
  inferVariableMeaning
} from "../dist/variable-continuity.js";

function createSnapshot({ globalVariables = [], spriteVariables = [] } = {}) {
  return {
    title: "Variable continuity test",
    currentTarget: "Cat",
    toolboxCategories: ["变量", "控制", "运算", "外观"],
    loadedExtensions: [],
    programAreaModules: [],
    sprites: [
      {
        name: "Cat",
        isStage: false,
        blockCount: 0,
        variables: spriteVariables.map((name) => ({ id: `sprite-${name}`, name, value: 0, isCloud: false })),
        scripts: []
      }
    ],
    blocks: [],
    globalVariables: globalVariables.map((name) => ({ id: `global-${name}`, name, value: 0, isCloud: false })),
    detectedConcepts: ["data"],
    updatedAt: "2026-07-20T00:00:00.000Z"
  };
}

function createContinuityContext(bindings) {
  return {
    previousRecommendationVariables: bindings.map((binding) => binding.preferredName),
    lockedVariableBindings: bindings.map((binding) => ({
      ...binding,
      source: "previous-recommendation",
      confidence: "high",
      aliases: [binding.preferredName, ...(binding.aliases ?? [])]
    }))
  };
}

test("inferVariableMeaning maps common aliases by usage and name", () => {
  assert.equal(inferVariableMeaning("", "求和"), null);
  assert.equal(inferVariableMeaning("求和", "1+2+...+100 求和"), "accumulator");
  assert.equal(inferVariableMeaning("i", "重复循环每次加 1"), "counter");
  assert.equal(inferVariableMeaning("n", "重复到上限"), "limit");
  assert.equal(inferVariableMeaning("i", "阶乘 product 乘积"), "counter");
  assert.equal(inferVariableMeaning("total", "商品总价 price quantity"), "total");
  assert.equal(inferVariableMeaning("score"), "score");
  assert.equal(inferVariableMeaning("unknownName"), null);
});

test("buildCoachingContinuityContext keeps previous context and flattens nested recommendations", () => {
  const previousContext = {
    previousRecommendationVariables: ["sum", "i"],
    lockedVariableBindings: [
      {
        meaning: "accumulator",
        preferredName: "sum",
        aliases: ["sum"],
        source: "current-recommendation",
        confidence: "high"
      }
    ]
  };

  const context = buildCoachingContinuityContext(
    {
      answerText: "继续完成求和。",
      nextStep: "把计数加到求和。",
      recommendation: {
        root: {
          opcode: "control_if_else",
          category: "控制",
          label: "如果否则",
          reason: "按上限判断",
          condition: {
            opcode: "operator_lt",
            category: "运算",
            label: "计数小于上限",
            reason: "判断循环上限",
            params: { left: "计数", right: "上限" }
          },
          substack: {
            opcode: "data_changevariableby",
            category: "变量",
            label: "将求和增加计数",
            reason: "每次把计数加到求和",
            params: { variable: "求和", changeBy: "计数 + answer + listlength" },
            next: {
              opcode: "data_changevariableby",
              category: "变量",
              label: "将计数增加 1",
              reason: "计数器前进",
              params: { variable: "计数", changeBy: "1" }
            }
          },
          substack2: {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说出总和",
            reason: "展示总和",
            params: { messageVariable: "总和" }
          },
          next: {
            opcode: "data_setvariableto",
            category: "变量",
            label: "重置乘积",
            reason: "阶乘乘积初始化",
            params: { variable: "product", value: "1" }
          }
        }
      }
    },
    previousContext
  );

  assert.deepEqual(context.previousRecommendationVariables, ["sum", "i", "计数", "上限", "求和", "总和", "product"]);
  assert.equal(context.previousRecommendation.answerText, "继续完成求和。");
  assert.equal(context.previousRecommendation.nextStep, "把计数加到求和。");
  assert.equal(context.previousRecommendation.blocks.length, 5);
  assert.equal(context.lockedVariableBindings.find((binding) => binding.meaning === "accumulator").source, "previous-recommendation");
  assert.deepEqual(
    context.lockedVariableBindings.find((binding) => binding.meaning === "accumulator").aliases,
    ["sum", "求和", "总和"]
  );
  assert.equal(context.lockedVariableBindings.find((binding) => binding.meaning === "counter").preferredName, "计数");
  assert.equal(context.lockedVariableBindings.find((binding) => binding.meaning === "limit").preferredName, "上限");
  assert.equal(context.lockedVariableBindings.find((binding) => binding.meaning === "product").preferredName, "product");
});

test("buildCoachingContinuityContext supports flat recommendations and empty responses", () => {
  const previousContext = createContinuityContext([
    { meaning: "score", preferredName: "score", aliases: ["分数"] }
  ]);

  assert.equal(buildCoachingContinuityContext(undefined, previousContext), previousContext);
  assert.equal(buildCoachingContinuityContext({ recommendedBlocks: [] }), undefined);

  const context = buildCoachingContinuityContext({
    recommendedBlocks: [
      {
        opcode: "data_changevariableby",
        category: "变量",
        label: "分数增加",
        reason: "答对加分",
        params: {
          variable: "分数",
          changeBy: "unknownName + 1",
          x: "text:分数变化",
          y: "",
          message: "text:分数变化"
        }
      }
    ]
  });

  assert.deepEqual(context.previousRecommendationVariables, ["分数", "unknownName"]);
  assert.equal(context.lockedVariableBindings[0].meaning, "score");
  assert.equal(context.lockedVariableBindings[0].preferredName, "分数");
});

test("applyVariableContinuityToStructure returns the same structure without locked bindings", () => {
  const structure = {
    root: {
      opcode: "data_changevariableby",
      category: "变量",
      label: "将求和增加计数",
      reason: "无上下文时不改名",
      params: { variable: "求和", changeBy: "计数" }
    }
  };

  assert.equal(applyVariableContinuityToStructure(structure, createSnapshot()), structure);
});

test("applyVariableContinuityToNode replaces equivalent aliases in params, labels, reasons and nested nodes", () => {
  const context = createContinuityContext([
    { meaning: "accumulator", preferredName: "sum", aliases: ["求和", "总和"] },
    { meaning: "counter", preferredName: "i", aliases: ["计数"] },
    { meaning: "limit", preferredName: "n", aliases: ["上限"] }
  ]);

  const node = {
    opcode: "control_repeat_until",
    category: "控制",
    label: "重复直到计数大于上限",
    reason: "计数到达上限后停止",
    params: { condition: "custom condition" },
    condition: {
      opcode: "operator_gt",
      category: "运算",
      label: "计数大于上限",
      reason: "判断计数是否超过上限",
      params: { left: "计数", right: "上限" }
    },
    substack: {
      opcode: "data_changevariableby",
      category: "变量",
      label: "将求和增加计数",
      reason: "把计数累加到求和",
      params: {
        variable: "求和",
        changeBy: "计数 + answer + round + listlength",
        message: "text:计数不要替换"
      }
    },
    substack2: {
      opcode: "looks_sayforsecs",
      category: "外观",
      label: "说出总和",
      reason: "展示总和",
      params: { messageVariable: "总和" }
    },
    next: {
      opcode: "data_changevariableby",
      category: "变量",
      label: "将计数增加 1",
      reason: "计数器前进",
      params: { variable: "计数", changeBy: "1" }
    }
  };

  const result = applyVariableContinuityToNode(node, createSnapshot(), context);

  assert.equal(result.params.condition, "custom condition");
  assert.equal(result.condition.label, "i大于n");
  assert.equal(result.condition.reason, "判断i是否超过n");
  assert.deepEqual(result.condition.params, { left: "i", right: "n" });
  assert.equal(result.substack.label, "将sum增加i");
  assert.equal(result.substack.reason, "把i累加到sum");
  assert.deepEqual(result.substack.params, {
    variable: "sum",
    changeBy: "i + answer + round + listlength",
    message: "text:计数不要替换"
  });
  assert.equal(result.substack2.label, "说出sum");
  assert.equal(result.substack2.params.messageVariable, "sum");
  assert.equal(result.next.label, "将i增加 1");
  assert.equal(result.next.params.variable, "i");

  const structureResult = applyVariableContinuityToStructure(
    {
      root: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "设置求和",
        reason: "重置求和",
        params: { variable: "求和", value: "0" }
      }
    },
    createSnapshot(),
    context
  );
  assert.equal(structureResult.root.params.variable, "sum");
  assert.equal(structureResult.root.label, "设置sum");
});

test("applyVariableContinuityToNode preserves variables that already exist in Scratch", () => {
  const context = createContinuityContext([
    { meaning: "accumulator", preferredName: "sum", aliases: ["求和"] },
    { meaning: "counter", preferredName: "i", aliases: ["计数"] }
  ]);

  const result = applyVariableContinuityToNode(
    {
      opcode: "data_changevariableby",
      category: "变量",
      label: "将求和增加计数",
      reason: "学生已经真实创建了求和和计数",
      params: { variable: "求和", changeBy: "计数" }
    },
    createSnapshot({ globalVariables: ["求和"], spriteVariables: ["计数"] }),
    context
  );

  assert.deepEqual(result.params, { variable: "求和", changeBy: "计数" });
  assert.equal(result.label, "将求和增加计数");
});

test("applyVariableContinuityToNode can replace by explicit alias when the meaning is unknown", () => {
  const context = createContinuityContext([
    { meaning: "custom-progress", preferredName: "progress", aliases: ["进度值"] }
  ]);

  const result = applyVariableContinuityToNode(
    {
      opcode: "data_setvariableto",
      category: "变量",
      label: "设置进度值",
      reason: "同步进度值",
      params: { variable: "进度值", value: "进度值 + 1" }
    },
    createSnapshot(),
    context
  );

  assert.deepEqual(result.params, { variable: "progress", value: "progress + 1" });
  assert.equal(result.label, "设置progress");
  assert.equal(result.reason, "同步progress");
});

test("applyVariableContinuityToNode omits empty params and leaves text expressions unchanged", () => {
  const context = createContinuityContext([
    { meaning: "score", preferredName: "score", aliases: ["分数"] }
  ]);

  const result = applyVariableContinuityToNode(
    {
      opcode: "looks_sayforsecs",
      category: "外观",
      label: "说出分数",
      reason: "文本常量不应参与变量改名",
      params: { variable: "", value: "text:分数" }
    },
    createSnapshot(),
    context
  );

  assert.deepEqual(result.params, { value: "text:分数" });
  assert.equal(result.label, "说出分数");

  const unchangedPreferred = applyVariableContinuityToNode(
    {
      opcode: "data_setvariableto",
      category: "变量",
      label: "设置score",
      reason: "score 已经是锁定变量名",
      params: { variable: "score", value: "score + 1" }
    },
    createSnapshot(),
    context
  );
  assert.deepEqual(unchangedPreferred.params, { variable: "score", value: "score + 1" });
});

test("applyVariableContinuityToNode passes through params when context or params are missing", () => {
  const withParams = {
    opcode: "data_changevariableby",
    category: "变量",
    label: "将分数增加 1",
    reason: "没有上下文时保持原样",
    params: { variable: "分数", changeBy: "1" }
  };
  const withoutParams = {
    opcode: "looks_sayforsecs",
    category: "外观",
    label: "说你好",
    reason: "没有参数"
  };

  assert.deepEqual(applyVariableContinuityToNode(withParams, createSnapshot()).params, withParams.params);
  assert.equal(
    Object.hasOwn(applyVariableContinuityToNode(withoutParams, createSnapshot(), createContinuityContext([
      { meaning: "score", preferredName: "score", aliases: ["分数"] }
    ])), "params"),
    false
  );
});
