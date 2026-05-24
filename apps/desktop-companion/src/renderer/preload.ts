import { contextBridge, ipcRenderer } from "electron";

const api = {
  getInitialState: async () => ipcRenderer.invoke("desktop-companion:get-state"),
  onStateChange: (listener: (state: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: unknown) => {
      listener(state);
    };

    ipcRenderer.on("desktop-companion:state", wrapped);
    return () => {
      ipcRenderer.off("desktop-companion:state", wrapped);
    };
  },
  retryNow: async () => {
    await ipcRenderer.invoke("desktop-companion:retry");
  },
  chooseScratchExecutable: async () =>
    ipcRenderer.invoke("desktop-companion:choose-scratch-executable"),
  launchScratch: async () => {
    await ipcRenderer.invoke("desktop-companion:launch-scratch");
  },
  openSettings: async () => {
    await ipcRenderer.invoke("desktop-companion:open-settings");
  },
  requestAiHint: async (goal?: string) => {
    await ipcRenderer.invoke("desktop-companion:request-ai-hint", goal);
  },
  saveCustomAiApiKey: async (apiKey: string) => {
    await ipcRenderer.invoke("desktop-companion:save-custom-ai-api-key", apiKey);
  },
  clearCustomAiApiKey: async () => {
    await ipcRenderer.invoke("desktop-companion:clear-custom-ai-api-key");
  },
  saveCustomAiModel: async (model: string) => {
    await ipcRenderer.invoke("desktop-companion:save-custom-ai-model", model);
  },
  saveAiHintTriggerMode: async (mode: "auto" | "manual") => {
    await ipcRenderer.invoke("desktop-companion:save-ai-hint-trigger-mode", mode);
  },
  saveCustomAiPrompt: async (prompt: string) => {
    await ipcRenderer.invoke("desktop-companion:save-custom-ai-prompt", prompt);
  },
  clearCustomAiPrompt: async () => {
    await ipcRenderer.invoke("desktop-companion:clear-custom-ai-prompt");
  }
};

contextBridge.exposeInMainWorld("desktopCompanionApi", api);
