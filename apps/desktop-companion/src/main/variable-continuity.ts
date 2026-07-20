import type {
  CoachResponse,
  ProjectSnapshot,
  RecommendedBlock,
  RecommendedBlockNode,
  RecommendedBlockParams,
  RecommendedBlockStructure
} from "../common/types";

export interface VariableBinding {
  meaning: string;
  preferredName: string;
  aliases: string[];
  source: "previous-recommendation" | "current-recommendation";
  confidence: "high" | "medium";
}

export interface CoachingContinuityContext {
  previousRecommendation?: {
    answerText?: string;
    nextStep?: string;
    blocks: Array<Pick<RecommendedBlock, "opcode" | "label" | "reason" | "params">>;
  };
  previousRecommendationVariables: string[];
  lockedVariableBindings: VariableBinding[];
}

const PARAM_VARIABLE_KEYS = new Set<keyof RecommendedBlockParams>(["variable", "messageVariable"]);
const PARAM_EXPRESSION_KEYS = new Set<keyof RecommendedBlockParams>([
  "value",
  "changeBy",
  "repeatTimes",
  "left",
  "right",
  "x",
  "y",
  "steps",
  "degrees"
]);
const IGNORED_EXPRESSION_TOKENS = new Set([
  "answer",
  "text",
  "true",
  "false",
  "round",
  "length",
  "letter",
  "join",
  "listlength",
  "operator",
  "data",
  "variable"
]);

const MEANING_ALIASES: Record<string, string[]> = {
  accumulator: ["sum", "s", "total", "总和", "合计", "累加和", "求和", "和"],
  counter: ["i", "j", "k", "count", "counter", "计数", "计数器", "当前数", "序号"],
  limit: ["n", "limit", "max", "上限", "次数", "个数", "数量"],
  product: ["product", "乘积", "积"],
  result: ["result", "answer", "结果", "答案"],
  score: ["score", "分数", "得分"],
  health: ["health", "life", "lives", "生命", "生命值", "血量"],
  damage: ["damage", "伤害"],
  grade: ["grade", "等级", "成绩等级"],
  price: ["price", "单价", "价格"],
  quantity: ["quantity", "qty", "数量"],
  total: ["total", "总价", "总金额"],
  number: ["number", "num", "数字", "输入数字"],
  remainder: ["remainder", "余数"],
  password: ["password", "密码"],
  item: ["item", "物品", "项目"],
  distance: ["distance", "距离"],
  speed: ["speed", "速度"],
  time: ["time", "时间"],
  weight: ["weight", "体重"],
  height: ["height", "身高"],
  bmi: ["bmi"]
};

