import type { RecommendedBlockNode, RecommendedBlockStructure } from "./types";

import {
  canRenderRecommendedBlockAtPosition,
  canUseRecommendedBlockRelation,
  type RecommendedBlockPosition
} from "./recommended-block-capabilities";

export type RecommendationNodePosition = RecommendedBlockPosition;

export function canRenderRecommendedNodeAtPosition(
  opcode: string,
  position: RecommendationNodePosition
) {
  return canRenderRecommendedBlockAtPosition(opcode, position);
}

function sanitizeRecommendedNode(
  node: RecommendedBlockNode | undefined,
  position: RecommendationNodePosition
): RecommendedBlockNode | null {
  if (!node || !canRenderRecommendedNodeAtPosition(node.opcode, position)) {
    return null;
  }

  const sanitizedNode: RecommendedBlockNode = {
    opcode: node.opcode,
    category: node.category,
    label: node.label,
    reason: node.reason,
    ...(node.params ? { params: node.params } : {})
  };

  if (node.next && canUseRecommendedBlockRelation(node.opcode, "next")) {
    const next = sanitizeRecommendedNode(node.next, "next");
    if (next) {
      sanitizedNode.next = next;
    }
  }

  if (node.condition && canUseRecommendedBlockRelation(node.opcode, "condition")) {
    const condition = sanitizeRecommendedNode(node.condition, "condition");
    if (condition) {
      sanitizedNode.condition = condition;
    }
  }

  if (node.substack && canUseRecommendedBlockRelation(node.opcode, "substack")) {
    const substack = sanitizeRecommendedNode(node.substack, "substack");
    if (substack) {
      sanitizedNode.substack = substack;
    }
  }

  if (node.substack2 && canUseRecommendedBlockRelation(node.opcode, "substack2")) {
    const substack2 = sanitizeRecommendedNode(node.substack2, "substack2");
    if (substack2) {
      sanitizedNode.substack2 = substack2;
    }
  }

  return sanitizedNode;
}

export function sanitizeRecommendedStructure(
  structure: RecommendedBlockStructure | undefined
): RecommendedBlockStructure | undefined {
  if (!structure) {
    return undefined;
  }

  const root = sanitizeRecommendedNode(structure.root, "root");
  if (!root) {
    return undefined;
  }

  return { root };
}
