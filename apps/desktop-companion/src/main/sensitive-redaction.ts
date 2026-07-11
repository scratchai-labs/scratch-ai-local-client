const API_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{6,}\b/g;
const AUTHORIZATION_PATTERN = /(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/=-]{6,})/gi;
const BEARER_PATTERN = /(Bearer\s+)(sk-\*\*\*|[A-Za-z0-9._~+/=-]{6,})/gi;
const JSON_SECRET_PATTERN = /("(?:apiKey|customAiApiKey|token|secret)"\s*:\s*")([^"]+)(")/gi;

export function redactSensitiveText(value: string) {
  return value
    .replace(API_KEY_PATTERN, "sk-***")
    .replace(AUTHORIZATION_PATTERN, "$1***")
    .replace(BEARER_PATTERN, "$1***")
    .replace(JSON_SECRET_PATTERN, "$1***$3");
}
