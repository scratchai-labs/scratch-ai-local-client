import path from "node:path";

import { validateBrief } from "./core.mjs";
import { ensureDir, loadPromptTemplates, readJson, writeJson, writeText } from "./file-system.mjs";
import { loadApiKey, runValidatedStage } from "./deepseek-client.mjs";
import { buildPlanStage, buildRoleStages, buildHintsStage, buildDebugStage } from "./stages.mjs";
import { buildSummary, buildResultManifest } from "./reporting.mjs";

async function executeStage({ stage, templates, apiKey, models, outputDir, renderedPromptsDir, repairAttempts }) {
  const userPrompt = stage.renderUserPrompt();
  const systemPrompt = templates[stage.templateKey.system];

  await writeText(path.join(renderedPromptsDir, `${stage.id}.user.txt`), userPrompt);

  const result = await runValidatedStage({
    apiKey,
    model: models[stage.modelKey],
    systemPrompt,
    userPrompt,
    maxTokens: stage.maxTokens,
    validate: stage.validate,
    stageName: stage.stageName,
    repairAttempts
  });

  await writeJson(path.join(outputDir, stage.outputName), result.parsed);
  return result;
}

export async function runTeachingWorkflow(config) {
  await ensureDir(config.outputDir);
  const renderedPromptsDir = path.join(config.outputDir, "rendered-prompts");
  await ensureDir(renderedPromptsDir);

  const brief = await readJson(config.briefPath);
  const briefValidation = validateBrief(brief);
  if (!briefValidation.ok) {
    throw new Error(`Brief validation failed: ${briefValidation.errors.join("; ")}`);
  }

  const apiKey = await loadApiKey(config.cwd);
  const templates = await loadPromptTemplates(config.promptsDir);
  await writeJson(path.join(config.outputDir, "00-brief.json"), brief);

  const planStage = buildPlanStage({ brief, templates });
  const plan = await executeStage({
    stage: planStage,
    templates,
    apiKey,
    models: config.models,
    outputDir: config.outputDir,
    renderedPromptsDir,
    repairAttempts: config.repairAttempts
  });

  const roleStages = buildRoleStages({ brief, plan: plan.parsed, templates });
  const rolePacks = [];
  for (const stage of roleStages) {
    rolePacks.push(
      await executeStage({
        stage,
        templates,
        apiKey,
        models: config.models,
        outputDir: config.outputDir,
        renderedPromptsDir,
        repairAttempts: config.repairAttempts
      })
    );
  }

  const hintsStage = buildHintsStage({
    brief,
    plan: plan.parsed,
    rolePacks: rolePacks.map((item) => item.parsed),
    templates
  });
  const hints = await executeStage({
    stage: hintsStage,
    templates,
    apiKey,
    models: config.models,
    outputDir: config.outputDir,
    renderedPromptsDir,
    repairAttempts: config.repairAttempts
  });

  const debugStage = buildDebugStage({
    brief,
    plan: plan.parsed,
    rolePacks: rolePacks.map((item) => item.parsed),
    hints: hints.parsed,
    templates
  });
  const debugPack = await executeStage({
    stage: debugStage,
    templates,
    apiKey,
    models: config.models,
    outputDir: config.outputDir,
    renderedPromptsDir,
    repairAttempts: config.repairAttempts
  });

  await writeText(
    path.join(config.outputDir, "SUMMARY.md"),
    buildSummary({
      brief,
      models: config.models,
      plan,
      rolePacks,
      hints,
      debugPack
    })
  );

  return buildResultManifest({
    outputDir: config.outputDir,
    briefPath: config.briefPath,
    models: config.models,
    plan,
    rolePacks,
    hints,
    debugPack
  });
}
