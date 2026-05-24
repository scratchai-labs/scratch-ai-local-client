import type { RecommendedBlock } from "./types";

const XML_NAMESPACE = "https://developers.google.com/blockly/xml";
const SCALAR_VARIABLE_TYPE = "";
const LIST_VARIABLE_TYPE = "list";
const BROADCAST_VARIABLE_TYPE = "broadcast_msg";
const STATEMENT_INPUT_NAMES = new Set(["SUBSTACK", "SUBSTACK2"]);

type PrimitiveInput = [number, ...unknown[]];

interface ScratchBlockInputRef {
  kind: "block-id" | "primitive";
  value: string | PrimitiveInput;
}

interface ScratchVariableDescriptor {
  id: string;
  name: string;
  type: string;
  isLocal: boolean;
  isCloud: boolean;
}

interface ScratchBlockRecord {
  opcode?: unknown;
  next?: unknown;
  parent?: unknown;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  shadow?: unknown;
  topLevel?: unknown;
  mutation?: Record<string, unknown>;
  x?: unknown;
  y?: unknown;
}

interface ScratchTargetRecord {
  id?: unknown;
  name?: unknown;
  isStage?: unknown;
  blocks?: Record<string, ScratchBlockRecord>;
  variables?: Record<string, unknown>;
  lists?: Record<string, unknown>;
  broadcasts?: Record<string, unknown>;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTargetList(projectData: unknown) {
  if (!projectData || typeof projectData !== "object" || !Array.isArray((projectData as { targets?: unknown[] }).targets)) {
    return [];
  }

  return (projectData as { targets: ScratchTargetRecord[] }).targets;
}

function isBlockRecord(block: unknown): block is ScratchBlockRecord {
  return Boolean(block) && typeof block === "object";
}

function getBlockMap(target: ScratchTargetRecord | undefined) {
  if (!target?.blocks || typeof target.blocks !== "object") {
    return {} as Record<string, ScratchBlockRecord>;
  }

  return target.blocks;
}

function pickCurrentTarget(
  projectData: unknown,
  currentTargetMeta?: { id?: string; name?: string }
) {
  const targets = asTargetList(projectData);
  const targetId = normalizeString(currentTargetMeta?.id);
  if (targetId) {
    const matchedTarget = targets.find((target) => normalizeString(target?.id) === targetId);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  const targetName = normalizeString(currentTargetMeta?.name);
  if (targetName) {
    const matchedTarget = targets.find((target) => normalizeString(target?.name) === targetName);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  return targets.find((target) => !Boolean(target?.isStage));
}

function getNumericSortValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getTopLevelScriptIds(blocks: Record<string, ScratchBlockRecord>) {
  return Object.entries(blocks)
    .filter(([, block]) => {
      if (!isBlockRecord(block)) {
        return false;
      }

      return typeof block.opcode === "string" && block.shadow !== true && block.topLevel === true;
    })
    .sort((left, right) => {
      const yDiff = getNumericSortValue(left[1].y) - getNumericSortValue(right[1].y);
      if (yDiff !== 0) {
        return yDiff;
      }

      const xDiff = getNumericSortValue(left[1].x) - getNumericSortValue(right[1].x);
      if (xDiff !== 0) {
        return xDiff;
      }

      return left[0].localeCompare(right[0], "zh-CN");
    })
    .map(([blockId]) => blockId);
}

function collectWorkspaceVariables(projectData: unknown) {
  const descriptors: ScratchVariableDescriptor[] = [];
  const seenIds = new Set<string>();

  for (const target of asTargetList(projectData)) {
    const isLocal = !Boolean(target?.isStage);
    const variableEntries = target?.variables && typeof target.variables === "object" ? Object.entries(target.variables) : [];
    for (const [id, entry] of variableEntries) {
      if (seenIds.has(id) || !Array.isArray(entry) || entry.length < 2) {
        continue;
      }

      descriptors.push({
        id,
        name: String(entry[0] ?? ""),
        type: SCALAR_VARIABLE_TYPE,
        isLocal,
        isCloud: Boolean(entry[2])
      });
      seenIds.add(id);
    }

    const listEntries = target?.lists && typeof target.lists === "object" ? Object.entries(target.lists) : [];
    for (const [id, entry] of listEntries) {
      if (seenIds.has(id) || !Array.isArray(entry) || entry.length < 1) {
        continue;
      }

      descriptors.push({
        id,
        name: String(entry[0] ?? ""),
        type: LIST_VARIABLE_TYPE,
        isLocal,
        isCloud: false
      });
      seenIds.add(id);
    }

    if (target?.isStage !== true || !target.broadcasts || typeof target.broadcasts !== "object") {
      continue;
    }

    for (const [id, name] of Object.entries(target.broadcasts)) {
      if (seenIds.has(id)) {
        continue;
      }

      descriptors.push({
        id,
        name: String(name ?? ""),
        type: BROADCAST_VARIABLE_TYPE,
        isLocal: false,
        isCloud: false
      });
      seenIds.add(id);
    }
  }

  return descriptors;
}

function buildVariablesXml(projectData: unknown) {
  const variables = collectWorkspaceVariables(projectData);
  if (variables.length === 0) {
    return "";
  }

  return `<variables>${variables
    .map(
      (variable) =>
        `<variable type="${escapeXml(variable.type)}" id="${escapeXml(variable.id)}" islocal="${variable.isLocal ? "true" : "false"}" iscloud="${variable.isCloud ? "true" : "false"}">${escapeXml(variable.name)}</variable>`
    )
    .join("")}</variables>`;
}

function getFieldText(rawField: unknown) {
  if (Array.isArray(rawField)) {
    return String(rawField[0] ?? "");
  }

  if (rawField && typeof rawField === "object") {
    if ("value" in rawField) {
      return String((rawField as { value?: unknown }).value ?? "");
    }
    if ("name" in rawField) {
      return String((rawField as { name?: unknown }).name ?? "");
    }
  }

  return String(rawField ?? "");
}

function getFieldAttributes(opcode: string, fieldName: string, rawField: unknown) {
  const attributes: Record<string, string> = {};
  if (Array.isArray(rawField) && typeof rawField[1] === "string") {
    if (fieldName === "VARIABLE") {
      attributes.id = rawField[1];
      attributes.variabletype = SCALAR_VARIABLE_TYPE;
    }
    if (fieldName === "LIST") {
      attributes.id = rawField[1];
      attributes.variabletype = LIST_VARIABLE_TYPE;
    }
    if (
      fieldName === "BROADCAST_OPTION" &&
      (opcode === "event_whenbroadcastreceived" || opcode === "event_broadcast_menu")
    ) {
      attributes.id = rawField[1];
      attributes.variabletype = BROADCAST_VARIABLE_TYPE;
    }
  }
  return attributes;
}

function buildFieldXml(name: string, value: unknown, attributes: Record<string, string> = {}) {
  const serializedAttributes = Object.entries(attributes)
    .map(([attributeName, attributeValue]) => ` ${attributeName}="${escapeXml(attributeValue)}"`)
    .join("");
  return `<field name="${escapeXml(name)}"${serializedAttributes}>${escapeXml(value)}</field>`;
}

function buildElementXml(
  tagName: string,
  blockType: string,
  body: string,
  attributes: Record<string, string> = {}
) {
  const serializedAttributes = Object.entries(attributes)
    .map(([attributeName, attributeValue]) => ` ${attributeName}="${escapeXml(attributeValue)}"`)
    .join("");
  return `<${tagName} type="${escapeXml(blockType)}"${serializedAttributes}>${body}</${tagName}>`;
}

function buildValueShadowXml(
  inputName: string,
  shadowType: string,
  fieldName: string,
  fieldValue: unknown,
  fieldAttributes: Record<string, string> = {}
) {
  return `<value name="${escapeXml(inputName)}">${buildElementXml(
    "shadow",
    shadowType,
    buildFieldXml(fieldName, fieldValue, fieldAttributes)
  )}</value>`;
}

function createInputReference(value: unknown, blocks: Record<string, ScratchBlockRecord>): ScratchBlockInputRef | null {
  if (typeof value === "string" && blocks[value]) {
    return {
      kind: "block-id",
      value
    };
  }

  if (Array.isArray(value) && typeof value[0] === "number") {
    return {
      kind: "primitive",
      value: value as PrimitiveInput
    };
  }

  return null;
}

function parseInputReferences(rawInput: unknown, blocks: Record<string, ScratchBlockRecord>) {
  if (!Array.isArray(rawInput) || rawInput.length < 2) {
    return null;
  }

  const shadowState = Number(rawInput[0]);
  const primary = createInputReference(rawInput[1], blocks);
  const secondary = createInputReference(rawInput[2], blocks);

  if (shadowState === 1) {
    return {
      block: null,
      shadow: primary
    };
  }

  if (shadowState === 2) {
    return {
      block: primary,
      shadow: null
    };
  }

  if (shadowState === 3) {
    return {
      block: primary,
      shadow: secondary
    };
  }

  const refs = rawInput.slice(1).map((value) => createInputReference(value, blocks)).filter(Boolean);
  return {
    block: refs.find((ref) => ref?.kind === "block-id") ?? refs[0] ?? null,
    shadow: refs.find((ref) => ref?.kind === "primitive") ?? null
  };
}

function buildPrimitiveInputXml(primitive: PrimitiveInput, tagName: "block" | "shadow") {
  const inputType = Number(primitive[0]);
  switch (inputType) {
    case 4:
      return buildElementXml(tagName, "math_number", buildFieldXml("NUM", primitive[1] ?? "0"));
    case 5:
      return buildElementXml(tagName, "math_positive_number", buildFieldXml("NUM", primitive[1] ?? "1"));
    case 6:
      return buildElementXml(tagName, "math_whole_number", buildFieldXml("NUM", primitive[1] ?? "1"));
    case 7:
      return buildElementXml(tagName, "math_integer", buildFieldXml("NUM", primitive[1] ?? "1"));
    case 8:
      return buildElementXml(tagName, "math_angle", buildFieldXml("NUM", primitive[1] ?? "90"));
    case 9:
      return buildElementXml(tagName, "colour_picker", buildFieldXml("COLOUR", primitive[1] ?? "#ff6680"));
    case 10:
      return buildElementXml(tagName, "text", buildFieldXml("TEXT", primitive[1] ?? ""));
    case 11:
      return buildElementXml(
        tagName,
        "event_broadcast_menu",
        buildFieldXml("BROADCAST_OPTION", primitive[1] ?? "", {
          id: String(primitive[2] ?? ""),
          variabletype: BROADCAST_VARIABLE_TYPE
        })
      );
    case 12:
      return buildElementXml(
        tagName,
        "data_variable",
        buildFieldXml("VARIABLE", primitive[1] ?? "", {
          id: String(primitive[2] ?? ""),
          variabletype: SCALAR_VARIABLE_TYPE
        })
      );
    case 13:
      return buildElementXml(
        tagName,
        "data_listcontents",
        buildFieldXml("LIST", primitive[1] ?? "", {
          id: String(primitive[2] ?? ""),
          variabletype: LIST_VARIABLE_TYPE
        })
      );
    default:
      return buildElementXml(tagName, "text", buildFieldXml("TEXT", primitive[1] ?? ""));
  }
}

function buildMutationXml(mutation: unknown): string {
  if (!mutation || typeof mutation !== "object") {
    return "";
  }

  const mutationRecord = mutation as Record<string, unknown>;
  const tagName = normalizeString(mutationRecord.tagName) || "mutation";
  const attributes = Object.entries(mutationRecord)
    .filter(([key, value]) => key !== "tagName" && key !== "children" && key !== "textContent" && value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");
  const textContent = mutationRecord.textContent === undefined ? "" : escapeXml(mutationRecord.textContent);
  const children = Array.isArray(mutationRecord.children)
    ? mutationRecord.children.map((child) => buildMutationXml(child)).join("")
    : "";
  return `<${tagName}${attributes}>${textContent}${children}</${tagName}>`;
}

function buildReferenceXml(
  ref: ScratchBlockInputRef | null,
  blocks: Record<string, ScratchBlockRecord>,
  visited: Set<string>,
  asShadow = false
) {
  if (!ref) {
    return "";
  }

  if (ref.kind === "primitive") {
    return buildPrimitiveInputXml(ref.value as PrimitiveInput, asShadow ? "shadow" : "block");
  }

  return buildBlockXml(ref.value as string, blocks, visited, asShadow);
}

function buildInputXml(
  blockOpcode: string,
  inputName: string,
  rawInput: unknown,
  blocks: Record<string, ScratchBlockRecord>,
  visited: Set<string>
) {
  const refs = parseInputReferences(rawInput, blocks);
  if (!refs) {
    return "";
  }

  if (STATEMENT_INPUT_NAMES.has(inputName)) {
    const statementXml = buildReferenceXml(refs.block ?? refs.shadow, blocks, visited);
    return statementXml ? `<statement name="${escapeXml(inputName)}">${statementXml}</statement>` : "";
  }

  const shadowXml = buildReferenceXml(refs.shadow, blocks, visited, true);
  const blockXml = buildReferenceXml(refs.block, blocks, visited);
  const innerXml = `${shadowXml}${blockXml}`;
  if (!innerXml) {
    return "";
  }

  return `<value name="${escapeXml(inputName)}">${innerXml}</value>`;
}

function buildBlockXml(
  blockId: string,
  blocks: Record<string, ScratchBlockRecord>,
  visited: Set<string>,
  asShadow = false
): string {
  if (visited.has(blockId)) {
    return "";
  }

  const block = blocks[blockId];
  if (!isBlockRecord(block) || typeof block.opcode !== "string") {
    return "";
  }

  visited.add(blockId);

  const body: string[] = [];
  const mutationXml = buildMutationXml(block.mutation);
  if (mutationXml) {
    body.push(mutationXml);
  }

  if (block.fields && typeof block.fields === "object") {
    for (const [fieldName, rawField] of Object.entries(block.fields)) {
      body.push(buildFieldXml(fieldName, getFieldText(rawField), getFieldAttributes(block.opcode, fieldName, rawField)));
    }
  }

  if (block.inputs && typeof block.inputs === "object") {
    for (const [inputName, rawInput] of Object.entries(block.inputs)) {
      const inputXml = buildInputXml(block.opcode, inputName, rawInput, blocks, visited);
      if (inputXml) {
        body.push(inputXml);
      }
    }
  }

  if (!asShadow && typeof block.next === "string") {
    const nextXml = buildBlockXml(block.next, blocks, visited);
    if (nextXml) {
      body.push(`<next>${nextXml}</next>`);
    }
  }

  return buildElementXml(asShadow || block.shadow === true ? "shadow" : "block", block.opcode, body.join(""));
}

function wrapWorkspaceXml(blockXml: string, variablesXml = "") {
  return `<xml xmlns="${XML_NAMESPACE}">${variablesXml}${blockXml}</xml>`;
}

const DEFAULT_BROADCAST_ATTRIBUTES = {
  id: "broadcast-message-1",
  variabletype: BROADCAST_VARIABLE_TYPE
};
const DEFAULT_VARIABLE_ATTRIBUTES = {
  id: "variable-score",
  variabletype: SCALAR_VARIABLE_TYPE
};
const DEFAULT_LIST_ATTRIBUTES = {
  id: "list-items",
  variabletype: LIST_VARIABLE_TYPE
};
const DEFAULT_SUPPORTED_RECOMMENDED_OPCODE = "looks_sayforsecs";

export const SUPPORTED_RECOMMENDED_BLOCK_OPCODES = Object.freeze([
  "event_whenflagclicked",
  "event_whenkeypressed",
  "event_whenbroadcastreceived",
  "event_whenbackdropswitchesto",
  "event_broadcast",
  "event_broadcastandwait",
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
  "looks_say",
  "looks_sayforsecs",
  "looks_think",
  "looks_thinkforsecs",
  "looks_show",
  "looks_hide",
  "looks_switchcostumeto",
  "looks_nextcostume",
  "looks_switchbackdropto",
  "looks_changeeffectby",
  "looks_seteffectto",
  "looks_cleargraphiceffects",
  "looks_changesizeby",
  "looks_setsizeto",
  "looks_gotofrontback",
  "looks_goforwardbackwardlayers",
  "sound_play",
  "sound_playuntildone",
  "sound_stopallsounds",
  "sound_changeeffectby",
  "sound_seteffectto",
  "sound_cleareffects",
  "sound_changevolumeby",
  "sound_setvolumeto",
  "control_wait",
  "control_repeat",
  "control_forever",
  "control_if",
  "control_if_else",
  "control_repeat_until",
  "control_stop",
  "control_create_clone_of",
  "control_delete_this_clone",
  "sensing_touchingobject",
  "sensing_keypressed",
  "sensing_mousedown",
  "sensing_askandwait",
  "sensing_answer",
  "sensing_distanceto",
  "operator_equals",
  "operator_gt",
  "operator_lt",
  "operator_add",
  "operator_subtract",
  "operator_multiply",
  "operator_divide",
  "operator_join",
  "operator_letter_of",
  "operator_length",
  "operator_contains",
  "operator_mod",
  "operator_round",
  "operator_mathop",
  "data_setvariableto",
  "data_changevariableby",
  "data_showvariable",
  "data_hidevariable",
  "data_addtolist",
  "data_deleteoflist",
  "data_deletealloflist",
  "data_insertatlist",
  "data_replaceitemoflist",
  "data_itemoflist",
  "data_itemnumoflist",
  "data_lengthoflist",
  "data_listcontainsitem",
  "data_showlist",
  "data_hidelist",
  "pen_clear",
  "pen_penDown",
  "pen_penUp",
  "pen_setPenColorToColor",
  "pen_changePenSizeBy"
]);

const SUPPORTED_RECOMMENDED_BLOCK_OPCODE_SET = new Set(SUPPORTED_RECOMMENDED_BLOCK_OPCODES);

export function isSupportedRecommendedBlockOpcode(opcode: string) {
  return SUPPORTED_RECOMMENDED_BLOCK_OPCODE_SET.has(normalizeString(opcode));
}

export function getDefaultSupportedRecommendedOpcode() {
  return DEFAULT_SUPPORTED_RECOMMENDED_OPCODE;
}

function buildValueElementXml(inputName: string, elementXml: string) {
  return `<value name="${escapeXml(inputName)}">${elementXml}</value>`;
}

function buildShadowFieldBlockXml(
  blockType: string,
  fieldName: string,
  fieldValue: unknown,
  fieldAttributes: Record<string, string> = {}
) {
  return buildElementXml("shadow", blockType, buildFieldXml(fieldName, fieldValue, fieldAttributes));
}

function buildTextShadowValueXml(inputName: string, text: string) {
  return buildValueShadowXml(inputName, "text", "TEXT", text);
}

function buildNumberShadowValueXml(inputName: string, value: string) {
  return buildValueShadowXml(inputName, "math_number", "NUM", value);
}

function buildWholeNumberShadowValueXml(inputName: string, value: string) {
  return buildValueShadowXml(inputName, "math_whole_number", "NUM", value);
}

function buildPositiveNumberShadowValueXml(inputName: string, value: string) {
  return buildValueShadowXml(inputName, "math_positive_number", "NUM", value);
}

function buildAngleShadowValueXml(inputName: string, value: string) {
  return buildValueShadowXml(inputName, "math_angle", "NUM", value);
}

function buildColourShadowValueXml(inputName: string, value: string) {
  return buildValueShadowXml(inputName, "colour_picker", "COLOUR", value);
}

function buildMenuShadowValueXml(
  inputName: string,
  menuBlockType: string,
  fieldName: string,
  fieldValue: string,
  fieldAttributes: Record<string, string> = {}
) {
  return buildValueElementXml(
    inputName,
    buildShadowFieldBlockXml(menuBlockType, fieldName, fieldValue, fieldAttributes)
  );
}

function buildMoveStepsStatementXml() {
  return `<statement name="SUBSTACK">${buildElementXml(
    "block",
    "motion_movesteps",
    buildNumberShadowValueXml("STEPS", "10")
  )}</statement>`;
}

function buildLooksSayStatementXml() {
  return `<statement name="SUBSTACK2">${buildElementXml(
    "block",
    "looks_sayforsecs",
    `${buildTextShadowValueXml("MESSAGE", "再试试另一种效果")}${buildNumberShadowValueXml("SECS", "2")}`
  )}</statement>`;
}

function buildMouseDownConditionValueXml() {
  return buildValueElementXml("CONDITION", buildElementXml("block", "sensing_mousedown", ""));
}

function buildOperatorComparisonXml(opcode: string, left: string, right: string) {
  return buildElementXml(
    "block",
    opcode,
    `${buildTextShadowValueXml("OPERAND1", left)}${buildTextShadowValueXml("OPERAND2", right)}`
  );
}

function buildOperatorMathXml(opcode: string, left: string, right: string) {
  return buildElementXml(
    "block",
    opcode,
    `${buildNumberShadowValueXml("NUM1", left)}${buildNumberShadowValueXml("NUM2", right)}`
  );
}

function buildListFieldXml(name = "LIST", value = "清单") {
  return buildFieldXml(name, value, DEFAULT_LIST_ATTRIBUTES);
}

function buildRecommendedBlockBody(block: RecommendedBlock) {
  const messageText = block.example || "开始吧";

  switch (block.opcode) {
    case "event_whenflagclicked":
      return buildElementXml("block", block.opcode, "");
    case "event_whenkeypressed":
      return buildElementXml("block", block.opcode, buildFieldXml("KEY_OPTION", "space"));
    case "event_whenbroadcastreceived":
      return buildElementXml(
        "block",
        block.opcode,
        buildFieldXml("BROADCAST_OPTION", "消息1", DEFAULT_BROADCAST_ATTRIBUTES)
      );
    case "event_whenbackdropswitchesto":
      return buildElementXml("block", block.opcode, buildFieldXml("BACKDROP", "背景1"));
    case "event_broadcast":
    case "event_broadcastandwait":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml(
          "BROADCAST_INPUT",
          "event_broadcast_menu",
          "BROADCAST_OPTION",
          "消息1",
          DEFAULT_BROADCAST_ATTRIBUTES
        )
      );
    case "motion_movesteps":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("STEPS", "10"));
    case "motion_turnright":
    case "motion_turnleft":
      return buildElementXml("block", block.opcode, buildAngleShadowValueXml("DEGREES", "15"));
    case "motion_pointindirection":
      return buildElementXml("block", block.opcode, buildAngleShadowValueXml("DIRECTION", "90"));
    case "motion_goto":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml("TO", "motion_goto_menu", "TO", "鼠标指针")
      );
    case "motion_pointtowards":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml("TOWARDS", "motion_pointtowards_menu", "TOWARDS", "鼠标指针")
      );
    case "motion_gotoxy":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildNumberShadowValueXml("X", "0")}${buildNumberShadowValueXml("Y", "0")}`
      );
    case "motion_glidesecstoxy":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildPositiveNumberShadowValueXml("SECS", "1")}${buildNumberShadowValueXml(
          "X",
          "0"
        )}${buildNumberShadowValueXml("Y", "0")}`
      );
    case "motion_glideto":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildPositiveNumberShadowValueXml("SECS", "1")}${buildMenuShadowValueXml(
          "TO",
          "motion_glideto_menu",
          "TO",
          "鼠标指针"
        )}`
      );
    case "motion_changexby":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("DX", "10"));
    case "motion_setx":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("X", "0"));
    case "motion_changeyby":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("DY", "10"));
    case "motion_sety":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("Y", "0"));
    case "motion_ifonedgebounce":
      return buildElementXml("block", block.opcode, "");
    case "looks_show":
    case "looks_hide":
    case "looks_nextcostume":
    case "looks_cleargraphiceffects":
    case "sound_stopallsounds":
    case "sound_cleareffects":
    case "sensing_answer":
    case "sensing_mousedown":
    case "control_delete_this_clone":
    case "pen_clear":
    case "pen_penDown":
    case "pen_penUp":
      return buildElementXml("block", block.opcode, "");
    case "looks_switchcostumeto":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml("COSTUME", "looks_costume", "COSTUME", "造型1")
      );
    case "looks_switchbackdropto":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml("BACKDROP", "looks_backdrops", "BACKDROP", "背景1")
      );
    case "looks_gotofrontback":
      return buildElementXml("block", block.opcode, buildFieldXml("FRONT_BACK", "front"));
    case "looks_goforwardbackwardlayers":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("FORWARD_BACKWARD", "forward")}${buildWholeNumberShadowValueXml(
          "NUM",
          "1"
        )}`
      );
    case "looks_changeeffectby":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("EFFECT", "COLOR")}${buildNumberShadowValueXml("CHANGE", "25")}`
      );
    case "looks_seteffectto":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("EFFECT", "COLOR")}${buildNumberShadowValueXml("VALUE", "25")}`
      );
    case "looks_changesizeby":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("CHANGE", "10"));
    case "looks_setsizeto":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("SIZE", "100"));
    case "sound_play":
    case "sound_playuntildone":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml("SOUND_MENU", "sound_sounds_menu", "SOUND_MENU", "pop")
      );
    case "sound_changeeffectby":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("EFFECT", "PITCH")}${buildNumberShadowValueXml("VALUE", "10")}`
      );
    case "sound_seteffectto":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("EFFECT", "PITCH")}${buildNumberShadowValueXml("VALUE", "100")}`
      );
    case "sound_changevolumeby":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("VOLUME", "-10"));
    case "sound_setvolumeto":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("VOLUME", "100"));
    case "looks_say":
    case "looks_think":
      return buildElementXml("block", block.opcode, buildTextShadowValueXml("MESSAGE", messageText));
    case "looks_sayforsecs":
    case "looks_thinkforsecs":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("MESSAGE", messageText)}${buildNumberShadowValueXml("SECS", "2")}`
      );
    case "control_wait":
      return buildElementXml("block", block.opcode, buildPositiveNumberShadowValueXml("DURATION", "1"));
    case "control_repeat":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("TIMES", "10")}${buildMoveStepsStatementXml()}`
      );
    case "control_forever":
      return buildElementXml("block", block.opcode, buildMoveStepsStatementXml());
    case "control_if":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildMouseDownConditionValueXml()}${buildMoveStepsStatementXml()}`
      );
    case "control_if_else":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildMouseDownConditionValueXml()}${buildMoveStepsStatementXml()}${buildLooksSayStatementXml()}`
      );
    case "control_repeat_until":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildMouseDownConditionValueXml()}${buildMoveStepsStatementXml()}`
      );
    case "control_stop":
      return buildElementXml("block", block.opcode, buildFieldXml("STOP_OPTION", "all"));
    case "control_create_clone_of":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml(
          "CLONE_OPTION",
          "control_create_clone_of_menu",
          "CLONE_OPTION",
          "自己"
        )
      );
    case "sensing_touchingobject":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml(
          "TOUCHINGOBJECTMENU",
          "sensing_touchingobjectmenu",
          "TOUCHINGOBJECTMENU",
          "边缘"
        )
      );
    case "sensing_keypressed":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml("KEY_OPTION", "sensing_keyoptions", "KEY_OPTION", "space")
      );
    case "sensing_askandwait":
      return buildElementXml(
        "block",
        block.opcode,
        buildTextShadowValueXml("QUESTION", "准备好了吗？")
      );
    case "sensing_distanceto":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml(
          "DISTANCETOMENU",
          "sensing_distancetomenu",
          "DISTANCETOMENU",
          "鼠标指针"
        )
      );
    case "operator_equals":
    case "operator_lt":
    case "operator_gt":
      return buildOperatorComparisonXml(block.opcode, "1", "2");
    case "operator_add":
    case "operator_subtract":
    case "operator_multiply":
    case "operator_divide":
      return buildOperatorMathXml(block.opcode, "1", "2");
    case "operator_join":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("STRING1", "你好")}${buildTextShadowValueXml("STRING2", "Scratch")}`
      );
    case "operator_letter_of":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("LETTER", "1")}${buildTextShadowValueXml(
          "STRING",
          "Scratch"
        )}`
      );
    case "operator_length":
      return buildElementXml("block", block.opcode, buildTextShadowValueXml("STRING", "Scratch"));
    case "operator_contains":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("STRING1", "Scratch AI")}${buildTextShadowValueXml(
          "STRING2",
          "AI"
        )}`
      );
    case "operator_mod":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildNumberShadowValueXml("NUM1", "10")}${buildNumberShadowValueXml("NUM2", "3")}`
      );
    case "operator_round":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("NUM", "3.6"));
    case "operator_mathop":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("OPERATOR", "abs")}${buildNumberShadowValueXml("NUM", "-10")}`
      );
    case "data_setvariableto":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("VARIABLE", "分数", DEFAULT_VARIABLE_ATTRIBUTES)}${buildNumberShadowValueXml("VALUE", "0")}`
      );
    case "data_changevariableby":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("VARIABLE", "分数", DEFAULT_VARIABLE_ATTRIBUTES)}${buildNumberShadowValueXml("VALUE", "1")}`
      );
    case "data_showvariable":
    case "data_hidevariable":
      return buildElementXml("block", block.opcode, buildFieldXml("VARIABLE", "分数", DEFAULT_VARIABLE_ATTRIBUTES));
    case "data_addtolist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("ITEM", "项目")}${buildListFieldXml()}`
      );
    case "data_deleteoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("INDEX", "1")}${buildListFieldXml()}`
      );
    case "data_deletealloflist":
      return buildElementXml("block", block.opcode, buildListFieldXml());
    case "data_insertatlist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("ITEM", "项目")}${buildWholeNumberShadowValueXml(
          "INDEX",
          "1"
        )}${buildListFieldXml()}`
      );
    case "data_replaceitemoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("INDEX", "1")}${buildListFieldXml()}${buildTextShadowValueXml(
          "ITEM",
          "新项目"
        )}`
      );
    case "data_itemoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("INDEX", "1")}${buildListFieldXml()}`
      );
    case "data_itemnumoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("ITEM", "项目")}${buildListFieldXml()}`
      );
    case "data_lengthoflist":
      return buildElementXml("block", block.opcode, buildListFieldXml());
    case "data_listcontainsitem":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildListFieldXml()}${buildTextShadowValueXml("ITEM", "项目")}`
      );
    case "data_showlist":
    case "data_hidelist":
      return buildElementXml(
        "block",
        block.opcode,
        buildListFieldXml()
      );
    case "pen_setPenColorToColor":
      return buildElementXml("block", block.opcode, buildColourShadowValueXml("COLOR", "#ff4d6a"));
    case "pen_changePenSizeBy":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("SIZE", "1"));
    default:
      return buildElementXml("block", block.opcode, "");
  }
}

export function buildCurrentTargetScriptXmlList(
  projectData: unknown,
  currentTargetMeta?: { id?: string; name?: string }
) {
  const target = pickCurrentTarget(projectData, currentTargetMeta);
  if (!target) {
    return [];
  }

  const blocks = getBlockMap(target);
  const variablesXml = buildVariablesXml(projectData);

  return getTopLevelScriptIds(blocks)
    .map((blockId) => {
      const blockXml = buildBlockXml(blockId, blocks, new Set<string>());
      return blockXml ? wrapWorkspaceXml(blockXml, variablesXml) : "";
    })
    .filter(Boolean);
}

export function buildRecommendedBlockXml(block: RecommendedBlock) {
  return wrapWorkspaceXml(buildRecommendedBlockBody(block));
}
