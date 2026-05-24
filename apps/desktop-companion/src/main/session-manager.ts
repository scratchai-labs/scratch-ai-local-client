import {
  desktopCompanionStateSchema,
  getModuleIdForOpcode,
  getUsedExtensionsFromProject,
  projectJsonToSnapshot,
  scratchStatePayloadSchema,
  summarizeProgramAreaModulesFromProject
} from "@scratch-ai/shared";

import { buildDesktopInjectionScript } from "./bridge-script";
import { ScratchBridgeServer } from "./bridge-server";
import { CoachService, DEFAULT_HINT_ONLY_SYSTEM_PROMPT } from "./coach-service";
import { loadDeepSeekConfig } from "./deepseek-config";
import { createScratchPlatformAdapter } from "./platform-adapter";
import { writeRuntimeLog } from "./runtime-log";
import { ScratchExecutableConfigStore } from "./scratch-config-store";
import { ScratchLauncher } from "./scratch-launcher";
import { ScratchRemoteDebugger } from "./scratch-remote-debugger";
import { StateStore } from "./state-store";
import { buildCurrentTargetScriptXmlList } from "../common/scratch-block-xml";
import { normalizeAiHintTriggerMode } from "../common/types";
import type { LoadedDeepSeekConfig } from "./deepseek-config";
import type { ScratchPlatformAdapter } from "./platform-adapter";
import type {
  AiHintTriggerMode,
  CurrentTargetScriptDescriptor,
  DesktopCompanionState,
  ProgramAreaModule,
  ProjectSnapshot,
  ScratchStatePayload
} from "../common/types";

const CDP_INJECTION_TIMEOUT_MS = 15_000;
const BRIDGE_CONNECTION_SETTLE_MS = 6_000;
const MAX_CDP_INJECTION_ATTEMPTS = 5;

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
  platform?: string;
  platformAdapter?: ScratchPlatformAdapter;
}

type ScratchLaunchSession = Awaited<ReturnType<ScratchLauncher["launch"]>>;

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

          return {
            opcode,
            categoryId,
            label
          };
        })
        .filter((block): block is CurrentTargetScriptDescriptor["blocks"][number] => Boolean(block))
    }))
    .filter((script) => script.blocks.length > 0);
}

