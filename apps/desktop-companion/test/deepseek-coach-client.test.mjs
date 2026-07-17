import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeepSeekCoachPrompts,
  requestDeepSeekCoachCandidate
} from "../dist/deepseek-coach-client.js";

function createStrictResponse(argumentsValue = { summary: "先试着移动角色。" }) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                type: "function",
                function: {
                  name: "submit_completed_project",
                  arguments: JSON.stringify(argumentsValue)
                }
              }
            ]
          }
        }
      ]
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}

function createRequestOptions(overrides = {}) {
  return {
    fetchImpl: async () => createStrictResponse(),
    config: {
      apiKey: "sk-test-demo",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      timeoutMs: 20_000
    },
    systemPrompt: "system prompt",
    userPrompt: "user prompt",
    ...overrides
  };
}

test("DeepSeek coach client sends the strict request through the injected fetch", async () => {
  const calls = [];
  const candidate = await requestDeepSeekCoachCandidate(
    createRequestOptions({
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return createStrictResponse();
      }
    })
  );

  assert.deepEqual(candidate, { summary: "先试着移动角色。" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/beta/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test-demo");
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
  assert.deepEqual(calls[0].body.thinking, { type: "disabled" });
  assert.equal(calls[0].body.model, "deepseek-v4-flash");
  assert.equal(calls[0].body.temperature, 0.3);
  assert.equal(calls[0].body.max_tokens, 2048);
  assert.equal(calls[0].body.tool_choice, "required");
  assert.deepEqual(calls[0].body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" }
  ]);
  assert.deepEqual(calls[0].body["legacyMessages"], undefined);
  assert.deepEqual(
    calls[0].body.tools.map((tool) => [tool.function.name, tool.function.strict]),
    [
      ["submit_completed_project", true],
      ["submit_scratch_recommendation", true]
    ]
  );
});

test("DeepSeek coach client aborts an injected fetch after the configured timeout", async () => {
  const fetchImpl = async (_url, init) =>
    await new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });

  await assert.rejects(
    requestDeepSeekCoachCandidate(
      createRequestOptions({
        fetchImpl,
        config: {
          ...createRequestOptions().config,
          timeoutMs: 5
        }
      })
    ),
    (error) => error?.name === "AbortError"
  );
});

test("DeepSeek coach client redacts response secrets from HTTP diagnostics", async () => {
  const secret = "sk-live-secret-value";

  await assert.rejects(
    requestDeepSeekCoachCandidate(
      createRequestOptions({
        config: {
          ...createRequestOptions().config,
          apiKey: secret
        },
        fetchImpl: async () =>
          new Response(`Authorization: Bearer ${secret} {"apiKey":"${secret}"}`, {
            status: 429
          })
      })
    ),
    (error) => {
      assert.equal(error.message.includes(secret), false);
      assert.match(error.message, /DeepSeek 请求失败：429/);
      assert.match(error.message, /Authorization: Bearer \*\*\*/);
      assert.match(error.message, /"apiKey":"\*\*\*"/);
      return true;
    }
  );
});

test("DeepSeek coach prompt builder preserves the default and custom prompt contracts", () => {
  const promptContext = { currentTarget: "Cat", taskType: "drawing" };
  const defaultPrompts = buildDeepSeekCoachPrompts({ promptContext });
  const customPrompts = buildDeepSeekCoachPrompts({
    customSystemPrompt: "  自定义教学要求  ",
    promptContext
  });

  assert.equal(defaultPrompts.systemPrompt.includes("Scratch 小学编程助教"), true);
  assert.equal(defaultPrompts.systemPrompt.includes("必须调用且只调用一个严格工具"), true);
  assert.equal(defaultPrompts.systemPrompt.includes("Scratch 官方 opcode 白名单"), true);
  assert.equal(defaultPrompts.userPrompt.includes("完整阅读舞台和全部角色"), true);
  assert.deepEqual(JSON.parse(defaultPrompts.userPrompt.split("\n\n").at(-1)), promptContext);
  assert.equal(customPrompts.systemPrompt.startsWith("自定义教学要求\n\n"), true);
  assert.equal(customPrompts.systemPrompt.includes("必须调用且只调用一个严格工具"), true);
});
