import {
  coachRecommendationResponseSchema,
  getDisplayLabelForOpcode,
  getExtensionIdForOpcode,
  recommendedBlockNodeSchema
} from "@scratch-ai/shared";
import { isSupportedRecommendedBlockOpcode } from "../common/scratch-block-xml";
import { sanitizeRecommendedStructure } from "../common/recommended-structure";
import { canUseRecommendedBlockRelation } from "../common/recommended-block-capabilities";
import { MAX_RECOMMENDED_BLOCKS } from "../common/recommended-blocks";
import {
  collectProjectVariableNames,
  detectCoachingTaskIntent,
  isMathTaskType,
  normalizeIntentText
} from "./coaching-task-intent";
import {
  buildKnownVariableGoalFallbackResponse,
  shouldReplaceKnownVariableGoalRecommendation
} from "./known-variable-goal-fallback";

import type {
  CoachResponse,
  ProgramAreaModule,
  ProjectSnapshot,
  RecommendedBlock,
  RecommendedBlockNode,
  RecommendedBlockStructure
} from "../common/types";

const NON_REPEATABLE_HAT_OPCODE_SET = new Set([
  "event_whenflagclicked",
  "event_whenkeypressed",
  "event_whenbroadcastreceived",
  "event_whenbackdropswitchesto"
]);

interface RecommendationContext {
  snapshot: ProjectSnapshot;
  currentTargetPrograms: string[];
  programAreaModules: ProgramAreaModule[];
  loadedExtensions: string[];
  goal?: string;
}

export interface RecommendationNormalizationOptions extends RecommendationContext {
  buildFallbackResponse: () => CoachResponse;
}

function getCurrentTargetSprite(snapshot: ProjectSnapshot) {
  return snapshot.sprites.find((sprite) => sprite.name === snapshot.currentTarget) ?? snapshot.sprites[0] ?? null;
}

function getCurrentTargetOpcodes(snapshot: ProjectSnapshot) {
  const sprite = getCurrentTargetSprite(snapshot);
  return sprite ? sprite.scripts.flatMap((script) => script.blockOpcodes) : [];
}

function getProjectOpcodes(snapshot: ProjectSnapshot) {
  return snapshot.sprites.flatMap((sprite) => sprite.scripts.flatMap((script) => script.blockOpcodes));
}

function getAllProjectOpcodes(snapshot: ProjectSnapshot) {
  return [
    ...getProjectOpcodes(snapshot),
    ...snapshot.blocks.map((block) => block.opcode)
  ];
}

function hasOpcodePrefix(opcodes: string[], prefix: string) {
  return opcodes.some((opcode) => opcode.startsWith(prefix));
}

function normalizeTextValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

const RECOMMENDATION_PARAM_KEY_SET = new Set([
  "variable",
  "value",
  "changeBy",
  "message",
  "messageVariable",
  "repeatTimes",
  "question",
  "key",
  "list",
  "broadcast",
  "left",
  "right",
  "x",
  "y",
  "steps",
  "degrees",
  "secs"
]);

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function operatorSymbolFromOpcode(opcode: string) {
  switch (opcode) {
    case "operator_add":
      return "+";
    case "operator_subtract":
      return "-";
    case "operator_multiply":
      return "*";
    case "operator_divide":
      return "/";
    default:
      return null;
  }
}

function normalizeParamExpression(value: unknown): string | null {
  const scalar = normalizeTextValue(value);
  if (scalar) {
    return scalar;
  }

  const node = asPlainRecord(value);
  if (!node) {
    return null;
  }

  const opcode = normalizeTextValue(node.opcode) ?? "";
  const params = asPlainRecord(node.params) ?? {};

  if (opcode === "data_variable") {
    return normalizeTextValue(params.variable) ?? normalizeTextValue(node.label);
  }

  if (opcode === "sensing_answer") {
    return "answer";
  }

  const operatorSymbol = operatorSymbolFromOpcode(opcode);
  if (operatorSymbol) {
    const left = normalizeParamExpression(params.left);
    const right = normalizeParamExpression(params.right);
    return left && right ? `(${left} ${operatorSymbol} ${right})` : null;
  }

  if (opcode === "operator_join") {
    const left = normalizeParamExpression(params.left) ?? "";
    const right = normalizeParamExpression(params.right) ?? "";
    return `${left}${right}`.trim() || null;
  }

  return null;
}

