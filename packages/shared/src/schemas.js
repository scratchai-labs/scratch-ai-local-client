import { z } from "zod";

const hintLevelSchema = z.enum(["light", "guided", "show-example"]);

const recommendedBlockSchema = z.object({
  opcode: z.string(),
  category: z.string(),
  label: z.string(),
  reason: z.string(),
  example: z.string().optional()
});

const scratchBlockDescriptorSchema = z.object({
  opcode: z.string(),
  categoryId: z.string(),
  label: z.string()
});

const currentTargetScriptDescriptorSchema = z.object({
  blocks: z.array(scratchBlockDescriptorSchema)
});

const detectedIssueSchema = z.object({
  severity: z.enum(["info", "warning"]),
  title: z.string(),
  description: z.string(),
  spriteName: z.string().optional()
});

const variableSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  isCloud: z.boolean().default(false)
});

const blockSummarySchema = z.object({
  id: z.string(),
  opcode: z.string(),
  category: z.string(),
  label: z.string(),
  spriteName: z.string(),
  topLevel: z.boolean()
});

const scriptSummarySchema = z.object({
  spriteName: z.string(),
  event: z.string(),
  purposeGuess: z.string().optional(),
  blockSequence: z.array(z.string()),
  blockOpcodes: z.array(z.string())
});

const spriteSnapshotSchema = z.object({
  name: z.string(),
  isStage: z.boolean(),
  scripts: z.array(scriptSummarySchema),
  variables: z.array(variableSnapshotSchema),
  blockCount: z.number().int().nonnegative()
});

const programAreaModuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  blockCount: z.number().int().positive()
});

const projectSnapshotSchema = z.object({
  projectId: z.string().optional(),
  goal: z.string().optional(),
  currentTarget: z.string().optional(),
  currentTargetId: z.string().optional(),
  toolboxCategories: z.array(z.string()).default([]),
  loadedExtensions: z.array(z.string()).default([]),
  programAreaModules: z.array(programAreaModuleSchema).default([]),
  sprites: z.array(spriteSnapshotSchema),
  blocks: z.array(blockSummarySchema),
  globalVariables: z.array(variableSnapshotSchema),
  detectedConcepts: z.array(z.string()),
  updatedAt: z.string()
});

const projectAnalysisSchema = z.object({
  summary: z.string(),
  existingCapabilities: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  nextStep: z.string(),
  nextBlockCandidates: z.array(recommendedBlockSchema),
  detectedIssues: z.array(detectedIssueSchema)
});

const analyzeProjectRequestSchema = z.object({
  snapshot: projectSnapshotSchema,
  goal: z.string().max(200).optional()
});

const analyzeProjectResponseSchema = z.object({
  analysis: projectAnalysisSchema
});

const coachRequestSchema = z.object({
  sessionId: z.string().optional(),
  studentMessage: z.string().min(1).max(500),
  goal: z.string().max(200).optional(),
  snapshot: projectSnapshotSchema,
  studentLevel: z.literal("elementary_beginner").default("elementary_beginner"),
  hintLevel: hintLevelSchema.default("light")
});

const coachResponseSchema = z.object({
  answerText: z.string(),
  recommendedBlocks: z.array(recommendedBlockSchema),
  nextStep: z.string(),
  detectedIssues: z.array(detectedIssueSchema),
  followUpQuestion: z.string().optional()
});

const aiHintProviderSchema = z.enum(["deepseek", "fallback"]);

const aiHintStatusSchema = z.enum(["idle", "loading", "ready", "error"]);

const aiConfigSourceSchema = z.enum(["custom"]);

const sessionEventSchema = z.object({
  sessionId: z.string().min(1),
  type: z.enum([
    "sidebar_opened",
    "snapshot_updated",
    "analysis_requested",
    "chat_sent",
    "chat_received"
  ]),
  details: z.record(z.any()).optional(),
  happenedAt: z.string()
});

const desktopCompanionStatusSchema = z.enum([
  "starting",
  "waiting",
  "injecting",
  "connected",
  "error",
  "unsupported"
]);

const aiHintTriggerModeSchema = z.enum(["auto", "manual"]);

const scratchStatePayloadSchema = z.object({
  bridgeVersion: z.string().optional(),
  source: z.string().optional(),
  capturedAt: z.string().optional(),
  scratchPid: z.number().int().positive().optional(),
  currentTargetId: z.string().optional(),
  currentTargetName: z.string().optional(),
  currentTargetIsStage: z.boolean().optional(),
  toolboxCategories: z.array(z.string()).default([]),
  loadedExtensions: z.array(z.string()).default([]),
  usedExtensions: z.array(z.string()).default([]),
  programAreaModules: z.array(programAreaModuleSchema).default([]),
  projectData: z.unknown().nullable().optional()
});

const desktopCompanionStateSchema = z.object({
  status: desktopCompanionStatusSchema,
  statusText: z.string(),
  detail: z.string().optional(),
  error: z.string().optional(),
  scratchPid: z.number().int().positive().optional(),
  scratchTitle: z.string().optional(),
  scratchExecutablePath: z.string().optional(),
  currentTargetId: z.string().optional(),
  currentTargetName: z.string().optional(),
  currentTargetIsStage: z.boolean().optional(),
  launchMode: z.string().optional(),
  injectionMode: z.string().optional(),
  toolboxCategories: z.array(z.string()).default([]),
  usedExtensions: z.array(z.string()).default([]),
  loadedExtensions: z.array(z.string()).default([]),
  programAreaModules: z.array(programAreaModuleSchema).default([]),
  currentTargetPrograms: z.array(z.string()).default([]),
  currentTargetScriptBlocks: z.array(currentTargetScriptDescriptorSchema).default([]),
  currentTargetScriptXmlList: z.array(z.string()).default([]),
  lastUpdatedAt: z.string().optional(),
  aiConfigured: z.boolean().default(false),
  aiConfigPath: z.string().optional(),
  aiConfigSource: aiConfigSourceSchema.optional(),
  aiCustomKeyConfigured: z.boolean().default(false),
  aiCustomModelConfigured: z.boolean().default(false),
  aiCustomModel: z.string().optional(),
  aiCustomPromptConfigured: z.boolean().default(false),
  aiCustomPrompt: z.string().optional(),
  aiDefaultPrompt: z.string().optional(),
  aiHintTriggerMode: aiHintTriggerModeSchema.default("auto"),
  aiStatus: aiHintStatusSchema.default("idle"),
  aiProvider: aiHintProviderSchema.optional(),
  aiModel: z.string().optional(),
  aiCoachResponse: coachResponseSchema.optional(),
  aiLastUpdatedAt: z.string().optional(),
  aiError: z.string().optional()
});

export {
  analyzeProjectRequestSchema,
  analyzeProjectResponseSchema,
  aiConfigSourceSchema,
  aiHintProviderSchema,
  aiHintStatusSchema,
  blockSummarySchema,
  coachRequestSchema,
  coachResponseSchema,
  currentTargetScriptDescriptorSchema,
  desktopCompanionStateSchema,
  desktopCompanionStatusSchema,
  detectedIssueSchema,
  hintLevelSchema,
  programAreaModuleSchema,
  projectAnalysisSchema,
  projectSnapshotSchema,
  recommendedBlockSchema,
  scratchStatePayloadSchema,
  scratchBlockDescriptorSchema,
  scriptSummarySchema,
  sessionEventSchema,
  spriteSnapshotSchema,
  variableSnapshotSchema,
  z
};
