/**
 * 推荐积木 params 协议专项验证：
 * 直接调用真实 DeepSeek + CoachService，检查模型是否按新协议返回 params，
 * 并确认客户端能把 params 渲染成具体 Scratch XML，而不是仅靠中文 reason 推断。
 *
 * 用法：
 *   npm run build --workspace=@scratch-ai/desktop-companion
 *   node tools/verification/scripts/verify-recommendation-params-protocol.mjs
 *   node tools/verification/scripts/verify-recommendation-params-protocol.mjs --strict=false
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

const strict = argv.get("--strict") !== "false";
const artifactDir =
  argv.get("--artifact-dir") ??
  path.join(workspaceRoot, `protocol-params-verification-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`);

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

function createBaseSnapshot({ goal, variables, script, blocks, modules }) {
  return {
    projectId: `protocol-${Date.now()}`,
    goal,
    currentTarget: "Cat",
    currentTargetId: "sprite-cat",
    toolboxCategories: ["事件", "变量", "运算", "控制", "外观", "侦测"],
    loadedExtensions: [],
    programAreaModules: modules,
    sprites: [
      {
        name: "Cat",
        isStage: false,
        blockCount: script.blockOpcodes.length,
        variables,
        scripts: [script]
      }
    ],
    blocks,
    globalVariables: variables,
    detectedConcepts: modules.map((module) => module.id),
    updatedAt: new Date().toISOString()
  };
}

function createChickenRabbitScenario() {
  const variables = [
    createVariable("heads", 35),
    createVariable("feet", 94),
    createVariable("rabbits", 0),
    createVariable("chickens", 0)
  ];
  const script = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 heads 设为 35", "将 feet 设为 94", "将 rabbits 设为 0"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "data_setvariableto"]
  };

  return {
    id: "chicken-rabbit-formula",
    title: "鸡兔同笼公式",
    goal: "鸡兔同笼：已知 heads=35、feet=94，下一步求 rabbits=(feet-2*heads)/2，再求 chickens 并说出结果。",
    expected: {
      params: ["variable", "value"],
      xml: ["operator_divide", "operator_subtract", "operator_multiply", "rabbits", "heads", "feet"],
      disallowedOpcodes: ["motion_movesteps", "motion_turnright", "motion_ifonedgebounce"]
    },
    currentTargetPrograms: [script.blockOpcodes.join(" -> ")],
    snapshot: createBaseSnapshot({
      goal: "鸡兔同笼：已知 heads=35、feet=94，求 rabbits 和 chickens。",
      variables,
      script,
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "data", label: "变量", blockCount: 3 },
        { id: "operator", label: "运算", blockCount: 1 }
      ],
      blocks: [
        createBlockSummary("hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("heads", "data_setvariableto", "变量", "将 heads 设为 35"),
        createBlockSummary("feet", "data_setvariableto", "变量", "将 feet 设为 94"),
        createBlockSummary("rabbits", "data_setvariableto", "变量", "将 rabbits 设为 0")
      ]
    })
  };
}

function createSumScenario() {
  const variables = [
    createVariable("n", 100),
    createVariable("sum", 0),
    createVariable("i", 1)
  ];
  const script = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 n 设为 100", "将 sum 设为 0", "将 i 设为 1"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "data_setvariableto"]
  };

  return {
    id: "sum-1-to-100",
    title: "1 到 100 求和",
    goal: "用重复执行求 1 到 100 的和：重复 100 次，在循环里 sum 增加 i、i 增加 1，最后说出 sum。",
    expected: {
      params: ["repeatTimes", "variable", "changeBy"],
      xmlAny: ["100", "sum", "i"],
      disallowedOpcodes: ["motion_movesteps", "motion_turnright", "motion_ifonedgebounce", "sensing_askandwait"]
    },
    currentTargetPrograms: [script.blockOpcodes.join(" -> ")],
    snapshot: createBaseSnapshot({
      goal: "1 到 100 求和，使用 sum 和 i 累加并说出 sum。",
      variables,
      script,
      modules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "data", label: "变量", blockCount: 3 },
        { id: "control", label: "控制", blockCount: 1 },
        { id: "operator", label: "运算", blockCount: 1 }
      ],
      blocks: [
        createBlockSummary("hat", "event_whenflagclicked", "事件", "当绿旗被点击", "Cat", true),
        createBlockSummary("n", "data_setvariableto", "变量", "将 n 设为 100"),
        createBlockSummary("sum", "data_setvariableto", "变量", "将 sum 设为 0"),
        createBlockSummary("i", "data_setvariableto", "变量", "将 i 设为 1")
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

function evaluateScenario(scenario, result) {
  const response = result.coachResponse;
  const nodes = response.recommendation ? collectNodes(response.recommendation.root) : [];
  const xml = response.recommendation ? buildRecommendedStructureXml(response.recommendation) : "";
  const opcodes = nodes.map((node) => node.opcode);
  const paramKeys = new Set(nodes.flatMap((node) => Object.keys(node.params ?? {})));
  const disallowedOpcodes = scenario.expected.disallowedOpcodes.filter((opcode) => opcodes.includes(opcode));
  const expectedParams = scenario.expected.params ?? [];
  const matchedParams = expectedParams.filter((key) => paramKeys.has(key));
  const expectedXml = scenario.expected.xml ?? [];
  const expectedXmlAny = scenario.expected.xmlAny ?? [];
  const matchedXml = expectedXml.filter((needle) => xml.includes(needle));
  const matchedXmlAny = expectedXmlAny.filter((needle) => xml.includes(needle));

  const checks = {
    deepseek: result.source === "deepseek",
    hasRecommendation: Boolean(response.recommendation),
    hasParams: matchedParams.length > 0,
    hasExpectedParams: expectedParams.length === 0 || matchedParams.length > 0,
    noDisallowedOpcodes: disallowedOpcodes.length === 0,
    xmlContainsExpected:
      expectedXml.length > 0
        ? matchedXml.length === expectedXml.length
        : expectedXmlAny.length === 0 || matchedXmlAny.length > 0
  };

  const pass = Object.values(checks).every(Boolean);

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
    expectedParams,
    matchedParams,
    disallowedOpcodes,
    expectedXml,
    matchedXml,
    expectedXmlAny,
    matchedXmlAny,
    xml,
    pass
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
  const scenarios = [createChickenRabbitScenario(), createSumScenario()];
  const results = [];

  for (const scenario of scenarios) {
    console.log(`[protocol-params] running ${scenario.id}...`);
    lastDeepSeekContent = null;
    const result = await service.generateHint({
      snapshot: scenario.snapshot,
      currentTargetPrograms: scenario.currentTargetPrograms,
      programAreaModules: scenario.snapshot.programAreaModules,
      usedExtensions: [],
      loadedExtensions: [],
      goal: scenario.goal,
      aiConfig
    });
    result.rawDeepSeekContent = lastDeepSeekContent;
    const evaluated = evaluateScenario(scenario, result);
    results.push(evaluated);
    await writeFile(path.join(artifactDir, `${scenario.id}.xml`), evaluated.xml, "utf8");
    if (evaluated.rawDeepSeekContent) {
      await writeFile(
        path.join(artifactDir, `${scenario.id}.deepseek.json.txt`),
        evaluated.rawDeepSeekContent,
        "utf8"
      );
    }
    console.log(
      `[protocol-params] ${scenario.id}: source=${evaluated.source} pass=${evaluated.pass} params=${evaluated.matchedParams.join(",") || "(none)"} opcodes=${evaluated.opcodes.join(" -> ")}`
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    artifactDir,
    strict,
    savedConfigPath,
    hasApiKey: true,
    model: aiConfig.model,
    pass: results.every((result) => result.pass),
    paramsAdoption: {
      scenarios: results.length,
      withParams: results.filter((result) => result.checks.hasParams).length
    },
    results
  };

  await writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  const report = [
    "# 推荐积木 params 协议专项验证",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- model: ${summary.model}`,
    `- hasApiKey: ${summary.hasApiKey}`,
    `- strict: ${summary.strict}`,
    `- overall pass: ${summary.pass}`,
    `- params adoption: ${summary.paramsAdoption.withParams}/${summary.paramsAdoption.scenarios}`,
    "",
    "## Scenarios",
    ...results.flatMap((result) => [
      "",
      `### ${result.title}`,
      `- source: ${result.source}`,
      `- warning: ${result.warning ?? "(none)"}`,
      `- raw DeepSeek saved: ${result.rawDeepSeekContent ? `${result.id}.deepseek.json.txt` : "(none)"}`,
      `- pass: ${result.pass}`,
      `- answer: ${result.answerText}`,
      `- opcodes: ${result.opcodes.join(" -> ") || "(none)"}`,
      `- matched params: ${result.matchedParams.join(", ") || "(none)"}`,
      `- disallowed opcodes: ${result.disallowedOpcodes.join(", ") || "(none)"}`,
      `- xml matches: ${(result.matchedXml.length ? result.matchedXml : result.matchedXmlAny).join(", ") || "(none)"}`
    ])
  ].join("\n");
  await writeFile(path.join(artifactDir, "REPORT.md"), report, "utf8");
  console.log(`[protocol-params] report: ${path.join(artifactDir, "REPORT.md")}`);

  if (strict && !summary.pass) {
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
  console.error(`[protocol-params] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
