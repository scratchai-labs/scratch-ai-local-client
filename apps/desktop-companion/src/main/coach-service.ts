import {
  coachRecommendationResponseSchema,
  coachResponseSchema,
  getDisplayLabelForOpcode,
  getExtensionIdForOpcode,
  projectSnapshotSchema,
  recommendedBlockNodeSchema
} from "@scratch-ai/shared";
import {
  SUPPORTED_RECOMMENDED_BLOCK_OPCODES,
  isSupportedRecommendedBlockOpcode
} from "../common/scratch-block-xml";
import { MAX_RECOMMENDED_BLOCKS } from "../common/recommended-blocks";

import type { LoadedDeepSeekConfig } from "./deepseek-config";
import { redactSensitiveText } from "./sensitive-redaction";
import type {
  CoachResponse,
  ProgramAreaModule,
  ProjectSnapshot,
  RecommendedBlock,
  RecommendedBlockNode,
  RecommendedBlockStructure,
  SpriteSnapshot
} from "../common/types";

const DEFAULT_FALLBACK_MODEL = "local-heuristic";
const DEFAULT_DEEPSEEK_MAX_TOKENS = 2048;
export const DEFAULT_HINT_ONLY_SYSTEM_PROMPT =
  "你是 Scratch 小学编程助教。请只根据学生当前作品，给出具体、可执行、面向小学生的中文提示，但不要直接给完整答案，不要写完整脚本。所有展示给学生的自然语言都必须直接对学生说“你”，不要用“学生”“老师”“用户”等第三人称称呼。你必须先判断学生当前项目已经做到哪一步，再给出当前最适合尝试的 1 到 3 个按顺序连接的关键积木。所有自然语言必须使用中文，不要出现英文 opcode、英文积木名、英文字段解释，避免中英混杂。recommendation.root 里的 opcode 必须使用 Scratch 官方积木 opcode，不要编造不存在的 opcode。";
const HINT_ONLY_OUTPUT_REQUIREMENTS =
  "输出必须是一个 JSON 对象，字段只能包含 summary、recommendation。summary 是一句直接给学生看的简短中文提示，必须使用“你”来称呼学生。recommendation.root 是按顺序连接的具体积木结构，最多 3 个积木节点；每个节点必须包含 opcode、category、label、reason。使用 next 表示下一个顺序积木，使用 condition 表示条件输入，使用 substack 表示内部执行分支，使用 substack2 表示否则分支。不要输出 Markdown，不要输出额外解释，不要输出追问、诊断、示例或 XML。";
const RECOMMENDED_OPCODE_WHITELIST_REQUIREMENTS =
  `recommendation 里的 opcode 只允许从以下 Scratch 官方 opcode 白名单中选择：${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.join("、")}。如果不确定具体 opcode，就不要返回那一块，不要替换成其他积木。`;
const HINT_ONLY_USER_PROMPT =
  "请根据下面的 Scratch 项目上下文，给出“下一步做什么”的提示。只根据当前学生作品判断已经完成了什么，再直接给出按顺序连接的具体积木。优先基于学生已经使用过的模块继续推进，不要让学生一下子大改。";

interface GenerateCoachHintOptions {
  snapshot: ProjectSnapshot;
  currentTargetPrograms: string[];
  programAreaModules: ProgramAreaModule[];
  usedExtensions: string[];
  loadedExtensions: string[];
  goal?: string;
  aiConfig: LoadedDeepSeekConfig;
  customSystemPrompt?: string;
}

export interface GenerateCoachHintResult {
  source: "deepseek" | "fallback";
  model: string;
  coachResponse: CoachResponse;
  warning?: string;
}

function createRecommendedBlock(
  opcode: string,
  category: string,
  label: string,
  reason: string,
  example?: string
): RecommendedBlock {
  const block: RecommendedBlock = {
    opcode,
    category,
    label,
    reason
  };

  if (example) {
    block.example = example;
  }

  return block;
}

function getCurrentTargetSprite(snapshot: ProjectSnapshot) {
  return snapshot.sprites.find((sprite) => sprite.name === snapshot.currentTarget) ?? snapshot.sprites[0] ?? null;
}

