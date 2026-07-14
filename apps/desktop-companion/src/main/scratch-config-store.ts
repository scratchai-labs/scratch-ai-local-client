import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeAiHintTriggerMode } from "../common/types";

const CONFIG_FILE_NAME = "desktop-companion.config.json";
const CONFIG_FILE_MODE = 0o600;

export class ScratchExecutableConfigStore {
  private readonly filePath: string;

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, CONFIG_FILE_NAME);
  }

  async load() {
    const parsed = await this.readParsedConfig();
    const nextConfig: {
      scratchExecutablePath?: string;
      customAiApiKey?: string;
      customAiModel?: string;
      customAiPrompt?: string;
      aiHintTriggerMode?: "auto" | "manual";
      lessonGoal?: string;
      lastScratchLocale?: string;
    } = {};

    if (typeof parsed.scratchExecutablePath === "string" && parsed.scratchExecutablePath.trim()) {
      nextConfig.scratchExecutablePath = parsed.scratchExecutablePath.trim();
    }

    if (typeof parsed.customAiApiKey === "string" && parsed.customAiApiKey.trim()) {
      nextConfig.customAiApiKey = parsed.customAiApiKey.trim();
    }

    if (typeof parsed.customAiModel === "string" && parsed.customAiModel.trim()) {
      nextConfig.customAiModel = parsed.customAiModel.trim();
    }

    if (typeof parsed.customAiPrompt === "string" && parsed.customAiPrompt.trim()) {
      nextConfig.customAiPrompt = parsed.customAiPrompt.trim();
    }

    if (typeof parsed.lastScratchLocale === "string" && parsed.lastScratchLocale.trim()) {
      nextConfig.lastScratchLocale = parsed.lastScratchLocale.trim();
    }

    nextConfig.aiHintTriggerMode = normalizeAiHintTriggerMode(parsed.aiHintTriggerMode);

    if (typeof parsed.lessonGoal === "string") {
      const lessonGoal = parsed.lessonGoal.trim();
      if (lessonGoal) {
        nextConfig.lessonGoal = lessonGoal.slice(0, 200);
      }
    }

    return nextConfig;
  }

  async saveScratchExecutablePath(scratchExecutablePath: string) {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig,
      scratchExecutablePath: scratchExecutablePath.trim()
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async saveCustomAiApiKey(customAiApiKey: string) {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig,
      customAiApiKey: customAiApiKey.trim()
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async clearCustomAiApiKey() {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig
    };

    delete nextConfig.customAiApiKey;

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async saveCustomAiModel(customAiModel: string) {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig,
      customAiModel: customAiModel.trim()
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async clearCustomAiModel() {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig
    };

    delete nextConfig.customAiModel;

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async saveCustomAiPrompt(customAiPrompt: string) {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig,
      customAiPrompt: customAiPrompt.trim()
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async clearCustomAiPrompt() {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig
    };

    delete nextConfig.customAiPrompt;

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async saveAiHintTriggerMode(aiHintTriggerMode: "auto" | "manual") {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig,
      aiHintTriggerMode: normalizeAiHintTriggerMode(aiHintTriggerMode)
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async saveLessonGoal(lessonGoal: string) {
    const currentConfig = await this.load();
    const trimmed = lessonGoal.trim().slice(0, 200);
    const nextConfig = {
      ...currentConfig
    };
    if (trimmed) {
      nextConfig.lessonGoal = trimmed;
    } else {
      delete nextConfig.lessonGoal;
    }

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  async saveLastScratchLocale(lastScratchLocale: string) {
    const currentConfig = await this.load();
    const nextConfig = {
      ...currentConfig,
      lastScratchLocale: lastScratchLocale.trim()
    };

    await this.writeConfig(nextConfig);
    return nextConfig;
  }

  private async readParsedConfig() {
    try {
      const rawConfig = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(rawConfig);

      if (!parsed || typeof parsed !== "object") {
        return {} as Record<string, unknown>;
      }

      return parsed as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  }

  private async writeConfig(nextConfig: Record<string, unknown>) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(nextConfig, null, 2), {
      encoding: "utf8",
      mode: CONFIG_FILE_MODE
    });

    if (process.platform !== "win32") {
      await chmod(this.filePath, CONFIG_FILE_MODE);
    }
  }
}
