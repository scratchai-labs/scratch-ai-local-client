import {
  getModuleIdForOpcode,
  getUsedExtensionsFromProject,
  summarizeProgramAreaModulesFromProject
} from "@scratch-ai/shared";

import { buildCurrentTargetScriptXmlList } from "../common/scratch-block-xml";
import type {
  CurrentTargetScriptDescriptor,
  DesktopCompanionState,
  ProjectSnapshot,
  ScratchStatePayload
} from "../common/types";

interface ScratchPayloadProjectionOptions {
  payload: ScratchStatePayload;
  currentState: DesktopCompanionState;
  snapshot: ProjectSnapshot | null;
}

function deriveCurrentTargetPrograms(snapshot: ProjectSnapshot, fallbackTargetName?: string) {
  const targetName =
    typeof snapshot.currentTarget === "string" && snapshot.currentTarget.trim()
      ? snapshot.currentTarget.trim()
      : fallbackTargetName;

  const currentTargetSprite = snapshot.sprites.find((sprite) => sprite.name === String(targetName ?? ""));
  if (!currentTargetSprite) {
    return [];
  }

  return currentTargetSprite.scripts
    .map((script) => script.blockSequence.join(" -> ").trim())
    .filter(Boolean);
}

function deriveCurrentTargetScriptBlocks(
  snapshot: ProjectSnapshot,
  fallbackTargetName?: string
): CurrentTargetScriptDescriptor[] {
  const targetName =
    typeof snapshot.currentTarget === "string" && snapshot.currentTarget.trim()
      ? snapshot.currentTarget.trim()
      : fallbackTargetName;

  const currentTargetSprite = snapshot.sprites.find((sprite) => sprite.name === String(targetName ?? ""));
  if (!currentTargetSprite) {
    return [];
  }

  return currentTargetSprite.scripts
    .map((script) => ({
      blocks: script.blockOpcodes
        .map((opcode, index) => {
          const label = script.blockSequence[index]?.trim();
          const categoryId = getModuleIdForOpcode(opcode) ?? "other";
          if (!label) {
            return null;
          }

          return { opcode, categoryId, label };
        })
        .filter((block): block is CurrentTargetScriptDescriptor["blocks"][number] => Boolean(block))
    }))
    .filter((script) => script.blocks.length > 0);
}

function pickRenderableWorkspaceXmlList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((xml) => xml && /<block\b/i.test(xml));
}

export function projectScratchPayload({
  payload,
  currentState,
  snapshot
}: ScratchPayloadProjectionOptions) {
  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  const hasProjectData = Boolean(payload.projectData && typeof payload.projectData === "object");
  const projectData = hasProjectData ? (payload.projectData as Record<string, unknown>) : null;
  const toolboxCategories = Array.isArray(payload.toolboxCategories) ? payload.toolboxCategories : [];
  const loadedExtensions = Array.isArray(payload.loadedExtensions)
    ? Array.from(new Set(payload.loadedExtensions)).sort()
    : currentState.loadedExtensions;
  const usedExtensions = projectData
    ? getUsedExtensionsFromProject(projectData)
    : currentState.usedExtensions;
  const programAreaModules =
    Array.isArray(payload.programAreaModules) && payload.programAreaModules.length > 0
      ? payload.programAreaModules
      : projectData
        ? summarizeProgramAreaModulesFromProject(projectData, {
            id: payload.currentTargetId,
            name: payload.currentTargetName
          })
        : currentState.programAreaModules;
  const currentTargetPrograms = snapshot
    ? deriveCurrentTargetPrograms(snapshot, payload.currentTargetName)
    : currentState.currentTargetPrograms;
  const currentTargetScriptBlocks = snapshot
    ? deriveCurrentTargetScriptBlocks(snapshot, payload.currentTargetName)
    : currentState.currentTargetScriptBlocks;
  const currentTargetWorkspaceXmlList = pickRenderableWorkspaceXmlList(
    payload.currentTargetWorkspaceXmlList
  );
  const generatedCurrentTargetScriptXmlList = projectData
    ? buildCurrentTargetScriptXmlList(projectData, {
        id: payload.currentTargetId,
        name: payload.currentTargetName
      })
    : [];
  const currentTargetScriptXmlList = projectData
    ? generatedCurrentTargetScriptXmlList
    : currentTargetWorkspaceXmlList.length > 0
      ? currentTargetWorkspaceXmlList
      : currentState.currentTargetScriptXmlList;
  const hasMeaningfulPayload = Boolean(
    payload.projectData ||
      toolboxCategories.length > 0 ||
      loadedExtensions.length > 0 ||
      programAreaModules.length > 0 ||
      currentTargetPrograms.length > 0 ||
      currentTargetScriptBlocks.length > 0 ||
      currentTargetScriptXmlList.length > 0
  );

  return {
    source,
    isHeartbeat: source === "heartbeat",
    toolboxCategories,
    loadedExtensions,
    snapshot,
    usedExtensions,
    programAreaModules,
    currentTargetPrograms,
    currentTargetScriptBlocks,
    currentTargetScriptXmlList,
    hasMeaningfulPayload
  };
}
