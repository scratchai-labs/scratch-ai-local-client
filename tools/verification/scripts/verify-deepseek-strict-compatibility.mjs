import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CoachService } from "../../../apps/desktop-companion/dist/coach-service.js";
import { loadDeepSeekConfig } from "../../../apps/desktop-companion/dist/deepseek-config.js";
import { buildRecommendedStructureXml } from "../../../apps/desktop-companion/dist/scratch-block-xml.js";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const requestedModel = process.argv.find((arg) => arg.startsWith("--model="))?.slice("--model=".length);

async function readSavedConfig() {
  const candidates = [
    path.join(process.env.HOME ?? "", "Library/Application Support/@scratch-ai/desktop-companion/desktop-companion.config.json"),
    path.join(process.env.HOME ?? "", "Library/Application Support/com.scratchai.desktopcompanion/@scratch-ai/desktop-companion/desktop-companion.config.json"),
    path.join(process.env.HOME ?? "", "Library/Application Support/com.scratchai.desktopcompanion/desktop-companion.config.json")
  ];
  for (const configPath of candidates) {
    try {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      if (typeof config.customAiApiKey === "string" && config.customAiApiKey.trim()) {
        return config;
      }
    } catch {
      // Try the next supported desktop config path.
    }
  }
  throw new Error("未找到已保存的 DeepSeek Key，无法执行 Strict 兼容性验证。");
}

function createSnapshot() {
  return {
    currentTarget: "Cat",
    currentTargetId: "strict-probe-cat",
    toolboxCategories: ["事件", "运动", "控制"],
    loadedExtensions: [],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "motion", label: "运动", blockCount: 1 }
    ],
    sprites: [{
      name: "Cat",
      isStage: false,
      blockCount: 2,
      variables: [],
      scripts: [{
        spriteName: "Cat",
        event: "当绿旗被点击",
        blockSequence: ["当绿旗被点击", "移动 10 步"],
        blockOpcodes: ["event_whenflagclicked", "motion_movesteps"]
      }]
    }],
    blocks: [
      {
        id: "strict-probe-hat",
        opcode: "event_whenflagclicked",
        category: "事件",
        label: "当绿旗被点击",
        spriteName: "Cat",
        topLevel: true
      },
      {
        id: "strict-probe-move",
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        spriteName: "Cat",
        topLevel: false
      }
    ],
    globalVariables: [],
    detectedConcepts: ["event", "motion"],
    updatedAt: new Date().toISOString()
  };
}

const savedConfig = await readSavedConfig();
const aiConfig = await loadDeepSeekConfig(
  path.join(workspaceRoot, "apps/desktop-companion/dist/deepseek.config.json"),
  {
    customApiKey: savedConfig.customAiApiKey,
    customModel: requestedModel || savedConfig.customAiModel
  }
);
assert.equal(aiConfig.configured, true, "DeepSeek 配置未生效");

const snapshot = createSnapshot();
const result = await new CoachService().generateHint({
  snapshot,
  currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
  programAreaModules: snapshot.programAreaModules,
  usedExtensions: [],
  loadedExtensions: [],
  goal: "让小猫持续移动并碰到边缘反弹",
  aiConfig
});

assert.equal(result.source, "deepseek", result.warning ?? "Strict 请求没有命中 DeepSeek");
assert.ok(result.coachResponse.recommendation, "Strict 推荐没有返回积木结构");
assert.ok(result.coachResponse.recommendedBlocks.length > 0, "Strict 推荐没有可用积木");
const xml = buildRecommendedStructureXml(result.coachResponse.recommendation);
assert.match(xml, /<block[^>]+type=/, "Strict 推荐无法生成 Blockly XML");

console.log(JSON.stringify({
  pass: true,
  model: result.model,
  opcodes: result.coachResponse.recommendedBlocks.map((block) => block.opcode),
  xmlLength: xml.length
}, null, 2));
