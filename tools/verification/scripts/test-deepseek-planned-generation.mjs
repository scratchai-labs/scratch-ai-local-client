import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const workspaceDir = process.cwd();
const desktopDir = path.join(os.homedir(), "Desktop");
const reportPath = path.join(desktopDir, "DeepSeek-Scratch-分阶段测试报告.md");
const rawOutputPath = path.join(desktopDir, "DeepSeek-Scratch-分阶段测试结果.json");

const expected = {
  title: "小猫接苹果",
  pitch: "控制小猫左右移动，接苹果得分，碰幽灵掉生命，先到 10 分获胜。",
  variables: ["分数", "生命"],
  broadcasts: ["开始", "胜利", "失败"],
  roles: ["舞台", "猫", "苹果", "幽灵", "提示牌"]
};

const roleRequirements = {
  舞台: {
    minScripts: 1,
    groups: [
      ["分数"],
      ["生命"],
      ["广播 开始"],
      ["广播 胜利", "当接收到 胜利"],
      ["广播 失败", "当接收到 失败"],
      ["停止全部", "停止 全部"]
    ]
  },
  猫: {
    minScripts: 2,
    groups: [
      ["左方向键", "左箭头键"],
      ["右方向键", "右箭头键"],
      ["x 改变", "将x坐标增加", "x坐标增加"],
      ["碰到边缘就反弹", "设为-240", "设为240"]
    ]
  },
  苹果: {
    minScripts: 2,
    groups: [
      ["当绿旗被点击"],
      ["隐藏"],
      ["分数"],
      ["碰到 猫", "碰到“猫”", "碰到猫"],
      ["重置", "删除此克隆体"]
    ]
  },
  幽灵: {
    minScripts: 2,
    groups: [
      ["当绿旗被点击"],
      ["隐藏"],
      ["生命"],
      ["碰到 猫", "碰到“猫”", "碰到猫"],
      ["重置", "删除此克隆体"]
    ]
  },
  提示牌: {
    minScripts: 3,
    groups: [["隐藏"], ["胜利"], ["失败"], ["显示"]]
  }
};

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
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;

  return withoutFence;
}

function normalizeLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function requestJson(apiKey, model, messages, maxTokens = 1800) {
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
      max_tokens: maxTokens,
      temperature: 0.1,
      messages
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

function validateExactArray(actual, expectedValue) {
  if (!Array.isArray(actual) || actual.length !== expectedValue.length) {
    return false;
  }
  return actual.every((item, index) => item === expectedValue[index]);
}

function validatePlan(plan) {
  const errors = [];

  if (plan.title !== expected.title) {
    errors.push(`title mismatch: ${JSON.stringify(plan.title)}`);
  }
  if (plan.pitch !== expected.pitch) {
    errors.push(`pitch mismatch: ${JSON.stringify(plan.pitch)}`);
  }
  if (!validateExactArray(plan.variables, expected.variables)) {
    errors.push(`variables mismatch: ${JSON.stringify(plan.variables)}`);
  }
  if (!validateExactArray(plan.broadcasts, expected.broadcasts)) {
    errors.push(`broadcasts mismatch: ${JSON.stringify(plan.broadcasts)}`);
  }

  const roleNames = Array.isArray(plan.roles) ? plan.roles.map((item) => item?.name) : null;
  if (!validateExactArray(roleNames, expected.roles)) {
    errors.push(`roles mismatch: ${JSON.stringify(roleNames)}`);
  }

  if (!Array.isArray(plan.roles)) {
    errors.push("roles is not an array");
  } else {
    for (const role of plan.roles) {
      if (!role || typeof role !== "object") {
        errors.push("role entry is not an object");
        continue;
      }
      if (!Array.isArray(role.scriptGoals) || role.scriptGoals.length === 0) {
        errors.push(`role ${role.name ?? "unknown"} has no scriptGoals`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function flattenRoleText(result) {
  const scriptTexts = Array.isArray(result.scripts)
    ? result.scripts.flatMap((script) => [
        normalizeLine(String(script.trigger ?? "")),
        ...(Array.isArray(script.steps) ? script.steps.map((step) => normalizeLine(String(step))) : [])
      ])
    : [];
  return scriptTexts.join(" | ");
}

function validateRole(roleName, result) {
  const errors = [];
  const requirement = roleRequirements[roleName];

  if (result.name !== roleName) {
    errors.push(`name mismatch: ${JSON.stringify(result.name)}`);
  }
  if (!Array.isArray(result.scripts)) {
    errors.push("scripts is not an array");
    return { ok: false, errors };
  }
  if (result.scripts.length < requirement.minScripts) {
    errors.push(`scripts count too small: ${result.scripts.length}`);
  }

  for (const [index, script] of result.scripts.entries()) {
    if (!script || typeof script !== "object") {
      errors.push(`script ${index + 1} is not an object`);
      continue;
    }
    if (typeof script.trigger !== "string" || !script.trigger.trim()) {
      errors.push(`script ${index + 1} has empty trigger`);
    }
    if (!Array.isArray(script.steps) || script.steps.length === 0) {
      errors.push(`script ${index + 1} has no steps`);
    }
  }

  const combined = flattenRoleText(result);
  for (const group of requirement.groups) {
    if (!group.some((keyword) => combined.includes(keyword))) {
      errors.push(`missing keyword group: ${group.join(" / ")}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function planMessages() {
  return [
    {
      role: "system",
      content: [
        "You are a Scratch 3.0 planning assistant.",
        "Return strict JSON only.",
        "Do not invent a new game.",
        "Keep all fixed fields exactly as provided.",
        "Only produce a planning document for later per-role generation."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "请为一个后续要分角色生成的 Scratch 3.0 小游戏做前期规划。",
        "固定游戏信息如下，必须原样保留：",
        JSON.stringify(
          {
            title: expected.title,
            pitch: expected.pitch,
            variables: expected.variables,
            broadcasts: expected.broadcasts,
            roles: expected.roles
          },
          null,
          2
        ),
        "请输出严格 JSON，字段只能包含 title,pitch,variables,broadcasts,roles,assemblyNotes。",
        "roles 必须是 5 个对象组成的数组，顺序固定为 舞台,猫,苹果,幽灵,提示牌。",
        "每个 roles 元素字段只能包含 name,responsibility,scriptGoals。",
        "scriptGoals 必须是字符串数组，用来指导后续单角色生成。"
      ].join("\n")
    }
  ];
}

function roleMessages(plan, roleName) {
  const role = plan.roles.find((item) => item.name === roleName);
  const assemblyNotes = Array.isArray(plan.assemblyNotes) ? plan.assemblyNotes : [];
  const hardConstraints = {
    舞台: [
      "至少包含一个初始化脚本：分数=0，生命=3，广播 开始。",
      "还要明确胜利和失败结束流程，且出现 停止全部。"
    ],
    猫: [
      "必须包含绿旗初始化脚本。",
      "必须包含开始后左右移动逻辑。",
      "必须体现左箭头/右箭头和 x 坐标变化，或边界限制。"
    ],
    苹果: [
      "必须包含绿旗被点击后隐藏的脚本。",
      "必须体现顶部出现、下落、碰到猫后加分、到底或碰到后重置/删除。"
    ],
    幽灵: [
      "必须包含绿旗被点击后隐藏的脚本。",
      "必须体现顶部出现、下落、碰到猫后减生命、到底或碰到后重置/删除。"
    ],
    提示牌: [
      "必须包含绿旗初始化隐藏或展示提示。",
      "必须单独处理 胜利 和 失败 两种展示。"
    ]
  };

  return [
    {
      role: "system",
      content: [
        "You are a Scratch 3.0 per-role script assistant.",
        "Return strict JSON only.",
        "Do not change the role name.",
        "Do not generate any other role.",
        "Use only built-in Scratch 3.0 blocks."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `现在只生成一个角色：${roleName}`,
        "完整游戏规划如下：",
        JSON.stringify(
          {
            title: plan.title,
            pitch: plan.pitch,
            variables: plan.variables,
            broadcasts: plan.broadcasts,
            role,
            assemblyNotes
          },
          null,
          2
        ),
        "当前角色必须遵守这些硬约束：",
        ...hardConstraints[roleName].map((item) => `- ${item}`),
        "请输出严格 JSON，字段只能包含 name,scripts。",
        "name 必须等于当前角色名。",
        "scripts 必须是数组；每个元素字段只能包含 trigger,steps。",
        "trigger 必须是中文。",
        "steps 必须是一维中文字符串数组，每一步都是可映射到 Scratch 积木的简短动作。",
        "不要输出别的角色，不要输出说明文字。"
      ].join("\n")
    }
  ];
}

function markdownCodeBlock(text) {
  return ["```json", text, "```"].join("\n");
}

function buildReport(results) {
  const lines = [
    "# DeepSeek Scratch 分阶段测试报告",
    "",
    `测试时间：${new Date().toISOString()}`,
    ""
  ];

  for (const run of results) {
    lines.push(`## ${run.model}`);
    lines.push("");
    lines.push(`- 规划阶段：${run.planValidation.ok ? "通过" : "失败"}`);
    if (!run.planValidation.ok) {
      for (const error of run.planValidation.errors) {
        lines.push(`- 规划错误：${error}`);
      }
    }

    for (const role of expected.roles) {
      const roleRun = run.roles[role];
      lines.push(`- ${role}：${roleRun.validation.ok ? "通过" : "失败"}`);
      if (!roleRun.validation.ok) {
        for (const error of roleRun.validation.errors) {
          lines.push(`- ${role} 错误：${error}`);
        }
      }
    }

    lines.push("");
    lines.push("### 规划输出");
    lines.push("");
    lines.push(markdownCodeBlock(run.plan.content));
    lines.push("");

    for (const role of expected.roles) {
      lines.push(`### ${role} 输出`);
      lines.push("");
      lines.push(markdownCodeBlock(run.roles[role].content));
      lines.push("");
    }
  }

  lines.push("## 结论");
  lines.push("");
  lines.push("- 这次测试只验证“先规划、后分角色生成”的提示词流水线是否更稳。");
  lines.push("- 如果规划阶段通过、且多数角色阶段通过，说明这种拆分方式比一次性生成完整 Scratch 工程更可靠。");
  lines.push("- 如果某个角色失败，优先继续细分到“一个角色的一段脚本”再生成。");

  return lines.join("\n");
}

async function runModel(apiKey, model) {
  const plan = await requestJson(apiKey, model, planMessages(), 1400);
  const planValidation = validatePlan(plan.parsed);

  const roleResults = {};
  for (const roleName of expected.roles) {
    const roleOutput = await requestJson(apiKey, model, roleMessages(plan.parsed, roleName), 1400);
    roleResults[roleName] = {
      ...roleOutput,
      validation: validateRole(roleName, roleOutput.parsed)
    };
  }

  return {
    model,
    plan,
    planValidation,
    roles: roleResults
  };
}

async function main() {
  const apiKey = await loadApiKey();
  const models = ["deepseek-v4-flash", "deepseek-v4-pro"];
  const results = [];

  for (const model of models) {
    results.push(await runModel(apiKey, model));
  }

  const report = buildReport(results);
  const serializable = results.map((run) => ({
    model: run.model,
    planValidation: run.planValidation,
    plan: {
      content: run.plan.content,
      parsed: run.plan.parsed
    },
    roles: Object.fromEntries(
      Object.entries(run.roles).map(([roleName, value]) => [
        roleName,
        {
          validation: value.validation,
          content: value.content,
          parsed: value.parsed
        }
      ])
    )
  }));

  await fs.writeFile(reportPath, report, "utf8");
  await fs.writeFile(rawOutputPath, JSON.stringify(serializable, null, 2), "utf8");

  const summary = {
    reportPath,
    rawOutputPath,
    results: serializable.map((run) => ({
      model: run.model,
      planOk: run.planValidation.ok,
      roles: Object.fromEntries(
        Object.entries(run.roles).map(([roleName, value]) => [roleName, value.validation.ok])
      )
    }))
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
