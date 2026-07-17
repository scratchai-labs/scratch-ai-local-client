import type { ProgramAreaModule, ProjectSnapshot } from "../common/types";

export interface CoachingTaskIntentOptions {
  snapshot: ProjectSnapshot;
  currentTargetPrograms: string[];
  programAreaModules: ProgramAreaModule[];
  goal?: string;
}

export function hasModule(programAreaModules: ProgramAreaModule[], moduleId: string) {
  return programAreaModules.some((module) => module.id === moduleId);
}

export type CoachingTaskType = "math-chicken-rabbit" | "math-sum" | "math-generic" | "drawing" | "game-or-animation" | "unknown";

export interface CoachingTaskIntent {
  taskType: CoachingTaskType;
  confidence: "high" | "medium" | "low";
  signals: string[];
  variableNames: string[];
  guidance: string;
}

export function collectProjectVariableNames(snapshot: ProjectSnapshot) {
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

export function normalizeIntentText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function detectCoachingTaskIntent(options: CoachingTaskIntentOptions): CoachingTaskIntent {
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

export function isMathTaskType(taskType: CoachingTaskType) {
  return taskType === "math-chicken-rabbit" || taskType === "math-sum" || taskType === "math-generic";
}
