import {
  desktopCompanionStateSchema,
  projectJsonToSnapshot,
  scratchStatePayloadSchema
} from "@scratch-ai/shared";

import { buildDesktopInjectionScript } from "./bridge-script";
import { ScratchBridgeServer } from "./bridge-server";
import { CoachService, DEFAULT_HINT_ONLY_SYSTEM_PROMPT } from "./coach-service";
import { CoachingSession } from "./coaching-session";
import { loadDeepSeekConfig } from "./deepseek-config";
import { validateDeepSeekApiKey } from "./deepseek-key-validator";
import { createScratchPlatformAdapter } from "./platform-adapter";
import { writeRuntimeLog } from "./runtime-log";
import { ScratchExecutableConfigStore } from "./scratch-config-store";
import { ScratchLauncher } from "./scratch-launcher";
import { ScratchRemoteDebugger } from "./scratch-remote-debugger";
import { StateStore } from "./state-store";
import { projectScratchPayload } from "./scratch-payload-projection";
import { normalizeAiHintTriggerMode } from "../common/types";
import type { LoadedDeepSeekConfig } from "./deepseek-config";
import type { ScratchPlatformAdapter } from "./platform-adapter";
import type { RequestSnapshot, SessionDecision } from "./coaching-session";
import type {
  AiHintTriggerMode,
  CoachResponse,
  DesktopCompanionState,
  ProgramAreaModule,
  ProjectSnapshot,
  ScratchStatePayload
} from "../common/types";

const CDP_INJECTION_TIMEOUT_MS = 15_000;
const BRIDGE_CONNECTION_SETTLE_MS = 6_000;
const MAX_CDP_INJECTION_ATTEMPTS = 5;
const LOCAL_REMINDER_MODEL = "local-reminder";

interface SessionManagerDependencies {
  log?: typeof writeRuntimeLog;
  bridgeServer?: Pick<ScratchBridgeServer, "start" | "stop" | "getBaseUrl" | "getToken"> & {
    setHandlers?: (onPayload: (payload: unknown) => void, onError: (message: string) => void) => void;
  };
  configStore?: ScratchExecutableConfigStore;
  scratchLauncher?: ScratchLauncher;
  scratchRemoteDebugger?: ScratchRemoteDebugger;
  buildInjectionScript?: typeof buildDesktopInjectionScript;
  coachService?: Pick<CoachService, "generateHint">;
  loadAiConfig?: typeof loadDeepSeekConfig;
  validateDeepSeekApiKey?: typeof validateDeepSeekApiKey;
  platform?: string;
  platformAdapter?: ScratchPlatformAdapter;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
}

type ScratchLaunchSession = Awaited<ReturnType<ScratchLauncher["launch"]>>;

function trimText(value?: string) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate || undefined;
}

function buildMissingDeepSeekKeyReminder(targetName?: string): CoachResponse {
  const target = trimText(targetName) ?? "当前角色";
  return {
    answerText: `我已经先给过你一次本地基础提示了。想继续拿到更贴合 ${target} 当前积木的建议，请先点右上角“DeepSeek 设置”保存 DeepSeek Key。`,
    recommendedBlocks: [],
    nextStep: "先去“DeepSeek 设置”保存 Key，然后再点一次“生成下一步提示”。",
    detectedIssues: [
      {
        severity: "warning",
        title: "还没有可用的 DeepSeek Key",
        description: "当前只保留一次本地基础提示；继续生成前请先在设置里保存 DeepSeek Key。",
        spriteName: target
      }
    ]
  };
}

export class SessionManager {
  private readonly log: typeof writeRuntimeLog;

  private readonly bridgeServer: SessionManagerDependencies["bridgeServer"];

  private readonly configStore: ScratchExecutableConfigStore;

  private readonly scratchLauncher: ScratchLauncher;

  private readonly scratchRemoteDebugger: ScratchRemoteDebugger;

  private readonly buildInjectionScript: typeof buildDesktopInjectionScript;

  private readonly coachService: Pick<CoachService, "generateHint">;

  private readonly loadAiConfig: typeof loadDeepSeekConfig;

  private readonly validateDeepSeekApiKey: typeof validateDeepSeekApiKey;

  private readonly platform: string;

  private readonly platformAdapter: ScratchPlatformAdapter;

  private readonly now: () => number;

  private config: {
    scratchExecutablePath?: string;
    customAiApiKey?: string;
    customAiModel?: string;
    customAiPrompt?: string;
    aiHintTriggerMode?: AiHintTriggerMode;
    lessonGoal?: string;
    lastScratchLocale?: string;
  } = {};

