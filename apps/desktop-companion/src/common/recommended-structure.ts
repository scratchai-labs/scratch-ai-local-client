import type { RecommendedBlockNode, RecommendedBlockStructure } from "./types";

const HAT_OPCODE_SET = new Set([
  "event_whenflagclicked",
  "event_whenkeypressed",
  "event_whenbroadcastreceived",
  "event_whenbackdropswitchesto"
]);

const BOOLEAN_REPORTER_OPCODE_SET = new Set([
  "sensing_touchingobject",
  "sensing_keypressed",
  "sensing_mousedown",
  "operator_equals",
  "operator_gt",
  "operator_lt",
  "operator_contains",
  "data_listcontainsitem"
]);

const REPORTER_OPCODE_SET = new Set([
  ...BOOLEAN_REPORTER_OPCODE_SET,
  "sensing_answer",
  "sensing_distanceto",
  "operator_add",
  "operator_subtract",
  "operator_multiply",
  "operator_divide",
  "operator_join",
  "operator_letter_of",
  "operator_length",
  "operator_mod",
  "operator_round",
  "operator_mathop",
  "data_itemoflist",
  "data_itemnumoflist",
  "data_lengthoflist"
]);

const CONDITION_PARENT_OPCODE_SET = new Set([
  "control_if",
  "control_if_else",
  "control_repeat_until"
]);

const SUBSTACK_PARENT_OPCODE_SET = new Set([
  "control_repeat",
  "control_forever",
  "control_if",
  "control_if_else",
  "control_repeat_until"
]);

export type RecommendationNodePosition = "root" | "next" | "condition" | "substack" | "substack2";

function isHatOpcode(opcode: string) {
  return HAT_OPCODE_SET.has(opcode);
}

function isReporterOpcode(opcode: string) {
  return REPORTER_OPCODE_SET.has(opcode);
}

function isBooleanReporterOpcode(opcode: string) {
  return BOOLEAN_REPORTER_OPCODE_SET.has(opcode);
}

export function canRenderRecommendedNodeAtPosition(
  opcode: string,
  position: RecommendationNodePosition
) {
  if (position === "root") {
    return !isReporterOpcode(opcode);
  }

  if (position === "condition") {
    return isBooleanReporterOpcode(opcode);
  }

  return !isReporterOpcode(opcode) && !isHatOpcode(opcode);
}

function sanitizeRecommendedNode(
  node: RecommendedBlockNode | undefined,
  position: RecommendationNodePosition
): RecommendedBlockNode | null {
  if (!node || !canRenderRecommendedNodeAtPosition(node.opcode, position)) {
    return null;
  }

  const sanitizedNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason
  };

  if (node.next && !isReporterOpcode(node.opcode)) {
    const next = sanitizeRecommendedNode(node.next, "next");
    if (next) {
      sanitizedNode.next = next;
    }
  }

  if (node.condition && CONDITION_PARENT_OPCODE_SET.has(node.opcode)) {
    const condition = sanitizeRecommendedNode(node.condition, "condition");
    if (condition) {
      sanitizedNode.condition = condition;
    }
  }

  if (node.substack && SUBSTACK_PARENT_OPCODE_SET.has(node.opcode)) {
    const substack = sanitizeRecommendedNode(node.substack, "substack");
    if (substack) {
      sanitizedNode.substack = substack;
    }
  }

  if (node.substack2 && node.opcode === "control_if_else") {
    const substack2 = sanitizeRecommendedNode(node.substack2, "substack2");
    if (substack2) {
      sanitizedNode.substack2 = substack2;
    }
  }

  return sanitizedNode;
}

export function sanitizeRecommendedStructure(
  structure: RecommendedBlockStructure | undefined
): RecommendedBlockStructure | undefined {
  if (!structure) {
    return undefined;
  }

  const root = sanitizeRecommendedNode(structure.root, "root");
  if (!root) {
    return undefined;
  }

  return { root };
}
