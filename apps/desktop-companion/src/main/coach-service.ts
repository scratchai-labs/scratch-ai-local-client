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
import { sanitizeRecommendedStructure } from "../common/recommended-structure";
import { MAX_RECOMMENDED_BLOCKS, MAX_SIMPLE_RECOMMENDED_BLOCKS } from "../common/recommended-blocks";

import type { LoadedDeepSeekConfig } from "./deepseek-config";
import { buildProjectScriptEvidence } from "./project-script-evidence";
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
  "你是 Scratch 小学编程助教。请完整阅读舞台和全部角色的全部脚本，从整个项目而不是只从当前角色判断作品是否完整。完整性判断只能依据本次最新项目快照中实际存在的脚本和积木；不得根据角色名称、造型主题或常见游戏玩法推测项目具有快照中没有的控制、得分、升级、胜利、失败或结束功能。请逐个核对舞台和每个角色的实际脚本，并从绿旗开始检查实际可达路径：追踪事件入口、条件、循环、变量和广播的发送与接收，确认核心流程不会因为等待尚未发生的广播或条件而无法启动。如果没有按键、角色点击、鼠标位置、鼠标按下等真实输入积木，就不能声称学生可以控制角色；如果碰撞条件指向的是另一个角色，也不能改写成学生控制的角色发生碰撞。只有启动方式、操作方式、核心规则、反馈和结束条件等你在 summary 中声称存在的功能，都能在当前脚本中找到证据并且实际可达时，才能判断作品完整。若作品仍需完善，给出具体、可执行、面向小学生的中文提示，但不要直接给完整答案，不要写完整脚本，并给出当前最适合尝试的 1 到 5 个按顺序连接的关键积木；简单下一步优先 1 到 3 个，只有输入、保存、条件和反馈等复杂步骤确实需要时才使用 4 到 5 个。若作品已经形成完整、可运行、目标清楚的程序，可以不返回 recommendation，只用 summary 简短告诉学生作品已完成以及如何启动、操作或体验。所有展示给学生的自然语言都必须直接对学生说“你”，不要用“学生”“老师”“用户”等第三人称称呼。所有自然语言必须使用中文，不要出现英文 opcode、英文积木名、英文字段解释，避免中英混杂。recommendation.root 里的 opcode 必须使用 Scratch 官方积木 opcode，不要编造不存在的 opcode。";
const HINT_ONLY_OUTPUT_REQUIREMENTS =
  "输出必须是一个 JSON 对象，字段只能包含 summary、recommendation。summary 是一句直接给学生看的简短中文提示，必须使用“你”来称呼学生。作品仍需完善时，recommendation.root 是按顺序连接的具体积木结构，最多 5 个积木节点，简单下一步优先不超过 3 个；每个节点必须包含 opcode、category、label、reason，嵌套的 condition、substack、substack2 节点也必须包含 reason。使用 next 表示下一个顺序积木，使用 condition 表示条件输入，使用 substack 表示内部执行分支，使用 substack2 表示否则分支。节点可选 params 只用于显示默认值，允许键仅有 variable、value、changeBy、message、messageVariable、repeatTimes、question、left、right、steps、degrees；所有 params 的值都必须是字符串，不要把 params.value、left、right、changeBy、messageVariable 写成嵌套对象或数字；例如将变量设为可用 params.variable=\"rabbits\" 和 params.value=\"(feet - 2 * heads) / 2\"，重复执行可用 params.repeatTimes=\"100\"，说话可用 params.messageVariable=\"sum\"，碰到 Apple 可用 params.variable=\"Apple\"。作品已经完整时，可以不返回 recommendation，只返回 summary，说明如何启动、操作或体验。不要输出 Markdown，不要输出额外解释，不要输出追问、诊断、示例或 XML。";
const RECOMMENDED_OPCODE_WHITELIST_REQUIREMENTS =
  `recommendation 里的 opcode 只允许从以下 Scratch 官方 opcode 白名单中选择：${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.join("、")}。如果不确定具体 opcode，就不要返回那一块，不要替换成其他积木。`;
const HINT_ONLY_USER_PROMPT =
  "这是一次基于最新快照的全新复评。请完整阅读舞台和全部角色的全部脚本，尤其使用 projectScriptEvidence 核对每个积木的真实字段、输入、条件分支和广播名称；不要沿用之前的完整性结论，也不要根据角色名或游戏题材脑补快照中没有的功能。请从绿旗入口开始追踪实际执行路径，确认广播发送条件能够到达、接收脚本能够启动，并区分自动运行与按键/鼠标控制。先从整个 Scratch 项目判断它是否已经形成完整、可运行、目标清楚的作品；summary 中提到的每项玩法都必须有当前脚本证据且实际可达。若还没完成，再给出“下一步做什么”的提示和按顺序连接的具体积木；优先基于已经使用过的模块继续推进，不要让学生一下子大改。不要把当前角色已经存在的事件帽子积木再次作为下一步推荐；如果后续积木需要接到现有脚本中，只返回需要新增的部分。若项目已经完整，不要为了给建议而强行添加功能，可以不返回 recommendation，只在 summary 里简短告诉学生如何启动、操作或体验。";