  private activeLaunchSession?: ScratchLaunchSession;

  private unsubscribeLaunchExit?: () => void;

  private readonly bridgeConnectionWaiters = new Set<(connected: boolean) => void>();

  private aiConfig: LoadedDeepSeekConfig | null = null;

  private liveProjectSnapshot: ProjectSnapshot | null = null;

  private isLaunching = false;

  private readonly coachingSession: CoachingSession;

  private readonly setHintTimer: (callback: () => void, delayMs: number) => unknown;

  private readonly clearHintTimer: (timer: unknown) => void;

  private pendingHintTimer?: unknown;

  private pendingRequestBaseline?: RequestSnapshot;

  private localFallbackUsedWithoutKey = false;

  constructor(
    private readonly stateStore: StateStore,
    dependencies: SessionManagerDependencies = {}
  ) {
    this.log = dependencies.log ?? writeRuntimeLog;
    this.bridgeServer =
      dependencies.bridgeServer ??
      new ScratchBridgeServer({
        onPayload: (payload) => {
          this.handlePayload(payload);
        },
        onError: (message) => {
          this.handleBridgeError(message);
        }
      });

    this.bridgeServer.setHandlers?.(
      (payload) => {
        this.handlePayload(payload);
      },
      (message) => {
        this.handleBridgeError(message);
      }
    );

    this.configStore = dependencies.configStore ?? new ScratchExecutableConfigStore(process.cwd());
    this.scratchLauncher = dependencies.scratchLauncher ?? new ScratchLauncher();
    this.scratchRemoteDebugger = dependencies.scratchRemoteDebugger ?? new ScratchRemoteDebugger();
    this.buildInjectionScript = dependencies.buildInjectionScript ?? buildDesktopInjectionScript;
    this.coachService = dependencies.coachService ?? new CoachService();
    this.loadAiConfig = dependencies.loadAiConfig ?? loadDeepSeekConfig;
    this.validateDeepSeekApiKey = dependencies.validateDeepSeekApiKey ?? validateDeepSeekApiKey;
    this.platformAdapter =
      dependencies.platformAdapter ??
      createScratchPlatformAdapter(dependencies.platform ?? process.platform);
    this.platform = this.platformAdapter.id;
    this.now = dependencies.now ?? Date.now;
    this.coachingSession = new CoachingSession({
      now: this.now
    });
    this.setHintTimer = dependencies.setTimeout ?? setTimeout;
    this.clearHintTimer = dependencies.clearTimeout ?? clearTimeout;
  }

  getCurrentState() {
    return this.stateStore.getState();
  }

  async start() {
    if (!this.platformAdapter.supported) {
      this.stateStore.setState({
        status: "unsupported",
        statusText: `当前版本暂不支持 ${this.platformAdapter.displayName}`,
        detail: "当前版本已支持 Windows 和 macOS，请在受支持的平台运行这个伴随程序。",
        toolboxCategories: [],
        usedExtensions: [],
        loadedExtensions: [],
        programAreaModules: [],
        currentTargetPrograms: [],
        currentTargetScriptBlocks: [],
        currentTargetScriptXmlList: [],
        aiConfigured: false,
        aiCustomKeyConfigured: false,
        aiCustomModelConfigured: false,
        aiCustomPromptConfigured: false,
        aiHintTriggerMode: "auto",
        aiDefaultPrompt: DEFAULT_HINT_ONLY_SYSTEM_PROMPT,
        aiStatus: "idle"
      });
      return;
    }

    await this.bridgeServer.start();
    this.config = await this.configStore.load();
    await this.refreshAiConfig();
    this.setWaitingState();
  }

  async stop() {
    this.unsubscribeLaunchExit?.();
    this.unsubscribeLaunchExit = undefined;
    this.activeLaunchSession = undefined;
    this.liveProjectSnapshot = null;
    this.resetCoachingState();
    this.flushBridgeConnectionWaiters(false);
    await this.bridgeServer.stop();
  }

  async retryNow() {
    if (this.activeLaunchSession) {
      await this.ensureBridgeScriptInjected(this.activeLaunchSession);
      return;
    }

    if (this.config.scratchExecutablePath) {
      await this.launchScratchNow();
      return;
    }

    this.setWaitingState();
  }

  async setScratchExecutablePath(scratchExecutablePath: string) {
    this.config = await this.configStore.saveScratchExecutablePath(scratchExecutablePath);
    this.log(`Scratch executable configured path=${JSON.stringify(this.config.scratchExecutablePath)}`);
    this.setWaitingState();
  }

