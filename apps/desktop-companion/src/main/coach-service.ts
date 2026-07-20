import {
  coachResponseSchema,
  projectSnapshotSchema
} from "@scratch-ai/shared";
import { MAX_RECOMMENDED_BLOCKS, MAX_SIMPLE_RECOMMENDED_BLOCKS } from "../common/recommended-blocks";

import type { LoadedDeepSeekConfig } from "./deepseek-config";
import { buildCoachPromptContext } from "./coach-prompt-context";
import {
  collectProjectVariableNames,
  detectCoachingTaskIntent,
  hasModule,
  isMathTaskType,
  normalizeIntentText,
  type CoachingTaskIntent,
  type CoachingTaskType
} from "./coaching-task-intent";
import {
  buildDeepSeekCoachPrompts,
  requestDeepSeekCoachCandidate
} from "./deepseek-coach-client";
export { DEFAULT_HINT_ONLY_SYSTEM_PROMPT } from "./deepseek-coach-client";
import {
  buildKnownVariableGoalFallbackResponse,
  shouldReplaceKnownVariableGoalRecommendation
} from "./known-variable-goal-fallback";
import {
  buildCompletedSquareCoachResponse,
  buildLinearRecommendation,
  normalizeCoachRecommendation,
  trimRecommendationStructure
} from "./recommendation-normalizer";
import type { CoachingContinuityContext } from "./variable-continuity";
import type {
  CoachResponse,
  ProgramAreaModule,
  ProjectSnapshot,
  RecommendedBlock,
  RecommendedBlockStructure
} from "../common/types";

const DEFAULT_FALLBACK_MODEL = "local-heuristic";
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
  continuityContext?: CoachingContinuityContext;
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
  example?: string,
  params?: RecommendedBlock["params"]
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
  if (params) {
    block.params = params;
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

function describeModules(programAreaModules: ProgramAreaModule[]) {
  if (programAreaModules.length === 0) {
    return "还没读取到当前角色的模块使用情况";
  }

  return programAreaModules
    .slice(0, 5)
    .map((module) => `${module.label}×${module.blockCount}`)
    .join("、");
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
          createRecommendedBlock(
            "data_setvariableto",
            "变量",
            "将 rabbits 设为",
            "把 (feet - 2 × heads) ÷ 2 的计算结果存进 rabbits。",
            undefined,
            { variable: "rabbits", value: "(feet - 2 * heads) / 2" }
          )
        ],
        nextStep: "先写出求兔子数量的公式，再求鸡的数量。",
        detectedIssues: []
      };
    }

    if (!hasChickensVar) {
      return {
        answerText: "你已经能求兔子了。下一步用 chickens = heads - rabbits 求出鸡的数量。",
        recommendedBlocks: [
          createRecommendedBlock(
            "data_setvariableto",
            "变量",
            "将 chickens 设为",
            "把 heads - rabbits 的计算结果存进 chickens。",
            undefined,
            { variable: "chickens", value: "heads - rabbits" }
          ),
          createRecommendedBlock("looks_sayforsecs", "外观", "说 2 秒", "算完后把 chickens 和 rabbits 的数量说出来。")
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
  recommendation = recommendation
    ? trimRecommendationStructure(recommendation, MAX_SIMPLE_RECOMMENDED_BLOCKS)
    : buildLinearRecommendation(visibleRecommendedBlocks);

  return {
    answerText,
    ...(recommendation ? { recommendation } : {}),
    recommendedBlocks: visibleRecommendedBlocks,
    nextStep,
    detectedIssues,
    ...(followUpQuestion ? { followUpQuestion } : {})
  };
}

function buildFallbackCoachResponse(options: GenerateCoachHintOptions): CoachResponse {
  const knownVariableGoalContext = {
    goal: options.goal,
    snapshotGoal: options.snapshot.goal,
    variableNames: collectProjectVariableNames(options.snapshot)
  };
  const knownVariableGoalResponse = buildKnownVariableGoalFallbackResponse(knownVariableGoalContext);
  if (knownVariableGoalResponse) {
    return knownVariableGoalResponse;
  }

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
    const taskIntent = detectCoachingTaskIntent(options);
    const promptContext = buildCoachPromptContext(options, taskIntent);
    const prompts = buildDeepSeekCoachPrompts({
      customSystemPrompt: options.customSystemPrompt,
      promptContext
    });
    const strictCandidate = await requestDeepSeekCoachCandidate({
      fetchImpl: this.fetchImpl,
      config: options.aiConfig,
      ...prompts
    });
    const normalizedJson = normalizeCoachRecommendation(strictCandidate, {
      snapshot: options.snapshot,
      currentTargetPrograms: options.currentTargetPrograms,
      programAreaModules: options.programAreaModules,
      loadedExtensions: options.loadedExtensions,
      goal: options.goal,
      continuityContext: options.continuityContext,
      buildFallbackResponse: () => buildFallbackCoachResponse(options)
    });
    return coachResponseSchema.parse(normalizedJson) as CoachResponse;
  }
}