const TASK_TYPE_GUIDANCE =
  "先判断作品任务类型，再给下一步提示：1) 数学计算题：变量名或脚本出现 heads/feet/chickens/rabbits/n/sum/i/total 等，或目标含鸡兔同笼/求和/累加/公式时，按计算题辅导。2) 图形绘制题：目标含画笔/绘制/正方形/三角形/五边形时，按画笔、重复执行、移动、转角推进，不要推荐边缘反弹、碰撞或计分。3) 游戏动画题：以移动、碰撞、得分、按键控制为主时，按游戏动画辅导。4) 混合题：有数学变量又有运动时，优先补全计算与结果输出，不要为了热闹再加无关动画。数学计算题硬性规则：- 已知量是 heads/feet 或 n 时，下一步必须朝求解目标量推进，禁止把任务反转成“用鸡兔再算总头脚”或“为了动画而移动/旋转/反弹”。- 鸡兔同笼优先：rabbits=(feet-2*heads)/2，chickens=heads-rabbits，最后用 looks_say 或显示变量说出结果。- 1到n求和优先：初始化 sum=0 与 i=1，重复 n 次，循环内 sum 增加 i、i 增加 1，最后说出 sum；如果目标已经写明 100 这类固定上限，不要再推荐 sensing_askandwait 询问 n，直接使用已知上限。- 缺计算时优先推荐 data_setvariableto / data_changevariableby / operator_add / operator_subtract / operator_multiply / operator_divide / control_repeat / sensing_askandwait / looks_sayforsecs。- 除非学生目标明确要求动画，不要推荐 motion_movesteps、motion_turnright、motion_ifonedgebounce、looks_switchcostumeto 作为数学题的下一步。";

const NON_REPEATABLE_HAT_OPCODE_SET = new Set([
  "event_whenflagclicked",
  "event_whenkeypressed",
  "event_whenbroadcastreceived",
  "event_whenbackdropswitchesto"
]);

