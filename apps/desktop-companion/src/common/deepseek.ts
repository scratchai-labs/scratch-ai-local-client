export const SUPPORTED_DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;

export type DeepSeekModel = (typeof SUPPORTED_DEEPSEEK_MODELS)[number];

export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModel = SUPPORTED_DEEPSEEK_MODELS[0];

export function normalizeDeepSeekModel(value: unknown): DeepSeekModel {
  const candidate = typeof value === "string" ? value.trim() : "";
  return SUPPORTED_DEEPSEEK_MODELS.includes(candidate as DeepSeekModel)
    ? (candidate as DeepSeekModel)
    : DEFAULT_DEEPSEEK_MODEL;
}
