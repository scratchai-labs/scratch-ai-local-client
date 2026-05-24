export function markdownJson(title, content) {
  return [`## ${title}`, "", "```json", content, "```", ""].join("\n");
}

export function buildSummary({ brief, models, plan, rolePacks, hints, debugPack }) {
  const lines = [
    "# DeepSeek Scratch 教学工作流输出",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    `- 规划模型：${models.plan}`,
    `- 角色模型：${models.role}`,
    `- 提示模型：${models.hint}`,
    `- 排错模型：${models.debug}`,
    "",
    `- 游戏题目：${brief.title}`,
    `- 学生水平：${brief.studentLevel}`,
    `- 角色数：${brief.roles.length}`,
    ""
  ];

  lines.push(markdownJson("规划", plan.content));
  for (const rolePack of rolePacks) {
    lines.push(markdownJson(`角色：${rolePack.parsed.name}`, rolePack.content));
  }
  lines.push(markdownJson("学生提示包", hints.content));
  lines.push(markdownJson("课堂排错包", debugPack.content));

  return lines.join("\n");
}

export function buildResultManifest({ outputDir, briefPath, models, plan, rolePacks, hints, debugPack }) {
  return {
    outputDir,
    briefPath,
    models,
    validations: {
      plan: plan.validation,
      roles: Object.fromEntries(rolePacks.map((item) => [item.parsed.name, item.validation])),
      hints: hints.validation,
      debug: debugPack.validation
    }
  };
}
