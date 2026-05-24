import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  getUsedExtensionsFromProject,
  projectJsonToSnapshot,
  summarizeProgramAreaModulesFromProject
} from "@scratch-ai/shared";
import { validateBrief } from "../workflows/deepseek-teaching/core.mjs";
import { ensureDir, writeJson, writeText } from "../workflows/deepseek-teaching/file-system.mjs";

const require = createRequire(import.meta.url);
const yauzl = require("yauzl");

const OPERATION_LABELS = {
  event_whenflagclicked: "当绿旗被点击",
  event_whenbroadcastreceived: "当收到广播",
  event_broadcast: "广播消息",
  control_forever: "一直重复",
  control_repeat: "重复执行",
  control_if: "如果",
  control_if_else: "如果否则",
  control_wait_until: "等待直到条件成立",
  control_wait: "等待",
  motion_gotoxy: "移到指定位置",
  motion_pointtowards: "面向目标",
  motion_movesteps: "移动几步",
  motion_changexby: "改变 x 坐标",
  motion_changeyby: "改变 y 坐标",
  motion_ifonedgebounce: "碰到边缘就反弹",
  looks_show: "显示",
  looks_hide: "隐藏",
  looks_switchcostumeto: "切换造型",
  looks_nextcostume: "下一个造型",
  looks_setsizeto: "设置大小",
  looks_gotofrontback: "移到前面或后面",
  sound_playuntildone: "播放声音直到播完",
  sound_play: "播放声音",
  sensing_touchingobject: "碰到对象判断",
  sensing_keypressed: "按键判断",
  operator_random: "随机数",
  operator_equals: "比较是否相等",
  operator_gt: "比较是否大于",
  operator_lt: "比较是否小于",
  data_setvariableto: "变量设值",
  data_changevariableby: "变量增减",
  procedures_definition: "定义自制积木",
  procedures_call: "调用自制积木"
};

const MODULE_TEACH_POINTS = {
  motion: "角色移动与定位",
  looks: "显示、隐藏和造型切换",
  sound: "声音反馈",
  event: "绿旗触发和广播",
  control: "循环与条件判断",
  sensing: "碰撞、按键或鼠标侦测",
  operator: "数字比较和随机数",
  data: "变量初始化和变化",
  procedures: "自制积木封装重复动作",
  colour: "颜色相关积木",
  math: "数学运算"
};

function timestampString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

function defaultOutputDir() {
  return path.join(os.homedir(), "Desktop", `Scratch-教学草稿-${timestampString()}`);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(normalizeString).filter(Boolean)));
}

function crossPlatformBaseName(filePath) {
  const normalized = normalizeString(filePath).replace(/\\/g, "/");
  return normalized ? path.posix.basename(normalized) : "";
}

function toComparableTitle(fileName) {
  return normalizeString(path.parse(fileName).name) || "Scratch 项目";
}

function textHumanScore(value) {
  const text = normalizeString(value);
  if (!text) {
    return -100;
  }

  let score = 0;
  for (const char of text) {
    if (/[\p{Script=Han}\p{Letter}\p{Number}]/u.test(char)) {
      score += 2;
      continue;
    }
    if (char === " " || char === "-" || char === "_") {
      score += 0.5;
      continue;
    }
    score -= 1;
  }

  if (text.length > 40) {
    score -= 2;
  }
  return score;
}

function looksLikeScratchId(value) {
  const text = normalizeString(value);
  if (!text) {
    return false;
  }

  if (/^(broadcast|var_|list_|proc_)/i.test(text)) {
    return true;
  }

  const punctuationCount = (text.match(/[^\p{Letter}\p{Number}\s_-]/gu) ?? []).length;
  const digitCount = (text.match(/\d/g) ?? []).length;
  const mixedCase = /[a-z]/.test(text) && /[A-Z]/.test(text);

  return text.length >= 12 && (punctuationCount > 0 || digitCount >= 2 || mixedCase);
}

function chooseReadableName(key, value) {
  const keyText = normalizeString(key);
  const valueText = normalizeString(value);
  if (/^broadcast/i.test(keyText) && valueText) {
    return valueText;
  }
  if (/^broadcast/i.test(valueText) && keyText) {
    return keyText;
  }
  if (looksLikeScratchId(keyText) && !looksLikeScratchId(valueText)) {
    return valueText;
  }
  if (looksLikeScratchId(valueText) && !looksLikeScratchId(keyText)) {
    return keyText;
  }
  return textHumanScore(valueText) >= textHumanScore(keyText) ? valueText : keyText;
}

