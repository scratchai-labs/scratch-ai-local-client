import { analyzeRecommendationProgress } from "../common/recommendation-matcher";
import type {
  AiHintTriggerMode,
  CoachResponse,
  RecommendedBlockStructure
} from "../common/types";

const AUTO_DEBOUNCE_MS = 3_000;

interface CurrentTargetMeta {
  id?: string;
  name?: string;
}

export interface ProjectObservation {
  mode: AiHintTriggerMode;
  projectId?: string;
  target?: CurrentTargetMeta;
  projectData: unknown;
  currentTargetPrograms: string[];
  currentTargetScriptXmlList: string[];
}

export interface RequestSnapshot extends ProjectObservation {
  signature: string;
  identity: string;
}

export type RequestReason =
  | "auto-change"
  | "recommendation-completed"
  | "student-diverged"
  | "identity-changed"
  | "manual";

export type SessionDecision =
  | { action: "idle" }
  | { action: "clear-hint" }
  | { action: "keep-current" }
  | {
      action: "scheduled" | "queued";
      reason: RequestReason;
      runAt?: number;
      keepExistingHint: boolean;
    }
  | {
      action: "request";
      reason: RequestReason;
      snapshot: RequestSnapshot;
      keepExistingHint: boolean;
    };

interface RequestResult {
  response?: Partial<CoachResponse>;
  baselineProjectData?: unknown;
  baselineTarget?: CurrentTargetMeta;
}

interface ActiveRecommendation {
  recommendation: RecommendedBlockStructure;
  baselineProjectData: unknown;
  baselineTarget?: CurrentTargetMeta;
}

interface PendingRequest {
  reason: RequestReason;
  snapshot: RequestSnapshot;
  runAt: number;
  keepExistingHint: boolean;
}

interface CoachingSessionDependencies {
  now?: () => number;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildIdentity(observation: Pick<ProjectObservation, "projectId" | "target">) {
  return JSON.stringify({
    projectId: normalizeString(observation.projectId),
    targetId: normalizeString(observation.target?.id),
    targetName: normalizeString(observation.target?.name)
  });
}

function buildSignature(observation: Pick<ProjectObservation, "projectId" | "target" | "currentTargetPrograms" | "currentTargetScriptXmlList">) {
  return JSON.stringify({
    projectId: normalizeString(observation.projectId),
    targetId: normalizeString(observation.target?.id),
    targetName: normalizeString(observation.target?.name),
    currentTargetPrograms: observation.currentTargetPrograms,
    currentTargetScriptXmlList: observation.currentTargetScriptXmlList
  });
}

function hasVisibleBlocks(observation: ProjectObservation) {
  return observation.currentTargetPrograms.length > 0 || observation.currentTargetScriptXmlList.length > 0;
}

function toSnapshot(observation: ProjectObservation): RequestSnapshot {
  return {
    ...observation,
    signature: buildSignature(observation),
    identity: buildIdentity(observation)
  };
}

export class CoachingSession {
  private readonly now: () => number;

  private latestSnapshot?: RequestSnapshot;

  private pendingRequest?: PendingRequest;

  private activeRecommendation?: ActiveRecommendation;

  private requestRunning = false;

  private lastCompletedSignature?: string;

  private lastManualSignature?: string;

  private currentIdentity?: string;

  constructor(dependencies: CoachingSessionDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
  }

