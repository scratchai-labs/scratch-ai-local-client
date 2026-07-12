import { redactSensitiveText } from "./sensitive-redaction";

import type { LoadedDeepSeekConfig } from "./deepseek-config";

interface DeepSeekBalanceInfo {
  currency?: string;
  total_balance?: string;
}

interface DeepSeekBalancePayload {
  is_available?: boolean;
  balance_infos?: DeepSeekBalanceInfo[];
}

export interface DeepSeekKeyValidationResult {
  message: string;
}

function buildBalanceSummary(balanceInfos: DeepSeekBalanceInfo[] = []) {
  const summary = balanceInfos
    .map((item) => {
      const amount = typeof item.total_balance === "string" ? item.total_balance.trim() : "";
      const currency = typeof item.currency === "string" ? item.currency.trim() : "";
      if (!amount) {
        return "";
      }

      return currency ? `${amount} ${currency}` : amount;
    })
    .filter(Boolean)
    .join("，");

  return summary || undefined;
}

function normalizeBalancePayload(payload: unknown): DeepSeekBalancePayload {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const candidate = payload as DeepSeekBalancePayload;
  return {
    is_available: candidate.is_available === true,
    balance_infos: Array.isArray(candidate.balance_infos) ? candidate.balance_infos : []
  };
}

export async function validateDeepSeekApiKey(
  config: Pick<LoadedDeepSeekConfig, "apiKey" | "baseUrl" | "timeoutMs">,
  fetchImpl: typeof fetch = fetch
): Promise<DeepSeekKeyValidationResult> {
  const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
  if (!apiKey) {
    throw new Error("当前没有可测试的 DeepSeek Key。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl}/user/balance`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const responseText = typeof response.text === "function" ? await response.text() : "";
      throw new Error(`DeepSeek Key 校验失败：${response.status} ${redactSensitiveText(responseText).slice(0, 240)}`);
    }

    const rawPayload = typeof response.json === "function" ? await response.json() : {};
    const payload = normalizeBalancePayload(rawPayload);
    const balanceSummary = buildBalanceSummary(payload.balance_infos);

    if (!payload.is_available) {
      throw new Error(
        balanceSummary
          ? `DeepSeek Key 已验证，但余额不足或当前账号暂不可用。余额：${balanceSummary}。`
          : "DeepSeek Key 已验证，但余额不足或当前账号暂不可用。"
      );
    }

    return {
      message: balanceSummary
        ? `DeepSeek Key 可用，当前账号可正常请求 DeepSeek。余额：${balanceSummary}。`
        : "DeepSeek Key 可用，当前账号可正常请求 DeepSeek。"
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DeepSeek Key 校验超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
