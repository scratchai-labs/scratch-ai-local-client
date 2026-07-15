import { SUPPORTED_RECOMMENDED_BLOCK_OPCODES } from "./scratch-block-xml";

export type RecommendedBlockShape = "hat" | "stack" | "terminal" | "reporter" | "boolean";
export type RecommendedBlockRelation = "next" | "condition" | "substack" | "substack2";
export type RecommendedBlockPosition = "root" | RecommendedBlockRelation;

const HAT_OPCODES = new Set([
  "event_whenflagclicked",
  "event_whenkeypressed",
  "event_whenbroadcastreceived",
  "event_whenbackdropswitchesto"
]);

const BOOLEAN_REPORTER_OPCODES = new Set([
  "sensing_touchingobject",
  "sensing_keypressed",
  "sensing_mousedown",
  "operator_equals",
  "operator_gt",
  "operator_lt",
  "operator_contains",
  "data_listcontainsitem"
]);

const REPORTER_OPCODES = new Set([
  ...BOOLEAN_REPORTER_OPCODES,
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

const TERMINAL_OPCODES = new Set([
  "control_forever",
  "control_stop",
  "control_delete_this_clone"
]);

const CONDITION_PARENT_OPCODES = new Set([
  "control_if",
  "control_if_else",
  "control_repeat_until"
]);

const SUBSTACK_PARENT_OPCODES = new Set([
  "control_repeat",
  "control_forever",
  "control_if",
  "control_if_else",
  "control_repeat_until"
]);

const supportedOpcodeSet = new Set<string>(SUPPORTED_RECOMMENDED_BLOCK_OPCODES);

export interface RecommendedBlockCapability {
  opcode: string;
  shape: RecommendedBlockShape;
  relations: ReadonlySet<RecommendedBlockRelation>;
}

function resolveShape(opcode: string): RecommendedBlockShape {
  if (HAT_OPCODES.has(opcode)) return "hat";
  if (BOOLEAN_REPORTER_OPCODES.has(opcode)) return "boolean";
  if (REPORTER_OPCODES.has(opcode)) return "reporter";
  if (TERMINAL_OPCODES.has(opcode)) return "terminal";
  return "stack";
}

function resolveRelations(opcode: string, shape: RecommendedBlockShape) {
  const relations = new Set<RecommendedBlockRelation>();
  if (shape === "hat" || shape === "stack") {
    relations.add("next");
  }
  if (CONDITION_PARENT_OPCODES.has(opcode)) {
    relations.add("condition");
  }
  if (SUBSTACK_PARENT_OPCODES.has(opcode)) {
    relations.add("substack");
  }
  if (opcode === "control_if_else") {
    relations.add("substack2");
  }
  return relations;
}

const capabilityByOpcode = new Map<string, RecommendedBlockCapability>(
  SUPPORTED_RECOMMENDED_BLOCK_OPCODES.map((opcode) => {
    const shape = resolveShape(opcode);
    return [opcode, { opcode, shape, relations: resolveRelations(opcode, shape) }];
  })
);

export function getRecommendedBlockCapability(opcode: string) {
  return capabilityByOpcode.get(opcode);
}

export function isKnownRecommendedBlockOpcode(opcode: string) {
  return supportedOpcodeSet.has(opcode);
}

export function canUseRecommendedBlockRelation(opcode: string, relation: RecommendedBlockRelation) {
  return capabilityByOpcode.get(opcode)?.relations.has(relation) ?? false;
}

export function canRenderRecommendedBlockAtPosition(opcode: string, position: RecommendedBlockPosition) {
  const capability = capabilityByOpcode.get(opcode);
  if (!capability) return false;

  if (position === "root") {
    return capability.shape !== "reporter" && capability.shape !== "boolean";
  }
  if (position === "condition") {
    return capability.shape === "boolean";
  }
  if (position === "next") {
    return capability.shape === "stack" || capability.shape === "terminal";
  }
  return capability.shape !== "hat" && capability.shape !== "reporter" && capability.shape !== "boolean";
}

export function getRecommendedOpcodesByShape(shape: RecommendedBlockShape) {
  return [...capabilityByOpcode.values()]
    .filter((capability) => capability.shape === shape)
    .map((capability) => capability.opcode);
}