function normalizeRecommendedParams(value: unknown) {
  const params = asPlainRecord(value);
  if (!params) {
    return value;
  }

  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(params)) {
    if (!RECOMMENDATION_PARAM_KEY_SET.has(key)) {
      continue;
    }

    const textValue = normalizeParamExpression(rawValue);
    if (!textValue) {
      continue;
    }

    if (key === "messageVariable" && asPlainRecord(rawValue) && !/^[a-z_][a-z0-9_]*$/i.test(textValue)) {
      normalized.message = textValue;
      continue;
    }

    normalized[key] = textValue;
  }

  return normalized;
}

function toRecommendedBlock(node: RecommendedBlockNode): RecommendedBlock {
  return {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason,
    ...(node.params ? { params: node.params } : {})
  };
}

function flattenRecommendedStructure(structure: RecommendedBlockStructure) {
  const blocks: RecommendedBlock[] = [];

  const visit = (node: RecommendedBlockNode) => {
    blocks.push(toRecommendedBlock(node));
    for (const relation of ["condition", "substack", "substack2", "next"] as const) {
      const child = node[relation];
      if (child) {
        visit(child);
      }
    }
  };

  visit(structure.root);
  return blocks.slice(0, MAX_RECOMMENDED_BLOCKS);
}

function cloneRecommendedBlockAsNode(block: RecommendedBlock): RecommendedBlockNode {
  return {
    opcode: block.opcode,
    category: block.category,
    label: block.label,
    reason: block.reason,
    ...(block.params ? { params: block.params } : {})
  };
}

export function buildLinearRecommendation(blocks: RecommendedBlock[]): RecommendedBlockStructure | undefined {
  const nodes = blocks.slice(0, MAX_RECOMMENDED_BLOCKS).map(cloneRecommendedBlockAsNode);
  if (!nodes[0]) {
    return undefined;
  }

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const currentNode = nodes[index];
    const nextNode = nodes[index + 1];
    if (currentNode && nextNode) {
      currentNode.next = nextNode;
    }
  }

  return {
    root: nodes[0]
  };
}

function trimRecommendedNode(
  node: RecommendedBlockNode,
  remaining: { count: number }
): RecommendedBlockNode | null {
  if (remaining.count <= 0) {
    return null;
  }

  remaining.count -= 1;
  const trimmedNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason,
    ...(node.params ? { params: node.params } : {})
  };

  for (const relation of ["condition", "substack", "substack2", "next"] as const) {
    const child = node[relation];
    if (!child) {
      continue;
    }

    const trimmedChild = trimRecommendedNode(child, remaining);
    if (trimmedChild) {
      trimmedNode[relation] = trimmedChild;
    }
  }

  return trimmedNode;
}

export function trimRecommendationStructure(
  structure: RecommendedBlockStructure,
  maxBlocks: number
): RecommendedBlockStructure | undefined {
  const root = trimRecommendedNode(structure.root, { count: maxBlocks });
  return root ? { root } : undefined;
}

function stripScratchNodeMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const node = value as Record<string, unknown>;
  const stripped: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(node)) {
    if (key === "fields" || key === "inputs") {
      continue;
    }

    if (key === "params") {
      stripped.params = normalizeRecommendedParams(childValue);
      continue;
    }

    if (["condition", "substack", "substack2", "next"].includes(key)) {
      stripped[key] = stripScratchNodeMetadata(childValue);
      continue;
    }

    stripped[key] = childValue;
  }

  if (typeof stripped.reason !== "string" || !stripped.reason.trim()) {
    const fallbackReason = normalizeTextValue(stripped.label) ?? normalizeTextValue(stripped.opcode);
    if (fallbackReason) {
      stripped.reason = fallbackReason;
    }
  }

  return stripped;
}