function getCurrentTargetOpcodes(snapshot: ProjectSnapshot) {
  const sprite = getCurrentTargetSprite(snapshot);
  if (!sprite) {
    return [];
  }

  return sprite.scripts.flatMap((script) => script.blockOpcodes);
}

function hasOpcodePrefix(opcodes: string[], prefix: string) {
  return opcodes.some((opcode) => opcode.startsWith(prefix));
}

function hasModule(programAreaModules: ProgramAreaModule[], moduleId: string) {
  return programAreaModules.some((module) => module.id === moduleId);
}

function describeModules(programAreaModules: ProgramAreaModule[]) {
  if (programAreaModules.length === 0) {
    return "还没读取到当前角色的模块使用情况";
  }

  return programAreaModules
    .slice(0, 5)
    .map((module) => `${module.label}×${module.blockCount}`)
    .join("、");
}

function buildCompactSprites(snapshot: ProjectSnapshot, currentTargetName?: string) {
  return snapshot.sprites.slice(0, 8).map((sprite: SpriteSnapshot) => ({
    name: sprite.name,
    isStage: sprite.isStage,
    blockCount: sprite.blockCount,
    variables: sprite.variables.map((variable) => variable.name),
    scripts:
      sprite.name === currentTargetName
        ? sprite.scripts.map((script) => script.blockSequence)
        : sprite.scripts.slice(0, 2).map((script) => script.blockSequence)
  }));
}

function localizeProgramDescription(program: string) {
  if (typeof program !== "string") {
    return "";
  }

  const parts = program
    .split("->")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/[\u4e00-\u9fff]/.test(part)) {
        return part;
      }
      return getDisplayLabelForOpcode(part);
    });

  return parts.join(" -> ");
}

function localizeProgramDescriptions(programs: string[]) {
  return programs.map((program) => localizeProgramDescription(program)).filter(Boolean);
}

function buildBlockSuggestionFromOpcode(opcode: string) {
  switch (opcode) {
    case "event_whenflagclicked":
      return createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "先给脚本一个明确的开始时机。");
    case "event_whenbroadcastreceived":
      return createRecommendedBlock("event_whenbroadcastreceived", "事件", "当接收到消息", "适合把多个角色之间的配合关联起来。");
    case "motion_gotoxy":
      return createRecommendedBlock("motion_gotoxy", "运动", "移到 x: y:", "先把角色放到需要的起点位置。");
    case "motion_movesteps":
      return createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "先让角色动起来，你会更容易看到效果。");
    case "motion_pointtowards":
      return createRecommendedBlock("motion_pointtowards", "运动", "面向...", "如果角色要跟随某个目标，先让方向正确。");
    case "control_forever":
      return createRecommendedBlock("control_forever", "控制", "一直重复", "把动作放进循环里，效果才会持续发生。");
    case "control_repeat":
      return createRecommendedBlock("control_repeat", "控制", "重复执行", "先用固定次数循环测试行为。");
    case "control_if":
      return createRecommendedBlock("control_if", "控制", "如果...那么", "让角色开始根据条件判断下一步。");
    case "sensing_touchingobject":
      return createRecommendedBlock("sensing_touchingobject", "侦测", "碰到...？", "适合做碰撞、得分、触发消息等互动。");
    case "data_setvariableto":
      return createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "先把分数、生命值等状态初始化。");
    case "data_changevariableby":
      return createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "完成某个动作或满足条件后，用它更新结果。");
    case "looks_show":
      return createRecommendedBlock("looks_show", "外观", "显示", "让角色在该出现的时候可见。");
    case "looks_sayforsecs":
      return createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "给角色一个看得见的反馈，方便你调试。");
    default:
      return null;
  }
}

