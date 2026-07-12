import test from "node:test";
import assert from "node:assert/strict";

import { validateDeepSeekApiKey } from "../dist/deepseek-key-validator.js";

test("validateDeepSeekApiKey accepts an available DeepSeek account and summarizes balance", async () => {
  const capturedRequests = [];
  const result = await validateDeepSeekApiKey(
    {
      apiKey: "sk-valid-demo",
      baseUrl: "https://api.deepseek.com",
      timeoutMs: 20_000
    },
    async (url, init) => {
      capturedRequests.push({
        url,
        method: init?.method,
        authorization: init?.headers?.Authorization
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: "12.34"
            }
          ]
        })
      };
    }
  );

  assert.equal(capturedRequests.length, 1);
  assert.deepEqual(capturedRequests[0], {
    url: "https://api.deepseek.com/user/balance",
    method: "GET",
    authorization: "Bearer sk-valid-demo"
  });
  assert.equal(result.message.includes("可正常请求 DeepSeek"), true);
  assert.equal(result.message.includes("12.34 CNY"), true);
});

test("validateDeepSeekApiKey throws a clear error when DeepSeek rejects the key", async () => {
  await assert.rejects(
    () =>
      validateDeepSeekApiKey(
        {
          apiKey: "sk-invalid-demo",
          baseUrl: "https://api.deepseek.com",
          timeoutMs: 20_000
        },
        async () => ({
          ok: false,
          status: 401,
          text: async () => '{"error":{"message":"Authentication Fails (no such user)"}}'
        })
      ),
    /DeepSeek Key 校验失败：401/
  );
});

test("validateDeepSeekApiKey treats unavailable balance as unusable", async () => {
  await assert.rejects(
    () =>
      validateDeepSeekApiKey(
        {
          apiKey: "sk-no-balance-demo",
          baseUrl: "https://api.deepseek.com",
          timeoutMs: 20_000
        },
        async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            is_available: false,
            balance_infos: [
              {
                currency: "CNY",
                total_balance: "0.00"
              }
            ]
          })
        })
      ),
    /余额不足或当前账号暂不可用/
  );
});
