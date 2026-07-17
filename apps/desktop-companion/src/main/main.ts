import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { desktopCompanionStateSchema } from "@scratch-ai/shared";
import { BrowserWindow, Menu, Tray, app, clipboard, dialog, ipcMain, shell } from "electron";

import { getLaunchOptions } from "../common/launch-options";
import { registerDesktopIpcHandlers } from "./desktop-ipc";
import { createDesktopWindowFactory } from "./desktop-windows";
import { createScratchPlatformAdapter } from "./platform-adapter";
import { getRuntimeLogPath, initializeRuntimeLog, writeRuntimeLog } from "./runtime-log";
import { ScratchExecutableConfigStore } from "./scratch-config-store";
import { SessionManager } from "./session-manager";
import { ScratchLauncher } from "./scratch-launcher";
import { StateStore } from "./state-store";
import { getIconAssetPath } from "./icon-assets";
import { createTrayIcon } from "./tray-icon";
import type { DesktopCompanionState } from "../common/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let windowRef: BrowserWindow | null = null;
let settingsWindowRef: BrowserWindow | null = null;
let trayRef: Tray | null = null;
let isQuitting = false;

const stateStore = new StateStore();
let sessionManager: SessionManager | null = null;
const launchOptions = getLaunchOptions(process.argv);
const automationActionCounts = {
  retry: 0,
  launchScratch: 0,
  chooseScratchExecutable: 0
};

const WINDOWS_APP_ID = "com.scratchai.desktopcompanion";
const scratchPlatformAdapter = createScratchPlatformAdapter(process.platform);
const USER_DATA_DIR =
  process.env.SCRATCH_AI_USER_DATA_DIR?.trim() ||
  scratchPlatformAdapter.getDefaultUserDataDir(app.getPath("appData"));

const desktopWindowFactory = createDesktopWindowFactory(
  { BrowserWindow, Menu, clipboard },
  {
    rendererDirectory: __dirname,
    iconPath: getIconAssetPath("app-icon.png"),
    platform: process.platform,
    onRendererLoadFailure: (errorCode, errorDescription) => {
      writeRuntimeLog(`renderer failed to load: ${errorCode} ${errorDescription}`);
    }
  }
);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

if (process.platform === "win32") {
  app.setAppUserModelId(WINDOWS_APP_ID);
}
app.setPath("userData", USER_DATA_DIR);

function showMainWindow() {
  desktopWindowFactory.showMainWindow(windowRef);
}

function hideMainWindow() {
  desktopWindowFactory.hideMainWindow(windowRef);
}

function updateTrayTooltip() {
  if (!trayRef) {
    return;
  }

  const state = stateStore.getState();
  trayRef.setToolTip(`Scratch AI 教练\n${state.statusText}`);
}

function showSettingsWindow() {
  if (!settingsWindowRef) {
    settingsWindowRef = desktopWindowFactory.createSettingsWindow({
      parent: windowRef,
      onClosed: () => {
        settingsWindowRef = null;
      }
    });
  }

  settingsWindowRef.show();
  settingsWindowRef.focus();
}

function createTray() {
  const tray = new Tray(createTrayIcon().resize({ width: 16, height: 16 }));

  const rebuildMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "显示监听窗口",
          click: () => {
            showMainWindow();
          }
        },
        {
          label: "隐藏到托盘",
          click: () => {
            hideMainWindow();
          }
        },
        {
          label: "选择 Scratch 软件",
          click: async () => {
            await chooseScratchExecutable("tray");
          }
        },
        {
          label: "打开已选 Scratch",
          click: () => {
            void sessionManager?.launchScratchNow();
          }
        },
        {
          label: "重新连接 Scratch",
          click: () => {
            void sessionManager?.retryNow();
          }
        },
        {
          label: "DeepSeek 设置",
          click: () => {
            showSettingsWindow();
          }
        },
        { type: "separator" },
        {
          label: "退出监听",
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ])
    );
  };

  rebuildMenu();
  tray.on("double-click", () => {
    showMainWindow();
  });
  tray.on("click", () => {
    if (windowRef?.isVisible()) {
      hideMainWindow();
      return;
    }
    showMainWindow();
  });

  updateTrayTooltip();
  return tray;
}