function buildGenericFallbackCoachResponse(options: GenerateCoachHintOptions): CoachResponse {
  const { snapshot, currentTargetPrograms, programAreaModules, goal } = options;
  const currentTarget = snapshot.currentTarget || "当前角色";
  const currentSprite = getCurrentTargetSprite(snapshot);
  const opcodes = getCurrentTargetOpcodes(snapshot);
  const recommendedBlocks: RecommendedBlock[] = [];
  const detectedIssues: CoachResponse["detectedIssues"] = [];

  let nextStep = `先围绕 ${currentTarget} 补一个更清晰的小目标。`;
  let answerText = `我看到 ${currentTarget} 现在主要用了 ${describeModules(programAreaModules)}。下一步先收紧范围，只补一个你自己也能完成的小功能。`;
  let followUpQuestion = "你希望这个角色下一步对什么做出反应，比如按键、碰撞还是计分？";

  if (currentTargetPrograms.length === 0 || !currentSprite || currentSprite.blockCount === 0) {
    nextStep = `先让 ${currentTarget} 拥有一个最小可运行脚本：事件开始，再加一个动作反馈。`;
    answerText = goal
      ? `我还没看到 ${currentTarget} 的完整脚本。先搭一个最小版本，往“${goal}”靠近一点点，不要一次把整套答案做完。`
      : `我还没看到 ${currentTarget} 的完整脚本。先搭一个最小版本，让角色先动起来或说一句话，再继续往下加。`;
    recommendedBlocks.push(
      createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "给脚本一个清楚的开始时机。"),
      createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "先做一个最直观的动作反馈。"),
      createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "你会更容易看出脚本已经被触发。", "比如：我开始执行啦"),
      createRecommendedBlock("control_repeat", "控制", "重复执行", "先把刚搭好的动作重复几次，更容易确认脚本真的跑起来了。")
    );
    detectedIssues.push({
      severity: "info",
      title: "当前角色还没有完整脚本",
      description: "建议先做一个能立刻运行的小脚本，再继续添加更复杂的规则。",
      spriteName: currentTarget
    });
    followUpQuestion = "你想先让角色动起来，还是先做一个看得见的提示？";
  } else if (!hasOpcodePrefix(opcodes, "event_")) {
    nextStep = "先补一个事件积木，把现有动作接到明确的触发时机后面。";
    answerText = `现在 ${currentTarget} 已经有动作思路了，但还缺少清楚的“什么时候开始执行”。先补事件，你会更容易理解流程。`;
    recommendedBlocks.push(
      createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "适合先做统一启动。"),
      createRecommendedBlock("event_whenkeypressed", "事件", "当按下某个键", "适合做角色控制或交互触发。"),
      createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "触发后给一个可见反馈，方便调试。"),
      createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "把事件后面的第一个动作补简单一点，你会更容易马上看到结果。")
    );
    detectedIssues.push({
      severity: "warning",
      title: "脚本触发条件不够清楚",
      description: "当前动作还缺少“什么时候开始”的事件积木。",
      spriteName: currentTarget
    });
    followUpQuestion = "你想让这个角色在绿旗点击时开始，还是在按键时开始？";
  } else if (!hasOpcodePrefix(opcodes, "control_repeat") && !hasOpcodePrefix(opcodes, "control_forever")) {
    nextStep = "把现有动作放进“重复执行”或“一直重复”里，让角色持续表现。";
    answerText = "当前脚本已经能跑起来了，下一步最值得补的是循环。这样角色不只做一次动作，作品会更像一个完整的小动画或小游戏。";
    recommendedBlocks.push(
      createRecommendedBlock("control_repeat", "控制", "重复执行", "先做固定次数的循环测试。"),
      createRecommendedBlock("control_forever", "控制", "一直重复", "适合持续移动、持续检测或持续绘制。"),
      createRecommendedBlock("motion_turnright", "运动", "右转 15 度", "放进循环里更容易看出连续效果。"),
      createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "和循环搭配后，角色会更明显地持续移动。")
    );
    followUpQuestion = "你希望它一直循环，还是只循环几次？";
  } else if (hasModule(programAreaModules, "motion") && !hasModule(programAreaModules, "sensing")) {
    nextStep = "在现有动作外面加一个侦测条件，让角色开始根据环境变化行为。";
    answerText = `现在 ${currentTarget} 已经会动了，下一步很适合补“侦测”。这样你就能从“会动”进阶到“会判断、会互动”。`;
    recommendedBlocks.push(
      createRecommendedBlock("sensing_touchingobject", "侦测", "碰到...？", "让角色开始根据环境做判断。"),
      createRecommendedBlock("control_if", "控制", "如果...那么", "把侦测结果变成真正的行为变化。"),
      createRecommendedBlock("motion_ifonedgebounce", "运动", "碰到边缘就反弹", "适合快速做出可见的互动结果。"),
      createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "判断成立时给一个提示，你更容易确认侦测逻辑是否生效。")
    );
    followUpQuestion = "你希望角色碰到边缘、鼠标，还是另一个角色时发生变化？";
  } else if (!hasModule(programAreaModules, "data")) {
    nextStep = "加一个变量，例如“分数”或“时间”，把作品从演示推进到有规则。";
    answerText = "当前脚本已经不只是单纯动作了。下一步可以加变量，帮你理解“状态”会随着事件变化。";
    recommendedBlocks.push(
      createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "先初始化一个核心变量。"),
      createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "完成动作或满足条件时更新结果。"),
      createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "变量变化后给一个可见反馈，方便调试。"),
      createRecommendedBlock("control_if", "控制", "如果...那么", "把变量变化和具体条件连起来，规则会更清楚。")
    );
    followUpQuestion = "如果这是一个小游戏，你最想先记录分数、时间，还是生命值？";
  } else {
    nextStep = "在现有脚本基础上补一个“如果...那么”判断，让角色会根据情况切换行为。";
    answerText = "这个项目已经有基础结构了。下一步不用一下子加太多，而是在现有动作外面补一层条件判断，让行为更像真实规则。";
    recommendedBlocks.push(
      createRecommendedBlock("control_if", "控制", "如果...那么", "让角色开始区分不同情况。"),
      createRecommendedBlock("operator_equals", "运算", "= ", "适合配合变量或侦测结果做判断。"),
      createRecommendedBlock("looks_switchcostumeto", "外观", "切换造型", "判断成立时给一个明显反馈。"),
      createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "如果这一步和得分或次数有关，可以顺手把结果记下来。")
    );
  }

  const visibleRecommendedBlocks = recommendedBlocks.slice(0, MAX_RECOMMENDED_BLOCKS);
  const recommendation = buildLinearRecommendation(visibleRecommendedBlocks);

  return {
    answerText,
    ...(recommendation ? { recommendation } : {}),
    recommendedBlocks: visibleRecommendedBlocks,
    nextStep,
    detectedIssues,
    ...(followUpQuestion ? { followUpQuestion } : {})
  };
}