interface GenerateCoachHintOptions {
  snapshot: ProjectSnapshot;
  projectData?: unknown;
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

function buildProjectSprites(snapshot: ProjectSnapshot) {
  return snapshot.sprites.map((sprite: SpriteSnapshot) => ({
    name: sprite.name,
    isStage: sprite.isStage,
    blockCount: sprite.blockCount,
    variables: sprite.variables.map((variable) => variable.name),
    scripts: sprite.scripts.map((script) => ({
      event: script.event,
      blocks: script.blockSequence.map(localizeProgramDescription),
      opcodes: script.blockOpcodes
    }))
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

type CoachingTaskType = "math-chicken-rabbit" | "math-sum" | "math-generic" | "drawing" | "game-or-animation" | "unknown";

interface CoachingTaskIntent {
  taskType: CoachingTaskType;
  confidence: "high" | "medium" | "low";
  signals: string[];
  variableNames: string[];
  guidance: string;
}

function collectProjectVariableNames(snapshot: ProjectSnapshot) {
  const names = new Set<string>();
  for (const variable of snapshot.globalVariables ?? []) {
    if (variable?.name) {
      names.add(String(variable.name));
    }
  }
  for (const sprite of snapshot.sprites ?? []) {
    for (const variable of sprite.variables ?? []) {
      if (variable?.name) {
        names.add(String(variable.name));
      }
    }
  }
  return Array.from(names);
}

function normalizeIntentText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function detectCoachingTaskIntent(options: GenerateCoachHintOptions): CoachingTaskIntent {
  const variableNames = collectProjectVariableNames(options.snapshot);
  const goalText = normalizeIntentText(options.goal || options.snapshot.goal || "");
  const programText = normalizeIntentText(
    [
      ...options.currentTargetPrograms,
      ...options.snapshot.sprites.flatMap((sprite) =>
        sprite.scripts.flatMap((script) => script.blockSequence)
      )
    ].join("|")
  );
  const variableText = normalizeIntentText(variableNames.join("|"));
  const combined = `${goalText}|${variableText}|${programText}`;
  const signals: string[] = [];

  const hasHeads = variableNames.some((name) => /^(heads|头|总头数|头数)$/i.test(name)) || /heads|总头数|头数/.test(combined);
  const hasFeet = variableNames.some((name) => /^(feet|脚|总脚数|脚数)$/i.test(name)) || /feet|总脚数|脚数/.test(combined);
  const hasChickens = variableNames.some((name) => /^(chickens|鸡|鸡的数量|鸡数)$/i.test(name)) || /chickens|鸡的数量|鸡数/.test(combined);
  const hasRabbits = variableNames.some((name) => /^(rabbits|兔|兔子|兔的数量|兔数)$/i.test(name)) || /rabbits|兔的数量|兔数|兔子/.test(combined);
  const hasSum = variableNames.some((name) => /^(sum|总和|合计|结果)$/i.test(name)) || /sum|总和|合计/.test(combined);
  const hasN = variableNames.some((name) => /^(n|上限|次数)$/i.test(name));
  const hasI = variableNames.some((name) => /^(i|计数|计数器)$/i.test(name));
  const mentionsChickenRabbit = /鸡兔|同笼|chicken|rabbit/.test(combined);
  const mentionsSum = /1到n|1到n|累加|求和|sum=|求和|合计/.test(combined) || /1\+2|1到/.test(combined);
  const mentionsCalculation = /平方|乘以自己|计算|算出|公式|number\*number|number.*number/.test(combined);
  const hasPenModule = hasModule(options.programAreaModules, "pen");
  const mentionsShapeDrawing = /绘制|画.*图|正方形|四边形|三角形|五边形|五角星|等边/.test(combined);
  const mentionsDrawing = mentionsShapeDrawing || (/画笔/.test(combined) && hasPenModule);
  const motionHeavy =
    hasModule(options.programAreaModules, "motion") &&
    !hasModule(options.programAreaModules, "data") &&
    !hasHeads &&
    !hasFeet &&
    !hasSum;

  if (hasHeads) signals.push("var:heads");
  if (hasFeet) signals.push("var:feet");
  if (hasChickens) signals.push("var:chickens");
  if (hasRabbits) signals.push("var:rabbits");
  if (hasSum) signals.push("var:sum");
  if (hasN) signals.push("var:n");
  if (hasI) signals.push("var:i");
  if (mentionsChickenRabbit) signals.push("text:chicken-rabbit");
  if (mentionsSum) signals.push("text:sum");
  if (mentionsCalculation) signals.push("text:calculation");
  if (mentionsDrawing || hasPenModule) signals.push("text:drawing");

  if ((hasHeads && hasFeet) || mentionsChickenRabbit || ((hasChickens || hasRabbits) && (hasHeads || hasFeet))) {
    return {
      taskType: "math-chicken-rabbit",
      confidence: hasHeads && hasFeet ? "high" : "medium",
      signals,
      variableNames,
      guidance:
        "当前更像鸡兔同笼数学题：已知 heads/feet 时，下一步应求 rabbits/chickens 并说出结果；禁止反转成用鸡兔再算总头脚，也不要为了热闹加移动/旋转。"
    };
  }

  if ((hasSum && (hasN || hasI || mentionsSum)) || mentionsSum) {
    return {
      taskType: "math-sum",
      confidence: hasSum && (hasN || hasI) ? "high" : "medium",
      signals,
      variableNames,
      guidance:
        "当前更像 1 到 n 累加数学题：优先补循环累加（sum 增加 i，i 增加 1）并说出 sum；不要把提示带偏成旋转、移动或边缘反弹动画。"
    };
  }

  if (hasSum || hasN || hasI || mentionsCalculation || hasModule(options.programAreaModules, "operator")) {
    const mathSignals = hasSum || hasN || hasI || mentionsCalculation || hasModule(options.programAreaModules, "data");
    if (mathSignals && !motionHeavy) {
      return {
        taskType: "math-generic",
        confidence: "medium",
        signals,
        variableNames,
        guidance:
          "当前更像数学计算题：优先围绕变量、运算、循环和结果输出推进；不要额外推荐无关的运动动画积木。"
      };
    }
  }

  if (mentionsDrawing || hasPenModule) {
    return {
      taskType: "drawing",
      confidence: mentionsDrawing ? "high" : "medium",
      signals,
      variableNames,
      guidance:
        "当前更像图形绘制题：优先补画笔、重复执行、移动步数和正确外角；不要转成边缘反弹、碰撞检测或计分小游戏。"
    };
  }

  if (motionHeavy) {
    return {
      taskType: "game-or-animation",
      confidence: "medium",
      signals: [...signals, "module:motion"],
      variableNames,
      guidance: "当前更像游戏或动画：可围绕事件、循环、移动、碰撞和反馈继续推进。"
    };
  }

  return {
    taskType: "unknown",
    confidence: "low",
    signals,
    variableNames,
    guidance: "任务类型尚不明确：先根据现有变量与脚本补一个最小可验证的下一步，不要假设学生在做动画。"
  };
}

function isMathTaskType(taskType: CoachingTaskType) {
  return taskType === "math-chicken-rabbit" || taskType === "math-sum" || taskType === "math-generic";
}

function inferDrawingShapeSpec(options: GenerateCoachHintOptions) {
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

  if (/三角形|等边/.test(text)) {
    return { name: "等边三角形", sides: 3, turnDegrees: 120 };
  }
  if (/五边形/.test(text)) {
    return { name: "五边形", sides: 5, turnDegrees: 72 };
  }
  if (/五角星/.test(text)) {
    return { name: "五角星", sides: 5, turnDegrees: 144 };
  }
  if (/正方形|四边形/.test(text)) {
    return { name: "正方形", sides: 4, turnDegrees: 90 };
  }
  return { name: "图形", sides: 4, turnDegrees: 90 };
}

function buildDrawingFallbackCoachResponse(options: GenerateCoachHintOptions): CoachResponse {
  const opcodes = getCurrentTargetOpcodes(options.snapshot);
  const hasEvent = hasOpcodePrefix(opcodes, "event_");
  const hasPenDown = opcodes.includes("pen_penDown");
  const hasPenUp = opcodes.includes("pen_penUp");
  const hasLoop = opcodes.includes("control_repeat");
  const hasMove = opcodes.includes("motion_movesteps");
  const hasTurn = opcodes.includes("motion_turnright") || opcodes.includes("motion_turnleft");
  const shape = inferDrawingShapeSpec(options);

  if (!hasEvent || !hasPenDown) {
    return {
      answerText: `这是画 ${shape.name} 的绘图任务。先用绿旗开始，清空画面并落笔，不要转去做边缘反弹小游戏。`,
      recommendedBlocks: [
        createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "给绘图脚本一个明确开始时机。"),
        createRecommendedBlock("pen_clear", "画笔", "全部擦除", "开始画图前先清空舞台。"),
        createRecommendedBlock("pen_penDown", "画笔", "落笔", "落笔后移动才会留下线条。")
      ],
      nextStep: "先准备画笔起点。",
      detectedIssues: []
    };
  }

  if (!hasLoop || !hasMove || !hasTurn) {
    return {
      answerText: `下一步用重复执行 ${shape.sides} 次画 ${shape.name}：每次移动一条边，再右转 ${shape.turnDegrees} 度。`,
      recommendedBlocks: [
        createRecommendedBlock("control_repeat", "控制", "重复执行", `重复执行 ${shape.sides} 次，对应 ${shape.name} 的边数。`),
        createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "每次移动画出一条边。"),
        createRecommendedBlock("motion_turnright", "运动", "右转 15 度", `每条边后右转 ${shape.turnDegrees} 度。`)
      ],
      nextStep: `搭出 ${shape.sides} 次循环、移动和 ${shape.turnDegrees} 度转角。`,
      detectedIssues: []
    };
  }

  if (!hasPenUp) {
    return {
      answerText: `${shape.name} 的循环、移动和转角已经有了。最后加“抬笔”，这样画完后角色再移动也不会继续乱画。`,
      recommendedBlocks: [
        createRecommendedBlock("pen_penUp", "画笔", "抬笔", "画完后抬笔，避免继续留下线条。")
      ],
      nextStep: "画完后抬笔收尾。",
      detectedIssues: []
    };
  }

  return {
    answerText: `${shape.name} 绘制已经接近完成。检查是否重复 ${shape.sides} 次，并且每条边后转 ${shape.turnDegrees} 度。`,
    recommendedBlocks: [],
    nextStep: "点击绿旗检查图形是否闭合。",
    detectedIssues: []
  };
}

function buildMathFallbackCoachResponse(
  options: GenerateCoachHintOptions,
  intent: CoachingTaskIntent
): CoachResponse {
  const opcodes = getCurrentTargetOpcodes(options.snapshot);
  const hasEvent = hasOpcodePrefix(opcodes, "event_");
  const hasLoop = hasOpcodePrefix(opcodes, "control_repeat") || hasOpcodePrefix(opcodes, "control_forever");
  const hasAsk = opcodes.includes("sensing_askandwait");
  const hasSay = opcodes.includes("looks_say") || opcodes.includes("looks_sayforsecs");
  const hasAdd = opcodes.includes("operator_add") || opcodes.includes("data_changevariableby");
  const hasSubtract = opcodes.includes("operator_subtract");
  const hasMultiply = opcodes.includes("operator_multiply");
  const hasDivide = opcodes.includes("operator_divide");
  const names = intent.variableNames.map((name) => name.toLowerCase());
  const hasRabbitsVar = names.some((name) => /rabbit|兔/.test(name));
  const hasChickensVar = names.some((name) => /chicken|鸡/.test(name));
  const hasSumVar = names.some((name) => /sum|总和|合计/.test(name));
  const combinedMathText = normalizeIntentText(
    [
      options.goal,
      options.snapshot.goal,
      ...options.currentTargetPrograms,
      names.join("|")
    ].join("|")
  );
  const isFactorialTask = /阶乘|factorial|product|乘积|1×2×3|1\*2\*3/.test(combinedMathText);

  if (intent.taskType === "math-chicken-rabbit") {
    if (!hasEvent) {
      return {
        answerText: "这是鸡兔同笼计算题。先点绿旗开始，再设置头数和脚数，不要先去做移动动画。",
        recommendedBlocks: [
          createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "给计算脚本一个明确开始时机。"),
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "先设置 heads 和 feet 这两个已知量。"),
          createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "算出结果后告诉大家鸡和兔各有多少。")
        ],
        nextStep: "先用绿旗启动，再设置 heads 和 feet。",
        detectedIssues: []
      };
    }

    if (!hasAsk && !names.some((name) => /head|脚|feet/.test(name))) {
      return {
        answerText: "先确认已知条件：你可以询问头数和脚数，并保存到变量里。",
        recommendedBlocks: [
          createRecommendedBlock("sensing_askandwait", "侦测", "询问并等待", "先问头数或脚数。"),
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "把回答保存到 heads 或 feet。"),
          createRecommendedBlock("operator_subtract", "运算", "减", "后面会用减法参与求兔/鸡。")
        ],
        nextStep: "先把 heads 和 feet 这两个已知量准备好。",
        detectedIssues: []
      };
    }