function extractBroadcastNames(project) {
  const names = [];
  for (const target of project?.targets ?? []) {
    for (const [key, value] of Object.entries(target?.broadcasts ?? {})) {
      const candidate = chooseReadableName(key, value);
      if (candidate) {
        names.push(candidate);
      }
    }
  }
  return uniqueStrings(names);
}

function extractVariableNames(project) {
  const names = [];
  for (const target of project?.targets ?? []) {
    for (const entry of Object.values(target?.variables ?? {})) {
      if (Array.isArray(entry) && entry[0]) {
        names.push(String(entry[0]));
      }
    }
  }
  return uniqueStrings(names);
}

function humanizeOpcode(opcode) {
  return OPERATION_LABELS[opcode] ?? opcode;
}

function describeScript(script, index) {
  const trigger = humanizeOpcode(script.event);
  const actionLabels = script.blockSequence
    .slice(1, 4)
    .map(humanizeOpcode)
    .filter(Boolean);

  if (actionLabels.length === 0) {
    return `脚本 ${index + 1}：${trigger}`;
  }

  return `脚本 ${index + 1}：${trigger} -> ${actionLabels.join(" -> ")}`;
}

function inferResponsibility(targetSummary) {
  const moduleIds = targetSummary.modules.map((item) => item.id);
  const name = targetSummary.name;

  if (targetSummary.isStage) {
    if (moduleIds.includes("sound")) {
      return "负责舞台层的背景音乐或整体氛围。";
    }
    return "负责舞台层的初始化、提示或整体规则。";
  }

  if (moduleIds.includes("motion") && moduleIds.includes("sensing") && moduleIds.includes("data")) {
    return `负责 ${name} 的移动、互动和规则变化。`;
  }
  if (moduleIds.includes("motion") && moduleIds.includes("sensing")) {
    return `负责 ${name} 的移动和互动。`;
  }
  if (moduleIds.includes("looks") && targetSummary.scriptCount >= 2) {
    return `负责 ${name} 的显示反馈或结果提示。`;
  }
  if (moduleIds.includes("sound")) {
    return `负责 ${name} 的声音或节奏反馈。`;
  }

  const moduleLabels = targetSummary.modules.map((item) => item.label);
  if (moduleLabels.length > 0) {
    return `负责 ${name} 的${moduleLabels.join("、")}相关逻辑。`;
  }

  return `负责 ${name} 的主要功能。`;
}

function inferMustTeach(targetSummary) {
  const teachPoints = targetSummary.modules
    .map((item) => MODULE_TEACH_POINTS[item.id] ?? `${item.label}相关积木`)
    .slice(0, 4);

  if (targetSummary.scriptCount > 1 && !teachPoints.includes("把功能拆成多条脚本")) {
    teachPoints.push("把功能拆成多条脚本");
  }

  return uniqueStrings(teachPoints.length > 0 ? teachPoints : ["先确认这个角色需要哪些积木"]);
}

function inferRequiredScripts(targetSummary) {
  const scripts = targetSummary.topLevelScripts.slice(0, 4).map((script, index) => describeScript(script, index));
  if (scripts.length > 0) {
    return scripts;
  }
  return [`请老师补充：${targetSummary.name} 至少需要一条核心脚本`];
}

function inferLearningGoals(summary) {
  const goals = [];

  if (summary.targetSummaries.filter((item) => !item.isStage).length > 1) {
    goals.push("理解一个 Scratch 项目可以拆成多个角色分工完成");
  }

  for (const concept of summary.detectedConcepts.slice(0, 5)) {
    goals.push(`理解“${concept}”在当前项目里的作用`);
  }

  if (summary.broadcasts.length > 0) {
    goals.push("理解广播怎样把不同角色连接成完整流程");
  }

  if (summary.variables.length > 0) {
    goals.push("理解变量怎样记录项目状态");
  }

  return uniqueStrings(goals.length > 0 ? goals : ["请老师补充：这节课最想让学生学会什么"]);
}

