import test from "node:test";
import assert from "node:assert/strict";

import { CoachService } from "../dist/coach-service.js";

function createAiConfig(overrides = {}) {
  return {
    configured: true,
    apiKey: "sk-test-demo",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    timeoutMs: 20000,
    configPath: "C:\\config\\deepseek.config.json",
    source: "custom",
    customKeyConfigured: true,
    ...overrides
  };
}

function createSnapshot() {
  return {
    currentTarget: "Cat",
    currentTargetId: "sprite-cat",
    toolboxCategories: ["运动", "控制"],
    loadedExtensions: [],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    sprites: [
      {
        name: "Cat",
        isStage: false,
        blockCount: 2,
        variables: [],
        scripts: [
          {
            spriteName: "Cat",
            event: "when green flag clicked",
            blockSequence: ["当绿旗被点击", "移动 10 步"],
            blockOpcodes: ["event_whenflagclicked", "motion_movesteps"]
          }
        ]
      }
    ],
    blocks: [
      {
        id: "block-1",
        opcode: "event_whenflagclicked",
        category: "事件",
        label: "当绿旗被点击",
        spriteName: "Cat",
        topLevel: true
      },
      {
        id: "block-2",
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        spriteName: "Cat",
        topLevel: false
      }
    ],
    globalVariables: [],
    detectedConcepts: ["event", "motion"],
    updatedAt: "2026-04-29T12:00:00.000Z"
  };
}

function createReferenceSnapshot() {
  return {
    projectId: "reference-project",
    currentTarget: "cheese",
    currentTargetId: "sprite-cheese",
    toolboxCategories: ["事件", "控制", "侦测", "变量"],
    loadedExtensions: [],
    programAreaModules: [
      {
        id: "event",
        label: "事件",
        blockCount: 1
      },
      {
        id: "control",
        label: "控制",
        blockCount: 1
      },
      {
        id: "sensing",
        label: "侦测",
        blockCount: 1
      }
    ],
    sprites: [
      {
        name: "cheese",
        isStage: false,
        blockCount: 4,
        variables: [],
        scripts: [
          {
            spriteName: "cheese",
            event: "when green flag clicked",
            blockSequence: [
              "event_whenflagclicked",
              "control_forever",
              "sensing_touchingobject",
              "data_changevariableby"
            ],
            blockOpcodes: [
              "event_whenflagclicked",
              "control_forever",
              "sensing_touchingobject",
              "data_changevariableby"
            ]
          }
        ]
      }
    ],
    blocks: [
      {
        id: "ref-block-1",
        opcode: "event_whenflagclicked",
        category: "事件",
        label: "当绿旗被点击",
        spriteName: "cheese",
        topLevel: true
      }
    ],
    globalVariables: [],
    detectedConcepts: ["event", "control", "sensing", "data"],
    updatedAt: "2026-05-03T12:00:00.000Z"
  };
}

function createDeepSeekResponse(content) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

