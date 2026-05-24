import type { z } from "zod";

export type ProgramAreaModule = {
  id: string;
  label: string;
  blockCount: number;
};

export type VariableSnapshot = {
  id: string;
  name: string;
  value: string | number | boolean;
  isCloud: boolean;
};

export type BlockSummary = {
  id: string;
  opcode: string;
  category: string;
  label: string;
  spriteName: string;
  topLevel: boolean;
};

export type ScriptSummary = {
  spriteName: string;
  event: string;
  purposeGuess?: string;
  blockSequence: string[];
  blockOpcodes: string[];
};

export type SpriteSnapshot = {
  name: string;
  isStage: boolean;
  scripts: ScriptSummary[];
  variables: VariableSnapshot[];
  blockCount: number;
};

export type ProjectSnapshot = {
  projectId?: string;
  goal?: string;
  currentTarget?: string;
  currentTargetId?: string;
  toolboxCategories: string[];
  loadedExtensions: string[];
  programAreaModules: ProgramAreaModule[];
  sprites: SpriteSnapshot[];
  blocks: BlockSummary[];
  globalVariables: VariableSnapshot[];
  detectedConcepts: string[];
  updatedAt: string;
};

export type RecommendedBlock = {
  opcode: string;
  category: string;
  label: string;
  reason: string;
  example?: string;
};

export type ScratchBlockDescriptor = {
  opcode: string;
  categoryId: string;
  label: string;
};

export type CurrentTargetScriptDescriptor = {
  blocks: ScratchBlockDescriptor[];
};

export type DetectedIssue = {
  severity: "info" | "warning";
  title: string;
  description: string;
  spriteName?: string;
};

export type CoachResponse = {
  answerText: string;
  recommendedBlocks: RecommendedBlock[];
  nextStep: string;
  detectedIssues: DetectedIssue[];
  followUpQuestion?: string;
};

export type AiConfigSource = "custom";

export type DesktopCompanionState = {
  status: "starting" | "waiting" | "injecting" | "connected" | "error" | "unsupported";
  statusText: string;
  detail?: string;
  error?: string;
  scratchPid?: number;
  scratchTitle?: string;
  scratchExecutablePath?: string;
  currentTargetId?: string;
  currentTargetName?: string;
  currentTargetIsStage?: boolean;
  launchMode?: string;
  injectionMode?: string;
  toolboxCategories: string[];
  usedExtensions: string[];
  loadedExtensions: string[];
  programAreaModules: ProgramAreaModule[];
  currentTargetPrograms: string[];
  currentTargetScriptBlocks: CurrentTargetScriptDescriptor[];
  currentTargetScriptXmlList: string[];
  lastUpdatedAt?: string;
  aiConfigured: boolean;
  aiConfigPath?: string;
  aiConfigSource?: AiConfigSource;
  aiCustomKeyConfigured: boolean;
  aiCustomModelConfigured: boolean;
  aiCustomModel?: string;
  aiCustomPromptConfigured: boolean;
  aiCustomPrompt?: string;
  aiDefaultPrompt?: string;
  aiHintTriggerMode: "auto" | "manual";
  aiStatus: "idle" | "loading" | "ready" | "error";
  aiProvider?: "deepseek" | "fallback";
  aiModel?: string;
  aiCoachResponse?: CoachResponse;
  aiLastUpdatedAt?: string;
  aiError?: string;
};

export declare const z: typeof import("zod").z;
export declare const CORE_EXTENSION_PREFIXES: Set<string>;
export declare const CORE_PROGRAM_AREA_MODULE_LABELS: Record<string, string>;
export declare const EXTENSION_PROGRAM_AREA_MODULE_LABELS: Record<string, string>;
export declare const hintLevelSchema: z.ZodTypeAny;
export declare const recommendedBlockSchema: z.ZodTypeAny;
export declare const scratchBlockDescriptorSchema: z.ZodTypeAny;
export declare const currentTargetScriptDescriptorSchema: z.ZodTypeAny;
export declare const detectedIssueSchema: z.ZodTypeAny;
export declare const variableSnapshotSchema: z.ZodTypeAny;
export declare const blockSummarySchema: z.ZodTypeAny;
export declare const scriptSummarySchema: z.ZodTypeAny;
export declare const spriteSnapshotSchema: z.ZodTypeAny;
export declare const programAreaModuleSchema: z.ZodTypeAny;
export declare const projectSnapshotSchema: z.ZodTypeAny;
export declare const projectAnalysisSchema: z.ZodTypeAny;
export declare const analyzeProjectRequestSchema: z.ZodTypeAny;
export declare const analyzeProjectResponseSchema: z.ZodTypeAny;
export declare const coachRequestSchema: z.ZodTypeAny;
export declare const coachResponseSchema: z.ZodTypeAny;
export declare const aiConfigSourceSchema: z.ZodTypeAny;
export declare const aiHintProviderSchema: z.ZodTypeAny;
export declare const aiHintStatusSchema: z.ZodTypeAny;
export declare const sessionEventSchema: z.ZodTypeAny;
export declare const desktopCompanionStatusSchema: z.ZodTypeAny;
export declare const scratchStatePayloadSchema: z.ZodTypeAny;
export declare const desktopCompanionStateSchema: z.ZodTypeAny;

export declare function normalizeExtensionId(prefix: string): string | null;
export declare function getExtensionIdForOpcode(opcode: string): string | null;
export declare function getModuleIdForOpcode(opcode: string): string | null;
export declare function getModuleLabelForId(moduleId: string): string | null;
export declare function getDisplayLabelForOpcode(opcode: string, fields?: Record<string, unknown>): string;
export declare function getUsedExtensionsFromBlocks(blocks: Record<string, unknown>): string[];
export declare function getUsedExtensionsFromProject(project: Record<string, unknown>): string[];
export declare function summarizeProgramAreaModulesFromBlocks(blocks: Record<string, unknown>): ProgramAreaModule[];
export declare function summarizeProgramAreaModulesFromTarget(target: Record<string, unknown>): ProgramAreaModule[];
export declare function summarizeProgramAreaModulesFromProject(project: Record<string, unknown>, currentTarget?: Record<string, unknown>): ProgramAreaModule[];
export declare function pickProjectTarget(project: Record<string, unknown>, currentTarget?: Record<string, unknown>): Record<string, unknown> | null;
export declare function uniqueSortedStrings(values: string[]): string[];
export declare function projectJsonToSnapshot(project: unknown, options?: Record<string, unknown>): ProjectSnapshot;
