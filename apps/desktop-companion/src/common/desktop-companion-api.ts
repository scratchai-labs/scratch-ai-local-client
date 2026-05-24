export interface DesktopCompanionApi {
  getInitialState: () => Promise<unknown>;
  onStateChange: (listener: (state: unknown) => void) => () => void;
  retryNow: () => Promise<void>;
  chooseScratchExecutable: () => Promise<string | null>;
  launchScratch: () => Promise<void>;
  openSettings: () => Promise<void>;
  requestAiHint: (goal?: string) => Promise<void>;
  saveCustomAiApiKey: (apiKey: string) => Promise<void>;
  clearCustomAiApiKey: () => Promise<void>;
  saveCustomAiModel: (model: string) => Promise<void>;
  saveAiHintTriggerMode: (mode: "auto" | "manual") => Promise<void>;
  saveCustomAiPrompt: (prompt: string) => Promise<void>;
  clearCustomAiPrompt: () => Promise<void>;
}