function parseRecommendationCandidate(candidate: Record<string, unknown>) {
  const extraTopLevelKeys = Object.keys(candidate).filter((key) => key !== "summary" && key !== "recommendation");
  if (extraTopLevelKeys.length > 0) {
    return coachRecommendationResponseSchema.parse(candidate);
  }

  if (typeof candidate.summary !== "string") {
    return coachRecommendationResponseSchema.parse(candidate);
  }

  const rawRecommendation = candidate.recommendation;
  if (rawRecommendation === undefined) {
    return coachRecommendationResponseSchema.parse(candidate);
  }
  if (!rawRecommendation || typeof rawRecommendation !== "object" || Array.isArray(rawRecommendation)) {
    return coachRecommendationResponseSchema.parse(candidate);
  }

  const recommendation = rawRecommendation as Record<string, unknown>;
  const extraRecommendationKeys = Object.keys(recommendation).filter((key) => key !== "root");
  if (extraRecommendationKeys.length > 0) {
    return coachRecommendationResponseSchema.parse(candidate);
  }

  const rawRoot = recommendedBlockNodeSchema.parse(stripScratchNodeMetadata(recommendation.root));
  const root = trimRecommendedNode(rawRoot, { count: MAX_RECOMMENDED_BLOCKS });
  if (!root) {
    throw new Error("DeepSeek 没有返回可用的官方推荐积木。");
  }

  return coachRecommendationResponseSchema.parse({
    summary: candidate.summary,
    recommendation: {
      root
    }
  });
}

const MATH_TASK_DISALLOWED_OPCODES = new Set([
  "motion_movesteps",
  "motion_turnright",
  "motion_turnleft",
  "motion_gotoxy",
  "motion_goto",
  "motion_glidesecstoxy",
  "motion_glideto",
  "motion_pointindirection",
  "motion_pointtowards",
  "motion_changexby",
  "motion_setx",
  "motion_changeyby",
  "motion_sety",
  "motion_ifonedgebounce",
  "looks_switchcostumeto",
  "looks_nextcostume"
]);

const DRAWING_TASK_DISALLOWED_OPCODES = new Set([
  "motion_ifonedgebounce",
  "sensing_touchingobject",
  "sensing_keypressed",
  "data_setvariableto",
  "data_changevariableby",
  "looks_switchcostumeto",
  "looks_nextcostume"
]);

function isAvailableRecommendedOpcode(opcode: string, options: RecommendationContext) {
  if (!isSupportedRecommendedBlockOpcode(opcode)) {
    return false;
  }

  const intent = detectCoachingTaskIntent(options);
  if (opcode === "sensing_askandwait" && shouldAvoidAskForFixedSumGoal(options, intent)) {
    return false;
  }
  if (isMathTaskType(intent.taskType) && MATH_TASK_DISALLOWED_OPCODES.has(opcode)) {
    return false;
  }
  if (intent.taskType === "drawing" && DRAWING_TASK_DISALLOWED_OPCODES.has(opcode)) {
    return false;
  }

  const extensionId = getExtensionIdForOpcode(opcode);
  if (!extensionId) {
    return true;
  }

  return options.loadedExtensions.includes(extensionId) || options.snapshot.loadedExtensions.includes(extensionId);
}

function shouldAvoidAskForFixedSumGoal(
  options: RecommendationContext,
  intent = detectCoachingTaskIntent(options)
) {
  if (intent.taskType !== "math-sum") {
    return false;
  }

  const goalText = normalizeIntentText(options.goal || options.snapshot.goal || "");
  if (!goalText || /询问|输入|回答|ask/.test(goalText)) {
    return false;
  }

  return /\d+/.test(goalText) && /(求和|累加|1到|1\+)/.test(goalText);
}

function shouldOmitAlreadyUsedRootHat(
  node: RecommendedBlockNode,
  options: RecommendationContext
) {
  return (
    NON_REPEATABLE_HAT_OPCODE_SET.has(node.opcode) &&
    getCurrentTargetOpcodes(options.snapshot).includes(node.opcode)
  );
}

