import { MAX_RECOMMENDED_BLOCKS } from "../common/recommended-blocks";
import {
  canRenderRecommendedBlockAtPosition,
  canUseRecommendedBlockRelation,
  type RecommendedBlockRelation
} from "../common/recommended-block-capabilities";
import { SUPPORTED_RECOMMENDED_BLOCK_OPCODES } from "../common/scratch-block-xml";
import type { RecommendedBlockNode, RecommendedBlockParams } from "../common/types";

export const DEEPSEEK_COMPLETE_TOOL_NAME = "submit_completed_project";
export const DEEPSEEK_RECOMMENDATION_TOOL_NAME = "submit_scratch_recommendation";

const ROOT_RELATION = "root";
const NODE_RELATIONS = ["next", "condition", "substack", "substack2"] as const;
const PARAM_NAMES = [
  "variable",
  "value",
  "changeBy",
  "message",
  "messageVariable",
  "repeatTimes",
  "question",
  "key",
  "left",
  "right",
  "steps",
  "degrees",
  "secs"
] as const;
const PARAM_NAME_SET = new Set<string>(PARAM_NAMES);
const PARAM_NAME_BY_LOWERCASE = new Map(PARAM_NAMES.map((name) => [name.toLowerCase(), name]));
const SUPPORTED_OPCODE_SET = new Set<string>(SUPPORTED_RECOMMENDED_BLOCK_OPCODES);

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

const strictNodeSchema = objectSchema({
  id: { type: "string" },
  parentId: { type: "string" },
  relation: { type: "string", enum: [ROOT_RELATION, ...NODE_RELATIONS] },
  opcode: { type: "string", enum: [...SUPPORTED_RECOMMENDED_BLOCK_OPCODES] },
  category: { type: "string" },
  label: { type: "string" },
  reason: { type: "string" },
  params: {
    type: "array",
    items: objectSchema({
      name: { type: "string", enum: [...PARAM_NAMES] },
      value: { type: "string" }
    })
  }
});

export const DEEPSEEK_STRICT_TOOLS = Object.freeze([
  {
    type: "function",
    function: {
      name: DEEPSEEK_COMPLETE_TOOL_NAME,
      description: "作品已经完整时，提交一句面向学生的中文玩法说明。",
      strict: true,
      parameters: objectSchema({
        summary: { type: "string" }
      })
    }
  },
  {
    type: "function",
    function: {
      name: DEEPSEEK_RECOMMENDATION_TOOL_NAME,
      description: "作品仍需完善时，提交最多五个带显式父节点和连接关系的 Scratch 推荐积木。",
      strict: true,
      parameters: objectSchema({
        summary: { type: "string" },
        nodes: {
          type: "array",
          items: strictNodeSchema
        }
      })
    }
  }
]);

export function buildDeepSeekStrictChatUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  const betaBase = normalized.endsWith("/beta") ? normalized : `${normalized}/beta`;
  return `${betaBase}/chat/completions`;
}

interface StrictRecommendationNodeRecord {
  id: string;
  parentId: string;
  relation: typeof ROOT_RELATION | RecommendedBlockRelation;
  opcode: string;
  category: string;
  label: string;
  reason: string;
  params?: RecommendedBlockParams;
}

function parseRequiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`DeepSeek 严格推荐节点缺少 ${key}。`);
  }
  return value.trim();
}

function parseStrictParams(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("DeepSeek 严格推荐节点 params 必须是数组。");
  }

  const params: RecommendedBlockParams = {};
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("DeepSeek 严格推荐参数格式无效。");
    }
    const record = item as Record<string, unknown>;
    const rawName = parseRequiredString(record, "name");
    const name = PARAM_NAME_BY_LOWERCASE.get(rawName.toLowerCase());
    const paramValue = parseRequiredString(record, "value");
    if (!name || !PARAM_NAME_SET.has(name)) {
      throw new Error(`DeepSeek 严格推荐包含未知参数 ${rawName}。`);
    }
    if (Object.hasOwn(params, name)) {
      throw new Error(`DeepSeek 严格推荐重复提供参数 ${name}。`);
    }
    (params as Record<string, string>)[name] = paramValue;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function parseStrictNode(value: unknown): StrictRecommendationNodeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DeepSeek 严格推荐节点格式无效。");
  }
  const record = value as Record<string, unknown>;
  const relation = parseRequiredString(record, "relation");
  if (relation !== ROOT_RELATION && !NODE_RELATIONS.includes(relation as RecommendedBlockRelation)) {
    throw new Error(`DeepSeek 严格推荐包含未知连接关系 ${relation}。`);
  }
  const opcode = parseRequiredString(record, "opcode");
  if (!SUPPORTED_OPCODE_SET.has(opcode)) {
    throw new Error(`DeepSeek 严格推荐包含未知 opcode ${opcode}。`);
  }

  return {
    id: parseRequiredString(record, "id"),
    parentId: typeof record.parentId === "string" ? record.parentId.trim() : "",
    relation: relation as StrictRecommendationNodeRecord["relation"],
    opcode,
    category: parseRequiredString(record, "category"),
    label: parseRequiredString(record, "label"),
    reason: parseRequiredString(record, "reason"),
    params: parseStrictParams(record.params)
  };
}