  observeProject(observation: ProjectObservation): SessionDecision {
    const snapshot = toSnapshot(observation);
    const previousIdentity = this.currentIdentity;
    const identityChanged = Boolean(previousIdentity && previousIdentity !== snapshot.identity);
    this.currentIdentity = snapshot.identity;
    this.latestSnapshot = snapshot;

    if (!hasVisibleBlocks(observation)) {
      this.pendingRequest = undefined;
      this.activeRecommendation = undefined;
      this.lastManualSignature = undefined;
      this.lastCompletedSignature = undefined;
      return { action: "clear-hint" };
    }

    if (identityChanged) {
      this.activeRecommendation = undefined;
      this.lastManualSignature = undefined;
      this.lastCompletedSignature = undefined;
      if (observation.mode !== "auto") {
        this.pendingRequest = undefined;
        return { action: "idle" };
      }
      return this.scheduleOrQueue("identity-changed", snapshot, false);
    }

    if (this.activeRecommendation) {
      const progress = analyzeRecommendationProgress({
        baselineProjectData: this.activeRecommendation.baselineProjectData,
        currentProjectData: snapshot.projectData,
        currentTarget: snapshot.target,
        recommendation: this.activeRecommendation.recommendation
      });

      if (progress.status === "following") {
        this.pendingRequest = undefined;
        return { action: "keep-current" };
      }

      if (progress.status === "completed") {
        if (this.lastCompletedSignature === snapshot.signature) {
          return { action: "keep-current" };
        }
        this.lastCompletedSignature = snapshot.signature;
        return this.scheduleOrQueue("recommendation-completed", snapshot, true);
      }

      if (progress.status === "diverged") {
        this.activeRecommendation = undefined;
        return this.scheduleOrQueue("student-diverged", snapshot, false);
      }
    }

    if (observation.mode !== "auto") {
      this.pendingRequest = undefined;
      return { action: "idle" };
    }

    return this.scheduleOrQueue("auto-change", snapshot, true);
  }

  consumeDueRequest(): SessionDecision | undefined {
    if (!this.pendingRequest || this.requestRunning || this.pendingRequest.runAt > this.now()) {
      return undefined;
    }

    const pending = this.pendingRequest;
    this.pendingRequest = undefined;
    if (pending.reason !== "manual") {
    }

    return {
      action: "request",
      reason: pending.reason,
      snapshot: pending.snapshot,
      keepExistingHint: pending.keepExistingHint
    };
  }

  requestManualHint(): SessionDecision {
    if (!this.latestSnapshot) {
      return { action: "idle" };
    }

    if (!hasVisibleBlocks(this.latestSnapshot)) {
      this.pendingRequest = undefined;
      this.lastManualSignature = undefined;
      return { action: "clear-hint" };
    }

    if (this.requestRunning) {
      return this.scheduleOrQueue("manual", this.latestSnapshot, true);
    }

    if (this.lastManualSignature === this.latestSnapshot.signature) {
      return { action: "idle" };
    }

    this.lastManualSignature = this.latestSnapshot.signature;
    return {
      action: "request",
      reason: "manual",
      snapshot: this.latestSnapshot,
      keepExistingHint: true
    };
  }

  markRequestStarted() {
    this.requestRunning = true;
  }

  markRequestFinished(result: RequestResult = {}): SessionDecision {
    this.requestRunning = false;

    const recommendation = result.response?.recommendation;
    if (recommendation) {
      this.activeRecommendation = {
        recommendation,
        baselineProjectData: result.baselineProjectData ?? this.latestSnapshot?.projectData,
        baselineTarget: result.baselineTarget ?? this.latestSnapshot?.target
      };
      this.lastCompletedSignature = undefined;
    }

    if (!this.pendingRequest || !this.latestSnapshot) {
      return { action: "idle" };
    }

    const pending = this.pendingRequest;
    return this.scheduleOrQueue(pending.reason, this.latestSnapshot, pending.keepExistingHint);
  }

  reset() {
    this.latestSnapshot = undefined;
    this.pendingRequest = undefined;
    this.activeRecommendation = undefined;
    this.requestRunning = false;
    this.lastCompletedSignature = undefined;
    this.lastManualSignature = undefined;
    this.currentIdentity = undefined;
  }

  getLatestSnapshot() {
    return this.latestSnapshot;
  }

  private scheduleOrQueue(
    reason: RequestReason,
    snapshot: RequestSnapshot,
    keepExistingHint: boolean
  ): SessionDecision {
    if (this.requestRunning) {
      this.pendingRequest = {
        reason,
        snapshot,
        runAt: this.getNextAutoRunAt(),
        keepExistingHint
      };
      return {
        action: "queued",
        reason,
        keepExistingHint
      };
    }

    const runAt = this.getNextAutoRunAt();
    this.pendingRequest = {
      reason,
      snapshot,
      runAt,
      keepExistingHint
    };

    return {
      action: "scheduled",
      reason,
      runAt,
      keepExistingHint
    };
  }

  private getNextAutoRunAt() {
    return this.now() + AUTO_DEBOUNCE_MS;
  }
}
