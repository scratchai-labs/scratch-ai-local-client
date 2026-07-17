import type { IpcMain } from "electron";

type MaybePromise<Value> = Value | Promise<Value>;

export type DesktopIpcMain = Pick<IpcMain, "handle">;

export interface DesktopIpcActions<State = unknown> {
  getState(): State;
  retry(): MaybePromise<void>;
  launchScratch(): MaybePromise<void>;
  openSettings(): MaybePromise<void>;
  requestAiHint(goal?: string): MaybePromise<void>;
  saveCustomAiApiKey(apiKey: string): MaybePromise<void>;
  testCustomAiApiKey(apiKey?: string): MaybePromise<string | undefined>;
  clearCustomAiApiKey(): MaybePromise<void>;
  saveCustomAiModel(model: string): MaybePromise<void>;
  saveAiHintTriggerMode(mode: "auto" | "manual"): MaybePromise<void>;
  saveLessonGoal(goal: string): MaybePromise<void>;
  saveCustomAiPrompt(prompt: string): MaybePromise<void>;
  clearCustomAiPrompt(): MaybePromise<void>;
  chooseScratchExecutable(): MaybePromise<string | null>;
}

export function registerDesktopIpcHandlers<State>(
  ipcMain: DesktopIpcMain,
  actions: DesktopIpcActions<State>
) {
  ipcMain.handle("desktop-companion:get-state", () => actions.getState());
  ipcMain.handle("desktop-companion:retry", async () => {
    await actions.retry();
  });
  ipcMain.handle("desktop-companion:launch-scratch", async () => {
    await actions.launchScratch();
  });
  ipcMain.handle("desktop-companion:open-settings", async () => {
    await actions.openSettings();
  });
  ipcMain.handle("desktop-companion:request-ai-hint", async (_event, goal?: string) => {
    await actions.requestAiHint(goal);
  });
  ipcMain.handle("desktop-companion:save-custom-ai-api-key", async (_event, apiKey: string) => {
    await actions.saveCustomAiApiKey(apiKey);
  });
  ipcMain.handle("desktop-companion:test-custom-ai-api-key", async (_event, apiKey?: string) => {
    return await actions.testCustomAiApiKey(apiKey);
  });
  ipcMain.handle("desktop-companion:clear-custom-ai-api-key", async () => {
    await actions.clearCustomAiApiKey();
  });
  ipcMain.handle("desktop-companion:save-custom-ai-model", async (_event, model: string) => {
    await actions.saveCustomAiModel(model);
  });
  ipcMain.handle(
    "desktop-companion:save-ai-hint-trigger-mode",
    async (_event, mode: "auto" | "manual") => {
      await actions.saveAiHintTriggerMode(mode);
    }
  );
  ipcMain.handle("desktop-companion:save-lesson-goal", async (_event, goal: string) => {
    await actions.saveLessonGoal(goal);
  });
  ipcMain.handle("desktop-companion:save-custom-ai-prompt", async (_event, prompt: string) => {
    await actions.saveCustomAiPrompt(prompt);
  });
  ipcMain.handle("desktop-companion:clear-custom-ai-prompt", async () => {
    await actions.clearCustomAiPrompt();
  });
  ipcMain.handle("desktop-companion:choose-scratch-executable", async () => {
    return await actions.chooseScratchExecutable();
  });
}