  async saveCustomAiApiKey(apiKey: string) {
    this.config = {
      ...this.config,
      ...(await this.configStore.saveCustomAiApiKey(apiKey))
    };
    if (normalizeAiHintTriggerMode(this.config.aiHintTriggerMode) !== "manual") {
      this.config.aiHintTriggerMode = "manual";
      this.config = {
        ...this.config,
        ...(await this.configStore.saveAiHintTriggerMode("manual"))
      };
    }
    this.localFallbackUsedWithoutKey = false;
    await this.refreshAiConfig();
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });
  }

  async clearCustomAiApiKey() {
    this.config = {
      ...this.config,
      ...(await this.configStore.clearCustomAiApiKey())
    };
    delete this.config.customAiApiKey;
    this.localFallbackUsedWithoutKey = false;
    await this.refreshAiConfig();
    if (!trimText(this.config.customAiApiKey) && this.aiConfig) {
      this.aiConfig = {
        ...this.aiConfig,
        configured: false,
        source: undefined,
        customKeyConfigured: false
      };
      delete this.aiConfig.apiKey;
    }
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });
  }

  async saveCustomAiModel(model: string) {
    this.config = await this.configStore.saveCustomAiModel(model);
    await this.refreshAiConfig();
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });
  }

  async testCustomAiApiKey(apiKey?: string) {
    const typedKey = trimText(apiKey);
    const savedKey = trimText(this.config.customAiApiKey) ?? trimText(this.aiConfig?.apiKey);
    const keyToTest = typedKey ?? savedKey;

    if (!keyToTest) {
      throw new Error("请先输入 DeepSeek API Key，或先保存后再测试。");
    }

    const source = typedKey ? "typed" : "saved";
    const validationConfig = await this.loadAiConfig(undefined, {
      customApiKey: keyToTest,
      customModel: trimText(this.config.customAiModel)
    });

    if (!validationConfig.configured || !trimText(validationConfig.apiKey)) {
      throw new Error("请先输入有效的 DeepSeek API Key，再测试。");
    }

    this.log(`Testing DeepSeek API key source=${source}`);

    try {
      const result = await this.validateDeepSeekApiKey(validationConfig);
      this.log(`DeepSeek API key test passed source=${source} model=${JSON.stringify(validationConfig.model)}`);
      return result.message;
    } catch (error) {
      this.log(`DeepSeek API key test failed source=${source}`, error);
      throw error;
    }
  }

  async saveCustomAiPrompt(prompt: string) {
    this.config = await this.configStore.saveCustomAiPrompt(prompt);
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });
  }

  async clearCustomAiPrompt() {
    this.config = await this.configStore.clearCustomAiPrompt();
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });
  }

  async saveAiHintTriggerMode(mode: AiHintTriggerMode) {
    this.config = await this.configStore.saveAiHintTriggerMode(normalizeAiHintTriggerMode(mode));
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });

    const currentState = this.stateStore.getState();
    if (currentState.status === "connected" && this.liveProjectSnapshot) {
      this.applySessionDecision(
        this.coachingSession.observeProject({
          mode: this.getAiHintTriggerMode(),
          target: {
            id: currentState.currentTargetId,
            name: currentState.currentTargetName
          },
          projectData: this.liveProjectSnapshot,
          currentTargetPrograms: currentState.currentTargetPrograms,
          currentTargetScriptXmlList: currentState.currentTargetScriptXmlList
        })
      );
    }
  }

  async saveLessonGoal(goal: string) {
    this.config = await this.configStore.saveLessonGoal(goal);
    const trimmed = trimText(this.config.lessonGoal);
    this.stateStore.update({
      ...this.getAiStatePatch(),
      ...(trimmed ? { lessonGoal: trimmed } : { lessonGoal: undefined }),
      aiError: undefined
    });
  }

  async requestAiHint(goal?: string) {
    if (!goal) {
      await this.refreshAiConfig();
      if (
        (!this.aiConfig?.configured || !this.aiConfig?.apiKey) &&
        (this.localFallbackUsedWithoutKey ||
          (this.stateStore.getState().aiProvider === "fallback" &&
            this.stateStore.getState().aiModel === "local-heuristic"))
      ) {
        await this.runAiHintRequest(this.coachingSession.getLatestSnapshot(), goal);
        return;
      }
      const decision = this.coachingSession.requestManualHint();
      this.log(`Manual AI hint requested action=${decision.action}`);
      if (decision.action === "idle") {
        return;
      }
      if (decision.action === "request") {
        await this.runAiHintRequest(decision.snapshot, goal);
        return;
      }
      this.applySessionDecision(decision);
      return;
    }

    const snapshot = this.coachingSession.getLatestSnapshot();
    await this.runAiHintRequest(snapshot, goal);
  }

  private async runAiHintRequest(requestSnapshot?: RequestSnapshot, goal?: string) {
    await this.refreshAiConfig();

    const currentState = this.stateStore.getState();
    const activeSnapshot = this.liveProjectSnapshot;

    if (!activeSnapshot) {
      this.stateStore.update({
        ...this.getAiStatePatch(),
        aiStatus: "error",
        aiProvider: undefined,
        aiCoachResponse: undefined,
        aiLastUpdatedAt: undefined,
        aiError: "还没读取到可分析的 Scratch 项目，请先从伴随程序打开已选 Scratch 并进入作品。"
      });
      return;
    }

    this.coachingSession.markRequestStarted(requestSnapshot);
    const trimmedGoal = this.resolveLessonGoal(goal);
    this.log(`AI hint request started goal=${JSON.stringify(trimmedGoal)}`);
    this.pendingRequestBaseline = requestSnapshot;
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiStatus: "loading",
      aiLastUpdatedAt: undefined,
      aiError: undefined
    });
    const aiConfig = this.aiConfig;
    if (!aiConfig) {
      this.stateStore.update({
        aiStatus: "error",
        aiError: "AI 配置尚未加载完成，请稍后重试。"
      });
      this.applySessionDecision(this.coachingSession.markRequestFinished());
      return;
    }

    if ((!aiConfig.configured || !aiConfig.apiKey) && this.localFallbackUsedWithoutKey) {
      const reminderResponse = buildMissingDeepSeekKeyReminder(currentState.currentTargetName);
      this.log("AI hint request skipped because DeepSeek key is still missing after one local fallback");
      this.stateStore.update({
        ...this.getAiStatePatch(),
        aiStatus: "ready",
        aiProvider: "fallback",
        aiModel: LOCAL_REMINDER_MODEL,
        aiCoachResponse: reminderResponse,
        aiLastUpdatedAt: new Date().toISOString(),
        aiError: "当前还没有保存 DeepSeek Key，请先去设置里添加。"
      });
      this.applySessionDecision(
        this.coachingSession.markRequestFinished({
          response: reminderResponse,
          baselineProjectData: this.pendingRequestBaseline?.projectData,
          baselineTarget: this.pendingRequestBaseline?.target
        })
      );
      this.pendingRequestBaseline = undefined;
      return;
    }

    const result = await this.coachService.generateHint({
      snapshot: activeSnapshot,
      projectData: requestSnapshot?.projectData,
      currentTargetPrograms: currentState.currentTargetPrograms,
      programAreaModules: currentState.programAreaModules,
      usedExtensions: currentState.usedExtensions,
      loadedExtensions: currentState.loadedExtensions,
      aiConfig,
      customSystemPrompt: this.config.customAiPrompt,
      ...(trimmedGoal ? { goal: trimmedGoal } : {})
    });

    if (result.warning) {
      this.log("DeepSeek live hint fell back to local heuristics", result.warning);
    }
    if ((!aiConfig.configured || !aiConfig.apiKey) && result.source === "fallback") {
      this.localFallbackUsedWithoutKey = true;
    }
    this.log(`AI hint request finished source=${result.source} model=${JSON.stringify(result.model)}`);

    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiStatus: "ready",
      aiProvider: result.source,
      aiModel: result.model,
      aiCoachResponse: result.coachResponse,
      aiLastUpdatedAt: new Date().toISOString(),
      aiError: result.warning
    });

    this.applySessionDecision(
      this.coachingSession.markRequestFinished({
        response: result.coachResponse,
        baselineProjectData: this.pendingRequestBaseline?.projectData,
        baselineTarget: this.pendingRequestBaseline?.target
      })
    );
    this.pendingRequestBaseline = undefined;
  }

  async launchScratchNow() {
    if (this.isLaunching) {
      return;
    }

    if (!this.config.scratchExecutablePath) {
      this.setWaitingState();
      return;
    }

    if (this.activeLaunchSession) {
      await this.ensureBridgeScriptInjected(this.activeLaunchSession);
      return;
    }

    this.isLaunching = true;
    try {
      this.stateStore.update({
        status: "injecting",
        statusText: "正在启动 Scratch Desktop…",
        launchMode: "controlled-launch",
        injectionMode: "cdp-runtime-evaluate",
        scratchExecutablePath: this.config.scratchExecutablePath,
        detail: "伴随程序会以受控模式启动 Scratch，并自动连接调试端口。",
        error: undefined
      });

      const launchSession = await this.scratchLauncher.launch(this.config.scratchExecutablePath);
      this.activeLaunchSession = launchSession;

      this.unsubscribeLaunchExit?.();
      this.unsubscribeLaunchExit = launchSession.onExit((code, signal) => {
        this.handleScratchExit(launchSession, code, signal);
      });

      this.log(
        `Scratch launched pid=${launchSession.pid} port=${launchSession.debugPort} locale=${JSON.stringify(launchSession.locale)} args=${JSON.stringify(launchSession.args)} path=${JSON.stringify(launchSession.scratchExecutablePath)}`
      );

      await this.ensureBridgeScriptInjected(launchSession);
    } catch (error) {
      this.log("Controlled Scratch launch failed", error);
      this.stateStore.update({
        status: "error",
        statusText: "启动 Scratch Desktop 失败",
        launchMode: "controlled-launch",
        injectionMode: "cdp-runtime-evaluate",
        scratchExecutablePath: this.config.scratchExecutablePath,
        error: error instanceof Error ? error.message : "Unknown launch error",
        detail: `请确认已经选择正确的 Scratch 软件（${this.platformAdapter.selectionLabel}），并允许伴随程序代为启动。`
      });
    } finally {
      this.isLaunching = false;
    }
  }

  handlePayload(rawPayload: unknown) {
    const parsed = scratchStatePayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.handleBridgeError(parsed.error.issues[0]?.message ?? "Scratch bridge payload invalid");
      return;
    }

    const payload = parsed.data as ScratchStatePayload;
    if (typeof payload.scratchLocale === "string" && payload.scratchLocale.trim()) {
      void this.rememberScratchLocale(payload.scratchLocale);
    }
    const currentState = this.stateStore.getState();
    const wasConnected = currentState.status === "connected";
    const snapshot =
      payload.projectData && typeof payload.projectData === "object"
        ? this.buildProjectSnapshot(payload.projectData as Record<string, unknown>, payload.currentTargetId, payload.currentTargetName)
        : null;
    const projection = projectScratchPayload({ payload, currentState, snapshot });
    const {
      source,
      isHeartbeat,
      toolboxCategories,
      loadedExtensions,
      usedExtensions,
      programAreaModules,
      currentTargetPrograms,
      currentTargetScriptBlocks,
      currentTargetScriptXmlList,
      hasMeaningfulPayload
    } = projection;

    if (!hasMeaningfulPayload) {
      return;
    }

    if (snapshot) {
      this.liveProjectSnapshot = snapshot;
    }

    this.log(
      `Scratch bridge payload source=${JSON.stringify(payload.source ?? "unknown")} target=${JSON.stringify(payload.currentTargetName ?? "unknown")} programs=${currentTargetPrograms.length} scripts=${currentTargetScriptBlocks.length} workspaceXml=${currentTargetScriptXmlList.length} modules=${programAreaModules.length}`
    );

    if (isHeartbeat && wasConnected) {
      this.flushBridgeConnectionWaiters(true);
      return;
    }

    this.stateStore.update({
      status: "connected",
      statusText: "已连接到 Scratch Desktop",
      scratchPid: payload.scratchPid ?? this.activeLaunchSession?.pid,
      scratchTitle: this.stateStore.getState().scratchTitle,
      scratchExecutablePath: this.config.scratchExecutablePath,
      currentTargetId: payload.currentTargetId,
      currentTargetName: payload.currentTargetName,
      currentTargetIsStage: payload.currentTargetIsStage,
      launchMode: "controlled-launch",
      injectionMode: "cdp-runtime-evaluate",
      toolboxCategories,
      usedExtensions,
      loadedExtensions,
      programAreaModules,
      currentTargetPrograms,
      currentTargetScriptBlocks,
      currentTargetScriptXmlList,
      lastUpdatedAt: payload.capturedAt ?? new Date().toISOString(),
      detail: this.buildConnectedDetail(payload.source, currentTargetPrograms),
      ...this.getAiStatePatch()
    });

    if (!wasConnected) {
      this.log(
        `Scratch bridge connected pid=${payload.scratchPid ?? this.activeLaunchSession?.pid ?? "unknown"} target=${JSON.stringify(payload.currentTargetName ?? "unknown")} toolboxCategories=${toolboxCategories.length} loadedExtensions=${loadedExtensions.length} programAreaModules=${programAreaModules.length}`
      );
    }

    if (snapshot && payload.projectData && typeof payload.projectData === "object") {
      const decision = this.coachingSession.observeProject({
        mode: this.getAiHintTriggerMode(),
        target: {
          id: payload.currentTargetId,
          name: payload.currentTargetName
        },
        projectData: payload.projectData,
        currentTargetPrograms,
        currentTargetScriptXmlList
      });

      this.applySessionDecision(decision);
    }
    this.flushBridgeConnectionWaiters(true);
  }

  getLastScratchLocale() {
    return typeof this.config.lastScratchLocale === "string" ? this.config.lastScratchLocale : undefined;
  }

  private async rememberScratchLocale(locale: string) {
    const normalizedLocale = locale.trim();
    if (!normalizedLocale || normalizedLocale === this.config.lastScratchLocale) {
      return;
    }

    this.config = await this.configStore.saveLastScratchLocale(normalizedLocale);
    this.log(`Scratch locale remembered locale=${JSON.stringify(normalizedLocale)}`);
  }

  handleBridgeError(message: string) {
    this.stateStore.update({
      status: "error",
      statusText: "监听端收到异常数据",
      launchMode: "controlled-launch",
      injectionMode: "cdp-runtime-evaluate",
      scratchExecutablePath: this.config.scratchExecutablePath,
      error: message
    });
  }

  private async ensureBridgeScriptInjected(launchSession: ScratchLaunchSession) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_CDP_INJECTION_ATTEMPTS; attempt += 1) {
      if (this.activeLaunchSession?.pid !== launchSession.pid) {
        return;
      }

      try {
        await this.injectBridgeScriptAttempt(launchSession, attempt);

        const connected = await this.waitForBridgeConnection(BRIDGE_CONNECTION_SETTLE_MS);
        if (connected) {
          return;
        }

        lastError = new Error(`Scratch bridge did not report state after injection attempt ${attempt}.`);
        this.log(
          `Scratch bridge payload not received after injection attempt=${attempt} pid=${launchSession.pid} port=${launchSession.debugPort}`
        );
      } catch (error) {
        lastError = error;
        this.log(`CDP injection attempt failed attempt=${attempt} pid=${launchSession.pid}`, error);
      }
    }

    this.stateStore.update({
      status: "error",
      statusText: "连接 Scratch 调试端口失败",
      scratchPid: launchSession.pid,
      scratchExecutablePath: launchSession.scratchExecutablePath,
      launchMode: "controlled-launch",
      injectionMode: "cdp-runtime-evaluate",
      error: lastError instanceof Error ? lastError.message : "Unknown injection error",
      detail: "Scratch 已启动，但伴随程序还没成功把读取脚本稳定注入到 renderer。"
    });
  }

  private async waitForBridgeConnection(timeoutMs: number) {
    if (this.stateStore.getState().status === "connected") {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      const onConnected = (connected: boolean) => {
        clearTimeout(timer);
        this.bridgeConnectionWaiters.delete(onConnected);
        resolve(connected);
      };

      const timer = setTimeout(() => {
        this.bridgeConnectionWaiters.delete(onConnected);
        resolve(false);
      }, timeoutMs);

      this.bridgeConnectionWaiters.add(onConnected);
    });
  }

  private flushBridgeConnectionWaiters(connected: boolean) {
    for (const waiter of this.bridgeConnectionWaiters) {
      waiter(connected);
    }
    this.bridgeConnectionWaiters.clear();
  }

  private async injectBridgeScriptAttempt(launchSession: ScratchLaunchSession, attempt: number) {
    this.log(`Preparing controlled injection for pid=${launchSession.pid} port=${launchSession.debugPort}`);
    this.stateStore.update({
      status: "injecting",
      statusText: "正在连接 Scratch 调试端口…",
      scratchPid: launchSession.pid,
      scratchExecutablePath: launchSession.scratchExecutablePath,
      launchMode: "controlled-launch",
      injectionMode: "cdp-runtime-evaluate",
      detail: `调试端口：127.0.0.1:${launchSession.debugPort}。正在尝试第 ${attempt}/${MAX_CDP_INJECTION_ATTEMPTS} 次注入。`,
      error: undefined
    });

    const injectionScript = this.buildInjectionScript(
      this.bridgeServer.getBaseUrl(),
      this.bridgeServer.getToken()
    );
    const injectionResult = await this.scratchRemoteDebugger.injectBridgeScript({
      port: launchSession.debugPort,
      script: injectionScript,
      timeoutMs: CDP_INJECTION_TIMEOUT_MS
    });

    this.log(
      `Bridge script injected via CDP pid=${launchSession.pid} port=${launchSession.debugPort} attempt=${attempt} targetTitle=${JSON.stringify(injectionResult.targetTitle)} targetUrl=${JSON.stringify(injectionResult.targetUrl)}`
    );

    this.stateStore.update({
      status: "injecting",
      statusText: "读取脚本已注入，等待 Scratch 回传状态…",
      scratchPid: launchSession.pid,
      scratchTitle: injectionResult.targetTitle,
      scratchExecutablePath: launchSession.scratchExecutablePath,
      launchMode: "controlled-launch",
      injectionMode: "cdp-runtime-evaluate",
      detail: `已连接调试端口 127.0.0.1:${launchSession.debugPort}，等待本地 bridge 回传。若未收到状态，将自动重试。`
    });
  }

  private handleScratchExit(
    launchSession: ScratchLaunchSession,
    code: number | null,
    signal: NodeJS.Signals | null
  ) {
    if (this.activeLaunchSession?.pid !== launchSession.pid) {
      return;
    }

    this.log(`Scratch process exited pid=${launchSession.pid} code=${code ?? "null"} signal=${signal ?? "null"}`);
    this.unsubscribeLaunchExit?.();
    this.unsubscribeLaunchExit = undefined;
    this.activeLaunchSession = undefined;
    this.liveProjectSnapshot = null;
    this.resetCoachingState();
    this.flushBridgeConnectionWaiters(false);
    this.setWaitingState("Scratch 已关闭，请重新点击“打开已选 Scratch”。");
  }

  private setWaitingState(detail?: string) {
    this.liveProjectSnapshot = null;
    this.resetCoachingState();

    const scratchExecutablePath = this.config.scratchExecutablePath;
    const hasScratchPath = typeof scratchExecutablePath === "string" && scratchExecutablePath.length > 0;

    const nextState: DesktopCompanionState = {
      status: "waiting",
      statusText: hasScratchPath ? "请从伴随程序打开已选 Scratch" : "请先选择 Scratch 软件",
      launchMode: "controlled-launch",
      injectionMode: "cdp-runtime-evaluate",
      toolboxCategories: [],
      usedExtensions: [],
      loadedExtensions: [],
      programAreaModules: [],
      currentTargetPrograms: [],
      currentTargetScriptBlocks: [],
      currentTargetScriptXmlList: [],
      aiConfigured: this.aiConfig?.configured ?? false,
      aiCustomKeyConfigured: this.aiConfig?.customKeyConfigured ?? false,
      aiCustomModelConfigured: Boolean(trimText(this.config.customAiModel)),
      aiCustomPromptConfigured: Boolean(trimText(this.config.customAiPrompt)),
      aiHintTriggerMode: this.getAiHintTriggerMode(),
      ...(trimText(this.config.lessonGoal) ? { lessonGoal: trimText(this.config.lessonGoal) as string } : {}),
      aiDefaultPrompt: DEFAULT_HINT_ONLY_SYSTEM_PROMPT,
      aiStatus: "idle",
      detail: detail ?? this.buildWaitingDetail(hasScratchPath, scratchExecutablePath)
    };

    if (hasScratchPath) {
      nextState.scratchExecutablePath = scratchExecutablePath;
    }

    if (this.aiConfig?.configPath) {
      nextState.aiConfigPath = this.aiConfig.configPath;
    }

    if (this.aiConfig?.source) {
      nextState.aiConfigSource = this.aiConfig.source;
    }

    if (this.aiConfig?.model) {
      nextState.aiModel = this.aiConfig.model;
    }

    if (this.config.customAiModel) {
      nextState.aiCustomModel = this.config.customAiModel;
    }

    if (this.config.customAiPrompt) {
      nextState.aiCustomPrompt = this.config.customAiPrompt;
    }

    this.stateStore.setState(desktopCompanionStateSchema.parse(nextState));
  }

  private async refreshAiConfig() {
    this.aiConfig = await this.loadAiConfig(undefined, {
      customApiKey: this.config.customAiApiKey,
      customModel: this.config.customAiModel
    });
    return this.aiConfig;
  }

  private getAiStatePatch() {
    return {
      aiConfigured: this.aiConfig?.configured ?? false,
      aiConfigPath: this.aiConfig?.configPath,
      aiConfigSource: this.aiConfig?.source,
      aiCustomKeyConfigured: this.aiConfig?.customKeyConfigured ?? false,
      aiCustomModelConfigured: Boolean(trimText(this.config.customAiModel)),
      aiCustomModel: this.config.customAiModel,
      aiCustomPromptConfigured: Boolean(trimText(this.config.customAiPrompt)),
      aiCustomPrompt: this.config.customAiPrompt,
      aiHintTriggerMode: this.getAiHintTriggerMode(),
      lessonGoal: trimText(this.config.lessonGoal) || undefined,
      aiDefaultPrompt: DEFAULT_HINT_ONLY_SYSTEM_PROMPT,
      aiModel: this.aiConfig?.model
    };
  }

  private getAiHintTriggerMode(): AiHintTriggerMode {
    return normalizeAiHintTriggerMode(this.config.aiHintTriggerMode);
  }

  private resolveLessonGoal(goal?: string) {
    return trimText(goal) ?? trimText(this.config.lessonGoal) ?? trimText(this.stateStore.getState().lessonGoal);
  }

  private resetCoachingState() {
    if (this.pendingHintTimer) {
      this.clearHintTimer(this.pendingHintTimer);
      this.pendingHintTimer = undefined;
    }
    this.pendingRequestBaseline = undefined;
    this.localFallbackUsedWithoutKey = false;
    this.coachingSession.reset();
  }

  private applySessionDecision(decision: SessionDecision | undefined) {
    if (!decision) {
      return;
    }

    if (decision.action === "scheduled") {
      this.scheduleDueHintRequest(decision.runAt);
      if (!decision.keepExistingHint) {
        this.stateStore.update({
          aiStatus: "loading",
          aiProvider: undefined,
          aiCoachResponse: undefined,
          aiLastUpdatedAt: undefined,
          aiError: undefined
        });
      }
      return;
    }

    if (decision.action === "clear-hint") {
      if (this.pendingHintTimer) {
        this.clearHintTimer(this.pendingHintTimer);
        this.pendingHintTimer = undefined;
      }
      this.stateStore.update({
        aiStatus: "idle",
        aiProvider: undefined,
        aiCoachResponse: undefined,
        aiLastUpdatedAt: undefined,
        aiError: undefined
      });
      return;
    }

    if (decision.action === "queued" && !decision.keepExistingHint) {
      this.stateStore.update({
        aiStatus: "loading",
        aiProvider: undefined,
        aiCoachResponse: undefined,
        aiLastUpdatedAt: undefined,
        aiError: undefined
      });
      return;
    }

    if (decision.action === "request") {
      void this.runAiHintRequest(decision.snapshot).catch((error) => {
        this.log("Automatic hint request failed", error);
      });
    }
  }

  private scheduleDueHintRequest(runAt?: number) {
    if (this.pendingHintTimer) {
      this.clearHintTimer(this.pendingHintTimer);
      this.pendingHintTimer = undefined;
    }

    if (typeof runAt !== "number") {
      return;
    }

    const delayMs = Math.max(0, runAt - this.now());
    this.pendingHintTimer = this.setHintTimer(() => {
      this.pendingHintTimer = undefined;
      this.applySessionDecision(this.coachingSession.consumeDueRequest());
    }, delayMs);
  }

  private buildProjectSnapshot(
    projectData: Record<string, unknown>,
    currentTargetId?: string,
    currentTargetName?: string
  ) {
    try {
      return projectJsonToSnapshot(projectData, {
        currentTargetId,
        currentTargetName
      }) as ProjectSnapshot;
    } catch (error) {
      this.log("Failed to build project snapshot", error);
      return null;
    }
  }

  private buildConnectedDetail(source?: string, currentTargetPrograms: string[] = []) {
    const base = `最近更新来源：${source ?? "unknown"}`;
    if (currentTargetPrograms.length === 0) {
      return this.getAiHintTriggerMode() === "manual"
        ? `${base}；当前 Scratch 还是新项目。先做一个最小脚本，再点“生成下一步提示”继续推进。`
        : `${base}；当前 Scratch 还是新项目。先做一个最小脚本，之后我会自动刷新下一步提示。`;
    }

    return this.getAiHintTriggerMode() === "manual"
      ? `${base}；AI 会继续根据当前作品进度，给出下一步建议。`
      : `${base}；AI 会在你修改积木后，自动刷新下一步建议。`;
  }

  private buildWaitingDetail(
    hasScratchPath: boolean,
    scratchExecutablePath: string | undefined
  ) {
    if (hasScratchPath && scratchExecutablePath) {
      return `已配置 Scratch 软件：${scratchExecutablePath}。点击“打开已选 Scratch”后，伴随程序会自动连接调试端口。`;
    }

    return `本地监听端已启动：${this.bridgeServer.getBaseUrl()}。请先选择本机的 Scratch 软件（${this.platformAdapter.selectionLabel}）。`;
  }
}