    if (!hasRabbitsVar || !hasSubtract || !hasMultiply || !hasDivide) {
      return {
        answerText: "已知头和脚时，下一步应求兔子数量：rabbits = (feet - 2 × heads) ÷ 2，不要反过来再算总头脚。",
        recommendedBlocks: [
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "把计算结果存进 rabbits。"),
          createRecommendedBlock("operator_subtract", "运算", "减", "先算 feet - 2×heads。"),
          createRecommendedBlock("operator_divide", "运算", "除", "再把结果除以 2 得到兔子数。")
        ],
        nextStep: "先写出求兔子数量的公式，再求鸡的数量。",
        detectedIssues: []
      };
    }

    if (!hasChickensVar) {
      return {
        answerText: "你已经能求兔子了。下一步用 chickens = heads - rabbits 求出鸡的数量。",
        recommendedBlocks: [
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "把鸡的数量存进 chickens。"),
          createRecommendedBlock("operator_subtract", "运算", "减", "鸡数 = 头数 - 兔数。"),
          createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "算完后把鸡和兔的数量说出来。")
        ],
        nextStep: "用 heads - rabbits 求出 chickens。",
        detectedIssues: []
      };
    }

    if (!hasSay) {
      return {
        answerText: "鸡和兔的数量已经有了。最后把结果说出来或显示变量，方便检查对不对。",
        recommendedBlocks: [
          createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "例如：鸡23只，兔12只。"),
          createRecommendedBlock("data_showvariable", "变量", "显示变量", "把 chickens 和 rabbits 显示在舞台上。"),
          createRecommendedBlock("operator_add", "运算", "加", "可选：用 2×鸡 + 4×兔 验算脚数。")
        ],
        nextStep: "把鸡和兔的数量说出来，完成这道计算题。",
        detectedIssues: []
      };
    }

    return {
      answerText: "这道鸡兔同笼已经接近完成。检查公式是否为 rabbits=(feet-2×heads)/2，以及 chickens=heads-rabbits。",
      recommendedBlocks: [
        createRecommendedBlock("operator_multiply", "运算", "乘", "验算时可用 2×鸡 或 4×兔。"),
        createRecommendedBlock("operator_add", "运算", "加", "把鸡脚和兔脚加起来对照 feet。"),
        createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "把最终答案清楚说出来。")
      ],
      nextStep: "验算并清楚说出鸡兔数量。",
      detectedIssues: []
    };
  }

  if (isFactorialTask) {
    if (!hasEvent) {
      return {
        answerText: "这是阶乘计算题。先点绿旗开始，再准备 product 和 i，不要退回到求和变量 sum。",
        recommendedBlocks: [
          createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "给阶乘计算脚本一个明确开始时机。"),
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "将 product 设为 1，保存乘积。"),
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "将 i 设为 1，作为当前乘数。")
        ],
        nextStep: "先初始化 product 和 i。",
        detectedIssues: []
      };
    }

    if (!hasLoop) {
      return {
        answerText: "阶乘需要重复乘。下一步用重复执行 5 次，循环里逐步更新 product 和 i。",
        recommendedBlocks: [
          createRecommendedBlock("control_repeat", "控制", "重复执行", "重复执行 5 次，对应 1×2×3×4×5。"),
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "将 product 设为 product * i。"),
          createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "每次循环后将 i 增加 1。")
        ],
        nextStep: "用重复执行 5 次搭出阶乘循环。",
        detectedIssues: []
      };
    }

    if (!hasMultiply) {
      return {
        answerText: "循环已经有了。阶乘的关键是乘法：在循环里将 product 设为 product * i，然后将 i 增加 1。",
        recommendedBlocks: [
          createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "将 product 设为 product * i。"),
          createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "每次循环后将 i 增加 1。"),
          createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "循环结束后说出 product。")
        ],
        nextStep: "在循环里补 product = product * i 和 i 增加 1。",
        detectedIssues: []
      };
    }

    if (!hasSay) {
      return {
        answerText: "阶乘乘法逻辑接近完成。最后说出 product，检查 5 的阶乘是否是 120。",
        recommendedBlocks: [
          createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "循环结束后说出 product。"),
          createRecommendedBlock("data_showvariable", "变量", "显示变量", "把 product 显示在舞台上。")
        ],
        nextStep: "说出 product 的最终结果。",
        detectedIssues: []
      };
    }

    return {
      answerText: "阶乘计算已经接近完成。核对是否重复 5 次，并且每次都是 product = product * i、i 增加 1。",
      recommendedBlocks: [
        createRecommendedBlock("control_repeat", "控制", "重复执行", "确认重复执行 5 次。"),
        createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "清楚说出 product。")
      ],
      nextStep: "核对阶乘循环并说出结果。",
      detectedIssues: []
    };
  }

  // math-sum or math-generic accumulator style
  if (!hasEvent) {
    return {
      answerText: "这是累加计算题。先点绿旗，再设置 n 和 sum，不要先做移动或旋转。",
      recommendedBlocks: [
        createRecommendedBlock("event_whenflagclicked", "事件", "当绿旗被点击", "给计算脚本一个明确开始时机。"),
        createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "先设置 n，并把 sum 设为 0。"),
        createRecommendedBlock("control_repeat", "控制", "重复执行", "后面会重复 n 次做累加。")
      ],
      nextStep: "先启动脚本并准备 n 与 sum。",
      detectedIssues: []
    };
  }

  if (!hasSumVar) {
    return {
      answerText: "先准备累加结果变量 sum，并把它设为 0。",
      recommendedBlocks: [
        createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "把 sum 设为 0。"),
        createRecommendedBlock("data_setvariableto", "变量", "将变量设为", "把 i 设为 1，作为每次加上的数。"),
        createRecommendedBlock("control_repeat", "控制", "重复执行", "准备重复 n 次。")
      ],
      nextStep: "先初始化 sum 和 i。",
      detectedIssues: []
    };
  }

  if (!hasLoop) {
    return {
      answerText: "变量已经有了。下一步用“重复执行 n 次”开始累加，不要改成一直旋转或移动。",
      recommendedBlocks: [
        createRecommendedBlock("control_repeat", "控制", "重复执行", "重复 n 次，把 1 到 n 依次加起来。"),
        createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "每次让 sum 增加 i。"),
        createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "每次让 i 增加 1。")
      ],
      nextStep: "先加上重复执行，再在循环里累加。",
      detectedIssues: []
    };
  }

  if (!hasAdd) {
    return {
      answerText: "循环已经有了。下一步在循环里让 sum 增加 i，再让 i 增加 1。",
      recommendedBlocks: [
        createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "sum 增加 i。"),
        createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "i 增加 1。"),
        createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "算完后把 sum 说出来。")
      ],
      nextStep: "在循环里完成 sum+=i 和 i+=1。",
      detectedIssues: []
    };
  }

  if (!hasSay) {
    return {
      answerText: "累加逻辑接近完成。最后把 sum 说出来或显示出来，确认 1 到 n 的和是否正确。",
      recommendedBlocks: [
        createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "例如：总和是 55。"),
        createRecommendedBlock("data_showvariable", "变量", "显示变量", "把 sum 显示在舞台上。"),
        createRecommendedBlock("operator_add", "运算", "加", "如果需要，可用运算积木核对结果。")
      ],
      nextStep: "把 sum 的结果说出来。",
      detectedIssues: []
    };
  }

  return {
    answerText: "这道累加题已经接近完成。检查是否重复 n 次，并且每次都执行了 sum 增加 i、i 增加 1。",
    recommendedBlocks: [
      createRecommendedBlock("control_repeat", "控制", "重复执行", "确认次数对应 n。"),
      createRecommendedBlock("data_changevariableby", "变量", "将变量增加", "确认 sum 与 i 的更新顺序。"),
      createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "清楚说出最终总和。")
    ],
    nextStep: "核对累加过程并说出结果。",
    detectedIssues: []
  };
}