function buildSystemPrompt(customSystemPrompt?: string) {
  const basePrompt = customSystemPrompt?.trim() || DEFAULT_HINT_ONLY_SYSTEM_PROMPT;
  return `${basePrompt}\n\n${HINT_ONLY_OUTPUT_REQUIREMENTS}\n${RECOMMENDED_OPCODE_WHITELIST_REQUIREMENTS}`;
}

function buildFallbackCoachResponse(options: GenerateCoachHintOptions): CoachResponse {
  return buildGenericFallbackCoachResponse(options);
}

function buildPromptContext(options: GenerateCoachHintOptions) {
  const { snapshot, currentTargetPrograms, programAreaModules, usedExtensions, loadedExtensions, goal } = options;
  const currentTarget = getCurrentTargetSprite(snapshot);

  return {
    goal: goal?.trim() || snapshot.goal || "",
    analysisPriority: "只根据当前学生作品，先判断已经完成了什么，再补下一小步。",
    currentTarget: snapshot.currentTarget || "",
    currentTargetPrograms: localizeProgramDescriptions(currentTargetPrograms),
    programAreaModules,
    usedExtensions,
    loadedExtensions,
    detectedConcepts: snapshot.detectedConcepts,
    sprites: buildCompactSprites(snapshot, currentTarget?.name),
    globalVariables: snapshot.globalVariables.map((variable) => ({
      name: variable.name,
      value: variable.value
    }))
  };
}

function extractMessageContent(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return "";
  }

  const payload = rawPayload as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("DeepSeek 返回了空内容。");
  }

  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;

  return JSON.parse(withoutFence);
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

function toRecommendedBlock(node: RecommendedBlockNode): RecommendedBlock {
  return {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason
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
    reason: block.reason
  };
}

