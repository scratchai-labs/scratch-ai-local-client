import { getDisplayLabelForOpcode } from "@scratch-ai/shared";

type UnknownRecord = Record<string, unknown>;

export interface ProjectScriptEvidence {
  playerInputEvidence: Array<{
    target: string;
    opcode: string;
    label: string;
    fields?: Record<string, string | number | boolean>;
  }>;
  targets: Array<{
    name: string;
    isStage: boolean;
    scripts: Array<{
      blocks: ScriptEvidenceBlock[];
    }>;
  }>;
}

interface ScriptEvidenceBlock {
  opcode: string;
  label: string;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, unknown>;
  branches?: Record<string, ScriptEvidenceBlock[]>;
  procedure?: string;
}


const DIRECT_PLAYER_INPUT_OPCODES = new Set([
  "event_whenkeypressed",
  "event_whenthisspriteclicked",
  "event_whenstageclicked",
  "sensing_keypressed",
  "sensing_mousedown",
  "sensing_mousex",
  "sensing_mousey"
]);

const MOUSE_MENU_OPCODES = new Set([
  "motion_goto_menu",
  "motion_pointtowards_menu",
  "sensing_touchingobjectmenu",
  "sensing_distancetomenu"
]);

const INPUT_KIND_LABELS: Record<number, string> = {
  4: "number",
  5: "positive-number",
  6: "positive-integer",
  7: "integer",
  8: "angle",
  9: "color",
  10: "text",
  11: "broadcast",
  12: "variable",
  13: "list"
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function normalizeScalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function normalizeFields(value: unknown) {
  const fields = asRecord(value);
  if (!fields) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean> = {};
  for (const [name, rawEntry] of Object.entries(fields)) {
    const entry = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry;
    const scalar = normalizeScalar(entry);
    if (scalar !== null) {
      normalized[name] = scalar;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function decodeLiteral(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return normalizeScalar(value);
  }

  const type = typeof value[0] === "number" ? value[0] : undefined;
  const rawValue = value[1];
  const kind = type === undefined ? undefined : INPUT_KIND_LABELS[type] ?? `scratch-input-${type}`;
  if (kind === "broadcast") {
    return { kind, name: String(rawValue ?? "") };
  }
  if (kind === "variable" || kind === "list") {
    return { kind, name: String(rawValue ?? "") };
  }
  return {
    ...(kind ? { kind } : {}),
    value: normalizeScalar(rawValue) ?? String(rawValue ?? "")
  };
}

function getReferencedBlockId(input: unknown, blocks: UnknownRecord) {
  if (!Array.isArray(input)) {
    return undefined;
  }
  for (const candidate of [input[1], input[2]]) {
    if (typeof candidate === "string" && asRecord(blocks[candidate])) {
      return candidate;
    }
  }
  return undefined;
}

function getLiteralInput(input: unknown) {
  if (!Array.isArray(input)) {
    return decodeLiteral(input);
  }
  for (const candidate of [input[1], input[2]]) {
    if (Array.isArray(candidate)) {
      return decodeLiteral(candidate);
    }
    const scalar = normalizeScalar(candidate);
    if (scalar !== null) {
      return scalar;
    }
  }
  return null;
}

function buildBlockEvidence(
  blockId: string,
  blocks: UnknownRecord,
  path: Set<string>
): ScriptEvidenceBlock | null {
  if (path.has(blockId)) {
    return null;
  }
  const block = asRecord(blocks[blockId]);
  const opcode = typeof block?.opcode === "string" ? block.opcode : "";
  if (!block || !opcode) {
    return null;
  }

  const nextPath = new Set(path);
  nextPath.add(blockId);
  const fields = normalizeFields(block.fields);
  const evidence: ScriptEvidenceBlock = {
    opcode,
    label: getDisplayLabelForOpcode(opcode, asRecord(block.fields) ?? undefined),
    ...(fields ? { fields } : {})
  };

  const mutation = asRecord(block.mutation);
  if (typeof mutation?.proccode === "string" && mutation.proccode.trim()) {
    evidence.procedure = mutation.proccode.trim();
  }

  const inputs = asRecord(block.inputs);
  if (!inputs) {
    return evidence;
  }

  const normalizedInputs: Record<string, unknown> = {};
  const branches: Record<string, ScriptEvidenceBlock[]> = {};
  for (const [name, input] of Object.entries(inputs)) {
    const referencedBlockId = getReferencedBlockId(input, blocks);
    if ((name === "SUBSTACK" || name === "SUBSTACK2") && referencedBlockId) {
      const branch = buildSequenceEvidence(referencedBlockId, blocks, nextPath);
      if (branch.length > 0) {
        branches[name] = branch;
      }
      continue;
    }

    if (referencedBlockId) {
      const nestedBlock = buildBlockEvidence(referencedBlockId, blocks, nextPath);
      if (nestedBlock) {
        normalizedInputs[name] = nestedBlock;
      }
      continue;
    }

    const literal = getLiteralInput(input);
    if (literal !== null) {
      normalizedInputs[name] = literal;
    }
  }

  if (Object.keys(normalizedInputs).length > 0) {
    evidence.inputs = normalizedInputs;
  }
  if (Object.keys(branches).length > 0) {
    evidence.branches = branches;
  }
  return evidence;
}

function buildSequenceEvidence(
  firstBlockId: string,
  blocks: UnknownRecord,
  inheritedPath = new Set<string>()
) {
  const sequence: ScriptEvidenceBlock[] = [];
  const visited = new Set(inheritedPath);
  let currentId: string | undefined = firstBlockId;

  while (currentId && !visited.has(currentId)) {
    const block = asRecord(blocks[currentId]);
    if (!block) {
      break;
    }
    const evidence = buildBlockEvidence(currentId, blocks, visited);
    if (evidence && block.shadow !== true) {
      sequence.push(evidence);
    }
    visited.add(currentId);
    currentId = typeof block.next === "string" ? block.next : undefined;
  }
  return sequence;
}

function isMouseMenuSelection(opcode: string, fields: Record<string, string | number | boolean> | undefined) {
  if (!MOUSE_MENU_OPCODES.has(opcode) || !fields) {
    return false;
  }
  return Object.values(fields).some((value) => {
    const normalized = String(value).trim().toLowerCase();
    return ["_mouse_", "mouse-pointer", "mouse pointer", "鼠标指针"].includes(normalized);
  });
}

function collectPlayerInputEvidence(target: UnknownRecord, blocks: UnknownRecord) {
  const targetName = String(target.name ?? "");
  return Object.values(blocks).flatMap((rawBlock) => {
    const block = asRecord(rawBlock);
    const opcode = typeof block?.opcode === "string" ? block.opcode : "";
    if (!block || !opcode) {
      return [];
    }
    const fields = normalizeFields(block.fields);
    if (!DIRECT_PLAYER_INPUT_OPCODES.has(opcode) && !isMouseMenuSelection(opcode, fields)) {
      return [];
    }
    return [{
      target: targetName,
      opcode,
      label: getDisplayLabelForOpcode(opcode, asRecord(block.fields) ?? undefined),
      ...(fields ? { fields } : {})
    }];
  });
}

export function buildProjectScriptEvidence(projectData: unknown): ProjectScriptEvidence | undefined {
  const project = asRecord(projectData);
  if (!project || !Array.isArray(project.targets)) {
    return undefined;
  }

  const playerInputEvidence: ProjectScriptEvidence["playerInputEvidence"] = [];
  const targets = project.targets.flatMap((rawTarget) => {
    const target = asRecord(rawTarget);
    if (!target) {
      return [];
    }
    const blocks = asRecord(target.blocks) ?? {};
    playerInputEvidence.push(...collectPlayerInputEvidence(target, blocks));
    const scripts = Object.entries(blocks).flatMap(([blockId, rawBlock]) => {
        const block = asRecord(rawBlock);
        if (!block || block.shadow === true || block.topLevel !== true || typeof block.opcode !== "string") {
          return [];
        }
        const sequence = buildSequenceEvidence(blockId, blocks);
        return sequence.length > 0 ? [{ blocks: sequence }] : [];
    });
    return [{
      name: String(target.name ?? ""),
      isStage: Boolean(target.isStage),
      scripts
    }];
  });

  return {
    playerInputEvidence,
    targets
  };
}
