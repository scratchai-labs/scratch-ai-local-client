import fs from "node:fs/promises";
import path from "node:path";

import { stripJsonFence } from "./core.mjs";

export async function loadApiKey(cwd = process.cwd()) {
  const candidates = [
    process.env.DEEPSEEK_API_KEY?.trim(),
    process.env.OPENAI_API_KEY?.trim()
  ].filter(Boolean);

  if (candidates[0]) {
    return candidates[0];
  }

  const envPath = path.join(cwd, ".env.example");
  const envText = await fs.readFile(envPath, "utf8");
  const deepSeekMatch = envText.match(/^DEEPSEEK_API_KEY=(.+)$/m);
  if (deepSeekMatch?.[1]?.trim()) {
    return deepSeekMatch[1].trim();
  }
  const openAiMatch = envText.match(/^OPENAI_API_KEY=(.+)$/m);
  if (openAiMatch?.[1]?.trim()) {
    return openAiMatch[1].trim();
  }

  throw new Error("No DeepSeek API key found in env or .env.example");
}

export async function requestStructuredJson({ apiKey, model, messages, maxTokens }) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      temperature: 0.1,
      messages
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status} ${responseText.slice(0, 500)}`);
  }

  const payload = JSON.parse(responseText);
  const content = stripJsonFence(payload?.choices?.[0]?.message?.content ?? "");

  return {
    raw: payload,
    content,
    parsed: JSON.parse(content)
  };
}

export async function runValidatedStage({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  maxTokens,
  validate,
  stageName,
  repairAttempts = 1
}) {
  let current = await requestStructuredJson({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    maxTokens
  });
  let validation = validate(current.parsed);

  for (let attempt = 1; !validation.ok && attempt <= repairAttempts; attempt += 1) {
    const repairPrompt = [
      `上一次 ${stageName} 输出没有通过本地校验。`,
      "请只修复下面这些问题，并继续输出严格 JSON：",
      ...validation.errors.map((error) => `- ${error}`),
      "",
      "原始输出：",
      current.content
    ].join("\n");

    current = await requestStructuredJson({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "assistant", content: current.content },
        { role: "user", content: repairPrompt }
      ],
      maxTokens
    });
    validation = validate(current.parsed);
  }

  return {
    ...current,
    validation
  };
}
