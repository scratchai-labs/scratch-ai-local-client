import { renderTemplate, validatePlan, validateRolePack, validateHintsPack, validateDebugPack } from "./core.mjs";

export function buildPlanStage({ brief, templates }) {
  return {
    id: "plan",
    stageName: "规划阶段",
    templateKey: {
      system: "01-plan.system.txt",
      user: "01-plan.user.txt"
    },
    modelKey: "plan",
    maxTokens: 2400,
    renderUserPrompt() {
      return renderTemplate(templates[this.templateKey.user], {
        briefJson: JSON.stringify(brief, null, 2)
      });
    },
    validate(parsed) {
      return validatePlan(parsed, brief);
    },
    outputName: "01-plan.json"
  };
}

export function buildRoleStages({ brief, plan, templates }) {
  return brief.roles.map((role) => ({
    id: `role-${role.name}`,
    stageName: `角色阶段:${role.name}`,
    templateKey: {
      system: "02-role-script.system.txt",
      user: "02-role-script.user.txt"
    },
    modelKey: "role",
    maxTokens: 2200,
    roleName: role.name,
    renderUserPrompt() {
      return renderTemplate(templates[this.templateKey.user], {
        briefJson: JSON.stringify(brief, null, 2),
        planJson: JSON.stringify(plan, null, 2),
        roleJson: JSON.stringify(role, null, 2)
      });
    },
    validate(parsed) {
      return validateRolePack(parsed, role);
    },
    outputName: `02-role-${role.name}.json`
  }));
}

export function buildHintsStage({ brief, plan, rolePacks, templates }) {
  return {
    id: "student-hints",
    stageName: "学生提示阶段",
    templateKey: {
      system: "03-student-hints.system.txt",
      user: "03-student-hints.user.txt"
    },
    modelKey: "hint",
    maxTokens: 2600,
    renderUserPrompt() {
      return renderTemplate(templates[this.templateKey.user], {
        briefJson: JSON.stringify(brief, null, 2),
        planJson: JSON.stringify(plan, null, 2),
        rolePacksJson: JSON.stringify(rolePacks, null, 2)
      });
    },
    validate(parsed) {
      return validateHintsPack(parsed, brief, plan);
    },
    outputName: "03-student-hints.json"
  };
}

export function buildDebugStage({ brief, plan, rolePacks, hints, templates }) {
  return {
    id: "debug-pack",
    stageName: "课堂排错阶段",
    templateKey: {
      system: "04-debug.system.txt",
      user: "04-debug.user.txt"
    },
    modelKey: "debug",
    maxTokens: 2400,
    renderUserPrompt() {
      return renderTemplate(templates[this.templateKey.user], {
        briefJson: JSON.stringify(brief, null, 2),
        planJson: JSON.stringify(plan, null, 2),
        rolePacksJson: JSON.stringify(rolePacks, null, 2),
        hintsJson: JSON.stringify(hints, null, 2)
      });
    },
    validate(parsed) {
      return validateDebugPack(parsed, brief);
    },
    outputName: "04-debug-pack.json"
  };
}
