import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_DEEPSEEK_MODEL, normalizeDeepSeekModel } from "../common/deepseek";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 20_000;
const PLACEHOLDER_API_KEYS = new Set([
  "",
  "PLEASE_FILL_DEEPSEEK_API_KEY",
  "YOUR_DEEPSEEK_API_KEY"
]);

export type DeepSeekConfigSource = "custom";

export interface LoadedDeepSeekConfig {
  configured: boolean;
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  configPath: string;
  source?: DeepSeekConfigSource;
  customKeyConfigured: boolean;
}

interface LoadDeepSeekConfigOptions {
  customApiKey?: string;
  customModel?: string;
}

function normalizeBaseUrl(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate ? candidate.replace(/\/+$/, "") : DEFAULT_DEEPSEEK_BASE_URL;
}

function normalizeModel(value: unknown) {
  return normalizeDeepSeekModel(value);
}

function normalizeTimeout(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 5_000) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 5_000) {
      return parsed;
    }
  }

  return DEFAULT_DEEPSEEK_TIMEOUT_MS;
}

export function getDeepSeekConfigPath() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, "deepseek.config.json");
}

export async function loadDeepSeekConfig(
  configPath = getDeepSeekConfigPath(),
  options: LoadDeepSeekConfigOptions = {}
): Promise<LoadedDeepSeekConfig> {
  let parsed: Record<string, unknown> = {};

  try {
    const rawConfig = await readFile(configPath, "utf8");
    const parsedConfig = JSON.parse(rawConfig);
    if (parsedConfig && typeof parsedConfig === "object") {
      parsed = parsedConfig as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const customApiKey = typeof options.customApiKey === "string" ? options.customApiKey.trim() : "";
  const customModel = normalizeModel(options.customModel);
  const apiKey = customApiKey;
  const configured = Boolean(apiKey && !PLACEHOLDER_API_KEYS.has(apiKey));
  const customKeyConfigured = Boolean(customApiKey && !PLACEHOLDER_API_KEYS.has(customApiKey));

  const config: LoadedDeepSeekConfig = {
    configured,
    baseUrl: normalizeBaseUrl(parsed.baseUrl),
    model: options.customModel ? customModel : normalizeModel(parsed.model),
    timeoutMs: normalizeTimeout(parsed.timeoutMs),
    configPath,
    customKeyConfigured
  };

  if (configured) {
    config.apiKey = apiKey;
    config.source = "custom";
  }

  return config;
}
