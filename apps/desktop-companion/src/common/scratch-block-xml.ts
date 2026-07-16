import type {
  RecommendedBlock,
  RecommendedBlockNode,
  RecommendedBlockStructure
} from "./types";

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

const DEFAULT_SUPPORTED_RECOMMENDED_OPCODE = "looks_sayforsecs";

export const SUPPORTED_RECOMMENDED_BLOCK_OPCODES = Object.freeze([
  "event_whenflagclicked",
  "event_whenkeypressed",
  "event_whenthisspriteclicked",
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

function getRecommendedParam(block: RecommendedBlock, name: keyof NonNullable<RecommendedBlock["params"]>) {
  return normalizeString(block.params?.[name]);
}

function getRecommendedNumericParam(
  block: RecommendedBlock,
  name: keyof NonNullable<RecommendedBlock["params"]>,
  fallback: string
) {
  const paramValue = getRecommendedParam(block, name);
  const numericMatch = paramValue.match(/^(\d+(?:\.\d+)?)\s*(?:秒|s|sec|secs|seconds)?$/i);
  return numericMatch?.[1] ?? fallback;
}

function getRecommendedSecsParam(block: RecommendedBlock, fallback: string) {
  return getRecommendedNumericParam(block, "secs", fallback);
}

function getRecommendedBlockText(block: RecommendedBlock) {
  return [block.label, block.reason, block.example]
    .map((value) => normalizeString(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasStandaloneToken(text: string, token: string) {
  return new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`, "i").test(text);
}

function buildRecommendedVariableIdSuffix(variableName: string) {
  if (/[^\x00-\x7F]/.test(variableName)) {
    return Array.from(variableName)
      .map((char) => char.codePointAt(0)?.toString(36))
      .filter(Boolean)
      .join("-") || "score";
  }

  return variableName.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "score";
}

function buildRecommendedVariableAttributes(variableName: string) {
  const normalizedName = normalizeString(variableName) || "分数";
  const idSuffix = buildRecommendedVariableIdSuffix(normalizedName);
  return {
    id: `variable-${idSuffix}`,
    variabletype: SCALAR_VARIABLE_TYPE
  };
}

function buildRecommendedVariableFieldXml(variableName: string) {
  return buildFieldXml("VARIABLE", variableName, buildRecommendedVariableAttributes(variableName));
}

function buildVariableReporterBlockXml(variableName: string) {
  return buildElementXml("block", "data_variable", buildRecommendedVariableFieldXml(variableName));
}

function buildAnswerReporterBlockXml() {
  return buildElementXml("block", "sensing_answer", "");
}

function buildVariableReporterValueXml(inputName: string, variableName: string) {
  return buildValueElementXml(inputName, buildVariableReporterBlockXml(variableName));
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

function buildVariableMathValueXml(inputName: string, opcode: string, leftVariable: string, rightVariable: string) {
  return buildValueElementXml(
    inputName,
    buildElementXml(
      "block",
      opcode,
      `${buildVariableReporterValueXml("NUM1", leftVariable)}${buildVariableReporterValueXml("NUM2", rightVariable)}`
    )
  );
}

type FormulaExpressionNode =
  | { kind: "number"; value: string }
  | { kind: "variable"; value: string }
  | { kind: "binary"; opcode: string; left: FormulaExpressionNode; right: FormulaExpressionNode };

function tokenizeFormulaExpression(value: string) {
  const normalized = value
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replaceAll("＋", "+")
    .replaceAll("－", "-")
    .replaceAll("＊", "*")
    .replaceAll("／", "/")
    .replaceAll("×", "*")
    .replaceAll("÷", "/");
  const tokens: string[] = [];
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const previous = tokens[tokens.length - 1];
    const canStartSignedNumber = !previous || ["(", "+", "-", "*", "/", "%"].includes(previous);
    const numberMatch = normalized
      .slice(index)
      .match(canStartSignedNumber ? /^-?\d+(?:\.\d+)?/ : /^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push(numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = normalized
      .slice(index)
      .match(/^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*/);
    if (identifierMatch) {
      tokens.push(identifierMatch[0]);
      index += identifierMatch[0].length;
      continue;
    }

    if ("()+-*/%".includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }

    return [];
  }

  return tokens;
}

function operatorTokenToOpcode(operator: string) {
  switch (operator) {
    case "+":
      return "operator_add";
    case "-":
      return "operator_subtract";
    case "*":
      return "operator_multiply";
    case "/":
      return "operator_divide";
    case "%":
      return "operator_mod";
    default:
      return null;
  }
}

function parseFormulaExpression(value: string): FormulaExpressionNode | null {
  const tokens = tokenizeFormulaExpression(value);
  let index = 0;

  const parsePrimary = (): FormulaExpressionNode | null => {
    const token = tokens[index];
    if (!token) {
      return null;
    }

    if (token === "(") {
      index += 1;
      const expression = parseAdditive();
      if (tokens[index] !== ")") {
        return null;
      }
      index += 1;
      return expression;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(token)) {
      index += 1;
      return { kind: "number", value: token };
    }

    if (/^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*$/.test(token)) {
      index += 1;
      return { kind: "variable", value: normalizeRecommendedVariableToken(token) ?? token };
    }

    return null;
  };

  const parseMultiplicative = (): FormulaExpressionNode | null => {
    let node = parsePrimary();
    while (node && (tokens[index] === "*" || tokens[index] === "/" || tokens[index] === "%")) {
      const opcode = operatorTokenToOpcode(tokens[index]);
      index += 1;
      const right = parsePrimary();
      if (!opcode || !right) {
        return null;
      }
      node = { kind: "binary", opcode, left: node, right };
    }
    return node;
  };

  const parseAdditive = (): FormulaExpressionNode | null => {
    let node = parseMultiplicative();
    while (node && (tokens[index] === "+" || tokens[index] === "-")) {
      const opcode = operatorTokenToOpcode(tokens[index]);
      index += 1;
      const right = parseMultiplicative();
      if (!opcode || !right) {
        return null;
      }
      node = { kind: "binary", opcode, left: node, right };
    }
    return node;
  };

  const expression = parseAdditive();
  return expression && index === tokens.length ? expression : null;
}

function buildFormulaExpressionElementXml(expression: FormulaExpressionNode): string {
  if (expression.kind === "number") {
    return buildShadowFieldBlockXml("math_number", "NUM", expression.value);
  }

  if (expression.kind === "variable") {
    if (expression.value === "answer" || expression.value === "sensing_answer") {
      return buildAnswerReporterBlockXml();
    }
    if (expression.value === "sensing_distanceto") {
      return buildElementXml(
        "block",
        "sensing_distanceto",
        buildMenuShadowValueXml("DISTANCETOMENU", "sensing_distancetomenu", "DISTANCETOMENU", "鼠标指针")
      );
    }
    return buildVariableReporterBlockXml(expression.value);
  }

  return buildElementXml(
    "block",
    expression.opcode,
    `${buildValueElementXml("NUM1", buildFormulaExpressionElementXml(expression.left))}${buildValueElementXml(
      "NUM2",
      buildFormulaExpressionElementXml(expression.right)
    )}`
  );
}

function buildFormulaExpressionValueXml(inputName: string, value: string) {
  const expression = parseFormulaExpression(value);
  return expression ? buildValueElementXml(inputName, buildFormulaExpressionElementXml(expression)) : null;
}

function splitRecommendedFunctionArgs(value: string) {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function parseRecommendedFunctionCall(value: string, functionName: string) {
  const match = value.trim().match(new RegExp(`^${functionName}\\((.*)\\)$`, "i"));
  return match?.[1] ? splitRecommendedFunctionArgs(match[1]) : null;
}

function buildStringOperandValueXml(inputName: string, value: string) {
  if (value.startsWith("text:")) {
    return buildTextShadowValueXml(inputName, value.slice("text:".length));
  }
  return buildFormulaExpressionValueXml(inputName, value) ?? buildTextShadowValueXml(inputName, value);
}

function buildSpecialExpressionElementXml(value: string): string | null {
  const letterArgs = parseRecommendedFunctionCall(value, "letter");
  if (letterArgs?.[0]) {
    return buildElementXml(
      "block",
      "operator_letter_of",
      `${buildFormulaOrNumberValueXml("LETTER", letterArgs[1] || "1", "1")}${buildStringOperandValueXml(
        "STRING",
        letterArgs[0]
      )}`
    );
  }

  const lengthArgs = parseRecommendedFunctionCall(value, "length");
  if (lengthArgs?.[0]) {
    return buildElementXml("block", "operator_length", buildStringOperandValueXml("STRING", lengthArgs[0]));
  }

  const listLengthArgs = parseRecommendedFunctionCall(value, "listlength");
  if (listLengthArgs?.[0]) {
    return buildElementXml("block", "data_lengthoflist", buildListFieldXml("LIST", listLengthArgs[0]));
  }

  const roundArgs = parseRecommendedFunctionCall(value, "round");
  if (roundArgs?.[0]) {
    return buildElementXml("block", "operator_round", buildFormulaOrNumberValueXml("NUM", roundArgs[0], "3.6"));
  }

  const joinArgs = parseRecommendedFunctionCall(value, "join");
  if (joinArgs?.[0] && joinArgs[1]) {
    return buildElementXml(
      "block",
      "operator_join",
      `${buildStringOperandValueXml("STRING1", joinArgs[0])}${buildStringOperandValueXml("STRING2", joinArgs[1])}`
    );
  }

  return null;
}

function buildSpecialExpressionValueXml(inputName: string, value: string) {
  const elementXml = buildSpecialExpressionElementXml(value);
  return elementXml ? buildValueElementXml(inputName, elementXml) : null;
}

function normalizeRecommendedVariableToken(token: string | undefined) {
  const rawToken = normalizeString(token);
  const normalized = rawToken.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/^(sum|累加和|总和|合计|和)$/.test(normalized)) {
    return "sum";
  }
  if (/^(i|计数器|计数)$/.test(normalized)) {
    return "i";
  }
  if (/^(n|上限|次数)$/.test(normalized)) {
    return "n";
  }
  if (/^(result|结果|结果变量|计算结果)$/.test(normalized)) {
    return "result";
  }
  if (/^(number|数字|输入的数)$/.test(normalized)) {
    return "number";
  }
  return /^[a-z_][a-z0-9_]*$/i.test(rawToken) ? rawToken : null;
}

const VARIABLE_TOKEN_PATTERN = "([a-z_][a-z0-9_]*|累加和|总和|合计|计数器|计数|结果变量|计算结果|结果|输入的数|数字)";
const FORMULA_OPERAND_PATTERN = "([a-z_][a-z0-9_]*|-?\\d+(?:\\.\\d+)?)";

function inferRecommendedAssignedVariableName(text: string) {
  const patterns = [
    /(?:存入|存进|保存到)\s*(?:变量)?\s*([a-z_][a-z0-9_]*)/i,
    new RegExp(`(?:将|把)?\\s*([a-z_][a-z0-9_]*)\\s*(?:设为|设置为|=)`, "i")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const variableName = normalizeRecommendedVariableToken(match?.[1]);
    if (variableName) {
      return variableName;
    }
  }

  return null;
}

function inferRecommendedChangeRelationship(text: string) {
  const sourceToTargetPatterns = [
    new RegExp(
      `(?:把|将|让)?\\s*(?:当前)?\\s*${VARIABLE_TOKEN_PATTERN}\\s*(?:的值|当前值)?\\s*(?:加到|加入|加进|累加到|累加进|累加至)\\s*${VARIABLE_TOKEN_PATTERN}(?:中|里)?`,
      "i"
    )
  ];
  const targetToSourcePatterns = [
    new RegExp(
      `${VARIABLE_TOKEN_PATTERN}\\s*(?:增加|加上|\\+=)\\s*(?:当前)?\\s*${VARIABLE_TOKEN_PATTERN}\\s*(?:的值|当前值)?`,
      "i"
    )
  ];

  for (const pattern of sourceToTargetPatterns) {
    const match = text.match(pattern);
    if (match?.[1] && match?.[2]) {
      return {
        source: normalizeRecommendedVariableToken(match[1]),
        target: normalizeRecommendedVariableToken(match[2])
      };
    }
  }

  for (const pattern of targetToSourcePatterns) {
    const match = text.match(pattern);
    if (match?.[1] && match?.[2]) {
      return {
        target: normalizeRecommendedVariableToken(match[1]),
        source: normalizeRecommendedVariableToken(match[2])
      };
    }
  }

  return null;
}

function inferRecommendedVariableName(block: RecommendedBlock) {
  const paramVariable = normalizeString(getRecommendedParam(block, "variable"));
  if (paramVariable) {
    return paramVariable;
  }

  const text = getRecommendedBlockText(block);
  const mentionsSum = /sum|累加和|总和|合计/.test(text);
  const mentionsResult = hasStandaloneToken(text, "result") || /结果变量|计算结果|存入结果/.test(text);
  const mentionsNumber = hasStandaloneToken(text, "number") || /输入的数|这个数|数字/.test(text);
  const mentionsCounter = /计数器|计数|自增/.test(text) || hasStandaloneToken(text, "i");
  const mentionsN = /上限|次数/.test(text) || hasStandaloneToken(text, "n");

  if (block.opcode === "data_setvariableto") {
    const assignedVariableName = inferRecommendedAssignedVariableName(text);
    if (assignedVariableName) {
      return assignedVariableName;
    }
  }

  if (block.opcode === "data_changevariableby") {
    const relationship = inferRecommendedChangeRelationship(text);
    if (relationship?.target) {
      return relationship.target;
    }
    if (/sum\s*(?:增加|加|\+=)|(?:累加和|总和|合计).*(?:增加|加)/.test(text)) {
      return "sum";
    }
    if (/i\s*(?:增加|加|\+=|自增)|(?:计数器|计数).*(?:增加|加|1|一)/.test(text)) {
      return "i";
    }
  }

  if (mentionsSum) {
    return "sum";
  }
  if (mentionsResult) {
    return "result";
  }
  if (mentionsNumber) {
    return "number";
  }
  if (mentionsCounter) {
    return "i";
  }
  if (mentionsN) {
    return "n";
  }
  return "分数";
}

function inferNumberNearVariable(text: string, variableName: string) {
  const escapedVariable = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escapedVariable}\\s*(?:设为|设置为|=|为|从)\\s*(-?\\d+(?:\\.\\d+)?)`, "i"),
    new RegExp(`${escapedVariable}[^\\d-]{0,12}(-?\\d+(?:\\.\\d+)?)`, "i")
  ];

  if (variableName === "sum") {
    patterns.push(/(?:累加和|总和|合计)[^\d-]{0,12}(-?\d+(?:\.\d+)?)/i);
  }
  if (variableName === "i") {
    patterns.push(/(?:计数器|计数)[^\d-]{0,12}(-?\d+(?:\.\d+)?)/i);
  }
  if (variableName === "n") {
    patterns.push(/(?:上限|次数)[^\d-]{0,12}(-?\d+(?:\.\d+)?)/i);
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function inferRecommendedSetVariableValue(block: RecommendedBlock, variableName: string) {
  const text = getRecommendedBlockText(block);
  const inferred = inferNumberNearVariable(text, variableName);
  if (inferred) {
    return inferred;
  }
  if (variableName === "i") {
    return "1";
  }
  if (variableName === "n") {
    const firstNumber = text.match(/-?\d+(?:\.\d+)?/)?.[0];
    return firstNumber ?? "100";
  }
  return "0";
}

function buildFormulaOperandValueXml(inputName: string, operand: string) {
  if (/^-?\d+(?:\.\d+)?$/.test(operand)) {
    return buildNumberShadowValueXml(inputName, operand);
  }

  return buildVariableReporterValueXml(inputName, normalizeRecommendedVariableToken(operand) ?? operand);
}

function getOperatorOpcodeFromText(operatorText: string) {
  if (/\*|×|乘/.test(operatorText)) {
    return "operator_multiply";
  }
  if (/\/|÷|除/.test(operatorText)) {
    return "operator_divide";
  }
  if (/\+|加/.test(operatorText)) {
    return "operator_add";
  }
  if (/-|减/.test(operatorText)) {
    return "operator_subtract";
  }
  return null;
}

function buildBinaryFormulaValueXml(inputName: string, opcode: string, leftOperand: string, rightOperand: string) {
  return buildValueElementXml(
    inputName,
    buildElementXml(
      "block",
      opcode,
      `${buildFormulaOperandValueXml("NUM1", leftOperand)}${buildFormulaOperandValueXml("NUM2", rightOperand)}`
    )
  );
}

function inferRoundOperand(text: string) {
  return normalizeRecommendedVariableToken(
    text.match(/(?:把|将)?\s*([a-z_][a-z0-9_]*)\s*(?:四舍五入|round)/i)?.[1] ??
      text.match(/(?:四舍五入|round)[^\w]{0,8}([a-z_][a-z0-9_]*)/i)?.[1]
  ) ?? "number";
}

function inferModOperands(text: string) {
  const match = text.match(
    /([a-z_][a-z0-9_]*)\s*(?:除以|除|\/|%|mod)\s*(-?\d+(?:\.\d+)?|[a-z_][a-z0-9_]*)\s*(?:的)?(?:余数)?/i
  );
  return {
    left: normalizeRecommendedVariableToken(match?.[1]) ?? match?.[1] ?? "number",
    right: normalizeRecommendedVariableToken(match?.[2]) ?? match?.[2] ?? "2"
  };
}

function buildOperatorOpcodeParamValueXml(inputName: string, value: string, text: string) {
  const parts = normalizeString(value).split(/\s+/).filter(Boolean);
  if (parts[0] === "operator_round") {
    const operand = normalizeRecommendedVariableToken(parts[1]) ?? parts[1] ?? inferRoundOperand(text);
    return buildValueElementXml(
      inputName,
      buildElementXml("block", "operator_round", buildFormulaOrNumberValueXml("NUM", operand, "3.6"))
    );
  }
  if (parts[0] === "operator_mod") {
    const inferred = inferModOperands(text);
    return buildBinaryFormulaValueXml(
      inputName,
      "operator_mod",
      normalizeRecommendedVariableToken(parts[1]) ?? parts[1] ?? inferred.left,
      normalizeRecommendedVariableToken(parts[2]) ?? parts[2] ?? inferred.right
    );
  }
  return null;
}

function inferRecommendedNamedMathFormulaValueXml(block: RecommendedBlock, variableName: string) {
  const text = getRecommendedBlockText(block);
  const normalizedVariable = normalizeRecommendedVariableToken(variableName);

  if ((normalizedVariable === "rounded" || /rounded/.test(text)) && /四舍五入|round/i.test(text)) {
    return buildValueElementXml(
      "VALUE",
      buildElementXml(
        "block",
        "operator_round",
        buildFormulaOrNumberValueXml("NUM", inferRoundOperand(text), "3.6")
      )
    );
  }

  if ((normalizedVariable === "remainder" || /remainder/.test(text)) && /余数|取余|mod|%/i.test(text)) {
    const {left, right} = inferModOperands(text);
    return buildBinaryFormulaValueXml("VALUE", "operator_mod", left, right);
  }

  return null;
}

function inferRecommendedBinaryFormulaValueXml(block: RecommendedBlock, variableName: string) {
  const text = getRecommendedBlockText(block);
  const escapedVariable = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const operatorPattern = "(\\*|×|乘以|乘|\\/|÷|除以|除|\\+|加上|加|-|减去|减)";
  const patterns = [
    new RegExp(`${escapedVariable}\\s*(?:设为|设置为|=|为)\\s*${FORMULA_OPERAND_PATTERN}\\s*${operatorPattern}\\s*${FORMULA_OPERAND_PATTERN}`, "i"),
    new RegExp(`(?:将|把)\\s*${escapedVariable}\\s*(?:设为|设置为)\\s*${FORMULA_OPERAND_PATTERN}\\s*${operatorPattern}\\s*${FORMULA_OPERAND_PATTERN}`, "i")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1] || !match?.[2] || !match?.[3]) {
      continue;
    }
    const opcode = getOperatorOpcodeFromText(match[2]);
    if (opcode) {
      return buildBinaryFormulaValueXml("VALUE", opcode, match[1], match[3]);
    }
  }

  return null;
}

function inferRecommendedSetVariableValueXml(block: RecommendedBlock, variableName: string) {
  const paramValue = getRecommendedParam(block, "value");
  const text = getRecommendedBlockText(block);
  const operatorOpcodeParamValueXml = buildOperatorOpcodeParamValueXml("VALUE", paramValue, text);
  if (operatorOpcodeParamValueXml) {
    return operatorOpcodeParamValueXml;
  }
  const isOperatorOpcodePlaceholder = /^operator_(?:add|subtract|multiply|divide|mod|round)$/.test(paramValue);
  if (paramValue && !isOperatorOpcodePlaceholder) {
    if (paramValue.startsWith("text:")) {
      return buildTextShadowValueXml("VALUE", paramValue.slice("text:".length));
    }
    if (/^-?\d+(?:\.\d+)?$/.test(paramValue)) {
      return buildTextShadowValueXml("VALUE", paramValue);
    }
    return buildSpecialExpressionValueXml("VALUE", paramValue) ??
      buildFormulaExpressionValueXml("VALUE", paramValue) ??
      buildTextShadowValueXml("VALUE", paramValue);
  }

  const namedMathFormulaValueXml = inferRecommendedNamedMathFormulaValueXml(block, variableName);
  if (namedMathFormulaValueXml) {
    return namedMathFormulaValueXml;
  }
  const binaryFormulaValueXml = inferRecommendedBinaryFormulaValueXml(block, variableName);
  if (binaryFormulaValueXml) {
    return binaryFormulaValueXml;
  }
  if (
    variableName === "result" &&
    /平方|乘以自己|\*\s*number|number\s*\*|number.*number|回答.*回答|answer.*answer/.test(text)
  ) {
    return buildVariableMathValueXml("VALUE", "operator_multiply", "number", "number");
  }

  return buildTextShadowValueXml("VALUE", inferRecommendedSetVariableValue(block, variableName));
}

function inferRecommendedChangeVariableValue(block: RecommendedBlock, variableName: string) {
  const paramChangeBy = getRecommendedParam(block, "changeBy");
  if (paramChangeBy) {
    return buildFormulaExpressionValueXml("VALUE", paramChangeBy) ?? buildNumberShadowValueXml("VALUE", "1");
  }

  const text = getRecommendedBlockText(block);
  const relationship = inferRecommendedChangeRelationship(text);
  if (relationship?.target === variableName && relationship.source) {
    return buildVariableReporterValueXml("VALUE", relationship.source);
  }
  if (variableName === "sum" && /(?:增加|加上|\+=)\s*i|(?:把|将)?\s*i\s*(?:加到|加入|加进|累加到)\s*sum/.test(text)) {
    return buildVariableReporterValueXml("VALUE", "i");
  }

  const explicitNumber =
    text.match(/(?:增加|加上|\+=)\s*(-?\d+(?:\.\d+)?)/)?.[1] ??
    inferNumberNearVariable(text, variableName);

  return buildNumberShadowValueXml("VALUE", explicitNumber ?? "1");
}

function inferRecommendedOutputVariableName(block: RecommendedBlock) {
  const paramMessageVariable = normalizeString(getRecommendedParam(block, "messageVariable"));
  if (paramMessageVariable) {
    return paramMessageVariable;
  }

  const text = getRecommendedBlockText(block);
  const explicitOutputPatterns = [
    /(?:说出|输出|显示|读出|展示|说)\s*(?:变量|累加结果|计算结果|结果|答案)?\s*([a-z_][a-z0-9_]*)/i,
    /(?:说话内容|内容)[\s\S]{0,12}(?:放入|使用|用)\s*([a-z_][a-z0-9_]*)\s*(?:变量)?/i
  ];

  for (const pattern of explicitOutputPatterns) {
    const variableName = normalizeRecommendedVariableToken(text.match(pattern)?.[1]);
    if (variableName) {
      return variableName;
    }
  }

  if (/sum|累加和|总和|合计/.test(text)) {
    return "sum";
  }
  if (hasStandaloneToken(text, "result") || /计算结果|结果变量|平方结果/.test(text)) {
    return "result";
  }
  if (/兔|rabbit/.test(text) && /鸡|chicken/.test(text)) {
    return "result";
  }
  return null;
}

function buildRecommendedMessageValueXml(block: RecommendedBlock, fallbackText: string) {
  const paramMessage = getRecommendedParam(block, "message");
  if (paramMessage) {
    return buildTextShadowValueXml("MESSAGE", paramMessage);
  }

  const outputVariable = inferRecommendedOutputVariableName(block);
  if (outputVariable) {
    const specialExpressionXml = buildSpecialExpressionValueXml("MESSAGE", outputVariable);
    if (specialExpressionXml) {
      return specialExpressionXml;
    }
  }
  return outputVariable
    ? buildVariableReporterValueXml("MESSAGE", outputVariable)
    : buildTextShadowValueXml("MESSAGE", fallbackText);
}

function inferRecommendedRepeatCount(block: RecommendedBlock) {
  const text = getRecommendedBlockText(block);
  const patterns = [
    /(?:重复执行|重复|循环)[^\d-]{0,12}(\d+)/,
    /(\d+)\s*次/,
    /1\s*(?:到|至|~|-)\s*(\d+)/,
    /1\s*\+\s*2(?:\s*\+\s*3)?\s*(?:\.\.\.|…)\s*\+?\s*(\d+)/,
    /(?:求和|累加|重复|循环)[\s\S]{0,24}1\s*\+\s*(\d+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (/三角形/.test(text)) {
    return "3";
  }
  if (/正方形|四边形/.test(text)) {
    return "4";
  }
  if (/五边形|五角星/.test(text)) {
    return "5";
  }

  return null;
}

function buildRecommendedRepeatTimesValueXml(block: RecommendedBlock) {
  const paramRepeatTimes = getRecommendedParam(block, "repeatTimes");
  if (paramRepeatTimes) {
    if (/^\d+(?:\.\d+)?$/.test(paramRepeatTimes)) {
      return buildWholeNumberShadowValueXml("TIMES", paramRepeatTimes);
    }
    const repeatTimesXml = buildFormulaExpressionValueXml("TIMES", paramRepeatTimes);
    if (repeatTimesXml) {
      return repeatTimesXml;
    }
  }

  const repeatCount = inferRecommendedRepeatCount(block);
  if (repeatCount) {
    return buildWholeNumberShadowValueXml("TIMES", repeatCount);
  }
  const text = getRecommendedBlockText(block);
  if (hasStandaloneToken(text, "n") || /上限|次数/.test(text)) {
    return buildVariableReporterValueXml("TIMES", "n");
  }
  return buildWholeNumberShadowValueXml("TIMES", "10");
}

function inferRecommendedTurnDegrees(block: RecommendedBlock) {
  const paramDegrees = getRecommendedParam(block, "degrees");
  if (paramDegrees) {
    return paramDegrees;
  }

  const preferredText = [block.reason, block.example]
    .map((value) => normalizeString(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const labelText = normalizeString(block.label).toLowerCase();
  for (const text of [preferredText, labelText]) {
    const explicitDegrees = text.match(/(?:右转|左转|转|角度|外角)[^\d-]{0,12}(-?\d+(?:\.\d+)?)/)?.[1];
    if (explicitDegrees) {
      return explicitDegrees;
    }
    if (/三角形/.test(text)) {
      return "120";
    }
    if (/正方形|四边形/.test(text)) {
      return "90";
    }
    if (/五边形/.test(text)) {
      return "72";
    }
    if (/五角星/.test(text)) {
      return "144";
    }
  }
  return "15";
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

function inferRecommendedTouchingObjectName(block: RecommendedBlock) {
  const paramTarget = normalizeString(getRecommendedParam(block, "variable")) || normalizeString(getRecommendedParam(block, "value"));
  if (paramTarget) {
    return paramTarget;
  }

  const text = [block.label, block.reason, block.example]
    .map((value) => normalizeString(value))
    .filter(Boolean)
    .join(" ");
  const explicitTarget = text.match(/碰到\s*([A-Za-z0-9_\u4e00-\u9fff -]+?)(?:[？?，,。.\s]|$)/)?.[1]?.trim();
  return explicitTarget || "边缘";
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

function buildFormulaOrTextValueXml(inputName: string, value: string) {
  return buildFormulaExpressionValueXml(inputName, value) ?? buildTextShadowValueXml(inputName, value);
}

function buildFormulaOrNumberValueXml(inputName: string, value: string, fallback: string) {
  return buildFormulaExpressionValueXml(inputName, value) ?? buildNumberShadowValueXml(inputName, fallback);
}

function buildTurnDegreesValueXml(block: RecommendedBlock) {
  const degrees = inferRecommendedTurnDegrees(block);
  if (/^-?\d+(?:\.\d+)?$/.test(degrees)) {
    return buildAngleShadowValueXml("DEGREES", degrees);
  }
  return buildFormulaExpressionValueXml("DEGREES", degrees) ?? buildAngleShadowValueXml("DEGREES", "15");
}

function buildOperatorComparisonXml(opcode: string, left: string, right: string) {
  return buildElementXml(
    "block",
    opcode,
    `${buildFormulaOrTextValueXml("OPERAND1", left)}${buildFormulaOrTextValueXml("OPERAND2", right)}`
  );
}

function buildOperatorMathXml(opcode: string, left: string, right: string) {
  return buildElementXml(
    "block",
    opcode,
    `${buildFormulaOrNumberValueXml("NUM1", left, "1")}${buildFormulaOrNumberValueXml("NUM2", right, "2")}`
  );
}

function buildListFieldXml(name = "LIST", value = "清单") {
  return buildFieldXml(name, value, {
    id: `list-${buildRecommendedVariableIdSuffix(value)}`,
    variabletype: LIST_VARIABLE_TYPE
  });
}

function buildBroadcastAttributes(value: string) {
  return {
    id: `broadcast-${buildRecommendedVariableIdSuffix(value)}`,
    variabletype: BROADCAST_VARIABLE_TYPE
  };
}

function buildRecommendedBlockBody(block: RecommendedBlock, includeStructuralPlaceholders = true) {
  const messageText = block.example || "开始吧";

  switch (block.opcode) {
    case "event_whenflagclicked":
    case "event_whenthisspriteclicked":
      return buildElementXml("block", block.opcode, "");
    case "event_whenkeypressed":
      return buildElementXml(
        "block",
        block.opcode,
        buildFieldXml("KEY_OPTION", getRecommendedParam(block, "key") || "space")
      );
    case "event_whenbroadcastreceived": {
      const broadcast = getRecommendedParam(block, "broadcast") || "消息1";
      return buildElementXml(
        "block",
        block.opcode,
        buildFieldXml("BROADCAST_OPTION", broadcast, buildBroadcastAttributes(broadcast))
      );
    }
    case "event_whenbackdropswitchesto":
      return buildElementXml("block", block.opcode, buildFieldXml("BACKDROP", getRecommendedParam(block, "value") || "背景1"));
    case "event_broadcast":
    case "event_broadcastandwait": {
      const broadcast = getRecommendedParam(block, "broadcast") || "消息1";
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml(
          "BROADCAST_INPUT",
          "event_broadcast_menu",
          "BROADCAST_OPTION",
          broadcast,
          buildBroadcastAttributes(broadcast)
        )
      );
    }
    case "motion_movesteps":
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("STEPS", getRecommendedParam(block, "steps") || "10", "10")
      );
    case "motion_turnright":
    case "motion_turnleft":
      return buildElementXml("block", block.opcode, buildTurnDegreesValueXml(block));
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
        `${buildFormulaOrNumberValueXml("X", getRecommendedParam(block, "x") || "0", "0")}${buildFormulaOrNumberValueXml(
          "Y",
          getRecommendedParam(block, "y") || "0",
          "0"
        )}`
      );
    case "motion_glidesecstoxy":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildPositiveNumberShadowValueXml("SECS", getRecommendedSecsParam(block, "1"))}${buildFormulaOrNumberValueXml(
          "X",
          getRecommendedParam(block, "x") || "0",
          "0"
        )}${buildFormulaOrNumberValueXml("Y", getRecommendedParam(block, "y") || "0", "0")}`
      );
    case "motion_glideto":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildPositiveNumberShadowValueXml("SECS", getRecommendedSecsParam(block, "1"))}${buildMenuShadowValueXml(
          "TO",
          "motion_glideto_menu",
          "TO",
          "鼠标指针"
        )}`
      );
    case "motion_changexby":
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("DX", getRecommendedParam(block, "steps") || "10", "10")
      );
    case "motion_setx":
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("X", getRecommendedParam(block, "x") || "0", "0")
      );
    case "motion_changeyby":
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("DY", getRecommendedParam(block, "steps") || "10", "10")
      );
    case "motion_sety":
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("Y", getRecommendedParam(block, "y") || "0", "0")
      );
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
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("VOLUME", getRecommendedParam(block, "changeBy") || "-10", "-10")
      );
    case "sound_setvolumeto":
      return buildElementXml("block", block.opcode, buildNumberShadowValueXml("VOLUME", "100"));
    case "looks_say":
    case "looks_think":
      return buildElementXml("block", block.opcode, buildRecommendedMessageValueXml(block, messageText));
    case "looks_sayforsecs":
    case "looks_thinkforsecs":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildRecommendedMessageValueXml(block, messageText)}${buildNumberShadowValueXml(
          "SECS",
          getRecommendedSecsParam(block, "2")
        )}`
      );
    case "control_wait":
      return buildElementXml(
        "block",
        block.opcode,
        buildPositiveNumberShadowValueXml("DURATION", getRecommendedSecsParam(block, "1"))
      );
    case "control_repeat":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildRecommendedRepeatTimesValueXml(block)}${
          includeStructuralPlaceholders ? buildMoveStepsStatementXml() : ""
        }`
      );
    case "control_forever":
      return buildElementXml(
        "block",
        block.opcode,
        includeStructuralPlaceholders ? buildMoveStepsStatementXml() : ""
      );
    case "control_if":
      return buildElementXml(
        "block",
        block.opcode,
        includeStructuralPlaceholders
          ? `${buildMouseDownConditionValueXml()}${buildMoveStepsStatementXml()}`
          : ""
      );
    case "control_if_else":
      return buildElementXml(
        "block",
        block.opcode,
        includeStructuralPlaceholders
          ? `${buildMouseDownConditionValueXml()}${buildMoveStepsStatementXml()}${buildLooksSayStatementXml()}`
          : ""
      );
    case "control_repeat_until":
      return buildElementXml(
        "block",
        block.opcode,
        includeStructuralPlaceholders
          ? `${buildMouseDownConditionValueXml()}${buildMoveStepsStatementXml()}`
          : ""
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
          inferRecommendedTouchingObjectName(block)
        )
      );
    case "sensing_keypressed":
      return buildElementXml(
        "block",
        block.opcode,
        buildMenuShadowValueXml(
          "KEY_OPTION",
          "sensing_keyoptions",
          "KEY_OPTION",
          getRecommendedParam(block, "key") || "space"
        )
      );
    case "sensing_askandwait":
      return buildElementXml(
        "block",
        block.opcode,
        buildTextShadowValueXml("QUESTION", getRecommendedParam(block, "question") || "准备好了吗？")
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
      return buildOperatorComparisonXml(
        block.opcode,
        getRecommendedParam(block, "left") || "1",
        getRecommendedParam(block, "right") || "2"
      );
    case "operator_add":
    case "operator_subtract":
    case "operator_multiply":
    case "operator_divide":
      return buildOperatorMathXml(
        block.opcode,
        getRecommendedParam(block, "left") || "1",
        getRecommendedParam(block, "right") || "2"
      );
    case "operator_join":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildStringOperandValueXml("STRING1", getRecommendedParam(block, "left") || "text:你好")}${buildStringOperandValueXml(
          "STRING2",
          getRecommendedParam(block, "right") || "text:Scratch"
        )}`
      );
    case "operator_letter_of":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFormulaOrNumberValueXml("LETTER", getRecommendedParam(block, "right") || "1", "1")}${buildStringOperandValueXml(
          "STRING",
          getRecommendedParam(block, "left") || "text:Scratch"
        )}`
      );
    case "operator_length":
      return buildElementXml(
        "block",
        block.opcode,
        buildStringOperandValueXml("STRING", getRecommendedParam(block, "left") || "text:Scratch")
      );
    case "operator_contains":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFormulaOrTextValueXml("STRING1", getRecommendedParam(block, "left") || "Scratch AI")}${buildTextShadowValueXml(
          "STRING2",
          getRecommendedParam(block, "right") || "AI"
        )}`
      );
    case "operator_mod":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFormulaOrNumberValueXml("NUM1", getRecommendedParam(block, "left") || "10", "10")}${buildFormulaOrNumberValueXml(
          "NUM2",
          getRecommendedParam(block, "right") || "3",
          "3"
        )}`
      );
    case "operator_round":
      return buildElementXml(
        "block",
        block.opcode,
        buildFormulaOrNumberValueXml("NUM", getRecommendedParam(block, "left") || "3.6", "3.6")
      );
    case "operator_mathop":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFieldXml("OPERATOR", "abs")}${buildNumberShadowValueXml("NUM", "-10")}`
      );
    case "data_setvariableto":
      {
        const variableName = inferRecommendedVariableName(block);
        return buildElementXml(
          "block",
          block.opcode,
          `${buildRecommendedVariableFieldXml(variableName)}${inferRecommendedSetVariableValueXml(
            block,
            variableName
          )}`
        );
      }
    case "data_changevariableby":
      {
        const variableName = inferRecommendedVariableName(block);
        return buildElementXml(
          "block",
          block.opcode,
          `${buildRecommendedVariableFieldXml(variableName)}${inferRecommendedChangeVariableValue(block, variableName)}`
        );
      }
    case "data_showvariable":
    case "data_hidevariable":
      return buildElementXml(
        "block",
        block.opcode,
        buildRecommendedVariableFieldXml(inferRecommendedVariableName(block))
      );
    case "data_addtolist": {
      const listName = getRecommendedParam(block, "list") || "清单";
      const itemValue = getRecommendedParam(block, "value") || "项目";
      return buildElementXml(
        "block",
        block.opcode,
        `${buildFormulaOrTextValueXml("ITEM", itemValue)}${buildListFieldXml("LIST", listName)}`
      );
    }
    case "data_deleteoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("INDEX", "1")}${buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")}`
      );
    case "data_deletealloflist":
      return buildElementXml("block", block.opcode, buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单"));
    case "data_insertatlist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("ITEM", "项目")}${buildWholeNumberShadowValueXml(
          "INDEX",
          "1"
        )}${buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")}`
      );
    case "data_replaceitemoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("INDEX", "1")}${buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")}${buildTextShadowValueXml(
          "ITEM",
          "新项目"
        )}`
      );
    case "data_itemoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildWholeNumberShadowValueXml("INDEX", "1")}${buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")}`
      );
    case "data_itemnumoflist":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildTextShadowValueXml("ITEM", "项目")}${buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")}`
      );
    case "data_lengthoflist":
      return buildElementXml("block", block.opcode, buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单"));
    case "data_listcontainsitem":
      return buildElementXml(
        "block",
        block.opcode,
        `${buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")}${buildTextShadowValueXml("ITEM", "项目")}`
      );
    case "data_showlist":
    case "data_hidelist":
      return buildElementXml(
        "block",
        block.opcode,
        buildListFieldXml("LIST", getRecommendedParam(block, "list") || "清单")
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

function buildRecommendedVariablesXml(blockXml: string) {
  const variables = new Map<string, { name: string; type: string }>();
  const variableFieldPattern = /<field name="(?:VARIABLE|LIST|BROADCAST_OPTION)" id="([^"]+)" variabletype="([^"]*)">([^<]*)<\/field>/g;
  for (const match of blockXml.matchAll(variableFieldPattern)) {
    const [, id, type, name] = match;
    if (id && name && !variables.has(id)) {
      variables.set(id, { name, type });
    }
  }

  if (variables.size === 0) {
    return "";
  }

  return `<variables>${[...variables.entries()]
    .map(([id, variable]) => `<variable type="${variable.type}" id="${id}" islocal="false" iscloud="false">${variable.name}</variable>`)
    .join("")}</variables>`;
}

export function buildRecommendedBlockXml(block: RecommendedBlock) {
  const blockXml = buildRecommendedBlockBody(block);
  return wrapWorkspaceXml(blockXml, buildRecommendedVariablesXml(blockXml));
}

function appendBlockChildren(blockXml: string, childrenXml: string) {
  const closingTag = "</block>";
  const closingIndex = blockXml.lastIndexOf(closingTag);
  if (closingIndex < 0) {
    return blockXml;
  }

  return `${blockXml.slice(0, closingIndex)}${childrenXml}${blockXml.slice(closingIndex)}`;
}

function applySequentialRecommendedInputDefaults(
  node: RecommendedBlockNode,
  previousNode?: RecommendedBlockNode
): RecommendedBlockNode {
  if (
    previousNode?.opcode === "sensing_askandwait" &&
    node.opcode === "data_setvariableto" &&
    !normalizeString(node.params?.value)
  ) {
    return {
      ...node,
      params: {
        ...node.params,
        value: "sensing_answer"
      }
    };
  }

  return node;
}

function buildRecommendedStructureBody(rawNode: RecommendedBlockNode, previousNode?: RecommendedBlockNode): string {
  const node = applySequentialRecommendedInputDefaults(rawNode, previousNode);
  const conditionXml = node.condition
    ? `<value name="CONDITION">${buildRecommendedStructureBody(node.condition)}</value>`
    : "";
  const substackXml = node.substack
    ? `<statement name="SUBSTACK">${buildRecommendedStructureBody(node.substack)}</statement>`
    : "";
  const substack2Xml = node.substack2
    ? `<statement name="SUBSTACK2">${buildRecommendedStructureBody(node.substack2)}</statement>`
    : "";
  const nextXml = node.next
    ? `<next>${buildRecommendedStructureBody(node.next, node)}</next>`
    : "";

  return appendBlockChildren(
    buildRecommendedBlockBody(node, false),
    `${conditionXml}${substackXml}${substack2Xml}${nextXml}`
  );
}

export function buildRecommendedStructureXml(structure: RecommendedBlockStructure) {
  const blockXml = buildRecommendedStructureBody(structure.root);
  return wrapWorkspaceXml(blockXml, buildRecommendedVariablesXml(blockXml));
}