function inferWinCondition(summary) {
  const candidate = summary.broadcasts.find((name) => /win|胜利|过关|通关/i.test(name));
  if (candidate) {
    return `请老师确认：满足获胜条件时广播 ${candidate}`;
  }
  return "请老师补充：项目的获胜条件是什么";
}

function inferLoseCondition(summary) {
  const candidate = summary.broadcasts.find((name) => /lose|失败|game over|结束/i.test(name));
  if (candidate) {
    return `请老师确认：满足失败条件时广播 ${candidate}`;
  }
  return "请老师补充：项目的失败条件是什么";
}

function buildConstraintList(summary) {
  const constraints = [
    "当前 brief 为脚本自动生成的草稿，进入教学工作流前请老师逐项复核。",
    "保留当前项目里的角色名、变量名和广播名，除非老师明确决定改名。"
  ];

  if (summary.usedExtensions.length === 0) {
    constraints.push("当前项目没有识别到扩展，可优先按内置积木教学。");
  } else {
    constraints.push(`当前项目使用扩展：${summary.usedExtensions.join("、")}。请老师确认课堂环境可用。`);
  }

  constraints.push("提示应以引导和追问为主，不直接替学生写完整答案。");
  return constraints;
}

function buildTeacherNotes(summary) {
  const notes = [
    "先让学生说出每个角色分别负责什么，再开始搭积木。",
    "优先先做最小可运行版本，再逐步补完整规则。",
    "学生卡住时，先判断他缺的是触发、循环、判断、变量还是广播。"
  ];

  if (summary.broadcasts.length > 0) {
    notes.push(`当前项目已有广播：${summary.broadcasts.join("、")}。要重点检查学生有没有改错名字。`);
  }

  if (summary.variables.length > 0) {
    notes.push(`当前项目已有变量：${summary.variables.join("、")}。要重点检查变量初始化放在哪里。`);
  }

  return notes;
}

function sortTargetsForDraft(targetSummaries) {
  const sprites = targetSummaries.filter((item) => !item.isStage);
  const stages = targetSummaries.filter((item) => item.isStage);
  return [...sprites, ...stages];
}

export function buildProjectSummary(project, options = {}) {
  const sourceFilePath = normalizeString(options.sourceFilePath);
  const sourceFileName = crossPlatformBaseName(sourceFilePath);
  const title = toComparableTitle(sourceFileName || options.title || "");
  const firstSprite = (project?.targets ?? []).find((target) => target?.isStage === false);
  const snapshot = projectJsonToSnapshot(project, {
    currentTargetName: normalizeString(options.currentTargetName) || normalizeString(firstSprite?.name)
  });

  const targetSummaries = snapshot.sprites.map((sprite) => ({
    name: sprite.name,
    isStage: sprite.isStage,
    blockCount: sprite.blockCount,
    scriptCount: sprite.scripts.length,
    variableNames: sprite.variables.map((item) => item.name),
    modules: summarizeProgramAreaModulesFromProject(project, { name: sprite.name }),
    topLevelScripts: sprite.scripts.map((script) => ({
      event: script.event,
      blockSequence: script.blockSequence
    }))
  }));

  return {
    title,
    sourceFilePath,
    sourceFileName,
    suggestedCurrentTarget: snapshot.currentTarget,
    targetCount: Array.isArray(project?.targets) ? project.targets.length : 0,
    spriteCount: targetSummaries.filter((item) => !item.isStage).length,
    stageCount: targetSummaries.filter((item) => item.isStage).length,
    monitorCount: Array.isArray(project?.monitors) ? project.monitors.length : 0,
    variables: extractVariableNames(project),
    broadcasts: extractBroadcastNames(project),
    usedExtensions: getUsedExtensionsFromProject(project),
    detectedConcepts: snapshot.detectedConcepts,
    targetSummaries: sortTargetsForDraft(targetSummaries)
  };
}