function buildGenericFallbackCoachResponse(options: GenerateCoachHintOptions): CoachResponse {
  const { snapshot, currentTargetPrograms, programAreaModules, goal } = options;
  const currentTarget = snapshot.currentTarget || "当前角色";
  const currentSprite = getCurrentTargetSprite(snapshot);
  const opcodes = getCurrentTargetOpcodes(snapshot);
  const recommendedBlocks: RecommendedBlock[] = [];
  const detectedIssues: CoachResponse["detectedIssues"] = [];
  let recommendation: RecommendedBlockStructure | undefined;

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
      createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "把事件后面的第一个动作补简单一点，你会更容易马上看到结果。"),
      createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "触发后给一个可见反馈，方便调试。"),
      createRecommendedBlock("event_whenkeypressed", "事件", "当按下某个键", "适合做角色控制或交互触发。")
    );
    recommendation = {
      root: {
        opcode: "event_whenflagclicked",
        category: "事件",
        label: "当绿旗被点击",
        reason: "适合先做统一启动。",
        next: {
          opcode: "motion_movesteps",
          category: "运动",
          label: "移动 10 步",
          reason: "把事件后面的第一个动作补简单一点，你会更容易马上看到结果。",
          next: {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说 2 秒",
            reason: "触发后给一个可见反馈，方便调试。"
          }
        }
      }
    };
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
      createRecommendedBlock("motion_turnright", "运动", "右转 15 度", "放进循环里更容易看出连续效果。"),
      createRecommendedBlock("motion_movesteps", "运动", "移动 10 步", "和循环搭配后，角色会更明显地持续移动。"),
      createRecommendedBlock("control_forever", "控制", "一直重复", "适合持续移动、持续检测或持续绘制。")
    );
    recommendation = {
      root: {
        opcode: "control_repeat",
        category: "控制",
        label: "重复执行",
        reason: "先做固定次数的循环测试。",
        substack: {
          opcode: "motion_turnright",
          category: "运动",
          label: "右转 15 度",
          reason: "放进循环里更容易看出连续效果。",
          next: {
            opcode: "motion_movesteps",
            category: "运动",
            label: "移动 10 步",
            reason: "和循环搭配后，角色会更明显地持续移动。"
          }
        }
      }
    };
    followUpQuestion = "你希望它一直循环，还是只循环几次？";
  } else if (
    hasModule(programAreaModules, "motion") &&
    !hasModule(programAreaModules, "sensing") &&
    !opcodes.includes("motion_ifonedgebounce")
  ) {
    nextStep = "把“碰到边缘就反弹”接进现有循环，让角色不要跑出舞台。";
    answerText = `现在 ${currentTarget} 已经会动了，下一步先补“碰到边缘就反弹”。这样角色会留在舞台里，你也更容易继续观察后面的动作效果。`;
    recommendedBlocks.push(
      createRecommendedBlock("motion_ifonedgebounce", "运动", "碰到边缘就反弹", "先让角色留在舞台里，动作会更稳定。")
    );
    followUpQuestion = "等它不会跑出舞台后，你想再加碰到谁或什么东西时发生变化？";
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
    recommendation = {
      root: {
        opcode: "control_if",
        category: "控制",
        label: "如果...那么",
        reason: "让角色开始区分不同情况。",
        condition: {
          opcode: "operator_equals",
          category: "运算",
          label: "= ",
          reason: "适合配合变量或侦测结果做判断。"
        },
        substack: {
          opcode: "looks_switchcostumeto",
          category: "外观",
          label: "切换造型",
          reason: "判断成立时给一个明显反馈。",
          next: {
            opcode: "data_changevariableby",
            category: "变量",
            label: "将变量增加",
            reason: "如果这一步和得分或次数有关，可以顺手把结果记下来。"
          }
        }
      }
    };
  }

  const visibleRecommendedBlocks = recommendedBlocks.slice(0, MAX_SIMPLE_RECOMMENDED_BLOCKS);
  const trimmedRecommendationRoot = recommendation
    ? trimRecommendedNode(recommendation.root, { count: MAX_SIMPLE_RECOMMENDED_BLOCKS })
    : null;
  recommendation = trimmedRecommendationRoot ? { root: trimmedRecommendationRoot } : buildLinearRecommendation(visibleRecommendedBlocks);

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
  return `${basePrompt}\n\n${TASK_TYPE_GUIDANCE}\n\n${HINT_ONLY_OUTPUT_REQUIREMENTS}\n${RECOMMENDED_OPCODE_WHITELIST_REQUIREMENTS}`;
}

