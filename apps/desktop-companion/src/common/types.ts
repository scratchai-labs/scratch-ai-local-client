export type DesktopCompanionStatus =
  | "starting"
  | "waiting"
  | "injecting"
  | "connected"
  | "error"
  | "unsupported";

export interface ProgramAreaModule {
  id: string;
  label: string;
  blockCount: number;
}

export type AiHintStatus = "idle" | "loading" | "ready" | "error";

export type AiHintProvider = "deepseek" | "fallback";

export type AiConfigSource = "custom";

export const AI_HINT_TRIGGER_MODES = ["auto", "manual"] as const;

export type AiHintTriggerMode = (typeof AI_HINT_TRIGGER_MODES)[number];

export function normalizeAiHintTriggerMode(value: unknown): AiHintTriggerMode {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return AI_HINT_TRIGGER_MODES.includes(candidate as AiHintTriggerMode)
    ? (candidate as AiHintTriggerMode)
    : "auto";
}

export interface RecommendedBlock {
  opcode: string;
  category: string;
  label: string;
  reason: string;
  example?: string;
}

export interface ScratchBlockDescriptor {
  opcode: string;
  categoryId: string;
  label: string;
}

export interface CurrentTargetScriptDescriptor {
  blocks: ScratchBlockDescriptor[];
}

export interface DetectedIssue {
  severity: "info" | "warning";
  title: string;
  description: string;
  spriteName?: string;
}

export interface CoachResponse {
  answerText: string;
  recommendedBlocks: RecommendedBlock[];
  nextStep: string;
  detectedIssues: DetectedIssue[];
  followUpQuestion?: string;
}

export interface VariableSnapshot {
  id: string;
  name: string;
  value: string | number | boolean;
  isCloud: boolean;
}

export interface BlockSummary {
  id: string;
  opcode: string;
  category: string;
  label: string;
  spriteName: string;
  topLevel: boolean;
}

export interface ScriptSummary {
  spriteName: string;
  event: string;
  purposeGuess?: string;
  blockSequence: string[];
  blockOpcodes: string[];
}

export interface SpriteSnapshot {
  name: string;
  isStage: boolean;
  scripts: ScriptSummary[];
  variables: VariableSnapshot[];
  blockCount: number;
}

export interface ProjectSnapshot {
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
}

export interface ScratchStatePayload {
  bridgeVersion?: string;
  source?: string;
  capturedAt?: string;
  scratchPid?: number;
  currentTargetId?: string;
  currentTargetName?: string;
  currentTargetIsStage?: boolean;
  toolboxCategories?: string[];
  loadedExtensions?: string[];
  usedExtensions?: string[];
  programAreaModules?: ProgramAreaModule[];
  projectData?: unknown;
}

export interface DesktopCompanionState {
  status: DesktopCompanionStatus;
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
  aiHintTriggerMode: AiHintTriggerMode;
  aiStatus: AiHintStatus;
  aiProvider?: AiHintProvider;
  aiModel?: string;
  aiCoachResponse?: CoachResponse;
  aiLastUpdatedAt?: string;
  aiError?: string;
}

export interface LaunchOptions {
  startHidden: boolean;
  mockStateFile?: string;
  automationActions: boolean;
  automationScratchExecutablePath?: string;
}