test("CoachService sends DeepSeek V4 chat completions requests in JSON non-thinking mode", async () => {
  let capturedRequest;

  const service = new CoachService(async (url, init) => {
    capturedRequest = {
      url,
      init,
      body: JSON.parse(init.body)
    };

    return createDeepSeekResponse(
      JSON.stringify({
        summary: "先把角色移动起来。",
        recommendation: {
          root: {
            opcode: "motion_movesteps",
            category: "运动",
            label: "移动 10 步",
            reason: "先给角色一个明显反馈。"
          }
        }
      })
    );
  });

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "让小猫先动起来",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(result.coachResponse.answerText, "先把角色移动起来。");
  assert.equal(result.coachResponse.nextStep, "先把角色移动起来。");
  assert.deepEqual(result.coachResponse.recommendation, {
    root: {
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      reason: "先给角色一个明显反馈。"
    }
  });
  assert.deepEqual(result.coachResponse.recommendedBlocks, [
    {
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      reason: "先给角色一个明显反馈。"
    }
  ]);
  assert.equal(Object.hasOwn(result.coachResponse, "followUpQuestion"), false);
  assert.equal(capturedRequest.url, "https://api.deepseek.com/chat/completions");
  assert.equal(capturedRequest.init.method, "POST");
  assert.equal(capturedRequest.init.headers["Content-Type"], "application/json");
  assert.equal(capturedRequest.init.headers.Authorization, "Bearer sk-test-demo");
  assert.equal(capturedRequest.body.model, "deepseek-v4-flash");
  assert.deepEqual(capturedRequest.body.thinking, { type: "disabled" });
  assert.equal(capturedRequest.body.temperature, 0.3);
  assert.equal(capturedRequest.body.max_tokens, 2048);
  assert.deepEqual(capturedRequest.body.response_format, { type: "json_object" });
  assert.equal(capturedRequest.body.messages.length, 2);
  assert.equal(capturedRequest.body.messages[0].content.includes("不要直接给完整答案"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("只允许从以下 Scratch 官方 opcode 白名单中选择"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("summary"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("recommendation.root"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("next"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("condition"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("substack"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("substack2"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("最多 3 个"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("按顺序"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("不要把积木顺序一次性全部告诉学生"), false);
  assert.equal(capturedRequest.body.messages[0].content.includes("最接近"), false);
  assert.equal(capturedRequest.body.messages[1].content.includes("直接给出按顺序连接的具体积木"), true);
});

test("CoachService falls back when DeepSeek returns invalid JSON content", async () => {
  const service = new CoachService(async () => createDeepSeekResponse("not-json"));

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "让小猫先动起来",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.model, "local-heuristic");
  assert.equal(typeof result.warning, "string");
  assert.equal(result.coachResponse.recommendedBlocks.length > 0, true);
});

test("CoachService ignores legacy teaching reference context and only sends the current project", async () => {
  let capturedRequest;

  const service = new CoachService(async (_url, init) => {
    capturedRequest = JSON.parse(init.body);

    return createDeepSeekResponse(
      JSON.stringify({
        summary: "先补起步脚本。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "先给脚本一个开始入口。"
          }
        }
      })
    );
  });

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    referenceSnapshot: createReferenceSnapshot(),
    referenceCurrentTargetPrograms: [
      "event_whenflagclicked -> control_forever -> sensing_touchingobject -> data_changevariableby"
    ],
    referenceProgramAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "control", label: "控制", blockCount: 1 },
      { id: "sensing", label: "侦测", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 1 }
    ],
    referenceUsedExtensions: [],
    referenceLoadedExtensions: [],
    referenceSourceLabel: "https://example.com/reference.sb3",
    goal: "让学生从新项目一步一步做出来",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(capturedRequest.messages[1].content.includes('"teachingReference"'), false);
  assert.equal(capturedRequest.messages[1].content.includes("https://example.com/reference.sb3"), false);
  assert.equal(capturedRequest.messages[0].content.includes("所有自然语言必须使用中文"), true);
  assert.equal(capturedRequest.messages[0].content.includes("必须先判断学生当前项目已经做到哪一步"), true);
  assert.equal(capturedRequest.messages[1].content.includes("先看学生当前 Scratch 项目"), false);
  assert.equal(capturedRequest.messages[1].content.includes("对照教师参考作品补当前还缺的一小步"), false);
  assert.equal(capturedRequest.messages[1].content.includes("只根据当前学生作品"), true);
  assert.equal(capturedRequest.messages[1].content.includes("当绿旗被点击 -> 移动 10 步"), true);
  assert.equal(capturedRequest.messages[1].content.includes("event_whenflagclicked -> motion_movesteps"), false);
});

test("CoachService uses the saved custom teacher prompt while keeping JSON output requirements", async () => {
  let capturedRequest;

  const service = new CoachService(async (_url, init) => {
    capturedRequest = JSON.parse(init.body);

    return createDeepSeekResponse(
      JSON.stringify({
        summary: "先补一段碰撞判断。",
        recommendation: {
          root: {
            opcode: "sensing_touchingobject",
            category: "侦测",
            label: "碰到...？",
            reason: "先判断是否碰到目标。"
          }
        }
      })
    );
  });

  await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "让小猫碰到奶酪后加分",
    aiConfig: createAiConfig(),
    customSystemPrompt: "请优先提醒碰撞、得分和变量变化，每次只给一个教学步骤。"
  });

  assert.equal(
    capturedRequest.messages[0].content.includes("请优先提醒碰撞、得分和变量变化，每次只给一个教学步骤。"),
    true
  );
  assert.equal(capturedRequest.messages[0].content.includes("输出必须是一个 JSON 对象"), true);
});

test("CoachService does not expose student-facing diagnostic fields for structured hints", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "把碰撞判断放进循环里。",
        recommendation: {
          root: {
            opcode: "sensing_touchingobject",
            category: "侦测",
            label: "碰到...？",
            reason: "先检测猫是否碰到奶酪。"
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "让小猫碰到奶酪后加分",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.warning, undefined);
  assert.deepEqual(result.coachResponse.detectedIssues, []);
  assert.equal(Object.hasOwn(result.coachResponse, "followUpQuestion"), false);
  assert.equal(result.coachResponse.nextStep, "把碰撞判断放进循环里。");
});

test("CoachService drops unsupported recommended opcodes and does not remap", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先加一个更容易看见的外观反馈。",
        recommendation: {
          root: {
            opcode: "looks_magicflash",
            category: "外观",
            label: "神奇闪光",
            reason: "这个 opcode 不在白名单里。"
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "looks",
        label: "外观",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "让角色有更明显的反馈",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.model, "local-heuristic");
  assert.equal(typeof result.warning, "string");
  assert.equal(result.coachResponse.recommendedBlocks.some((block) => block.opcode === "looks_sayforsecs"), false);
});

test("CoachService keeps valid structured recommendations after dropping invalid children", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先保留能用的动作，再继续尝试。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "给脚本一个开始入口。",
            next: {
              opcode: "looks_magicflash",
              category: "外观",
              label: "神奇闪光",
              reason: "这个 opcode 不可用。"
            },
            substack: {
              opcode: "motion_movesteps",
              category: "运动",
              label: "移动 10 步",
              reason: "这个有效节点应该保留。"
            }
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "motion", label: "运动", blockCount: 1 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "继续做动作",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["event_whenflagclicked", "motion_movesteps"]
  );
  assert.equal(result.coachResponse.recommendation.root.next, undefined);
  assert.equal(result.coachResponse.recommendation.root.substack.opcode, "motion_movesteps");
});

test("CoachService drops extension opcodes that are not available in the current toolbox", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先不要使用还没加载的扩展积木。",
        recommendation: {
          root: {
            opcode: "pen_clear",
            category: "画笔",
            label: "清空",
            reason: "画笔扩展没有加载。"
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      { id: "motion", label: "运动", blockCount: 1 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "尝试画笔",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.model, "local-heuristic");
  assert.equal(typeof result.warning, "string");
  assert.equal(result.coachResponse.recommendedBlocks.some((block) => block.opcode === "pen_clear"), false);
});

test("CoachService keeps at most three recommended blocks from DeepSeek", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "按顺序先补三小步。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "1",
            next: {
              opcode: "motion_movesteps",
              category: "运动",
              label: "移动 10 步",
              reason: "2",
              next: {
                opcode: "control_repeat",
                category: "控制",
                label: "重复执行",
                reason: "3"
              }
            }
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "先做三步",
    aiConfig: createAiConfig()
  });

  assert.equal(result.coachResponse.recommendedBlocks.length, 3);
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    [
      "event_whenflagclicked",
      "motion_movesteps",
      "control_repeat"
    ]
  );
});

