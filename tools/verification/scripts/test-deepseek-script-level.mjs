import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const workspaceDir = process.cwd();
const desktopDir = path.join(os.homedir(), "Desktop");
const reportPath = path.join(desktopDir, "DeepSeek-Scratch-脚本级测试报告.md");
const rawOutputPath = path.join(desktopDir, "DeepSeek-Scratch-脚本级测试结果.json");

const scriptCases = [
  {
    id: "cat-move",
    role: "猫",
    objective: "只生成开始后的左右移动脚本",
    expectedTrigger: "当接收到 开始",
    keywordGroups: [
      ["左箭头", "左方向键"],
      ["右箭头", "右方向键"],
      ["将x坐标增加", "x 改变"],
      ["设为 -220", "设为-220", "设为 220", "设为220", "碰到边缘就反弹"]
    ],
    prompt: [
      "现在只生成 猫 角色的一段 Scratch 3.0 脚本。",
      "只返回严格 JSON，字段只能包含 trigger,steps。",
      "trigger 必须是 当接收到 开始。",
      "steps 必须是一维中文字符串数组。",
      "脚本要求：显示；移到 x:0 y:-150；重复执行；左箭头时 x 减少 10；右箭头时 x 增加 10；不能跑出左右边界。"
    ].join("\n")
  },
  {
    id: "ghost-clone",
    role: "幽灵",
    objective: "只生成克隆体下落脚本",
    expectedTrigger: "当作为克隆体启动时",
    keywordGroups: [
      ["显示"],
      ["随机", "在 -200 到 200 间随机选一个数"],
      ["将y坐标增加 -5", "将 y 坐标增加 -5"],
      ["碰到 猫", "碰到“猫”", "碰到猫", "碰到 小猫"],
      ["删除此克隆体", "重置"]
    ],
    prompt: [
      "现在只生成 幽灵 角色的一段 Scratch 3.0 脚本。",
      "只返回严格 JSON，字段只能包含 trigger,steps。",
      "trigger 必须是 当作为克隆体启动时。",
      "steps 必须是一维中文字符串数组。",
      "脚本要求：显示；出现在顶部随机 x 位置，y=180；向下移动；碰到猫则生命减1并删除；掉到底部也删除。"
    ].join("\n")
  }
];

function extractApiKey(envText) {
  const keyMatch = envText.match(/^OPENAI_API_KEY=(.+)$/m);
  if (!keyMatch) {
    throw new Error("OPENAI_API_KEY not found in .env.example");
  }
  return keyMatch[1].trim();
}

async function loadApiKey() {
  const envText = await fs.readFile(path.join(workspaceDir, ".env.example"), "utf8");
  return extractApiKey(envText);
}

function parseAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek did not return text content.");
  }
  const trimmed = content.trim();
  return trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;
}

async function requestJson(apiKey, model, prompt) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: 900,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "You are a Scratch 3.0 script assistant. Return strict JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status} ${responseText.slice(0, 400)}`);
  }

  const payload = JSON.parse(responseText);
  const content = parseAssistantContent(payload);
  return {
    raw: payload,
    content,
    parsed: JSON.parse(content)
  };
}

function validateScriptCase(testCase, parsed) {
  const errors = [];
  if (parsed.trigger !== testCase.expectedTrigger) {
    errors.push(`trigger mismatch: ${JSON.stringify(parsed.trigger)}`);
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    errors.push("steps is empty");
    return {
      ok: false,
      errors
    };
  }

  const combined = parsed.steps.join(" | ");
  for (const group of testCase.keywordGroups) {
    if (!group.some((keyword) => combined.includes(keyword))) {
      errors.push(`missing keyword group: ${group.join(" / ")}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function buildReport(results) {
  const lines = [
    "# DeepSeek Scratch 脚本级测试报告",
    "",
    `测试时间：${new Date().toISOString()}`,
    ""
  ];

  for (const run of results) {
    lines.push(`## ${run.model}`);
    lines.push("");
    for (const item of run.items) {
      lines.push(`- ${item.id}：${item.validation.ok ? "通过" : "失败"}`);
      if (!item.validation.ok) {
        for (const error of item.validation.errors) {
          lines.push(`- 错误：${error}`);
        }
      }
      lines.push("");
      lines.push("```json");
      lines.push(item.content);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## 结论");
  lines.push("");
  lines.push("- 如果脚本级测试通过，说明 DeepSeek 更适合作为“单段 Scratch 脚本生成器”。");
  lines.push("- 如果角色级测试失败、脚本级测试通过，那么后续流水线应采用：先规划，再按角色拆，再按脚本拆。");

  return lines.join("\n");
}

async function runModel(apiKey, model) {
  const items = [];
  for (const testCase of scriptCases) {
    const output = await requestJson(apiKey, model, testCase.prompt);
    items.push({
      id: testCase.id,
      role: testCase.role,
      objective: testCase.objective,
      content: output.content,
      parsed: output.parsed,
      validation: validateScriptCase(testCase, output.parsed)
    });
  }

  return {
    model,
    items
  };
}

async function main() {
  const apiKey = await loadApiKey();
  const models = ["deepseek-v4-flash", "deepseek-v4-pro"];
  const results = [];

  for (const model of models) {
    results.push(await runModel(apiKey, model));
  }

  await fs.writeFile(reportPath, buildReport(results), "utf8");
  await fs.writeFile(rawOutputPath, JSON.stringify(results, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        reportPath,
        rawOutputPath,
        results: results.map((run) => ({
          model: run.model,
          items: Object.fromEntries(run.items.map((item) => [item.id, item.validation.ok]))
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