function createMainWindow(startHidden: boolean) {
  return desktopWindowFactory.createMainWindow({
    startHidden,
    shouldHideOnClose: () => !isQuitting && Boolean(trayRef),
    onHideRequested: hideMainWindow
  });
}

function getAutomationScratchExecutablePath() {
  return (
    launchOptions.automationScratchExecutablePath?.trim() ||
    stateStore.getState().scratchExecutablePath ||
    scratchPlatformAdapter.defaultAutomationScratchExecutablePath
  );
}

function applyAutomationAction(action: keyof typeof automationActionCounts) {
  automationActionCounts[action] += 1;
  const currentState = stateStore.getState();
  const detail = `automation:${action}#${automationActionCounts[action]}`;
  const nextState: Partial<DesktopCompanionState> = {
    detail,
    error: undefined,
    lastUpdatedAt: new Date().toISOString()
  };

  if (action === "chooseScratchExecutable") {
    nextState.scratchExecutablePath = getAutomationScratchExecutablePath();
  }

  stateStore.update(nextState);
  writeRuntimeLog(`automation action applied action=${action} detail=${JSON.stringify(detail)}`);
  return nextState.scratchExecutablePath ?? null;
}

async function handleRetryNow() {
  if (launchOptions.automationActions) {
    applyAutomationAction("retry");
    return;
  }
  await sessionManager?.retryNow();
}

async function handleLaunchScratchNow() {
  if (launchOptions.automationActions) {
    applyAutomationAction("launchScratch");
    return;
  }
  await sessionManager?.launchScratchNow();
}

async function handleRequestAiHint(goal?: string) {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.requestAiHint(goal);
}

async function handleSaveCustomAiApiKey(apiKey: string) {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.saveCustomAiApiKey(apiKey);
}

async function handleTestCustomAiApiKey(apiKey?: string) {
  if (launchOptions.automationActions) {
    return "自动化模式下未执行 DeepSeek Key 测试。";
  }
  return await sessionManager?.testCustomAiApiKey(apiKey);
}

async function handleClearCustomAiApiKey() {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.clearCustomAiApiKey();
}

async function handleSaveCustomAiModel(model: string) {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.saveCustomAiModel(model);
}

async function handleSaveAiHintTriggerMode(mode: "auto" | "manual") {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.saveAiHintTriggerMode(mode);
}

async function handleSaveLessonGoal(goal: string) {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.saveLessonGoal(goal);
}

async function handleSaveCustomAiPrompt(prompt: string) {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.saveCustomAiPrompt(prompt);
}

async function handleClearCustomAiPrompt() {
  if (launchOptions.automationActions) {
    return;
  }
  await sessionManager?.clearCustomAiPrompt();
}

async function handleChooseScratchExecutable() {
  if (launchOptions.automationActions) {
    return applyAutomationAction("chooseScratchExecutable");
  }
  return await chooseScratchExecutable("window");
}

registerDesktopIpcHandlers(ipcMain, {
  getState: () => stateStore.getState(),
  retry: handleRetryNow,
  launchScratch: handleLaunchScratchNow,
  openSettings: showSettingsWindow,
  requestAiHint: handleRequestAiHint,
  saveCustomAiApiKey: handleSaveCustomAiApiKey,
  testCustomAiApiKey: handleTestCustomAiApiKey,
  clearCustomAiApiKey: handleClearCustomAiApiKey,
  saveCustomAiModel: handleSaveCustomAiModel,
  saveAiHintTriggerMode: handleSaveAiHintTriggerMode,
  saveLessonGoal: handleSaveLessonGoal,
  saveCustomAiPrompt: handleSaveCustomAiPrompt,
  clearCustomAiPrompt: handleClearCustomAiPrompt,
  chooseScratchExecutable: handleChooseScratchExecutable
});