function buildLinearRecommendation(blocks: RecommendedBlock[]): RecommendedBlockStructure | undefined {
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
    reason: node.reason
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

    if (["condition", "substack", "substack2", "next"].includes(key)) {
      stripped[key] = stripScratchNodeMetadata(childValue);
      continue;
    }

    stripped[key] = childValue;
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

function isAvailableRecommendedOpcode(opcode: string, options: GenerateCoachHintOptions) {
  if (!isSupportedRecommendedBlockOpcode(opcode)) {
    return false;
  }

  const extensionId = getExtensionIdForOpcode(opcode);
  if (!extensionId) {
    return true;
  }

  return options.loadedExtensions.includes(extensionId) || options.snapshot.loadedExtensions.includes(extensionId);
}

function canUseRecommendationRelation(opcode: string, relation: "condition" | "substack" | "substack2") {
  if (relation === "condition") {
    return [
      "control_if",
      "control_if_else",
      "control_repeat_until",
      "control_wait_until"
    ].includes(opcode);
  }

  if (relation === "substack") {
    return [
      "control_forever",
      "control_if",
      "control_if_else",
      "control_repeat",
      "control_repeat_until"
    ].includes(opcode);
  }

  return opcode === "control_if_else";
}

function filterRecommendedNode(
  node: RecommendedBlockNode,
  options: GenerateCoachHintOptions
): RecommendedBlockNode | null {
  if (!isAvailableRecommendedOpcode(node.opcode, options)) {
    return null;
  }

  const filteredNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason
  };

  const next = node.next ? filterRecommendedNode(node.next, options) : null;
  const condition =
    node.condition && canUseRecommendationRelation(node.opcode, "condition")
      ? filterRecommendedNode(node.condition, options)
      : null;
  const substack =
    node.substack && canUseRecommendationRelation(node.opcode, "substack")
      ? filterRecommendedNode(node.substack, options)
      : null;
  const substack2 =
    node.substack2 && canUseRecommendationRelation(node.opcode, "substack2")
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

function normalizeCoachResponse(rawPayload: unknown, options: GenerateCoachHintOptions) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return rawPayload;
  }

  const candidate = rawPayload as Record<string, unknown>;
  if (candidate.recommendation && typeof candidate.recommendation === "object") {
    const parsed = parseRecommendationCandidate(candidate);
    const filteredRoot = filterRecommendedNode(parsed.recommendation.root, options);
    if (!filteredRoot) {
      throw new Error("DeepSeek 没有返回可用的官方推荐积木。");
    }

    const recommendation = {
      root: filteredRoot
    };

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

export class CoachService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async generateHint(options: GenerateCoachHintOptions): Promise<GenerateCoachHintResult> {
    const snapshot = projectSnapshotSchema.parse(options.snapshot) as ProjectSnapshot;
    const normalizedOptions = {
      ...options,
      snapshot
    };

    if (!options.aiConfig.configured || !options.aiConfig.apiKey) {
      return {
        source: "fallback",
        model: DEFAULT_FALLBACK_MODEL,
        coachResponse: buildFallbackCoachResponse(normalizedOptions)
      };
    }

    try {
      const coachResponse = await this.requestDeepSeek(normalizedOptions);
      return {
        source: "deepseek",
        model: options.aiConfig.model,
        coachResponse
      };
    } catch (error) {
      return {
        source: "fallback",
        model: DEFAULT_FALLBACK_MODEL,
        coachResponse: buildFallbackCoachResponse(normalizedOptions),
        warning: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async requestDeepSeek(options: GenerateCoachHintOptions) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.aiConfig.timeoutMs);

    try {
      const promptContext = buildPromptContext(options);
      const systemPrompt = buildSystemPrompt(options.customSystemPrompt);
      const userPrompt = `${HINT_ONLY_USER_PROMPT}\n\n${JSON.stringify(promptContext, null, 2)}`;
      const response = await this.fetchImpl(`${options.aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: options.aiConfig.model,
          thinking: {
            type: "disabled"
          },
          temperature: 0.3,
          max_tokens: DEFAULT_DEEPSEEK_MAX_TOKENS,
          response_format: {
            type: "json_object"
          },
          [Symbol.for("legacyMessages")]: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`DeepSeek 请求失败：${response.status} ${redactSensitiveText(responseText).slice(0, 240)}`);
      }

      const rawPayload = await response.json();
      const messageContent = extractMessageContent(rawPayload);
      const parsedJson = parseJsonObject(messageContent);
      const normalizedJson = normalizeCoachResponse(parsedJson, options);
      return coachResponseSchema.parse(normalizedJson) as CoachResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}
