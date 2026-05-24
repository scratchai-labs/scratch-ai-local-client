import {
  getDisplayLabelForOpcode,
  getModuleLabelForId,
  getModuleIdForOpcode,
  getUsedExtensionsFromProject,
  pickProjectTarget,
  summarizeProgramAreaModulesFromProject,
  uniqueSortedStrings
} from "./extensions.js";

function normalizeVariableValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value ?? "");
}

function getScalarVariables(record) {
  if (!record || typeof record !== "object") {
    return [];
  }
  const variables = [];
  for (const [id, entry] of Object.entries(record)) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    variables.push({
      id,
      name: String(entry[0] ?? ""),
      value: normalizeVariableValue(entry[1]),
      isCloud: Boolean(entry[2])
    });
  }
  return variables;
}

function getBlockCategoryLabel(opcode) {
  const moduleId = getModuleIdForOpcode(opcode);
  return getModuleLabelForId(moduleId) ?? "其他";
}

function getVisibleBlocks(blocks, spriteName) {
  if (!blocks || typeof blocks !== "object") {
    return [];
  }
  return Object.entries(blocks)
    .filter(([, block]) => block && typeof block.opcode === "string" && block.shadow !== true)
    .map(([id, block]) => ({
      id,
      opcode: block.opcode,
      category: getBlockCategoryLabel(block.opcode),
      label: getDisplayLabelForOpcode(block.opcode, block.fields),
      spriteName,
      topLevel: Boolean(block.topLevel)
    }));
}

function getNestedStackBlockIds(block, blocks) {
  if (!block?.inputs || typeof block.inputs !== "object") {
    return [];
  }

  const nestedStackIds = [];
  for (const key of ["SUBSTACK", "SUBSTACK2"]) {
    const input = block.inputs[key];
    if (!Array.isArray(input)) {
      continue;
    }

    for (const value of input) {
      if (typeof value === "string" && blocks[value] && !nestedStackIds.includes(value)) {
        nestedStackIds.push(value);
      }
    }
  }

  return nestedStackIds;
}

function appendScriptSequence(blockId, blocks, sequence, opcodes, visited) {
  let currentId = blockId;

  while (typeof currentId === "string" && !visited.has(currentId)) {
    visited.add(currentId);
    const current = blocks[currentId];
    if (!current || typeof current !== "object") {
      return;
    }

    if (typeof current.opcode === "string" && current.shadow !== true) {
      sequence.push(getDisplayLabelForOpcode(current.opcode, current.fields));
      opcodes.push(current.opcode);
    }

    for (const nestedBlockId of getNestedStackBlockIds(current, blocks)) {
      appendScriptSequence(nestedBlockId, blocks, sequence, opcodes, visited);
    }

    currentId = typeof current.next === "string" ? current.next : null;
  }
}

function buildScriptSummary(target) {
  const blocks = target?.blocks && typeof target.blocks === "object" ? target.blocks : {};
  const summaries = [];
  for (const [blockId, block] of Object.entries(blocks)) {
    if (!block || block.shadow === true || !block.topLevel || typeof block.opcode !== "string") {
      continue;
    }
    const sequence = [];
    const opcodes = [];
    const visited = new Set();
    appendScriptSequence(blockId, blocks, sequence, opcodes, visited);
    summaries.push({
      spriteName: String(target?.name ?? ""),
      event: getDisplayLabelForOpcode(block.opcode, block.fields),
      blockSequence: sequence,
      blockOpcodes: opcodes
    });
  }
  return summaries;
}

function detectConcepts(project) {
  const concepts = new Set();
  for (const target of project?.targets ?? []) {
    for (const block of Object.values(target?.blocks ?? {})) {
      if (!block || block.shadow === true || typeof block.opcode !== "string") {
        continue;
      }
      const opcode = block.opcode;
      if (opcode.startsWith("event_")) {
        concepts.add("事件驱动");
      }
      if (opcode.startsWith("control_repeat") || opcode.startsWith("control_forever")) {
        concepts.add("循环");
      }
      if (opcode.startsWith("control_if")) {
        concepts.add("条件判断");
      }
      if (opcode.startsWith("data_")) {
        concepts.add("变量");
      }
      if (opcode.startsWith("operator_")) {
        concepts.add("运算");
      }
      const moduleId = getModuleIdForOpcode(opcode);
      if (moduleId && !["event", "control", "operator", "data"].includes(moduleId)) {
        concepts.add(getModuleLabelForId(moduleId) ?? moduleId);
      }
    }
  }
  return uniqueSortedStrings(Array.from(concepts));
}

function parseProjectJson(project) {
  if (typeof project === "string") {
    return JSON.parse(project);
  }
  return project;
}

function projectJsonToSnapshot(project, options = {}) {
  const parsedProject = parseProjectJson(project);
  if (!parsedProject || !Array.isArray(parsedProject.targets)) {
    throw new Error("Invalid Scratch project JSON.");
  }

  const currentTarget = pickProjectTarget(parsedProject, {
    id: options.currentTargetId,
    name: options.currentTargetName
  });

  const blocks = [];
  const sprites = parsedProject.targets.map((target) => {
    const spriteName = String(target?.name ?? "");
    const targetBlocks = getVisibleBlocks(target?.blocks, spriteName);
    blocks.push(...targetBlocks);
    return {
      name: spriteName,
      isStage: Boolean(target?.isStage),
      scripts: buildScriptSummary(target),
      variables: getScalarVariables(target?.variables),
      blockCount: targetBlocks.length
    };
  });

  const stageTarget = parsedProject.targets.find((target) => target?.isStage);

  return {
    projectId: options.projectId,
    goal: options.goal,
    currentTarget: currentTarget?.name ? String(currentTarget.name) : options.currentTargetName,
    currentTargetId: currentTarget?.id ? String(currentTarget.id) : options.currentTargetId,
    toolboxCategories: uniqueSortedStrings(options.toolboxCategories ?? []),
    loadedExtensions: uniqueSortedStrings(options.loadedExtensions ?? []),
    programAreaModules: summarizeProgramAreaModulesFromProject(parsedProject, {
      id: currentTarget?.id,
      name: currentTarget?.name
    }),
    sprites,
    blocks,
    globalVariables: getScalarVariables(stageTarget?.variables),
    detectedConcepts: detectConcepts(parsedProject),
    updatedAt: options.updatedAt ?? new Date().toISOString()
  };
}

export { projectJsonToSnapshot };