function normalizeName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeText(value: unknown) {
  return normalizeName(value).replace(/[，。；：、,.!?！？()（）[\]{}"'`]/g, "");
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeName(trimmed);
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function aliasMeaningForName(name: string) {
  const normalized = normalizeName(name);
  for (const [meaning, aliases] of Object.entries(MEANING_ALIASES)) {
    if (aliases.some((alias) => normalizeName(alias) === normalized)) {
      return meaning;
    }
  }
  return null;
}

export function inferVariableMeaning(name: string, usageText = "") {
  const normalizedName = normalizeName(name);
  const usage = normalizeText(usageText);

  if (!normalizedName) {
    return null;
  }

  if (
    /(求和|累加|1\+|1到|sum|accumulat)/.test(usage) &&
    MEANING_ALIASES.accumulator.some((alias) => normalizeName(alias) === normalizedName)
  ) {
    return "accumulator";
  }
  if (
    /(求和|累加|循环|重复|repeat|每次|增加1|加1)/.test(usage) &&
    MEANING_ALIASES.counter.some((alias) => normalizeName(alias) === normalizedName)
  ) {
    return "counter";
  }
  if (
    /(求和|累加|循环|重复|repeat|1到|上限)/.test(usage) &&
    MEANING_ALIASES.limit.some((alias) => normalizeName(alias) === normalizedName)
  ) {
    return "limit";
  }
  if (/(阶乘|乘积|factorial|product)/.test(usage) && normalizedName === "i") {
    return "counter";
  }
  if (/(商品|总价|单价|price|quantity)/.test(usage) && /^(total|总价|总金额)$/.test(normalizedName)) {
    return "total";
  }

  return aliasMeaningForName(name);
}

function flattenStructure(structure: RecommendedBlockStructure | undefined) {
  const blocks: RecommendedBlock[] = [];
  const visit = (node: RecommendedBlockNode | undefined) => {
    if (!node) return;
    blocks.push({
      opcode: node.opcode,
      category: node.category,
      label: node.label,
      reason: node.reason,
      ...(node.params ? { params: node.params } : {})
    });
    visit(node.condition);
    visit(node.substack);
    visit(node.substack2);
    visit(node.next);
  };
  visit(structure?.root);
  return blocks;
}

function extractExpressionTokens(value: string) {
  if (value.startsWith("text:")) {
    return [];
  }

  const matches = value.match(/[A-Za-z_][A-Za-z0-9_]*|[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9_]*/g) ?? [];
  return uniqueStrings(matches.filter((token) => !IGNORED_EXPRESSION_TOKENS.has(normalizeName(token))));
}

function getBlockUsageText(block: Pick<RecommendedBlock, "opcode" | "label" | "reason" | "params">) {
  const params = block.params ? Object.values(block.params).join("|") : "";
  return [block.opcode, block.label, block.reason, params].join("|");
}

function collectVariableReferences(block: Pick<RecommendedBlock, "opcode" | "label" | "reason" | "params">) {
  const params = block.params ?? {};
  const usageText = getBlockUsageText(block);
  const refs: Array<{ name: string; meaning: string | null; usageText: string }> = [];

  for (const [rawKey, value] of Object.entries(params) as Array<[keyof RecommendedBlockParams, string | undefined]>) {
    if (!value) {
      continue;
    }
    if (PARAM_VARIABLE_KEYS.has(rawKey)) {
      refs.push({ name: value, meaning: inferVariableMeaning(value, usageText), usageText });
      continue;
    }
    if (PARAM_EXPRESSION_KEYS.has(rawKey)) {
      for (const token of extractExpressionTokens(value)) {
        refs.push({ name: token, meaning: inferVariableMeaning(token, usageText), usageText });
      }
    }
  }

  return refs;
}

function mergeBinding(bindings: VariableBinding[], ref: { name: string; meaning: string | null }) {
  if (!ref.meaning) {
    return;
  }

  const existing = bindings.find((binding) => binding.meaning === ref.meaning);
  if (!existing) {
    bindings.push({
      meaning: ref.meaning,
      preferredName: ref.name,
      aliases: [ref.name],
      source: "current-recommendation",
      confidence: "high"
    });
    return;
  }

  existing.aliases = uniqueStrings([...existing.aliases, ref.name]);
}

export function buildCoachingContinuityContext(
  response: Partial<CoachResponse> | undefined,
  previousContext?: CoachingContinuityContext
): CoachingContinuityContext | undefined {
  if (!response) {
    return previousContext;
  }

  const blocks = response.recommendation
    ? flattenStructure(response.recommendation)
    : response.recommendedBlocks ?? [];
  const bindings = (previousContext?.lockedVariableBindings ?? []).map((binding) => ({
    ...binding,
    aliases: [...binding.aliases],
    source: "previous-recommendation" as const
  }));

  const variableNames: string[] = [];
  for (const block of blocks) {
    for (const ref of collectVariableReferences(block)) {
      variableNames.push(ref.name);
      mergeBinding(bindings, ref);
    }
  }

  const previousRecommendationVariables = uniqueStrings([
    ...(previousContext?.previousRecommendationVariables ?? []),
    ...variableNames
  ]);

  if (blocks.length === 0 && bindings.length === 0 && previousRecommendationVariables.length === 0) {
    return undefined;
  }

  return {
    previousRecommendation: {
      answerText: response.answerText,
      nextStep: response.nextStep,
      blocks: blocks.slice(0, 5).map((block) => ({
        opcode: block.opcode,
        label: block.label,
        reason: block.reason,
        ...(block.params ? { params: block.params } : {})
      }))
    },
    previousRecommendationVariables,
    lockedVariableBindings: bindings
  };
}

function getExistingVariableNameSet(snapshot: ProjectSnapshot) {
  const names = new Set<string>();
  for (const variable of snapshot.globalVariables ?? []) {
    names.add(normalizeName(variable.name));
  }
  for (const sprite of snapshot.sprites ?? []) {
    for (const variable of sprite.variables ?? []) {
      names.add(normalizeName(variable.name));
    }
  }
  return names;
}

function findBinding(
  candidate: string,
  usageText: string,
  context?: CoachingContinuityContext
) {
  const candidateMeaning = inferVariableMeaning(candidate, usageText);
  const normalizedCandidate = normalizeName(candidate);
  return context?.lockedVariableBindings.find((binding) => {
    if (candidateMeaning && binding.meaning === candidateMeaning) {
      return true;
    }
    return binding.aliases.some((alias) => normalizeName(alias) === normalizedCandidate);
  });
}

function resolveVariableName(
  candidate: string,
  usageText: string,
  existingVariableNames: Set<string>,
  context?: CoachingContinuityContext
) {
  if (!candidate || existingVariableNames.has(normalizeName(candidate))) {
    return candidate;
  }

  const binding = findBinding(candidate, usageText, context);
  if (!binding || normalizeName(binding.preferredName) === normalizeName(candidate)) {
    return candidate;
  }

  return binding.preferredName;
}

function replaceExpressionVariables(
  value: string,
  usageText: string,
  existingVariableNames: Set<string>,
  context: CoachingContinuityContext | undefined,
  replacements: Map<string, string>
) {
  if (value.startsWith("text:")) {
    return value;
  }

  return value.replace(/[A-Za-z_][A-Za-z0-9_]*|[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9_]*/g, (token) => {
    if (IGNORED_EXPRESSION_TOKENS.has(normalizeName(token))) {
      return token;
    }
    const resolved = resolveVariableName(token, usageText, existingVariableNames, context);
    if (resolved !== token) {
      replacements.set(token, resolved);
    }
    return resolved;
  });
}

function replaceTextAliases(text: string, replacements: Map<string, string>) {
  let result = text;
  for (const [from, to] of replacements) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const latin = /^[A-Za-z_][A-Za-z0-9_]*$/.test(from);
    result = latin
      ? result.replace(new RegExp(`\\b${escaped}\\b`, "g"), to)
      : result.replace(new RegExp(escaped, "g"), to);
  }
  return result;
}

function applyContinuityToParams(
  params: RecommendedBlockParams | undefined,
  usageText: string,
  existingVariableNames: Set<string>,
  context: CoachingContinuityContext | undefined,
  replacements: Map<string, string>
) {
  if (!params || !context?.lockedVariableBindings.length) {
    return params;
  }

  const nextParams: RecommendedBlockParams = {};
  for (const [rawKey, value] of Object.entries(params) as Array<[keyof RecommendedBlockParams, string | undefined]>) {
    if (!value) {
      continue;
    }
    if (PARAM_VARIABLE_KEYS.has(rawKey)) {
      const resolved = resolveVariableName(value, usageText, existingVariableNames, context);
      if (resolved !== value) {
        replacements.set(value, resolved);
      }
      nextParams[rawKey] = resolved;
      continue;
    }
    if (PARAM_EXPRESSION_KEYS.has(rawKey)) {
      nextParams[rawKey] = replaceExpressionVariables(value, usageText, existingVariableNames, context, replacements);
      continue;
    }
    nextParams[rawKey] = value;
  }

  return nextParams;
}

export function applyVariableContinuityToNode(
  node: RecommendedBlockNode,
  snapshot: ProjectSnapshot,
  context?: CoachingContinuityContext
): RecommendedBlockNode {
  const existingVariableNames = getExistingVariableNameSet(snapshot);
  const replacements = new Map<string, string>();
  const usageText = getBlockUsageText(node);
  const params = applyContinuityToParams(node.params, usageText, existingVariableNames, context, replacements);
  const nextNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: replaceTextAliases(node.label, replacements),
    reason: replaceTextAliases(node.reason, replacements),
    ...(params ? { params } : {})
  };

  for (const relation of ["condition", "substack", "substack2", "next"] as const) {
    const child = node[relation];
    if (child) {
      nextNode[relation] = applyVariableContinuityToNode(child, snapshot, context);
    }
  }

  return nextNode;
}

export function applyVariableContinuityToStructure(
  structure: RecommendedBlockStructure,
  snapshot: ProjectSnapshot,
  context?: CoachingContinuityContext
): RecommendedBlockStructure {
  if (!context?.lockedVariableBindings.length) {
    return structure;
  }
  return {
    root: applyVariableContinuityToNode(structure.root, snapshot, context)
  };
}