function trimText(value?: string) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate || undefined;
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

  private readonly platform: string;

  private readonly platformAdapter: ScratchPlatformAdapter;

  private config: {
    scratchExecutablePath?: string;
    customAiApiKey?: string;
    customAiModel?: string;
    customAiPrompt?: string;
    aiHintTriggerMode?: AiHintTriggerMode;
  } = {};

  private activeLaunchSession?: ScratchLaunchSession;

  private unsubscribeLaunchExit?: () => void;

  private readonly bridgeConnectionWaiters = new Set<(connected: boolean) => void>();

  private aiConfig: LoadedDeepSeekConfig | null = null;

  private liveProjectSnapshot: ProjectSnapshot | null = null;

  private isLaunching = false;

  private autoHintRefreshRunning = false;

  private queuedAutoHintSignature?: string;

  private lastAutoHintSignature?: string;

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
    this.platformAdapter =
      dependencies.platformAdapter ??
      createScratchPlatformAdapter(dependencies.platform ?? process.platform);
    this.platform = this.platformAdapter.id;
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
    this.resetAutoHintRefreshState();
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
    this.config = await this.configStore.saveCustomAiApiKey(apiKey);
    await this.refreshAiConfig();
    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiError: undefined
    });
  }

  async clearCustomAiApiKey() {
    this.config = await this.configStore.clearCustomAiApiKey();
    await this.refreshAiConfig();
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

    if (this.getAiHintTriggerMode() === "manual") {
      this.queuedAutoHintSignature = undefined;
      return;
    }

    const currentState = this.stateStore.getState();
    const signature = this.buildAutoHintRefreshSignature(
      currentState.currentTargetId,
      currentState.currentTargetName,
      currentState.currentTargetPrograms,
      currentState.currentTargetScriptXmlList
    );

    if (currentState.status === "connected" && this.liveProjectSnapshot && signature) {
      this.queueAutoHintRefresh(signature);
    }
  }

  async requestAiHint(goal?: string) {
    await this.refreshAiConfig();

    const currentState = this.stateStore.getState();
    const activeSnapshot = this.liveProjectSnapshot;
    const currentHintSignature = this.buildAutoHintRefreshSignature(
      currentState.currentTargetId,
      currentState.currentTargetName,
      currentState.currentTargetPrograms,
      currentState.currentTargetScriptXmlList
    );

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

    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiStatus: "loading",
      aiProvider: undefined,
      aiCoachResponse: undefined,
      aiLastUpdatedAt: undefined,
      aiError: undefined
    });

    const trimmedGoal = trimText(goal);
    const aiConfig = this.aiConfig;
    if (!aiConfig) {
      this.stateStore.update({
        aiStatus: "error",
        aiError: "AI 配置尚未加载完成，请稍后重试。"
      });
      if (currentHintSignature) {
        this.lastAutoHintSignature = currentHintSignature;
      }
      return;
    }

    const result = await this.coachService.generateHint({
      snapshot: activeSnapshot,
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

    this.stateStore.update({
      ...this.getAiStatePatch(),
      aiStatus: "ready",
      aiProvider: result.source,
      aiModel: result.model,
      aiCoachResponse: result.coachResponse,
      aiLastUpdatedAt: new Date().toISOString(),
      aiError: result.warning
    });

    if (currentHintSignature) {
      this.lastAutoHintSignature = currentHintSignature;
    }
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
        `Scratch launched pid=${launchSession.pid} port=${launchSession.debugPort} path=${JSON.stringify(launchSession.scratchExecutablePath)}`
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
    const wasConnected = this.stateStore.getState().status === "connected";
    const toolboxCategories = Array.isArray(payload.toolboxCategories) ? payload.toolboxCategories : [];
    const loadedExtensions = Array.isArray(payload.loadedExtensions)
      ? Array.from(new Set(payload.loadedExtensions)).sort()
      : this.stateStore.getState().loadedExtensions;
    const snapshot =
      payload.projectData && typeof payload.projectData === "object"
        ? this.buildProjectSnapshot(payload.projectData as Record<string, unknown>, payload.currentTargetId, payload.currentTargetName)
        : null;
    const usedExtensions =
      payload.projectData && typeof payload.projectData === "object"
        ? getUsedExtensionsFromProject(payload.projectData as Record<string, unknown>)
        : this.stateStore.getState().usedExtensions;
    const programAreaModules =
      Array.isArray(payload.programAreaModules) && payload.programAreaModules.length > 0
        ? payload.programAreaModules
        : payload.projectData && typeof payload.projectData === "object"
          ? summarizeProgramAreaModulesFromProject(payload.projectData as Record<string, unknown>, {
              id: payload.currentTargetId,
              name: payload.currentTargetName
            })
          : this.stateStore.getState().programAreaModules;
    const currentTargetPrograms =
      snapshot
        ? deriveCurrentTargetPrograms(snapshot, payload.currentTargetName)
        : this.stateStore.getState().currentTargetPrograms;
    const currentTargetScriptBlocks =
      snapshot
        ? deriveCurrentTargetScriptBlocks(snapshot, payload.currentTargetName)
        : this.stateStore.getState().currentTargetScriptBlocks;
    const currentTargetScriptXmlList =
      payload.projectData && typeof payload.projectData === "object"
        ? buildCurrentTargetScriptXmlList(payload.projectData as Record<string, unknown>, {
            id: payload.currentTargetId,
            name: payload.currentTargetName
          })
        : this.stateStore.getState().currentTargetScriptXmlList;

    if (
      !payload.projectData &&
      toolboxCategories.length === 0 &&
      loadedExtensions.length === 0 &&
      programAreaModules.length === 0 &&
      currentTargetPrograms.length === 0 &&
      currentTargetScriptBlocks.length === 0 &&
      currentTargetScriptXmlList.length === 0
    ) {
      return;
    }

    if (snapshot) {
      this.liveProjectSnapshot = snapshot;
    }

    const nextAutoHintSignature = this.buildAutoHintRefreshSignature(
      payload.currentTargetId,
      payload.currentTargetName,
      currentTargetPrograms,
      currentTargetScriptXmlList
    );

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

    if (snapshot && this.getAiHintTriggerMode() === "auto" && nextAutoHintSignature) {
      this.queueAutoHintRefresh(nextAutoHintSignature);
    }
    this.flushBridgeConnectionWaiters(true);
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
    this.resetAutoHintRefreshState();
    this.flushBridgeConnectionWaiters(false);
    this.setWaitingState("Scratch 已关闭，请重新点击“打开已选 Scratch”。");
  }

  private setWaitingState(detail?: string) {
    this.liveProjectSnapshot = null;
    this.resetAutoHintRefreshState();

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
      aiDefaultPrompt: DEFAULT_HINT_ONLY_SYSTEM_PROMPT,
      aiModel: this.aiConfig?.model
    };
  }

  private getAiHintTriggerMode(): AiHintTriggerMode {
    return normalizeAiHintTriggerMode(this.config.aiHintTriggerMode);
  }

  private resetAutoHintRefreshState() {
    this.autoHintRefreshRunning = false;
    this.queuedAutoHintSignature = undefined;
    this.lastAutoHintSignature = undefined;
  }

  private buildAutoHintRefreshSignature(
    currentTargetId: string | undefined,
    currentTargetName: string | undefined,
    currentTargetPrograms: string[],
    currentTargetScriptXmlList: string[]
  ) {
    return JSON.stringify({
      currentTargetId: currentTargetId ?? "",
      currentTargetName: currentTargetName ?? "",
      currentTargetPrograms,
      currentTargetScriptXmlList
    });
  }

  private queueAutoHintRefresh(signature: string) {
    if (this.getAiHintTriggerMode() !== "auto") {
      return;
    }

    if (this.lastAutoHintSignature === signature || this.queuedAutoHintSignature === signature) {
      return;
    }

    this.queuedAutoHintSignature = signature;
    if (this.autoHintRefreshRunning) {
      return;
    }

    void this.flushAutoHintRefreshQueue().catch((error) => {
      this.log("Automatic hint refresh after Scratch change failed", error);
    });
  }

  private async flushAutoHintRefreshQueue() {
    if (this.autoHintRefreshRunning) {
      return;
    }

    while (this.queuedAutoHintSignature && this.getAiHintTriggerMode() === "auto" && this.liveProjectSnapshot) {
      const signature = this.queuedAutoHintSignature;
      this.queuedAutoHintSignature = undefined;

      if (this.lastAutoHintSignature === signature) {
        continue;
      }

      this.autoHintRefreshRunning = true;
      try {
        await this.requestAiHint();
      } finally {
        this.autoHintRefreshRunning = false;
        this.lastAutoHintSignature = signature;
      }
    }
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