function filterRecommendedNode(
  node: RecommendedBlockNode,
  options: RecommendationContext
): RecommendedBlockNode | null {
  // Skip disallowed nodes (e.g. motion drift on math tasks) and promote the remaining chain.
  if (!isAvailableRecommendedOpcode(node.opcode, options)) {
    const promotedNext = node.next ? filterRecommendedNode(node.next, options) : null;
    if (promotedNext) {
      return promotedNext;
    }
    const promotedSubstack =
      node.substack && canUseRecommendedBlockRelation(node.opcode, "substack")
        ? filterRecommendedNode(node.substack, options)
        : null;
    if (promotedSubstack) {
      return promotedSubstack;
    }
    return null;
  }

  const filteredNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason,
    ...(node.params ? { params: node.params } : {})
  };

  const next = node.next ? filterRecommendedNode(node.next, options) : null;
  const condition =
    node.condition && canUseRecommendedBlockRelation(node.opcode, "condition")
      ? filterRecommendedNode(node.condition, options)
      : null;
  const substack =
    node.substack && canUseRecommendedBlockRelation(node.opcode, "substack")
      ? filterRecommendedNode(node.substack, options)
      : null;
  const substack2 =
    node.substack2 && canUseRecommendedBlockRelation(node.opcode, "substack2")
      ? filterRecommendedNode(node.substack2, options)
      : null;

  if (next) {
    filteredNode.next = next;
  }
  if (condition) {
    filteredNode.condition = condition;
  }
  if (substack) {
    filteredNode.substack = substack;
  }
  if (substack2) {
    filteredNode.substack2 = substack2;
  }

  return filteredNode;
}

function appendReasonDetail(reason: string, detail: string) {
  return reason.includes(detail) ? reason : `${reason} ${detail}`;
}

function isSayOpcode(opcode: string) {
  return opcode === "looks_say" || opcode === "looks_sayforsecs";
}

function inferMathSumAccumulatorVariableName(options: RecommendationContext) {
  const variableNames = collectProjectVariableNames(options.snapshot);
  const preferred = variableNames.find((name) => /^(sum|累加和|总和|合计|total)$/i.test(name));
  if (preferred) {
    return preferred;
  }

  const fallback = variableNames.find((name) => !/^(i|n|计数器|计数|上限|次数)$/i.test(name));
  return fallback || "sum";
}

function reasonMentionsVariable(reasonText: string, variableName: string) {
  const normalizedVariable = normalizeIntentText(variableName);
  if (!normalizedVariable) {
    return false;
  }
  if (/^(sum|累加和|总和|合计|total)$/.test(normalizedVariable)) {
    return /sum|累加和|总和|合计|total/.test(reasonText);
  }
  return new RegExp(`(^|[^a-z0-9_])${normalizedVariable}([^a-z0-9_]|$)`, "i").test(reasonText);
}

function isSquareCalculationGoal(options: RecommendationContext) {
  const text = normalizeIntentText(
    [
      options.goal,
      options.snapshot.goal,
      ...options.currentTargetPrograms,
      ...options.snapshot.sprites.flatMap((sprite) =>
        sprite.scripts.flatMap((script) => script.blockSequence)
      )
    ].join("|")
  );
  return /平方|乘以自己|number\*number|number.*number/.test(text);
}

export function buildCompletedSquareCoachResponse(options: RecommendationContext): CoachResponse | null {
  if (!isSquareCalculationGoal(options)) {
    return null;
  }

  const opcodes = getAllProjectOpcodes(options.snapshot);
  const variableNames = collectProjectVariableNames(options.snapshot).map((name) => name.toLowerCase());
  const hasNumber = variableNames.some((name) => name === "number" || name === "数字" || name === "输入的数");
  const hasResult = variableNames.some((name) => name === "result" || name === "结果");
  const hasInput = opcodes.includes("sensing_askandwait") || opcodes.includes("sensing_answer");
  const hasMultiply = opcodes.includes("operator_multiply");
  const hasSay = opcodes.includes("looks_say") || opcodes.includes("looks_sayforsecs");

  if (!hasNumber || !hasResult || !hasInput || !hasMultiply || !hasSay) {
    return null;
  }

  const answerText = "你的平方计算已经完成。点击绿旗，输入一个数字，角色会说出它的平方结果。";
  return {
    answerText,
    recommendedBlocks: [],
    nextStep: answerText,
    detectedIssues: []
  };
}

