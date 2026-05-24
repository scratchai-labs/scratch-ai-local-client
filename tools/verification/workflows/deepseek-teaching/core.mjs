export function renderTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return String(variables[key]);
  });
}

export function stripJsonFence(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;
}

export function exactArrayEquals(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

export function validateBrief(brief) {
  const errors = [];

  for (const key of ["title", "pitch", "winCondition", "loseCondition", "studentLevel"]) {
    if (typeof brief?.[key] !== "string" || !brief[key].trim()) {
      errors.push(`brief.${key} must be a non-empty string`);
    }
  }

  for (const key of ["variables", "broadcasts", "learningGoals", "constraints", "teacherNotes"]) {
    if (!Array.isArray(brief?.[key]) || brief[key].length === 0) {
      errors.push(`brief.${key} must be a non-empty array`);
    }
  }

  if (!Array.isArray(brief?.roles) || brief.roles.length === 0) {
    errors.push("brief.roles must be a non-empty array");
  } else {
    for (const [index, role] of brief.roles.entries()) {
      if (typeof role?.name !== "string" || !role.name.trim()) {
        errors.push(`brief.roles[${index}].name must be a non-empty string`);
      }
      if (typeof role?.responsibility !== "string" || !role.responsibility.trim()) {
        errors.push(`brief.roles[${index}].responsibility must be a non-empty string`);
      }
      if (!Array.isArray(role?.requiredScripts) || role.requiredScripts.length === 0) {
        errors.push(`brief.roles[${index}].requiredScripts must be a non-empty array`);
      }
      if (!Array.isArray(role?.mustTeach) || role.mustTeach.length === 0) {
        errors.push(`brief.roles[${index}].mustTeach must be a non-empty array`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validatePlan(plan, brief) {
  const errors = [];
  const expectedRoleNames = brief.roles.map((role) => role.name);

  if (plan.title !== brief.title) {
    errors.push(`title mismatch: ${JSON.stringify(plan.title)}`);
  }
  if (plan.pitch !== brief.pitch) {
    errors.push(`pitch mismatch: ${JSON.stringify(plan.pitch)}`);
  }
  if (plan.winCondition !== brief.winCondition) {
    errors.push(`winCondition mismatch: ${JSON.stringify(plan.winCondition)}`);
  }
  if (plan.loseCondition !== brief.loseCondition) {
    errors.push(`loseCondition mismatch: ${JSON.stringify(plan.loseCondition)}`);
  }
  if (!exactArrayEquals(plan.variables, brief.variables)) {
    errors.push(`variables mismatch: ${JSON.stringify(plan.variables)}`);
  }
  if (!exactArrayEquals(plan.broadcasts, brief.broadcasts)) {
    errors.push(`broadcasts mismatch: ${JSON.stringify(plan.broadcasts)}`);
  }

  const roleNames = Array.isArray(plan.roles) ? plan.roles.map((role) => role?.name) : null;
  if (!exactArrayEquals(roleNames, expectedRoleNames)) {
    errors.push(`roles mismatch: ${JSON.stringify(roleNames)}`);
  }

  if (!exactArrayEquals(plan.roleBuildOrder, expectedRoleNames)) {
    errors.push(`roleBuildOrder mismatch: ${JSON.stringify(plan.roleBuildOrder)}`);
  }

  if (!Array.isArray(plan.milestones) || plan.milestones.length === 0) {
    errors.push("milestones must be a non-empty array");
  } else {
    for (const [index, item] of plan.milestones.entries()) {
      for (const key of ["id", "title", "studentOutcome", "teacherCheck"]) {
        if (typeof item?.[key] !== "string" || !item[key].trim()) {
          errors.push(`milestones[${index}].${key} must be a non-empty string`);
        }
      }
    }
  }

  if (!Array.isArray(plan.roleContracts) || plan.roleContracts.length !== expectedRoleNames.length) {
    errors.push("roleContracts must match the role count");
  } else {
    const contractNames = plan.roleContracts.map((item) => item?.name);
    if (!exactArrayEquals(contractNames, expectedRoleNames)) {
      errors.push(`roleContracts names mismatch: ${JSON.stringify(contractNames)}`);
    }
    for (const [index, item] of plan.roleContracts.entries()) {
      if (!Array.isArray(item?.mustHaveScripts) || item.mustHaveScripts.length === 0) {
        errors.push(`roleContracts[${index}].mustHaveScripts must be a non-empty array`);
      }
      if (!Array.isArray(item?.mustAvoid) || item.mustAvoid.length === 0) {
        errors.push(`roleContracts[${index}].mustAvoid must be a non-empty array`);
      }
    }
  }

  if (!Array.isArray(plan.commonPitfalls) || plan.commonPitfalls.length === 0) {
    errors.push("commonPitfalls must be a non-empty array");
  } else {
    for (const [index, item] of plan.commonPitfalls.entries()) {
      for (const key of ["role", "symptom", "teacherQuestion"]) {
        if (typeof item?.[key] !== "string" || !item[key].trim()) {
          errors.push(`commonPitfalls[${index}].${key} must be a non-empty string`);
        }
      }
    }
  }

  if (!Array.isArray(plan.assemblyChecklist) || plan.assemblyChecklist.length === 0) {
    errors.push("assemblyChecklist must be a non-empty array");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateRolePack(pack, role) {
  const errors = [];

  if (pack.name !== role.name) {
    errors.push(`name mismatch: ${JSON.stringify(pack.name)}`);
  }
  if (typeof pack.studentGoal !== "string" || !pack.studentGoal.trim()) {
    errors.push("studentGoal must be a non-empty string");
  }
  if (!Array.isArray(pack.scripts) || pack.scripts.length < role.requiredScripts.length) {
    errors.push(`scripts count must be at least ${role.requiredScripts.length}`);
  } else {
    for (const [index, script] of pack.scripts.entries()) {
      for (const key of ["id", "goal", "trigger"]) {
        if (typeof script?.[key] !== "string" || !script[key].trim()) {
          errors.push(`scripts[${index}].${key} must be a non-empty string`);
        }
      }
      if (!Array.isArray(script?.steps) || script.steps.length === 0) {
        errors.push(`scripts[${index}].steps must be a non-empty array`);
      }
    }
  }
  if (!Array.isArray(pack.teacherChecks) || pack.teacherChecks.length === 0) {
    errors.push("teacherChecks must be a non-empty array");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateHintsPack(pack, brief, plan) {
  const errors = [];
  const expectedRoleNames = brief.roles.map((role) => role.name);
  const expectedMilestoneIds = Array.isArray(plan?.milestones) ? plan.milestones.map((item) => item.id) : [];

  if (pack.title !== brief.title) {
    errors.push(`title mismatch: ${JSON.stringify(pack.title)}`);
  }
  if (pack.studentLevel !== brief.studentLevel) {
    errors.push(`studentLevel mismatch: ${JSON.stringify(pack.studentLevel)}`);
  }
  if (!Array.isArray(pack.hintPolicy) || pack.hintPolicy.length === 0) {
    errors.push("hintPolicy must be a non-empty array");
  }

  if (!Array.isArray(pack.milestoneHints) || pack.milestoneHints.length !== expectedMilestoneIds.length) {
    errors.push("milestoneHints must match the milestone count");
  } else {
    const ids = pack.milestoneHints.map((item) => item?.milestoneId);
    if (!exactArrayEquals(ids, expectedMilestoneIds)) {
      errors.push(`milestoneHints ids mismatch: ${JSON.stringify(ids)}`);
    }
    for (const [index, item] of pack.milestoneHints.entries()) {
      for (const key of ["light", "guided", "exampleReady"]) {
        if (typeof item?.[key] !== "string" || !item[key].trim()) {
          errors.push(`milestoneHints[${index}].${key} must be a non-empty string`);
        }
      }
    }
  }

  if (!Array.isArray(pack.roleHints) || pack.roleHints.length !== expectedRoleNames.length) {
    errors.push("roleHints must match the role count");
  } else {
    const names = pack.roleHints.map((item) => item?.name);
    if (!exactArrayEquals(names, expectedRoleNames)) {
      errors.push(`roleHints names mismatch: ${JSON.stringify(names)}`);
    }
    for (const [index, item] of pack.roleHints.entries()) {
      if (!Array.isArray(item?.questions) || item.questions.length === 0) {
        errors.push(`roleHints[${index}].questions must be a non-empty array`);
      }
      if (!Array.isArray(item?.commonMistakes) || item.commonMistakes.length === 0) {
        errors.push(`roleHints[${index}].commonMistakes must be a non-empty array`);
      }
    }
  }

  if (!Array.isArray(pack.teacherPrompts) || pack.teacherPrompts.length === 0) {
    errors.push("teacherPrompts must be a non-empty array");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateDebugPack(pack, brief) {
  const errors = [];
  const expectedRoleNames = brief.roles.map((role) => role.name);

  if (pack.title !== brief.title) {
    errors.push(`title mismatch: ${JSON.stringify(pack.title)}`);
  }
  if (!Array.isArray(pack.debugChecklist) || pack.debugChecklist.length === 0) {
    errors.push("debugChecklist must be a non-empty array");
  } else {
    for (const [index, item] of pack.debugChecklist.entries()) {
      for (const key of ["symptom", "askStudent", "quickCheck", "minimalFix", "verify"]) {
        if (typeof item?.[key] !== "string" || !item[key].trim()) {
          errors.push(`debugChecklist[${index}].${key} must be a non-empty string`);
        }
      }
    }
  }

  if (!Array.isArray(pack.roleSpecificFixes) || pack.roleSpecificFixes.length !== expectedRoleNames.length) {
    errors.push("roleSpecificFixes must match the role count");
  } else {
    const names = pack.roleSpecificFixes.map((item) => item?.name);
    if (!exactArrayEquals(names, expectedRoleNames)) {
      errors.push(`roleSpecificFixes names mismatch: ${JSON.stringify(names)}`);
    }
    for (const [index, item] of pack.roleSpecificFixes.entries()) {
      if (!Array.isArray(item?.watchFor) || item.watchFor.length === 0) {
        errors.push(`roleSpecificFixes[${index}].watchFor must be a non-empty array`);
      }
      if (!Array.isArray(item?.microFixes) || item.microFixes.length === 0) {
        errors.push(`roleSpecificFixes[${index}].microFixes must be a non-empty array`);
      }
    }
  }

  if (!Array.isArray(pack.whenToIntervene) || pack.whenToIntervene.length === 0) {
    errors.push("whenToIntervene must be a non-empty array");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