export function buildBriefDraftFromSummary(summary) {
  const brief = {
    title: summary.title,
    pitch:
      `请老师补充：当前项目包含角色 ${summary.targetSummaries.map((item) => item.name).join("、")}。` +
      "请用一句话写清楚学生要完成的核心玩法。",
    studentLevel: "请老师补充：适用的学生年级或 Scratch 水平",
    winCondition: inferWinCondition(summary),
    loseCondition: inferLoseCondition(summary),
    variables: summary.variables.length > 0 ? summary.variables : ["请老师确认：这个项目是否需要变量"],
    broadcasts: summary.broadcasts.length > 0 ? summary.broadcasts : ["请老师确认：这个项目是否需要广播"],
    learningGoals: inferLearningGoals(summary),
    constraints: buildConstraintList(summary),
    teacherNotes: buildTeacherNotes(summary),
    roles: summary.targetSummaries.map((item) => ({
      name: item.name,
      responsibility: inferResponsibility(item),
      requiredScripts: inferRequiredScripts(item),
      mustTeach: inferMustTeach(item)
    }))
  };

  const validation = validateBrief(brief);
  if (!validation.ok) {
    throw new Error(`Generated brief draft is invalid: ${validation.errors.join("; ")}`);
  }

  return brief;
}

export async function readSb3Project(sb3Path) {
  return await new Promise((resolve, reject) => {
    yauzl.open(sb3Path, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (entry.fileName !== "project.json") {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          let jsonText = "";
          stream.setEncoding("utf8");
          stream.on("data", (chunk) => {
            jsonText += chunk;
          });
          stream.on("end", () => {
            zipFile.close();
            resolve(JSON.parse(jsonText));
          });
          stream.on("error", reject);
        });
      });

      zipFile.on("end", () => {
        reject(new Error("project.json not found in sb3 archive"));
      });
      zipFile.on("error", reject);
    });
  });
}

function buildReadme({ outputDir, summary, runWorkflow, workflowOutputDir }) {
  const lines = [
    "# Scratch 教学草稿",
    "",
    `源文件：${summary.sourceFilePath || "未记录"}`,
    "",
    "已生成文件：",
    "- `project-summary.json`",
    "- `brief-draft.json`",
    "",
    "建议下一步：",
    "1. 先人工修改 `brief-draft.json`，补齐题目、学生层级、胜负条件和教学目标。",
    "2. 确认角色名、变量名、广播名是否保留。",
    "3. 再把这个 brief 交给 `run-deepseek-teaching-workflow.mjs`。"
  ];

  if (runWorkflow) {
    lines.push(
      "",
      `本次已经继续尝试运行教学工作流，输出目录：${workflowOutputDir}`
    );
  } else {
    const briefPath = path.join(outputDir, "brief-draft.json");
    lines.push(
      "",
      "手动运行示例：",
      "```powershell",
      `node tools/verification\\scripts\\run-deepseek-teaching-workflow.mjs --brief=\"${briefPath}\"`,
      "```"
    );
  }

  return lines.join("\n");
}

export async function generateTeachingDraftFromSb3({
  sb3Path,
  outputDir = defaultOutputDir(),
  currentTargetName,
  runWorkflow = false,
  workflowConfig
}) {
  const absoluteSb3Path = path.resolve(sb3Path);
  await fs.access(absoluteSb3Path);

  const project = await readSb3Project(absoluteSb3Path);
  const summary = buildProjectSummary(project, {
    sourceFilePath: absoluteSb3Path,
    currentTargetName
  });
  const briefDraft = buildBriefDraftFromSummary(summary);

  await ensureDir(outputDir);
  await writeJson(path.join(outputDir, "project-summary.json"), summary);
  await writeJson(path.join(outputDir, "brief-draft.json"), briefDraft);

  let workflowResult = null;
  let workflowOutputDir = null;

  if (runWorkflow) {
    const { runTeachingWorkflow } = await import("../workflows/deepseek-teaching/workflow.mjs");
    workflowOutputDir = workflowConfig.outputDir;
    workflowResult = await runTeachingWorkflow({
      ...workflowConfig,
      briefPath: path.join(outputDir, "brief-draft.json")
    });
  }

  await writeText(
    path.join(outputDir, "README.md"),
    buildReadme({
      outputDir,
      summary,
      runWorkflow,
      workflowOutputDir
    })
  );

  return {
    outputDir,
    summaryPath: path.join(outputDir, "project-summary.json"),
    briefDraftPath: path.join(outputDir, "brief-draft.json"),
    readmePath: path.join(outputDir, "README.md"),
    summary,
    briefDraft,
    workflowOutputDir,
    workflowResult
  };
}