app.on("second-instance", () => {
  showMainWindow();
});

function showStartupError(error: unknown) {
  const logPath = getRuntimeLogPath();
  const message = error instanceof Error ? error.message : String(error);
  const detail = logPath ? `日志文件：${logPath}` : "未能创建日志文件。";
  dialog.showErrorBox("Scratch AI 教练启动失败", `${message}\n\n${detail}`);
}

async function findScratchExecutableCandidatesWithShortcuts() {
  const publicProfile = process.env.PUBLIC?.trim();
  const publicDesktopPath = publicProfile ? path.join(publicProfile, "Desktop") : undefined;
  return await scratchPlatformAdapter.findScratchExecutableCandidates({
    env: process.env,
    homeDir: app.getPath("home"),
    desktopPath: app.getPath("desktop"),
    publicDesktopPath,
    readShortcutLink: (shortcutPath) => shell.readShortcutLink(shortcutPath)
  });
}

async function autoConfigureScratchExecutableIfNeeded() {
  if (!sessionManager) {
    return;
  }

  const currentScratchPath = stateStore.getState().scratchExecutablePath;
  if (currentScratchPath) {
    writeRuntimeLog(`scratch executable already configured path=${JSON.stringify(currentScratchPath)}`);
    return;
  }

  const autoDetectedCandidates = await findScratchExecutableCandidatesWithShortcuts();
  writeRuntimeLog(
    `startup scratch auto-detect count=${autoDetectedCandidates.length} candidates=${JSON.stringify(autoDetectedCandidates)}`
  );

  if (autoDetectedCandidates.length !== 1) {
    return;
  }

  const detectedPath = autoDetectedCandidates[0];
  await sessionManager.setScratchExecutablePath(detectedPath);
  writeRuntimeLog(`startup scratch executable auto-selected path=${JSON.stringify(detectedPath)}`);
}

function setScratchSelectionError(message: string) {
  stateStore.update({
    error: message
  });
}

function clearScratchSelectionError() {
  stateStore.update({
    error: undefined
  });
}

process.on("uncaughtException", (error) => {
  writeRuntimeLog("uncaught exception", error);
});
process.on("unhandledRejection", (reason) => {
  writeRuntimeLog("unhandled rejection", reason);
});

async function loadMockState(mockStateFile: string) {
  const rawState = await readFile(mockStateFile, "utf8");
  return desktopCompanionStateSchema.parse(JSON.parse(rawState)) as DesktopCompanionState;
}

