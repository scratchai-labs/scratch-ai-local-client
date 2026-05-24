import path from "node:path";

import { generateTeachingDraftFromSb3 } from "./sb3-teaching-draft.mjs";

function parseArgs(argv) {
  const options = new Map();
  for (const item of argv.slice(2)) {
    if (!item.startsWith("--")) {
      continue;
    }

    const [key, rawValue] = item.split("=");
    options.set(key, rawValue ?? "true");
  }
  return options;
}

function getFlag(options, key) {
  return options.get(key) === "true";
}

function getModels(options) {
  return {
    plan: options.get("--plan-model") || "deepseek-v4-pro",
    role: options.get("--role-model") || "deepseek-v4-flash",
    hint: options.get("--hint-model") || "deepseek-v4-flash",
    debug: options.get("--debug-model") || "deepseek-v4-pro"
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const sb3Path = options.get("--sb3");
  if (!sb3Path) {
    throw new Error("Missing required argument: --sb3=\"C:\\path\\to\\project.sb3\"");
  }

  const outputDir =
    options.get("--output-dir") ||
    path.join(process.cwd(), "tools/verification", "generated", path.parse(sb3Path).name);
  const runWorkflow = getFlag(options, "--run-workflow");
  const workflowOutputDir = options.get("--workflow-output-dir") || path.join(outputDir, "workflow-output");

  const result = await generateTeachingDraftFromSb3({
    sb3Path,
    outputDir,
    currentTargetName: options.get("--current-target"),
    runWorkflow,
    workflowConfig: {
      cwd: process.cwd(),
      workflowDir: path.join(process.cwd(), "tools", "verification", "workflows", "deepseek-teaching"),
      promptsDir: path.join(
        process.cwd(),
        "tools",
        "verification",
        "workflows",
        "deepseek-teaching",
        "prompts"
      ),
      outputDir: workflowOutputDir,
      models: getModels(options),
      repairAttempts: Number(options.get("--repair-attempts") || "1")
    }
  });

  console.log(
    JSON.stringify(
      {
        outputDir: result.outputDir,
        summaryPath: result.summaryPath,
        briefDraftPath: result.briefDraftPath,
        readmePath: result.readmePath,
        workflowOutputDir: result.workflowOutputDir,
        workflowGenerated: Boolean(result.workflowResult)
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