test("CoachService keeps fewer than three recommendations without padding", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先补成两步。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "1",
            next: {
              opcode: "motion_movesteps",
              category: "运动",
              label: "移动 10 步",
              reason: "2"
            }
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "先做三步",
    aiConfig: createAiConfig()
  });

  assert.equal(result.coachResponse.recommendedBlocks.length, 2);
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    [
      "event_whenflagclicked",
      "motion_movesteps"
    ]
  );
});

test("CoachService fallback gives a local basic hint without forcing three blocks", async () => {
  const service = new CoachService();
  const snapshot = createSnapshot();
  snapshot.sprites[0].blockCount = 0;
  snapshot.sprites[0].scripts = [];
  snapshot.blocks = [];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: [],
    programAreaModules: [],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "先让小猫动起来",
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.coachResponse.recommendedBlocks.length >= 1, true);
  assert.equal(result.coachResponse.recommendedBlocks.length <= 3, true);
});

test("CoachService redacts API keys from DeepSeek failure warnings", async () => {
  const secretKey = "sk-secret-from-error-body";
  const service = new CoachService(async () =>
    new Response(`Authorization: Bearer ${secretKey} {"apiKey":"${secretKey}"}`, {
      status: 500,
      statusText: "Internal Server Error"
    })
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: [],
    programAreaModules: [],
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig({
      apiKey: secretKey
    })
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.warning.includes(secretKey), false);
  assert.match(result.warning, /Authorization: Bearer \*\*\*/);
  assert.match(result.warning, /"apiKey":"\*\*\*"/);
});