export function compileDeepSeekStrictNodes(rawNodes: unknown): RecommendedBlockNode {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new Error("DeepSeek 严格推荐没有返回积木节点。");
  }
  if (rawNodes.length > MAX_RECOMMENDED_BLOCKS) {
    throw new Error(`DeepSeek 严格推荐最多只能包含 ${MAX_RECOMMENDED_BLOCKS} 个节点。`);
  }

  const nodes = rawNodes.map(parseStrictNode);
  const nodeById = new Map<string, StrictRecommendationNodeRecord>();
  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      throw new Error(`DeepSeek 严格推荐节点 id 重复：${node.id}。`);
    }
    nodeById.set(node.id, node);
  }

  const roots = nodes.filter((node) => node.relation === ROOT_RELATION);
  if (roots.length !== 1 || roots[0].parentId) {
    throw new Error("DeepSeek 严格推荐必须有且只有一个无父节点 root。 ");
  }
  const root = roots[0];
  if (!canRenderRecommendedBlockAtPosition(root.opcode, "root")) {
    throw new Error(`DeepSeek 严格推荐 root 不能使用 ${root.opcode}。`);
  }

  const childrenByParent = new Map<string, Map<RecommendedBlockRelation, StrictRecommendationNodeRecord>>();
  for (const node of nodes) {
    if (node === root) continue;
    if (!node.parentId || !nodeById.has(node.parentId)) {
      throw new Error(`DeepSeek 严格推荐节点 ${node.id} 的父节点不存在。`);
    }
    const relation = node.relation as RecommendedBlockRelation;
    const parent = nodeById.get(node.parentId)!;
    if (!canUseRecommendedBlockRelation(parent.opcode, relation)) {
      throw new Error(`${parent.opcode} 不允许使用 ${relation} 连接。`);
    }
    if (!canRenderRecommendedBlockAtPosition(node.opcode, relation)) {
      throw new Error(`${node.opcode} 不能放在 ${relation} 位置。`);
    }

    const relationMap = childrenByParent.get(parent.id) ?? new Map();
    if (relationMap.has(relation)) {
      throw new Error(`DeepSeek 严格推荐父节点 ${parent.id} 重复使用 ${relation}。`);
    }
    relationMap.set(relation, node);
    childrenByParent.set(parent.id, relationMap);
  }

  const visited = new Set<string>();
  const buildNode = (node: StrictRecommendationNodeRecord, ancestors: Set<string>): RecommendedBlockNode => {
    if (ancestors.has(node.id)) {
      throw new Error(`DeepSeek 严格推荐存在循环连接：${node.id}。`);
    }
    visited.add(node.id);
    const nextAncestors = new Set(ancestors).add(node.id);
    const result: RecommendedBlockNode = {
      opcode: node.opcode,
      category: node.category,
      label: node.label,
      reason: node.reason,
      ...(node.params ? { params: node.params } : {})
    };
    const relations = childrenByParent.get(node.id);
    for (const relation of NODE_RELATIONS) {
      const child = relations?.get(relation);
      if (child) result[relation] = buildNode(child, nextAncestors);
    }
    return result;
  };

  const compiledRoot = buildNode(root, new Set());
  if (visited.size !== nodes.length) {
    throw new Error("DeepSeek 严格推荐包含未连接到 root 的节点。");
  }
  return compiledRoot;
}

export function extractDeepSeekStrictCandidate(rawPayload: unknown) {
  const payload = rawPayload as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          type?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        }>;
      };
    }>;
  };
  const calls = payload?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) {
    throw new Error("DeepSeek 没有调用严格推荐工具。");
  }

  const call = calls.find((item) =>
    item?.type === "function" &&
    (item.function?.name === DEEPSEEK_COMPLETE_TOOL_NAME ||
      item.function?.name === DEEPSEEK_RECOMMENDATION_TOOL_NAME)
  );
  if (!call || typeof call.function?.arguments !== "string") {
    throw new Error("DeepSeek 没有返回可解析的严格工具参数。");
  }

  const parsed = JSON.parse(call.function.arguments) as Record<string, unknown>;
  if (call.function.name === DEEPSEEK_COMPLETE_TOOL_NAME) {
    return { summary: parseRequiredString(parsed, "summary") };
  }

  return {
    summary: parseRequiredString(parsed, "summary"),
    recommendation: {
      root: compileDeepSeekStrictNodes(parsed.nodes)
    }
  };
}