function buildFallbackCoachResponse(options: GenerateCoachHintOptions): CoachResponse {
  const completedSquareResponse = buildCompletedSquareCoachResponse(options);
  if (completedSquareResponse) {
    return completedSquareResponse;
  }

  const intent = detectCoachingTaskIntent(options);
  if (isMathTaskType(intent.taskType)) {
    const mathResponse = buildMathFallbackCoachResponse(options, intent);
    return {
      ...mathResponse,
      recommendedBlocks: mathResponse.recommendedBlocks.slice(0, MAX_RECOMMENDED_BLOCKS),
      recommendation: buildLinearRecommendation(mathResponse.recommendedBlocks.slice(0, MAX_RECOMMENDED_BLOCKS))
    };
  }
  if (intent.taskType === "drawing") {
    const drawingResponse = buildDrawingFallbackCoachResponse(options);
    const visibleRecommendedBlocks = drawingResponse.recommendedBlocks.slice(0, MAX_RECOMMENDED_BLOCKS);
    const recommendation = buildLinearRecommendation(visibleRecommendedBlocks);
    return {
      ...drawingResponse,
      recommendedBlocks: visibleRecommendedBlocks,
      ...(recommendation ? { recommendation } : {})
    };
  }
  return buildGenericFallbackCoachResponse(options);
}

