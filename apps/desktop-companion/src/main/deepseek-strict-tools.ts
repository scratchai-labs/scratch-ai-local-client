import {
  getRecommendedOpcodesByShape,
  type RecommendedBlockShape
} from "../common/recommended-block-capabilities";

export const DEEPSEEK_COMPLETE_TOOL_NAME = "submit_completed_project";
export const DEEPSEEK_RECOMMENDATION_TOOL_NAME = "submit_scratch_recommendation";

const PARAM_NAMES = [
  "variable",
  "value",
  "changeBy",
  "message",
  "messageVariable",
  "repeatTimes",
  "question",
  "left",
  "right",
  "steps",
  "degrees",
  "secs"
] as const;

const CONTROL_CONTAINER_OPCODES = new Set([
  "control_repeat",
  "control_forever",
  "control_if",
  "control_if_else",
  "control_repeat_until"
]);

function opcodesByShape(shape: RecommendedBlockShape) {
  return getRecommendedOpcodesByShape(shape);
}

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

const paramsSchema = {
  type: "array",
  items: objectSchema({
    name: { type: "string", enum: [...PARAM_NAMES] },
    value: { type: "string" }
  })
};

function baseNodeProperties(opcodes: string[]) {
  return {
    opcode: { type: "string", enum: opcodes },
    category: { type: "string" },
    label: { type: "string" },
    reason: { type: "string" },
    params: paramsSchema
  };
}

function nodeSchema(opcodes: string[], relations: Record<string, unknown> = {}) {
  return objectSchema({
    ...baseNodeProperties(opcodes),
    ...relations
  });
}

function createRecommendationParametersSchema() {
  const normalStackOpcodes = opcodesByShape("stack").filter(
    (opcode) => !CONTROL_CONTAINER_OPCODES.has(opcode)
  );
  const terminalOpcodes = opcodesByShape("terminal").filter(
    (opcode) => opcode !== "control_forever"
  );
  const hatOpcodes = opcodesByShape("hat");
  const booleanOpcodes = opcodesByShape("boolean");
  const nextRef = { $ref: "#/$defs/statementNode" };

  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      recommendation: objectSchema({
        root: { $ref: "#/$defs/rootNode" }
      })
    },
    required: ["summary", "recommendation"],
    additionalProperties: false,
    $defs: {
      conditionNode: nodeSchema(booleanOpcodes),
      normalStackWithoutNext: nodeSchema(normalStackOpcodes),
      normalStackWithNext: nodeSchema(normalStackOpcodes, { next: nextRef }),
      terminalNode: nodeSchema(terminalOpcodes),
      foreverNode: nodeSchema(["control_forever"], {
        substack: { $ref: "#/$defs/statementNode" }
      }),
      repeatWithoutNext: nodeSchema(["control_repeat"], {
        substack: { $ref: "#/$defs/statementNode" }
      }),
      repeatWithNext: nodeSchema(["control_repeat"], {
        substack: { $ref: "#/$defs/statementNode" },
        next: nextRef
      }),
      repeatUntilWithoutNext: nodeSchema(["control_repeat_until"], {
        condition: { $ref: "#/$defs/conditionNode" },
        substack: { $ref: "#/$defs/statementNode" }
      }),
      repeatUntilWithNext: nodeSchema(["control_repeat_until"], {
        condition: { $ref: "#/$defs/conditionNode" },
        substack: { $ref: "#/$defs/statementNode" },
        next: nextRef
      }),
      ifWithoutNext: nodeSchema(["control_if"], {
        condition: { $ref: "#/$defs/conditionNode" },
        substack: { $ref: "#/$defs/statementNode" }
      }),
      ifWithNext: nodeSchema(["control_if"], {
        condition: { $ref: "#/$defs/conditionNode" },
        substack: { $ref: "#/$defs/statementNode" },
        next: nextRef
      }),
      ifElseWithoutNext: nodeSchema(["control_if_else"], {
        condition: { $ref: "#/$defs/conditionNode" },
        substack: { $ref: "#/$defs/statementNode" },
        substack2: { $ref: "#/$defs/statementNode" }
      }),
      ifElseWithNext: nodeSchema(["control_if_else"], {
        condition: { $ref: "#/$defs/conditionNode" },
        substack: { $ref: "#/$defs/statementNode" },
        substack2: { $ref: "#/$defs/statementNode" },
        next: nextRef
      }),
      statementNode: {
        anyOf: [
          { $ref: "#/$defs/normalStackWithoutNext" },
          { $ref: "#/$defs/normalStackWithNext" },
          { $ref: "#/$defs/terminalNode" },
          { $ref: "#/$defs/foreverNode" },
          { $ref: "#/$defs/repeatWithoutNext" },
          { $ref: "#/$defs/repeatWithNext" },
          { $ref: "#/$defs/repeatUntilWithoutNext" },
          { $ref: "#/$defs/repeatUntilWithNext" },
          { $ref: "#/$defs/ifWithoutNext" },
          { $ref: "#/$defs/ifWithNext" },
          { $ref: "#/$defs/ifElseWithoutNext" },
          { $ref: "#/$defs/ifElseWithNext" }
        ]
      },
      hatWithoutNext: nodeSchema(hatOpcodes),
      hatWithNext: nodeSchema(hatOpcodes, { next: nextRef }),
      rootNode: {
        anyOf: [
          { $ref: "#/$defs/hatWithoutNext" },
          { $ref: "#/$defs/hatWithNext" },
          { $ref: "#/$defs/statementNode" }
        ]
      }
    }
  };
}

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
      description: "作品仍需完善时，提交经过 Scratch 连接规则约束的下一步积木结构。",
      strict: true,
      parameters: createRecommendationParametersSchema()
    }
  }
]);

export function buildDeepSeekStrictChatUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  const betaBase = normalized.endsWith("/beta") ? normalized : `${normalized}/beta`;
  return `${betaBase}/chat/completions`;
}

function convertStrictParams(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  const params: Record<string, string> = {};
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { name, value: itemValue } = item as { name?: unknown; value?: unknown };
    if (typeof name === "string" && typeof itemValue === "string") {
      params[name] = itemValue;
    }
  }
  return params;
}

function convertStrictNode(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const node = { ...(value as Record<string, unknown>) };
  const params = convertStrictParams(node.params);
  if (params && typeof params === "object" && !Array.isArray(params) && Object.keys(params).length > 0) {
    node.params = params;
  } else {
    delete node.params;
  }
  for (const relation of ["next", "condition", "substack", "substack2"]) {
    if (node[relation] !== undefined) {
      node[relation] = convertStrictNode(node[relation]);
    }
  }
  return node;
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
    return {
      summary: parsed.summary
    };
  }

  const recommendation = parsed.recommendation;
  if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) {
    throw new Error("DeepSeek 严格推荐缺少 recommendation。");
  }
  const root = (recommendation as Record<string, unknown>).root;
  return {
    summary: parsed.summary,
    recommendation: {
      root: convertStrictNode(root)
    }
  };
}