function enrichRecommendedNodeForMathIntent(
  node: RecommendedBlockNode,
  options: RecommendationContext,
  intent = detectCoachingTaskIntent(options)
): RecommendedBlockNode {
  const enrichedNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason,
    ...(node.params ? { params: node.params } : {})
  };
  const reasonText = normalizeIntentText(node.reason);
  const squareGoal = isSquareCalculationGoal(options);

  if (intent.taskType === "math-sum" && isSayOpcode(node.opcode)) {
    const accumulatorVariable = inferMathSumAccumulatorVariableName(options);
    if (!reasonMentionsVariable(reasonText, accumulatorVariable)) {
      enrichedNode.reason = appendReasonDetail(
        node.reason,
        `说话内容要放入 ${accumulatorVariable} 变量，不能只填“结果”。`
      );
    }
  }

  if (squareGoal && node.opcode === "data_setvariableto" && !/result.*number|number.*result/.test(reasonText)) {
    enrichedNode.reason = appendReasonDetail(node.reason, "将 result 设为 number * number。");
  }

  if (squareGoal && isSayOpcode(node.opcode) && !/result|计算结果|平方结果/.test(reasonText)) {
    enrichedNode.reason = appendReasonDetail(node.reason, "说话内容要放入 result 变量，不能只填“结果”。");
  }

  for (const relation of ["condition", "substack", "substack2", "next"] as const) {
    const child = node[relation];
    if (child) {
      enrichedNode[relation] = enrichRecommendedNodeForMathIntent(child, options, intent);
    }
  }

  return enrichedNode;
}

function hasCompletionEvidenceForSummaryOnlyResponse(snapshot: ProjectSnapshot) {
  const opcodes = getProjectOpcodes(snapshot);
  const blockCount = snapshot.sprites.reduce((total, sprite) => total + sprite.blockCount, 0);
  const scriptCount = snapshot.sprites.reduce((total, sprite) => total + sprite.scripts.length, 0);
  if (blockCount < 4 || scriptCount === 0) {
    return false;
  }

  if (!hasOpcodePrefix(opcodes, "event_") || !hasOpcodePrefix(opcodes, "control_")) {
    return false;
  }

  const hasRuleOrFeedback =
    hasOpcodePrefix(opcodes, "sensing_") ||
    hasOpcodePrefix(opcodes, "data_") ||
    hasOpcodePrefix(opcodes, "looks_") ||
    hasOpcodePrefix(opcodes, "sound_") ||
    opcodes.includes("event_broadcast") ||
    opcodes.includes("event_broadcastandwait") ||
    opcodes.includes("event_whenbroadcastreceived");
  const hasMultiActorFlow =
    snapshot.sprites.filter((sprite) => !sprite.isStage && sprite.blockCount > 0).length > 1 && blockCount >= 8;

  return hasRuleOrFeedback || hasMultiActorFlow;
}

