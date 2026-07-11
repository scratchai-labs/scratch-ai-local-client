import type {
  RecommendedBlockNode,
  RecommendedBlockStructure
} from "./types";

type MatchStatus = "unchanged" | "following" | "completed" | "diverged";

interface ScratchBlockRecord {
  opcode?: unknown;
  next?: unknown;
  parent?: unknown;
  inputs?: Record<string, unknown>;
  shadow?: unknown;
  topLevel?: unknown;
}

interface ScratchTargetRecord {
  id?: unknown;
  name?: unknown;
  isStage?: unknown;
  blocks?: Record<string, ScratchBlockRecord>;
}

interface CurrentTargetMeta {
  id?: string;
  name?: string;
}

interface RecommendationProgressOptions {
  baselineProjectData: unknown;
  currentProjectData: unknown;
  currentTarget?: CurrentTargetMeta;
  recommendation: RecommendedBlockStructure;
}

export interface RecommendationProgress {
  status: MatchStatus;
  baselineMatchedNodeCount: number;
  currentMatchedNodeCount: number;
  totalRecommendedNodeCount: number;
  baselineStructureSignature: string;
  currentStructureSignature: string;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTargetList(projectData: unknown) {
  if (!projectData || typeof projectData !== "object" || !Array.isArray((projectData as { targets?: unknown[] }).targets)) {
    return [];
  }

  return (projectData as { targets: ScratchTargetRecord[] }).targets;
}

function pickCurrentTarget(projectData: unknown, currentTarget?: CurrentTargetMeta) {
  const targets = asTargetList(projectData);
  const targetId = normalizeString(currentTarget?.id);
  if (targetId) {
    const matchedTarget = targets.find((target) => normalizeString(target?.id) === targetId);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  const targetName = normalizeString(currentTarget?.name);
  if (targetName) {
    const matchedTarget = targets.find((target) => normalizeString(target?.name) === targetName);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  return targets.find((target) => !Boolean(target?.isStage)) ?? null;
}

function getBlockMap(projectData: unknown, currentTarget?: CurrentTargetMeta) {
  const target = pickCurrentTarget(projectData, currentTarget);
  if (!target?.blocks || typeof target.blocks !== "object") {
    return {} as Record<string, ScratchBlockRecord>;
  }

  return target.blocks;
}

function isRealBlock(block: unknown): block is ScratchBlockRecord {
  return Boolean(block) && typeof block === "object" && (block as ScratchBlockRecord).shadow !== true;
}

function getReferencedBlockId(rawInput: unknown): string | null {
  if (!Array.isArray(rawInput)) {
    return null;
  }

  for (let index = 1; index < rawInput.length; index += 1) {
    const candidate = rawInput[index];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function countRecommendedNodes(node: RecommendedBlockNode): number {
  return (
    1 +
    (node.condition ? countRecommendedNodes(node.condition) : 0) +
    (node.substack ? countRecommendedNodes(node.substack) : 0) +
    (node.substack2 ? countRecommendedNodes(node.substack2) : 0) +
    (node.next ? countRecommendedNodes(node.next) : 0)
  );
}

function matchNode(
  blocks: Record<string, ScratchBlockRecord>,
  blockId: string,
  recommendedNode: RecommendedBlockNode
): number {
  const block = blocks[blockId];
  if (!isRealBlock(block) || block.opcode !== recommendedNode.opcode) {
    return 0;
  }

  let matchedCount = 1;

  if (recommendedNode.condition) {
    const conditionId = getReferencedBlockId(block.inputs?.CONDITION);
    if (!conditionId) {
      return matchedCount;
    }

    const conditionMatchedCount = matchNode(blocks, conditionId, recommendedNode.condition);
    if (conditionMatchedCount < countRecommendedNodes(recommendedNode.condition)) {
      return matchedCount;
    }

    matchedCount += conditionMatchedCount;
  }

  if (recommendedNode.substack) {
    const substackId = getReferencedBlockId(block.inputs?.SUBSTACK);
    if (!substackId) {
      return matchedCount;
    }

    const substackMatchedCount = matchNode(blocks, substackId, recommendedNode.substack);
    if (substackMatchedCount < countRecommendedNodes(recommendedNode.substack)) {
      return matchedCount;
    }

    matchedCount += substackMatchedCount;
  }

  if (recommendedNode.substack2) {
    const substack2Id = getReferencedBlockId(block.inputs?.SUBSTACK2);
    if (!substack2Id) {
      return matchedCount;
    }

    const substack2MatchedCount = matchNode(blocks, substack2Id, recommendedNode.substack2);
    if (substack2MatchedCount < countRecommendedNodes(recommendedNode.substack2)) {
      return matchedCount;
    }

    matchedCount += substack2MatchedCount;
  }

  if (recommendedNode.next) {
    const nextId = normalizeString(block.next);
    if (!nextId) {
      return matchedCount;
    }

    const nextMatchedCount = matchNode(blocks, nextId, recommendedNode.next);
    if (nextMatchedCount < countRecommendedNodes(recommendedNode.next)) {
      return matchedCount;
    }

    matchedCount += nextMatchedCount;
  }

  return matchedCount;
}

function getBestMatchCount(projectData: unknown, currentTarget: CurrentTargetMeta | undefined, recommendation: RecommendedBlockStructure) {
  const blocks = getBlockMap(projectData, currentTarget);
  let bestMatchCount = 0;

  for (const blockId of Object.keys(blocks)) {
    bestMatchCount = Math.max(bestMatchCount, matchNode(blocks, blockId, recommendation.root));
  }

  return bestMatchCount;
}

function buildBlockStructureSignature(
  blocks: Record<string, ScratchBlockRecord>,
  blockId: string,
  visited: Set<string>
): string {
  if (visited.has(blockId)) {
    return `${blockId}:cycle`;
  }

  const block = blocks[blockId];
  if (!isRealBlock(block) || typeof block.opcode !== "string") {
    return "";
  }

  visited.add(blockId);
  const conditionId = getReferencedBlockId(block.inputs?.CONDITION);
  const substackId = getReferencedBlockId(block.inputs?.SUBSTACK);
  const substack2Id = getReferencedBlockId(block.inputs?.SUBSTACK2);
  const nextId = normalizeString(block.next);
  const condition = conditionId ? `condition(${buildBlockStructureSignature(blocks, conditionId, visited)})` : "";
  const substack = substackId ? `substack(${buildBlockStructureSignature(blocks, substackId, visited)})` : "";
  const substack2 = substack2Id ? `substack2(${buildBlockStructureSignature(blocks, substack2Id, visited)})` : "";
  const next = nextId ? `next(${buildBlockStructureSignature(blocks, nextId, visited)})` : "";

  return [block.opcode, condition, substack, substack2, next].filter(Boolean).join("|");
}

function buildStructureSignature(projectData: unknown, currentTarget?: CurrentTargetMeta) {
  const blocks = getBlockMap(projectData, currentTarget);
  return Object.entries(blocks)
    .filter(([, block]) => isRealBlock(block) && typeof block.opcode === "string")
    .map(([blockId, block]) => {
      const isChild = Object.values(blocks).some((candidate) => {
        if (!isRealBlock(candidate)) {
          return false;
        }

        return (
          candidate.next === blockId ||
          getReferencedBlockId(candidate.inputs?.CONDITION) === blockId ||
          getReferencedBlockId(candidate.inputs?.SUBSTACK) === blockId ||
          getReferencedBlockId(candidate.inputs?.SUBSTACK2) === blockId
        );
      });

      return block.topLevel === true || !isChild
        ? buildBlockStructureSignature(blocks, blockId, new Set())
        : "";
    })
    .filter(Boolean)
    .sort()
    .join("||");
}

export function isRecommendationCompleted(
  projectData: unknown,
  currentTarget: CurrentTargetMeta | undefined,
  recommendation: RecommendedBlockStructure
) {
  const totalRecommendedNodeCount = countRecommendedNodes(recommendation.root);
  return getBestMatchCount(projectData, currentTarget, recommendation) >= totalRecommendedNodeCount;
}

export function analyzeRecommendationProgress(options: RecommendationProgressOptions): RecommendationProgress {
  const totalRecommendedNodeCount = countRecommendedNodes(options.recommendation.root);
  const baselineMatchedNodeCount = getBestMatchCount(
    options.baselineProjectData,
    options.currentTarget,
    options.recommendation
  );
  const currentMatchedNodeCount = getBestMatchCount(
    options.currentProjectData,
    options.currentTarget,
    options.recommendation
  );
  const baselineStructureSignature = buildStructureSignature(options.baselineProjectData, options.currentTarget);
  const currentStructureSignature = buildStructureSignature(options.currentProjectData, options.currentTarget);
  const structureChanged = baselineStructureSignature !== currentStructureSignature;

  let status: MatchStatus = "unchanged";
  if (currentMatchedNodeCount >= totalRecommendedNodeCount) {
    status = "completed";
  } else if (currentMatchedNodeCount > baselineMatchedNodeCount) {
    status = "following";
  } else if (structureChanged) {
    status = "diverged";
  }

  return {
    status,
    baselineMatchedNodeCount,
    currentMatchedNodeCount,
    totalRecommendedNodeCount,
    baselineStructureSignature,
    currentStructureSignature
  };
}
