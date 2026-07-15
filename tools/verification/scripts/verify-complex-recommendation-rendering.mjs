/**
 * 复杂目标推荐积木渲染验证：
 * 直接调用真实 DeepSeek + CoachService，把结构化 recommendation 渲染成 Scratch XML，
 * 用更复杂的公式、条件、循环、游戏规则和画笔目标检查显示质量。
 *
 * 用法：
 *   npm run build --workspace=@scratch-ai/desktop-companion
 *   node tools/verification/scripts/verify-complex-recommendation-rendering.mjs
 *   node tools/verification/scripts/verify-complex-recommendation-rendering.mjs --artifact-dir=complex-render-verification-20260715
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CoachService } from "../../../apps/desktop-companion/dist/coach-service.js";
import { loadDeepSeekConfig } from "../../../apps/desktop-companion/dist/deepseek-config.js";
import { buildRecommendedStructureXml } from "../../../apps/desktop-companion/dist/scratch-block-xml.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

const argv = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.split("=");
    return [key, rest.join("=") || "true"];
  })
);

const artifactDir =
  argv.get("--artifact-dir") ??
  path.join(workspaceRoot, `complex-render-verification-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function loadSavedDesktopConfig() {
  const candidates = [
    path.join(
      process.env.HOME ?? "",
      "Library/Application Support/@scratch-ai/desktop-companion/desktop-companion.config.json"
    ),
    path.join(
      process.env.HOME ?? "",
      "Library/Application Support/com.scratchai.desktopcompanion/@scratch-ai/desktop-companion/desktop-companion.config.json"
    ),
    path.join(
      process.env.HOME ?? "",
      "Library/Application Support/com.scratchai.desktopcompanion/desktop-companion.config.json"
    )
  ];

  for (const configPath of candidates) {
    const config = await readJsonIfExists(configPath);
    if (typeof config.customAiApiKey === "string" && config.customAiApiKey.trim()) {
      return { configPath, config };
    }
  }

  return { configPath: candidates[0], config: {} };
}

function createVariable(name, value) {
  return {
    id: name,
    name,
    value,
    isCloud: false
  };
}

function createBlockSummary(id, opcode, category, label, spriteName = "Cat", topLevel = false) {
  return {
    id,
    opcode,
    category,
    label,
    spriteName,
    topLevel
  };
}

function createSprite({ name = "Cat", variables = [], script, blockCount, isStage = false }) {
  return {
    name,
    isStage,
    blockCount: blockCount ?? script.blockOpcodes.length,
    variables,
    scripts: [script]
  };
}

function createSnapshot({
  goal,
  variables,
  script,
  modules,
  blocks,
  sprites,
  currentTarget = "Cat",
  loadedExtensions = []
}) {
  const snapshotSprites = sprites ?? [createSprite({ name: currentTarget, variables, script })];
  return {
    projectId: `complex-render-${Date.now()}`,
    goal,
    currentTarget,
    currentTargetId: `sprite-${currentTarget.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    toolboxCategories: ["事件", "变量", "运算", "控制", "外观", "侦测", "运动", "画笔"],
    loadedExtensions,
    programAreaModules: modules,
    sprites: snapshotSprites,
    blocks,
    globalVariables: variables,
    detectedConcepts: modules.map((module) => module.id),
    updatedAt: new Date().toISOString()
  };
}

function createAverageScenario() {
  const variables = [
    createVariable("score1", 88),
    createVariable("score2", 92),
    createVariable("score3", 95),
    createVariable("average", 0)
  ];
  const script = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 score1 设为 88", "将 score2 设为 92", "将 score3 设为 95", "将 average 设为 0"],
    blockOpcodes: [
      "event_whenflagclicked",
      "data_setvariableto",
      "data_setvariableto",
      "data_setvariableto",
      "data_setvariableto"
    ]
  };

  return {
    id: "average-grade-branch",
    title: "三个成绩平均分 + 等级判断",
    goal:
      "复杂数学目标：score1=88、score2=92、score3=95，先计算 average=(score1+score2+score3)/3；如果 average 大于 90，就说“优秀”，否则说“继续努力”。当前只初始化了变量，下一步请补计算和判断输出。",
    currentTargetPrograms: [script.blockOpcodes.join(" -> ")],
    expected: {
      xmlAnyGroups: [
        ["average"],
        ["operator_divide", "operator_add"],
        ["operator_gt", "looks_say", "looks_sayforsecs"]
      ],
      riskXml: ["<field name=\"VARIABLE\" id=\"variable-分数\"", "<field name=\"NUM\">0</field>"]
    },
    snapshot: createSnapshot({
      goal: "计算三个成绩平均分 average，并根据 average 是否大于 90 输出等级。",
      variables,
      script,
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "data", label: "变量", blockCount: 4 },
        { id: "operator", label: "运算", blockCount: 2 },
        { id: "control", label: "控制", blockCount: 1 },
        { id: "looks", label: "外观", blockCount: 1 }
      ],
      blocks: [
        createBlockSummary("hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("score1", "data_setvariableto", "变量", "将 score1 设为 88"),
        createBlockSummary("score2", "data_setvariableto", "变量", "将 score2 设为 92"),
        createBlockSummary("score3", "data_setvariableto", "变量", "将 score3 设为 95"),
        createBlockSummary("average", "data_setvariableto", "变量", "将 average 设为 0")
      ]
    })
  };
}

function createGuessScenario() {
  const variables = [
    createVariable("secretNumber", 7),
    createVariable("guess", 0),
    createVariable("attempts", 0)
  ];
  const script = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 secretNumber 设为 7", "将 guess 设为 0", "将 attempts 设为 0"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "data_setvariableto"]
  };

  return {
    id: "guess-number-branch",
    title: "猜数字输入 + 条件判断",
    goal:
      "复杂交互目标：做猜数字小游戏。secretNumber 已经设为 7，下一步询问“你猜是多少？”，把回答存到 guess，再判断 guess 是否等于 secretNumber；相等就说“猜对了”。",
    currentTargetPrograms: [script.blockOpcodes.join(" -> ")],
    expected: {
      xmlAnyGroups: [
        ["sensing_askandwait", "QUESTION"],
        ["guess"],
        ["operator_equals", "secretNumber"]
      ],
      riskXml: [
        "<block type=\"data_variable\"><field name=\"VARIABLE\" id=\"variable-answer\"",
        "<block type=\"data_variable\"><field name=\"VARIABLE\" id=\"variable-sensing_answer\"",
        "准备好了吗？"
      ]
    },
    snapshot: createSnapshot({
      goal: "猜数字小游戏：询问答案，保存到 guess，判断 guess 是否等于 secretNumber。",
      variables,
      script,
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "data", label: "变量", blockCount: 3 },
        { id: "sensing", label: "侦测", blockCount: 1 },
        { id: "operator", label: "运算", blockCount: 1 },
        { id: "control", label: "控制", blockCount: 1 },
        { id: "looks", label: "外观", blockCount: 1 }
      ],
      blocks: [
        createBlockSummary("hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("secret", "data_setvariableto", "变量", "将 secretNumber 设为 7"),
        createBlockSummary("guess", "data_setvariableto", "变量", "将 guess 设为 0"),
        createBlockSummary("attempts", "data_setvariableto", "变量", "将 attempts 设为 0")
      ]
    })
  };
}

function createCountdownScenario() {
  const variables = [createVariable("timer", 10)];
  const script = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 timer 设为 10"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto"]
  };

  return {
    id: "countdown-launch",
    title: "10 秒倒计时发射",
    goal:
      "复杂循环目标：做火箭发射倒计时。timer 已经设为 10，下一步重复执行 10 次：说出 timer，然后让 timer 增加 -1；循环结束后说“发射”。",
    currentTargetPrograms: [script.blockOpcodes.join(" -> ")],
    expected: {
      xmlAnyGroups: [
        ["control_repeat", "10"],
        ["timer"],
        ["-1", "looks_say", "looks_sayforsecs"]
      ],
      riskXml: ["<field name=\"NUM\">1</field>", "开始吧"]
    },
    snapshot: createSnapshot({
      goal: "火箭倒计时：重复 10 次说出 timer，并让 timer 每次减少 1，最后说发射。",
      variables,
      script,
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "data", label: "变量", blockCount: 1 },
        { id: "control", label: "控制", blockCount: 1 },
        { id: "looks", label: "外观", blockCount: 1 }
      ],
      blocks: [
        createBlockSummary("hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("timer", "data_setvariableto", "变量", "将 timer 设为 10")
      ]
    })
  };
}

function createAppleScoreScenario() {
  const variables = [createVariable("score", 0)];
  const catScript = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "一直重复", "移动 10 步"],
    blockOpcodes: ["event_whenflagclicked", "control_forever", "motion_movesteps"]
  };
  const appleScript = {
    spriteName: "Apple",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "显示"],
    blockOpcodes: ["event_whenflagclicked", "looks_show"]
  };

  return {
    id: "apple-score-rule",
    title: "接苹果计分规则",
    goal:
      "复杂游戏目标：Cat 已经会一直移动，Apple 已经显示。下一步给 Cat 加规则：如果碰到 Apple，就让 score 增加 1，并说出 score。",
    currentTargetPrograms: [catScript.blockOpcodes.join(" -> ")],
    expected: {
      xmlAnyGroups: [
        ["control_if", "sensing_touchingobject"],
        ["score"],
        ["data_changevariableby", "looks_say", "looks_sayforsecs"]
      ],
      riskXml: ["<field name=\"TOUCHINGOBJECTMENU\">边缘</field>", "<field name=\"VARIABLE\" id=\"variable-分数\""]
    },
    snapshot: createSnapshot({
      goal: "接苹果游戏：Cat 碰到 Apple 时 score 增加 1，并反馈当前分数。",
      variables,
      script: catScript,
      currentTarget: "Cat",
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "motion", label: "运动", blockCount: 1 },
        { id: "control", label: "控制", blockCount: 2 },
        { id: "sensing", label: "侦测", blockCount: 1 },
        { id: "data", label: "变量", blockCount: 1 },
        { id: "looks", label: "外观", blockCount: 1 }
      ],
      sprites: [
        createSprite({ name: "Cat", variables, script: catScript, blockCount: 3 }),
        createSprite({ name: "Apple", variables: [], script: appleScript, blockCount: 2 })
      ],
      blocks: [
        createBlockSummary("cat-hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("cat-forever", "control_forever", "控制", "一直重复", "Cat"),
        createBlockSummary("cat-move", "motion_movesteps", "运动", "移动 10 步", "Cat"),
        createBlockSummary("apple-hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Apple", true),
        createBlockSummary("apple-show", "looks_show", "外观", "显示", "Apple")
      ]
    })
  };
}

function createStarDrawingScenario() {
  const variables = [];
  const script = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "全部擦除", "落笔"],
    blockOpcodes: ["event_whenflagclicked", "pen_clear", "pen_penDown"]
  };

  return {
    id: "draw-five-point-star",
    title: "画五角星",
    goal:
      "复杂画图目标：已经清空画面并落笔。下一步画一个五角星：重复执行 5 次，每次移动 100 步，再右转 144 度，最后抬笔。",
    currentTargetPrograms: [script.blockOpcodes.join(" -> ")],
    expected: {
      xmlAnyGroups: [
        ["control_repeat", "5"],
        ["motion_movesteps", "100"],
        ["motion_turnright", "144"]
      ],
      riskXml: ["motion_ifonedgebounce", "10</field>"]
    },
    snapshot: createSnapshot({
      goal: "画五角星：重复 5 次，移动 100 步，右转 144 度，最后抬笔。",
      variables,
      script,
      loadedExtensions: ["pen"],
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "pen", label: "画笔", blockCount: 2 },
        { id: "control", label: "控制", blockCount: 1 },
        { id: "motion", label: "运动", blockCount: 2 }
      ],
      blocks: [
        createBlockSummary("hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("clear", "pen_clear", "画笔", "全部擦除"),
        createBlockSummary("pendown", "pen_penDown", "画笔", "落笔")
      ]
    })
  };
}

function collectNodes(root) {
  const nodes = [];
  const visit = (node, pathName) => {
    if (!node) return;
    nodes.push({
      path: pathName,
      opcode: node.opcode,
      reason: node.reason,
      params: node.params ?? null
    });
    for (const relation of ["condition", "substack", "substack2", "next"]) {
      visit(node[relation], `${pathName}.${relation}`);
    }
  };
  visit(root, "root");
  return nodes;
}

function groupMatched(xml, group) {
  return group.filter((needle) => xml.includes(needle));
}

function evaluateScenario(scenario, result) {
  const response = result.coachResponse;
  const nodes = response.recommendation ? collectNodes(response.recommendation.root) : [];
  let xml = "";
  let renderError = null;
  try {
    xml = response.recommendation ? buildRecommendedStructureXml(response.recommendation) : "";
  } catch (error) {
    renderError = error?.message ?? String(error);
  }

  const opcodes = nodes.map((node) => node.opcode);
  const expectedGroups = scenario.expected.xmlAnyGroups ?? [];
  const matchedGroups = expectedGroups.map((group) => ({
    expected: group,
    matched: groupMatched(xml, group),
    pass: group.some((needle) => xml.includes(needle))
  }));
  const riskMatches = (scenario.expected.riskXml ?? []).filter((needle) => xml.includes(needle));
  const checks = {
    deepseek: result.source === "deepseek",
    hasRecommendation: Boolean(response.recommendation),
    rendersXml: Boolean(xml) && !renderError,
    hasRelevantRendering: matchedGroups.length === 0 || matchedGroups.every((group) => group.pass),
    noRiskyDefaults: riskMatches.length === 0
  };

  const fail = !checks.deepseek || !checks.hasRecommendation || !checks.rendersXml;
  const warning = !fail && (!checks.hasRelevantRendering || !checks.noRiskyDefaults);
  const quality = fail ? "fail" : warning ? "warning" : "good";

  return {
    id: scenario.id,
    title: scenario.title,
    source: result.source,
    model: result.model,
    warning: result.warning ?? null,
    rawDeepSeekContent: result.rawDeepSeekContent ?? null,
    answerText: response.answerText,
    nextStep: response.nextStep,
    opcodes,
    nodes,
    checks,
    matchedGroups,
    riskMatches,
    renderError,
    xml,
    quality
  };
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const { configPath: savedConfigPath, config: savedConfig } = await loadSavedDesktopConfig();
  assert(
    typeof savedConfig.customAiApiKey === "string" && savedConfig.customAiApiKey.trim(),
    "未找到已保存 DeepSeek Key，无法验证真实模型效果。"
  );

  const aiConfig = await loadDeepSeekConfig(path.join(workspaceRoot, "apps/desktop-companion/dist/deepseek.config.json"), {
    customApiKey: savedConfig.customAiApiKey,
    customModel: savedConfig.customAiModel
  });
  assert(aiConfig.configured, "DeepSeek 配置未生效。");

  let lastDeepSeekContent = null;
  const capturingFetch = async (url, init) => {
    const response = await fetch(url, init);
    const text = await response.text();
    try {
      const payload = JSON.parse(text);
      lastDeepSeekContent = payload?.choices?.[0]?.message?.content ?? null;
    } catch {
      lastDeepSeekContent = text;
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  };

  const service = new CoachService(capturingFetch);
  const scenarios = [
    createAverageScenario(),
    createGuessScenario(),
    createCountdownScenario(),
    createAppleScoreScenario(),
    createStarDrawingScenario()
  ];
  const results = [];

  for (const scenario of scenarios) {
    console.log(`[complex-render] running ${scenario.id}...`);
    lastDeepSeekContent = null;
    const result = await service.generateHint({
      snapshot: scenario.snapshot,
      currentTargetPrograms: scenario.currentTargetPrograms,
      programAreaModules: scenario.snapshot.programAreaModules,
      usedExtensions: scenario.snapshot.loadedExtensions,
      loadedExtensions: scenario.snapshot.loadedExtensions,
      goal: scenario.goal,
      aiConfig
    });
    result.rawDeepSeekContent = lastDeepSeekContent;
    const evaluated = evaluateScenario(scenario, result);
    results.push(evaluated);
    await writeFile(path.join(artifactDir, `${scenario.id}.xml`), evaluated.xml, "utf8");
    if (evaluated.rawDeepSeekContent) {
      await writeFile(path.join(artifactDir, `${scenario.id}.deepseek.json.txt`), evaluated.rawDeepSeekContent, "utf8");
    }
    console.log(
      `[complex-render] ${scenario.id}: source=${evaluated.source} quality=${evaluated.quality} opcodes=${evaluated.opcodes.join(" -> ")} risks=${evaluated.riskMatches.join(",") || "(none)"}`
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    artifactDir,
    savedConfigPath,
    hasApiKey: true,
    model: aiConfig.model,
    pass: results.every((result) => result.quality !== "fail"),
    qualityCounts: results.reduce(
      (counts, result) => {
        counts[result.quality] += 1;
        return counts;
      },
      { good: 0, warning: 0, fail: 0 }
    ),
    results
  };

  await writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  const report = [
    "# 复杂目标推荐积木渲染验证",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- model: ${summary.model}`,
    `- hasApiKey: ${summary.hasApiKey}`,
    `- overall pass: ${summary.pass}`,
    `- quality: good=${summary.qualityCounts.good}, warning=${summary.qualityCounts.warning}, fail=${summary.qualityCounts.fail}`,
    "",
    "## Scenarios",
    ...results.flatMap((result) => [
      "",
      `### ${result.title}`,
      `- quality: ${result.quality}`,
      `- source: ${result.source}`,
      `- warning: ${result.warning ?? "(none)"}`,
      `- render error: ${result.renderError ?? "(none)"}`,
      `- raw DeepSeek saved: ${result.rawDeepSeekContent ? `${result.id}.deepseek.json.txt` : "(none)"}`,
      `- answer: ${result.answerText}`,
      `- opcodes: ${result.opcodes.join(" -> ") || "(none)"}`,
      `- matched groups: ${result.matchedGroups
        .map((group) => `[${group.matched.join(", ") || "(none)"}]`)
        .join(" / ") || "(none)"}`,
      `- risk defaults: ${result.riskMatches.join(", ") || "(none)"}`
    ])
  ].join("\n");
  await writeFile(path.join(artifactDir, "REPORT.md"), report, "utf8");
  console.log(`[complex-render] report: ${path.join(artifactDir, "REPORT.md")}`);

  if (!summary.pass) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await mkdir(artifactDir, { recursive: true }).catch(() => {});
  await writeFile(
    path.join(artifactDir, "failure.json"),
    JSON.stringify({ message: error?.message ?? String(error), stack: error?.stack ?? "" }, null, 2),
    "utf8"
  ).catch(() => {});
  console.error(`[complex-render] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
