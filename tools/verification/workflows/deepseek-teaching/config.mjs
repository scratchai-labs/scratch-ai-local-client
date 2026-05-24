import path from "node:path";

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

export function parseWorkflowArgs(argv) {
  const options = new Map();
  for (const item of argv.slice(2)) {
    if (!item.startsWith("--")) {
      continue;
    }
    const [key, value = ""] = item.split("=");
    options.set(key, value);
  }
  return options;
}

export function getDefaultWorkflowOutputDir(cwd = process.cwd()) {
  return path.join(
    cwd,
    "tools",
    "verification",
    "generated",
    `DeepSeek-Scratch-教学工作流-${timestampString()}`
  );
}

export function createWorkflowConfig(argv, cwd = process.cwd()) {
  const args = parseWorkflowArgs(argv);
  const workflowDir = path.join(cwd, "tools", "verification", "workflows", "deepseek-teaching");
  const promptsDir = path.join(workflowDir, "prompts");

  return {
    cwd,
    workflowDir,
    promptsDir,
    briefPath:
      args.get("--brief") ||
      path.join(cwd, "tools", "verification", "fixtures", "deepseek-workflow-brief.example.json"),
    outputDir:
      args.get("--output-dir") ||
      getDefaultWorkflowOutputDir(cwd),
    models: {
      plan: args.get("--plan-model") || "deepseek-v4-pro",
      role: args.get("--role-model") || "deepseek-v4-flash",
      hint: args.get("--hint-model") || "deepseek-v4-flash",
      debug: args.get("--debug-model") || "deepseek-v4-pro"
    },
    repairAttempts: Number(args.get("--repair-attempts") || "1")
  };
}