app.whenReady()
  .then(async () => {
    initializeRuntimeLog();
    writeRuntimeLog("app ready");

    windowRef = createMainWindow(launchOptions.startHidden);
    writeRuntimeLog("main window created");

    const unsubscribe = stateStore.onChange((state) => {
      windowRef?.webContents.send("desktop-companion:state", state);
      settingsWindowRef?.webContents.send("desktop-companion:state", state);
      if (trayRef) {
        updateTrayTooltip();
      }
    });

    windowRef.on("closed", () => {
      unsubscribe();
      windowRef = null;
    });

    try {
      trayRef = createTray();
      writeRuntimeLog("tray created");
    } catch (error) {
      writeRuntimeLog("tray creation failed, falling back to window-only mode", error);
      stateStore.update({
        detail: "托盘初始化失败，当前已降级为窗口模式。",
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (launchOptions.mockStateFile) {
      const mockState = await loadMockState(launchOptions.mockStateFile);
      stateStore.setState(mockState);
      writeRuntimeLog(`mock state loaded file=${JSON.stringify(launchOptions.mockStateFile)}`);
      return;
    }

    sessionManager = new SessionManager(stateStore, {
      configStore: new ScratchExecutableConfigStore(app.getPath("userData")),
      platformAdapter: scratchPlatformAdapter,
      scratchLauncher: new ScratchLauncher(() => sessionManager?.getLastScratchLocale())
    });

    writeRuntimeLog("session manager start begin");
    await sessionManager.start();
    writeRuntimeLog("session manager start finished");
    await autoConfigureScratchExecutableIfNeeded();
    writeRuntimeLog("session manager started");
  })
  .catch((error) => {
    writeRuntimeLog("startup failed", error);
    if (app.isReady()) {
      showStartupError(error);
    }
    app.quit();
  });

app.on("activate", () => {
  if (!windowRef) {
    windowRef = createMainWindow(false);
    return;
  }

  showMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});

app.on("before-quit", async () => {
  isQuitting = true;
  await sessionManager?.stop();
});

async function chooseScratchExecutable(source: "tray" | "window") {
  writeRuntimeLog(`choose scratch executable started source=${source}`);
  clearScratchSelectionError();

  const currentScratchPath = stateStore.getState().scratchExecutablePath;
  const autoDetectedCandidates = await findScratchExecutableCandidatesWithShortcuts();
  writeRuntimeLog(
    `scratch executable auto-detect source=${source} count=${autoDetectedCandidates.length} candidates=${JSON.stringify(autoDetectedCandidates)}`
  );

  if (!currentScratchPath && autoDetectedCandidates.length === 1 && sessionManager) {
    const detectedPath = autoDetectedCandidates[0];
    await sessionManager.setScratchExecutablePath(detectedPath);
    writeRuntimeLog(`scratch executable auto-selected source=${source} path=${JSON.stringify(detectedPath)}`);
    return detectedPath;
  }

  const dialogOptions: Electron.OpenDialogOptions = {
    title: scratchPlatformAdapter.selectionDialogTitle,
    properties: ["openFile"]
  };

  dialogOptions.defaultPath = scratchPlatformAdapter.getDialogDefaultPath({
    currentScratchPath,
    autoDetectedCandidates,
    desktopPath: app.getPath("desktop")
  });

  const wasAlwaysOnTop = windowRef?.isAlwaysOnTop() ?? false;
  if (windowRef) {
    windowRef.setAlwaysOnTop(false);
    windowRef.focus();
  }

  let result: Electron.OpenDialogReturnValue;
  try {
    writeRuntimeLog(
      `opening scratch executable dialog source=${source} defaultPath=${JSON.stringify(dialogOptions.defaultPath ?? null)}`
    );
    result = await dialog.showOpenDialog(dialogOptions);
  } finally {
    if (windowRef) {
      windowRef.setAlwaysOnTop(wasAlwaysOnTop);
      windowRef.focus();
    }
  }

  const scratchExecutablePath = result.canceled ? null : result.filePaths[0] ?? null;
  writeRuntimeLog(
    `scratch executable dialog finished source=${source} canceled=${String(result.canceled)} selected=${JSON.stringify(scratchExecutablePath)}`
  );

  if (!scratchExecutablePath) {
    clearScratchSelectionError();
    return null;
  }

  try {
    const resolvedScratchExecutablePath = await scratchPlatformAdapter.resolveScratchExecutableSelection(
      scratchExecutablePath,
      {
        readShortcutLink: (shortcutPath) => shell.readShortcutLink(shortcutPath)
      }
    );

    if (resolvedScratchExecutablePath !== scratchExecutablePath) {
      writeRuntimeLog(
        `scratch shortcut resolved source=${source} shortcut=${JSON.stringify(scratchExecutablePath)} target=${JSON.stringify(resolvedScratchExecutablePath)}`
      );
    }

    await sessionManager?.setScratchExecutablePath(resolvedScratchExecutablePath);
    writeRuntimeLog(`scratch executable accepted source=${source} path=${JSON.stringify(resolvedScratchExecutablePath)}`);
    return resolvedScratchExecutablePath;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "选择 Scratch 失败，请重新选择。";
    writeRuntimeLog(
      `scratch executable rejected source=${source} selected=${JSON.stringify(scratchExecutablePath)} reason=${JSON.stringify(message)}`
    );
    setScratchSelectionError(message);
    return null;
  }
}