export function normalizeCoachRecommendation(rawPayload: unknown, options: RecommendationNormalizationOptions) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return rawPayload;
  }

  const completedSquareResponse = buildCompletedSquareCoachResponse(options);
  if (completedSquareResponse) {
    return completedSquareResponse;
  }

  const candidate = rawPayload as Record<string, unknown>;
  if (typeof candidate.summary === "string") {
    const structuredCandidate: Record<string, unknown> = {
      summary: candidate.summary
    };
    if (candidate.recommendation !== undefined && candidate.recommendation !== null) {
      structuredCandidate.recommendation = candidate.recommendation;
    }

    if (structuredCandidate.recommendation === undefined) {
      const parsed = parseRecommendationCandidate(structuredCandidate);
      if (!hasCompletionEvidenceForSummaryOnlyResponse(options.snapshot)) {
        return options.buildFallbackResponse();
      }

      return {
        answerText: parsed.summary,
        recommendedBlocks: [],
        nextStep: parsed.summary,
        detectedIssues: []
      };
    }

    const parsed = parseRecommendationCandidate(structuredCandidate);
    const rootCandidate = shouldOmitAlreadyUsedRootHat(parsed.recommendation.root, options)
      ? parsed.recommendation.root.next
      : parsed.recommendation.root;
    const filteredRoot = rootCandidate ? filterRecommendedNode(rootCandidate, options) : null;
    if (!filteredRoot) {
      throw new Error("DeepSeek 没有返回可用的官方推荐积木。");
    }

    let renderableRoot: RecommendedBlockNode | undefined = enrichRecommendedNodeForMathIntent(filteredRoot, options);
    let recommendation: RecommendedBlockStructure | undefined;
    while (renderableRoot && !recommendation) {
      recommendation = sanitizeRecommendedStructure({
        root: renderableRoot
      });
      renderableRoot = renderableRoot.next;
    }
    if (!recommendation) {
      throw new Error("DeepSeek 没有返回可渲染的推荐积木结构。");
    }

    const knownVariableGoalContext = {
      goal: options.goal,
      snapshotGoal: options.snapshot.goal,
      variableNames: collectProjectVariableNames(options.snapshot)
    };
    if (shouldReplaceKnownVariableGoalRecommendation(knownVariableGoalContext, recommendation)) {
      const targetedFallback = buildKnownVariableGoalFallbackResponse(knownVariableGoalContext);
      if (targetedFallback) {
        return targetedFallback;
      }
    }

    return {
      answerText: parsed.summary,
      recommendation,
      recommendedBlocks: flattenRecommendedStructure(recommendation),
      nextStep: parsed.summary,
      detectedIssues: []
    };
  }

  const answerText =
    normalizeTextValue(candidate.answerText) ??
    normalizeTextValue(candidate.answer) ??
    normalizeTextValue(candidate.summary);
  const nextStep =
    normalizeTextValue(candidate.nextStep) ??
    normalizeTextValue(candidate.next_action) ??
    normalizeTextValue(candidate.nextAction);
  const followUpQuestion =
    normalizeTextValue(candidate.followUpQuestion) ??
    normalizeTextValue(candidate.follow_up_question) ??
    normalizeTextValue(candidate.followUp);

  const recommendedBlocks = Array.isArray(candidate.recommendedBlocks)
    ? candidate.recommendedBlocks
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .flatMap((item) => {
          const category = normalizeTextValue(item.category) ?? "其他";
          const opcode = normalizeTextValue(item.opcode) ?? "";
          if (!isSupportedRecommendedBlockOpcode(opcode)) {
            return [];
          }
          if (isMathTaskType(detectCoachingTaskIntent(options).taskType) && MATH_TASK_DISALLOWED_OPCODES.has(opcode)) {
            return [];
          }
          const rawLabel =
            normalizeTextValue(item.label) ??
            normalizeTextValue(item.blockName);
          const label =
            rawLabel && !/^[a-z0-9_]+$/i.test(rawLabel)
              ? rawLabel
              : getDisplayLabelForOpcode(opcode);
          const reason =
            normalizeTextValue(item.reason) ??
            normalizeTextValue(item.description) ??
            "适合作为下一步尝试。";
          const example = normalizeTextValue(item.example);

          return [{
            opcode,
            category,
            label,
            reason,
            ...(example ? { example } : {})
          }];
        })
    : [];

  return {
    answerText,
    recommendedBlocks: recommendedBlocks.slice(0, MAX_RECOMMENDED_BLOCKS),
    nextStep,
    detectedIssues: [],
    ...(followUpQuestion && !candidate.recommendation ? { followUpQuestion } : {})
  };
}
