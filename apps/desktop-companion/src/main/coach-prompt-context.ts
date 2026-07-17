import { getDisplayLabelForOpcode } from "@scratch-ai/shared";

import type { ProgramAreaModule, ProjectSnapshot, SpriteSnapshot } from "../common/types";
import type { CoachingTaskIntent } from "./coaching-task-intent";
import { buildProjectScriptEvidence } from "./project-script-evidence";

export interface CoachPromptContextOptions {
  snapshot: ProjectSnapshot;
  projectData?: unknown;
  currentTargetPrograms: string[];
  programAreaModules: ProgramAreaModule[];
  usedExtensions: string[];
  loadedExtensions: string[];
  goal?: string;
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

export function buildCoachPromptContext(
  options: CoachPromptContextOptions,
  taskIntent: CoachingTaskIntent
) {
  const {
    snapshot,
    projectData,
    currentTargetPrograms,
    programAreaModules,
    usedExtensions,
    loadedExtensions,
    goal
  } = options;
  const projectScriptEvidence = buildProjectScriptEvidence(projectData);

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