function buildPromptContext(options: GenerateCoachHintOptions) {
  const { snapshot, projectData, currentTargetPrograms, programAreaModules, usedExtensions, loadedExtensions, goal } = options;
  const projectScriptEvidence = buildProjectScriptEvidence(projectData);
  const taskIntent = detectCoachingTaskIntent(options);
  return {
    goal: goal?.trim() || snapshot.goal || "",
    taskType: taskIntent.taskType,
    taskConfidence: taskIntent.confidence,
    taskSignals: taskIntent.signals,
    taskGuidance: taskIntent.guidance,
    snapshotRule: "这是本次请求的最新项目快照；只根据这里实际存在的脚本判断，不沿用旧结论，不根据角色名或题材补全不存在的功能。",
    analysisPriority: "完整阅读舞台和全部角色的全部脚本，逐个核对实际积木后判断整个项目是否完整；完整时说明有脚本证据的用法，不强行推荐新积木。先识别任务类型（数学计算 / 图形绘制 / 游戏动画），数学题禁止任务反转与无关运动漂移，绘图题禁止转成边缘反弹、碰撞或计分。",
    currentTarget: snapshot.currentTarget || "",
    currentTargetPrograms: localizeProgramDescriptions(currentTargetPrograms),
    programAreaModules,
    usedExtensions,
    loadedExtensions,
    detectedConcepts: snapshot.detectedConcepts,
    ...(projectScriptEvidence ? { projectScriptEvidence } : {}),
    sprites: buildProjectSprites(snapshot),
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

const RECOMMENDATION_PARAM_KEY_SET = new Set([
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
  "degrees"
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

function isAvailableRecommendedOpcode(opcode: string, options: GenerateCoachHintOptions) {
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
  options: GenerateCoachHintOptions,
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


function shouldOmitAlreadyUsedRootHat(
  node: RecommendedBlockNode,
  options: GenerateCoachHintOptions
) {
  return (
    NON_REPEATABLE_HAT_OPCODE_SET.has(node.opcode) &&
    getCurrentTargetOpcodes(options.snapshot).includes(node.opcode)
  );
}

function filterRecommendedNode(
  node: RecommendedBlockNode,
  options: GenerateCoachHintOptions
): RecommendedBlockNode | null {
  // Skip disallowed nodes (e.g. motion drift on math tasks) and promote the remaining chain.
  if (!isAvailableRecommendedOpcode(node.opcode, options)) {
    const promotedNext = node.next ? filterRecommendedNode(node.next, options) : null;
    if (promotedNext) {
      return promotedNext;
    }
    const promotedSubstack =
      node.substack && canUseRecommendationRelation(node.opcode, "substack")
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

function appendReasonDetail(reason: string, detail: string) {
  return reason.includes(detail) ? reason : `${reason} ${detail}`;
}

function isSayOpcode(opcode: string) {
  return opcode === "looks_say" || opcode === "looks_sayforsecs";
}

function inferMathSumAccumulatorVariableName(options: GenerateCoachHintOptions) {
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

function isSquareCalculationGoal(options: GenerateCoachHintOptions) {
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

function buildCompletedSquareCoachResponse(options: GenerateCoachHintOptions): CoachResponse | null {
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
  options: GenerateCoachHintOptions,
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

function normalizeCoachResponse(rawPayload: unknown, options: GenerateCoachHintOptions) {
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
        return buildFallbackCoachResponse(options);
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
