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
      },
      {
        name: "Cat 2",
        isStage: false,
        blockCount: 6,
        variables: [],
        scripts: [1, 2, 3].map((index) => ({
          spriteName: "Cat 2",
          event: `script ${index}`,
          blockSequence: ["当绿旗被点击", `移动 ${index}0 步`],
          blockOpcodes: ["event_whenflagclicked", "motion_movesteps"]
        }))
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

function createCompleteSnapshot() {
  return {
    ...createSnapshot(),
    toolboxCategories: ["事件", "运动", "控制", "侦测", "变量"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "motion", label: "运动", blockCount: 1 },
      { id: "control", label: "控制", blockCount: 2 },
      { id: "sensing", label: "侦测", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 1 }
    ],
    sprites: [
      {
        name: "Cat",
        isStage: false,
        blockCount: 6,
        variables: [{ id: "score", name: "分数", value: 0, isCloud: false }],
        scripts: [
          {
            spriteName: "Cat",
            event: "when green flag clicked",
            blockSequence: ["当绿旗被点击", "一直重复", "移动 10 步", "如果碰到边缘那么", "将分数增加 1"],
            blockOpcodes: [
              "event_whenflagclicked",
              "control_forever",
              "motion_movesteps",
              "control_if",
              "sensing_touchingobject",
              "data_changevariableby"
            ]
          }
        ]
      }
    ],
    blocks: [
      {
        id: "complete-block-1",
        opcode: "event_whenflagclicked",
        category: "事件",
        label: "当绿旗被点击",
        spriteName: "Cat",
        topLevel: true
      },
      {
        id: "complete-block-2",
        opcode: "control_forever",
        category: "控制",
        label: "一直重复",
        spriteName: "Cat",
        topLevel: false
      },
      {
        id: "complete-block-3",
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        spriteName: "Cat",
        topLevel: false
      },
      {
        id: "complete-block-4",
        opcode: "control_if",
        category: "控制",
        label: "如果...那么",
        spriteName: "Cat",
        topLevel: false
      },
      {
        id: "complete-block-5",
        opcode: "sensing_touchingobject",
        category: "侦测",
        label: "碰到...？",
        spriteName: "Cat",
        topLevel: false
      },
      {
        id: "complete-block-6",
        opcode: "data_changevariableby",
        category: "变量",
        label: "将分数增加 1",
        spriteName: "Cat",
        topLevel: false
      }
    ],
    globalVariables: [{ id: "score", name: "分数", value: 0, isCloud: false }],
    detectedConcepts: ["event", "motion", "control", "sensing", "data"]
  };
}

function createProjectDataWithBroadcastDependencies() {
  return {
    targets: [
      {
        id: "sprite-cat-2",
        name: "Cat 2",
        isStage: false,
        variables: {},
        blocks: {
          catStart: {
            opcode: "event_whenbroadcastreceived",
            next: "catForever",
            parent: null,
            inputs: {},
            fields: { BROADCAST_OPTION: ["Level Up", "broadcast-level-up"] },
            shadow: false,
            topLevel: true
          },
          catForever: {
            opcode: "control_forever",
            next: null,
            parent: "catStart",
            inputs: { SUBSTACK: [2, "catPoint"] },
            fields: {},
            shadow: false,
            topLevel: false
          },
          catPoint: {
            opcode: "motion_pointtowards",
            next: "catMove",
            parent: "catForever",
            inputs: { TOWARDS: [1, "catTargetMenu"] },
            fields: {},
            shadow: false,
            topLevel: false
          },
          catTargetMenu: {
            opcode: "motion_pointtowards_menu",
            next: null,
            parent: "catPoint",
            inputs: {},
            fields: { TOWARDS: ["Mouse1", null] },
            shadow: true,
            topLevel: false
          },
          catMove: {
            opcode: "motion_movesteps",
            next: null,
            parent: "catPoint",
            inputs: { STEPS: [1, [4, "3"]] },
            fields: {},
            shadow: false,
            topLevel: false
          }
        }
      },
      {
        id: "sprite-cheese",
        name: "cheese",
        isStage: false,
        variables: {},
        blocks: {
          cheeseStart: {
            opcode: "event_whenflagclicked",
            next: "waitUntil",
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
          },
          waitUntil: {
            opcode: "control_wait_until",
            next: "scoreIf",
            parent: "cheeseStart",
            inputs: { CONDITION: [2, "touchingMouse"] },
            fields: {},
            shadow: false,
            topLevel: false
          },
          touchingMouse: {
            opcode: "sensing_touchingobject",
            next: null,
            parent: "waitUntil",
            inputs: { TOUCHINGOBJECTMENU: [1, "touchingMenu"] },
            fields: {},
            shadow: false,
            topLevel: false
          },
          touchingMenu: {
            opcode: "sensing_touchingobjectmenu",
            next: null,
            parent: "touchingMouse",
            inputs: {},
            fields: { TOUCHINGOBJECTMENU: ["Mouse1", null] },
            shadow: true,
            topLevel: false
          },
          scoreIf: {
            opcode: "control_if",
            next: null,
            parent: "waitUntil",
            inputs: { CONDITION: [2, "scoreEquals"], SUBSTACK: [2, "levelUpBroadcast"] },
            fields: {},
            shadow: false,
            topLevel: false
          },
          scoreEquals: {
            opcode: "operator_equals",
            next: null,
            parent: "scoreIf",
            inputs: {
              OPERAND1: [3, [12, "Score", "score-id"], [10, ""]],
              OPERAND2: [1, [10, "5"]]
            },
            fields: {},
            shadow: false,
            topLevel: false
          },
          levelUpBroadcast: {
            opcode: "event_broadcast",
            next: null,
            parent: "scoreIf",
            inputs: { BROADCAST_INPUT: [1, [11, "Level Up", "broadcast-level-up"]] },
            fields: {},
            shadow: false,
            topLevel: false
          }
        }
      }
    ]
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

function convertNodeParamsToStrictTransport(node) {
  if (!node || typeof node !== "object") {
    return node;
  }

  const converted = { ...node };
  if (converted.params && !Array.isArray(converted.params)) {
    converted.params = Object.entries(converted.params).map(([name, value]) => ({ name, value }));
  } else if (!converted.params) {
    converted.params = [];
  }

  for (const relation of ["next", "condition", "substack", "substack2"]) {
    if (converted[relation]) {
      converted[relation] = convertNodeParamsToStrictTransport(converted[relation]);
    }
  }
  return converted;
}

function createDeepSeekResponse(content) {
  let toolName = "submit_scratch_recommendation";
  let argumentsText = content;

  try {
    const candidate = JSON.parse(content);
    if (candidate.recommendation && candidate.recommendation.root) {
      argumentsText = JSON.stringify({
        summary: candidate.summary,
        recommendation: {
          root: convertNodeParamsToStrictTransport(candidate.recommendation.root)
        }
      });
    } else {
      toolName = "submit_completed_project";
      argumentsText = JSON.stringify({ summary: candidate.summary });
    }
  } catch {
    // Keep malformed arguments so the production parser can prove it fails closed.
  }

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
                  name: toolName,
                  arguments: argumentsText
                }
              }
            ]
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

test("CoachService sends DeepSeek Strict tool requests in non-thinking mode", async () => {
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
    projectData: createProjectDataWithBroadcastDependencies(),
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
  assert.equal(capturedRequest.url, "https://api.deepseek.com/beta/chat/completions");
  assert.equal(capturedRequest.init.method, "POST");
  assert.equal(capturedRequest.init.headers["Content-Type"], "application/json");
  assert.equal(capturedRequest.init.headers.Authorization, "Bearer sk-test-demo");
  assert.equal(capturedRequest.body.model, "deepseek-v4-flash");
  assert.deepEqual(capturedRequest.body.thinking, { type: "disabled" });
  assert.equal(capturedRequest.body.temperature, 0.3);
  assert.equal(capturedRequest.body.max_tokens, 2048);
  assert.equal(Object.hasOwn(capturedRequest.body, "response_format"), false);
  assert.equal(capturedRequest.body.tool_choice, "required");
  assert.deepEqual(
    capturedRequest.body.tools.map((tool) => [tool.function.name, tool.function.strict]),
    [
      ["submit_completed_project", true],
      ["submit_scratch_recommendation", true]
    ]
  );
  assert.equal(capturedRequest.body.tools[1].function.parameters.additionalProperties, false);
  assert.equal(capturedRequest.body.messages.length, 2);
  assert.equal(capturedRequest.body.messages[0].content.includes("不要直接给完整答案"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("直接对学生说“你”"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("不要用“学生”“老师”“用户”等第三人称称呼"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("只允许从以下 Scratch 官方 opcode 白名单中选择"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("summary"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("recommendation.root"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("next"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("condition"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("substack"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("substack2"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("params"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("messageVariable"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("name 只允许"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("sensing_answer"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("变量名优先复用项目已有名称"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("新建变量时使用符合题目语言"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes('params.variable="rabbits"'), false);
  assert.equal(capturedRequest.body.messages[0].content.includes('params.value="(feet - 2 * heads) / 2"'), false);
  assert.equal(capturedRequest.body.messages[0].content.includes("最多包含 5 个"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("按顺序"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("不要把积木顺序一次性全部告诉学生"), false);
  assert.equal(capturedRequest.body.messages[0].content.includes("最接近"), false);
  assert.equal(capturedRequest.body.messages[1].content.includes("按顺序连接的具体积木"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("舞台和全部角色"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("可以不返回 recommendation"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("只能依据本次最新项目快照"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("不得根据角色名称、造型主题或常见游戏玩法推测"), true);
  assert.equal(capturedRequest.body.messages[1].content.includes("完整阅读舞台和全部角色"), true);
  assert.equal(capturedRequest.body.messages[1].content.includes("逐个核对"), true);
  assert.equal(capturedRequest.body.messages[1].content.includes("不要沿用之前的完整性结论"), true);

  const promptContext = JSON.parse(capturedRequest.body.messages[1].content.split("\n\n").at(-1));
  assert.equal(promptContext.snapshotRule.includes("最新项目快照"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("从绿旗开始检查实际可达路径"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("不能声称学生可以控制角色"), true);
  assert.equal(promptContext.projectScriptEvidence.playerInputEvidence.length, 0);
  assert.equal(promptContext.projectScriptEvidence.targets.length, 2);
  const catEvidence = promptContext.projectScriptEvidence.targets.find((target) => target.name === "Cat 2");
  assert.equal(catEvidence.scripts[0].blocks[0].fields.BROADCAST_OPTION, "Level Up");
  assert.equal(catEvidence.scripts[0].blocks[1].branches.SUBSTACK[0].inputs.TOWARDS.fields.TOWARDS, "Mouse1");
  assert.equal(catEvidence.scripts[0].blocks[1].branches.SUBSTACK[1].inputs.STEPS.value, "3");
  const cheeseEvidence = promptContext.projectScriptEvidence.targets.find((target) => target.name === "cheese");
  assert.equal(cheeseEvidence.scripts[0].blocks[1].inputs.CONDITION.inputs.TOUCHINGOBJECTMENU.fields.TOUCHINGOBJECTMENU, "Mouse1");
  assert.equal(cheeseEvidence.scripts[0].blocks[2].inputs.CONDITION.inputs.OPERAND1.kind, "variable");
  assert.equal(cheeseEvidence.scripts[0].blocks[2].inputs.CONDITION.inputs.OPERAND1.name, "Score");
  assert.equal(cheeseEvidence.scripts[0].blocks[2].branches.SUBSTACK[0].inputs.BROADCAST_INPUT.name, "Level Up");
  assert.equal(promptContext.sprites.length, 2);
  assert.equal(promptContext.sprites[1].scripts.length, 3);
  assert.deepEqual(promptContext.sprites[1].scripts[0], {
    event: "script 1",
    blocks: ["当绿旗被点击", "移动 10 步"],
    opcodes: ["event_whenflagclicked", "motion_movesteps"]
  });
});

test("CoachService preserves recommendation params from DeepSeek structured output", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先按公式算兔子数量。",
        recommendation: {
          root: {
            opcode: "data_setvariableto",
            category: "变量",
            label: "将变量设为",
            reason: "用 heads 和 feet 求 rabbits。",
            params: {
              variable: "rabbits",
              value: "(feet - 2 * heads) / 2"
            },
            next: {
              opcode: "looks_sayforsecs",
              category: "外观",
              label: "说 2 秒",
              reason: "说出兔子数量。",
              params: {
                messageVariable: "rabbits"
              }
            }
          }
        }
      })
    )
  );

  const snapshot = createSnapshot();
  snapshot.toolboxCategories = ["事件", "变量", "运算", "外观"];
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 4 },
    { id: "operator", label: "运算", blockCount: 3 }
  ];
  snapshot.globalVariables = [
    { id: "heads", name: "heads", value: 35, isCloud: false },
    { id: "feet", name: "feet", value: 94, isCloud: false },
    { id: "rabbits", name: "rabbits", value: 0, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 heads 设为 35", "将 feet 设为 94"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["event_whenflagclicked -> data_setvariableto -> data_setvariableto"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "鸡兔同笼，已知 heads 和 feet，求 rabbits",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.deepEqual(result.coachResponse.recommendation.root.params, {
    variable: "rabbits",
    value: "(feet - 2 * heads) / 2"
  });
  assert.deepEqual(result.coachResponse.recommendation.root.next.params, {
    messageVariable: "rabbits"
  });
  assert.deepEqual(result.coachResponse.recommendedBlocks.map((block) => block.params), [
    {
      variable: "rabbits",
      value: "(feet - 2 * heads) / 2"
    },
    {
      messageVariable: "rabbits"
    }
  ]);
});

test("CoachService preserves Strict string recommendation params", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先把公式和循环参数填进推荐积木。",
        recommendation: {
          root: {
            opcode: "data_setvariableto",
            category: "变量",
            label: "将变量设为",
            reason: "用 heads 和 feet 求 rabbits。",
            params: {
              variable: "rabbits",
              value: "((feet - (2 * heads)) / 2)"
            },
            next: {
              opcode: "control_repeat",
              category: "控制",
              label: "重复执行",
              reason: "重复 100 次累加。",
              params: {
                repeatTimes: "100"
              },
              substack: {
                opcode: "data_changevariableby",
                category: "变量",
                label: "将变量增加",
                reason: "让 i 增加 1。",
                params: {
                  variable: "i",
                  changeBy: "1"
                }
              },
              next: {
                opcode: "looks_sayforsecs",
                category: "外观",
                label: "说 3 秒",
                reason: "把结果说 3 秒。",
                params: {
                  message: "算好了",
                  secs: "3"
                }
              }
            }
          }
        }
      })
    )
  );

  const snapshot = createSnapshot();
  snapshot.toolboxCategories = ["事件", "变量", "运算", "控制", "外观"];
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 4 },
    { id: "operator", label: "运算", blockCount: 3 },
    { id: "control", label: "控制", blockCount: 1 },
    { id: "looks", label: "外观", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "heads", name: "heads", value: 35, isCloud: false },
    { id: "feet", name: "feet", value: 94, isCloud: false },
    { id: "rabbits", name: "rabbits", value: 0, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 heads 设为 35", "将 feet 设为 94"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["event_whenflagclicked -> data_setvariableto -> data_setvariableto"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "测试推荐 params 对象和数字能否被客户端正常接收",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.deepEqual(result.coachResponse.recommendation.root.params, {
    variable: "rabbits",
    value: "((feet - (2 * heads)) / 2)"
  });
  assert.deepEqual(result.coachResponse.recommendation.root.next.params, {
    repeatTimes: "100"
  });
  assert.deepEqual(result.coachResponse.recommendation.root.next.substack.params, {
    variable: "i",
    changeBy: "1"
  });
  assert.deepEqual(result.coachResponse.recommendation.root.next.next.params, {
    message: "算好了",
    secs: "3"
  });
});

test("CoachService fills missing nested recommendation reasons from labels", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "下一步先判断 guess 是否等于 secretNumber。",
        recommendation: {
          root: {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "判断是否猜中。",
            condition: {
              opcode: "operator_equals",
              category: "运算",
              label: "guess = secretNumber",
              params: {
                left: "guess",
                right: "secretNumber"
              }
            },
            substack: {
              opcode: "looks_sayforsecs",
              category: "外观",
              label: "说 2 秒",
              reason: "猜对时给反馈。",
              params: {
                message: "猜对了"
              }
            }
          }
        }
      })
    )
  );

  const snapshot = createSnapshot();
  snapshot.toolboxCategories = ["事件", "变量", "运算", "控制", "外观"];
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 2 },
    { id: "operator", label: "运算", blockCount: 1 },
    { id: "control", label: "控制", blockCount: 1 },
    { id: "looks", label: "外观", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "guess", name: "guess", value: 0, isCloud: false },
    { id: "secretNumber", name: "secretNumber", value: 7, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["event_whenflagclicked -> data_setvariableto"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "猜数字小游戏，判断 guess 是否等于 secretNumber",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendation.root.condition.reason, "guess = secretNumber");
  assert.deepEqual(result.coachResponse.recommendation.root.condition.params, {
    left: "guess",
    right: "secretNumber"
  });
});

test("CoachService accepts a complete-project usage summary without recommended blocks", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "你的作品已经完整。点击绿旗后，用方向键控制 Cat 2 躲避障碍即可。"
      })
    )
  );
  const snapshot = createCompleteSnapshot();

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.answerText, "你的作品已经完整。点击绿旗后，用方向键控制 Cat 2 躲避障碍即可。");
  assert.equal(result.coachResponse.nextStep, result.coachResponse.answerText);
  assert.deepEqual(result.coachResponse.recommendedBlocks, []);
  assert.equal(Object.hasOwn(result.coachResponse, "recommendation"), false);
});

test("CoachService falls back to structured local blocks when a simple project receives summary-only DeepSeek output", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "你的作品已经可以点击绿旗看到角色移动。"
      })
    )
  );
  const snapshot = createSnapshot();

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.warning, undefined);
  assert.match(result.coachResponse.answerText, /下一步|循环|补/);
  assert.notEqual(result.coachResponse.nextStep, "你的作品已经可以点击绿旗看到角色移动。");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "control_repeat");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["control_repeat", "motion_turnright", "motion_movesteps"]
  );
});

test("CoachService keeps DeepSeek hints when legacy nextStep is null", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "当前项目还缺少碰撞后的反馈，请先补上得分变化。",
        recommendation: {
          root: {
            opcode: "data_changevariableby",
            category: "变量",
            label: "将分数增加 1",
            reason: "让碰撞后出现明确的得分反馈。"
          }
        },
        nextStep: null
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> motion_movesteps"],
    programAreaModules: [{ id: "motion", label: "运动", blockCount: 1 }],
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.warning, undefined);
  assert.equal(result.coachResponse.nextStep, "当前项目还缺少碰撞后的反馈，请先补上得分变化。");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "data_changevariableby");
});

test("CoachService keeps completed-project summaries when DeepSeek returns null optional fields", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "你的作品已经完整，点击绿旗即可开始体验。",
        recommendation: null,
        nextStep: null
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createCompleteSnapshot(),
    currentTargetPrograms: ["event_whenflagclicked -> control_forever -> motion_movesteps -> control_if"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "motion", label: "运动", blockCount: 1 },
      { id: "control", label: "控制", blockCount: 2 },
      { id: "sensing", label: "侦测", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 1 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.warning, undefined);
  assert.equal(result.coachResponse.nextStep, "你的作品已经完整，点击绿旗即可开始体验。");
  assert.equal(Object.hasOwn(result.coachResponse, "recommendation"), false);
});

test("CoachService fallback speaks directly to the student", async () => {
  const service = new CoachService();

  const result = await service.generateHint({
    snapshot: {
      ...createSnapshot(),
      toolboxCategories: ["事件", "控制", "侦测"],
      programAreaModules: [
        { id: "event", label: "事件", blockCount: 1 },
        { id: "control", label: "控制", blockCount: 1 },
        { id: "sensing", label: "侦测", blockCount: 1 }
      ],
      sprites: [
        {
          ...createSnapshot().sprites[0],
          blockCount: 4,
          scripts: [
            {
              spriteName: "Cat",
              event: "when green flag clicked",
              blockSequence: ["当绿旗被点击", "一直重复", "碰到...？"],
              blockOpcodes: ["event_whenflagclicked", "control_forever", "sensing_touchingobject"]
            }
          ]
        }
      ],
      detectedConcepts: ["event", "control", "sensing"]
    },
    currentTargetPrograms: ["event_whenflagclicked -> control_forever -> sensing_touchingobject"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "control", label: "控制", blockCount: 1 },
      { id: "sensing", label: "侦测", blockCount: 1 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "做一个有规则的小游戏",
    aiConfig: createAiConfig({ configured: false, apiKey: "" })
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.coachResponse.answerText.includes("学生"), false);
  assert.equal(result.coachResponse.answerText.includes("你"), true);
  assert.deepEqual(result.coachResponse.recommendation, {
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "将变量设为",
      reason: "先初始化一个核心变量。",
      next: {
        opcode: "data_changevariableby",
        category: "变量",
        label: "将变量增加",
        reason: "完成动作或满足条件时更新结果。",
        next: {
          opcode: "looks_sayforsecs",
          category: "外观",
          label: "说 2 秒",
          reason: "变量变化后给一个可见反馈，方便调试。"
        }
      }
    }
  });
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
        summary: "先补一个新的按键入口。",
        recommendation: {
          root: {
            opcode: "event_whenkeypressed",
            category: "事件",
            label: "当按下空格键",
            reason: "给脚本增加一个新的触发入口。"
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
  assert.equal(capturedRequest.messages[0].content.includes("从整个项目而不是只从当前角色判断作品是否完整"), true);
  assert.equal(capturedRequest.messages[1].content.includes("先看学生当前 Scratch 项目"), false);
  assert.equal(capturedRequest.messages[1].content.includes("对照教师参考作品补当前还缺的一小步"), false);
  assert.equal(capturedRequest.messages[1].content.includes("完整阅读舞台和全部角色"), true);
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
  assert.equal(capturedRequest.messages[0].content.includes("必须调用且只调用一个严格工具"), true);
});

test("CoachService does not expose student-facing diagnostic fields for structured hints", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "把碰撞判断放进循环里。",
        recommendation: {
          root: {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "先把判断写成真正会执行的脚本。",
            condition: {
              opcode: "sensing_touchingobject",
              category: "侦测",
              label: "碰到...？",
              reason: "先检测猫是否碰到奶酪。"
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
            opcode: "event_whenkeypressed",
            category: "事件",
            label: "当按下空格键",
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
    ["event_whenkeypressed"]
  );
  assert.equal(result.coachResponse.recommendation.root.next, undefined);
  assert.equal(result.coachResponse.recommendation.root.substack, undefined);
});

test("CoachService keeps nested recommendations only on compatible parent blocks", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "把移动动作放进重复执行里。",
        recommendation: {
          root: {
            opcode: "control_repeat",
            category: "控制",
            label: "重复执行",
            reason: "让动作重复。",
            substack: {
              opcode: "motion_movesteps",
              category: "运动",
              label: "移动 10 步",
              reason: "重复移动。"
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
      { id: "control", label: "控制", blockCount: 1 },
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
    ["control_repeat", "motion_movesteps"]
  );
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

test("CoachService omits an already-used green-flag hat and keeps the new continuation", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "让角色持续运动。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "这是程序的开始，你已经用了这个积木。",
            next: {
              opcode: "control_forever",
              category: "控制",
              label: "重复执行",
              reason: "让角色持续运动。",
              substack: {
                opcode: "motion_movesteps",
                category: "运动",
                label: "移动 10 步",
                reason: "让角色向前移动。"
              }
            }
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
    programAreaModules: createSnapshot().programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "control_forever");
  assert.equal(result.coachResponse.recommendation?.root.substack?.opcode, "motion_movesteps");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["control_forever", "motion_movesteps"]
  );
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode === "event_whenflagclicked"),
    false
  );
});

test("CoachService salvages a renderable continuation after omitting an already-used hat", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "让角色碰到边缘后继续移动。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "从绿旗开始。",
            next: {
              opcode: "sensing_touchingobject",
              category: "侦测",
              label: "碰到边缘？",
              reason: "检查角色是否碰到边缘。",
              next: {
                opcode: "motion_ifonedgebounce",
                category: "运动",
                label: "碰到边缘就反弹",
                reason: "让角色留在舞台里。"
              }
            }
          }
        }
      })
    )
  );

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
    programAreaModules: createSnapshot().programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "motion_ifonedgebounce");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["motion_ifonedgebounce"]
  );
});

test("CoachService filters unavailable recommended blocks from DeepSeek", async () => {
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

  assert.equal(result.coachResponse.recommendedBlocks.length, 2);
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["motion_movesteps", "control_repeat"]
  );
});

test("CoachService trims overlong DeepSeek structures to five blocks instead of falling back", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "复杂推荐只保留最关键的五步。",
        recommendation: {
          root: {
            opcode: "motion_gotoxy",
            category: "运动",
            label: "移到 x: y:",
            reason: "1",
            next: {
              opcode: "control_forever",
              category: "控制",
              label: "一直重复",
              reason: "2",
              substack: {
                opcode: "motion_movesteps",
                category: "运动",
                label: "移动 10 步",
                reason: "3"
              },
              next: {
                opcode: "looks_sayforsecs",
                category: "外观",
                label: "说 2 秒",
                reason: "4",
                next: {
                  opcode: "data_setvariableto",
                  category: "变量",
                  label: "将变量设为",
                  reason: "5",
                  next: {
                    opcode: "data_changevariableby",
                    category: "变量",
                    label: "将变量增加",
                    reason: "6"
                  }
                }
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
      { id: "motion", label: "运动", blockCount: 2 },
      { id: "control", label: "控制", blockCount: 1 },
      { id: "looks", label: "外观", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 2 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "继续做复杂移动",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["motion_gotoxy", "control_forever", "motion_movesteps"]
  );
  assert.equal(result.coachResponse.recommendation.root.next?.next, undefined);
});

test("CoachService strips Scratch node metadata from DeepSeek structures", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "用判断和隐藏做一个反馈。",
        recommendation: {
          root: {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "判断碰撞。",
            fields: {},
            inputs: {
              CONDITION: [2, "condition"],
              SUBSTACK: [2, "hide"]
            },
            condition: {
              opcode: "sensing_touchingobject",
              category: "侦测",
              label: "碰到...？",
              reason: "检测是否碰到目标。",
              fields: {
                TOUCHINGOBJECTMENU: ["Mouse1", "Mouse1"]
              },
              inputs: {}
            },
            substack: {
              opcode: "looks_hide",
              category: "外观",
              label: "隐藏",
              reason: "碰到时隐藏。",
              fields: {},
              inputs: {}
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
      { id: "control", label: "控制", blockCount: 1 },
      { id: "sensing", label: "侦测", blockCount: 1 },
      { id: "looks", label: "外观", blockCount: 1 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "碰到鼠标时隐藏",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["control_if", "sensing_touchingobject", "looks_hide"]
  );
  assert.equal("fields" in result.coachResponse.recommendation.root, false);
  assert.equal("inputs" in result.coachResponse.recommendation.root.condition, false);
});

test("CoachService keeps fewer recommendations without padding", async () => {
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

  assert.equal(result.coachResponse.recommendedBlocks.length, 1);
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["motion_movesteps"]
  );
});

test("CoachService accepts explicit null tails from DeepSeek recommendation structures", async () => {
  const service = new CoachService(async () =>
    createDeepSeekResponse(
      JSON.stringify({
        summary: "先让角色动一下。",
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "先给脚本一个开始。",
            next: {
              opcode: "motion_movesteps",
              category: "运动",
              label: "移动 10 步",
              reason: "让角色动起来。",
              next: null
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
        id: "event",
        label: "事件",
        blockCount: 1
      },
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "让角色先动起来",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["motion_movesteps"]
  );
  assert.equal(result.coachResponse.recommendation.root.next, undefined);
});

test("CoachService fallback gives a local basic hint without forcing a fixed block count", async () => {
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
  assert.equal(
    result.coachResponse.recommendation?.root.opcode,
    result.coachResponse.recommendedBlocks[0].opcode
  );
});

test("CoachService fallback builds a renderable loop structure instead of chaining incompatible control blocks", async () => {
  const service = new CoachService();

  const result = await service.generateHint({
    snapshot: createSnapshot(),
    currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "control_repeat");
  assert.equal(result.coachResponse.recommendation?.root.next, undefined);
  assert.equal(result.coachResponse.recommendation?.root.substack?.opcode, "motion_turnright");
  assert.equal(
    result.coachResponse.recommendation?.root.substack?.next?.opcode,
    "motion_movesteps"
  );
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["control_repeat", "motion_turnright", "motion_movesteps"]
  );
});

test("CoachService fallback recommends direct edge bounce instead of wrapping it in an if block", async () => {
  const service = new CoachService();
  const snapshot = createSnapshot();
  snapshot.toolboxCategories = ["事件", "运动", "控制", "侦测"];
  snapshot.programAreaModules = [
    {
      id: "event",
      label: "事件",
      blockCount: 1
    },
    {
      id: "motion",
      label: "运动",
      blockCount: 2
    },
    {
      id: "control",
      label: "控制",
      blockCount: 1
    }
  ];
  snapshot.sprites[0].blockCount = 4;
  snapshot.sprites[0].scripts = [
    {
      spriteName: "Cat",
      event: "when green flag clicked",
      blockSequence: ["当绿旗被点击", "重复执行", "移动 10 步", "右转 15 度"],
      blockOpcodes: [
        "event_whenflagclicked",
        "control_repeat",
        "motion_movesteps",
        "motion_turnright"
      ]
    }
  ];
  snapshot.blocks = [
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
      opcode: "control_repeat",
      category: "控制",
      label: "重复执行",
      spriteName: "Cat",
      topLevel: false
    },
    {
      id: "block-3",
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      spriteName: "Cat",
      topLevel: false
    },
    {
      id: "block-4",
      opcode: "motion_turnright",
      category: "运动",
      label: "右转 15 度",
      spriteName: "Cat",
      topLevel: false
    }
  ];
  snapshot.detectedConcepts = ["event", "motion", "control"];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 重复执行 -> 移动 10 步 -> 右转 15 度"],
    programAreaModules: [
      {
        id: "event",
        label: "事件",
        blockCount: 1
      },
      {
        id: "motion",
        label: "运动",
        blockCount: 2
      },
      {
        id: "control",
        label: "控制",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "motion_ifonedgebounce");
  assert.equal(
    result.coachResponse.recommendation?.root.condition,
    undefined
  );
  assert.equal(
    result.coachResponse.recommendation?.root.substack,
    undefined
  );
  assert.equal(
    result.coachResponse.recommendation?.root.next?.opcode,
    undefined
  );
  assert.deepEqual(
    result.coachResponse.recommendedBlocks.map((block) => block.opcode),
    ["motion_ifonedgebounce"]
  );
});

test("CoachService fallback does not chain multiple hat blocks in the event suggestion", async () => {
  const service = new CoachService();
  const snapshot = createSnapshot();
  snapshot.sprites[0].scripts = [
    {
      spriteName: "Cat",
      event: "",
      blockSequence: ["移动 10 步"],
      blockOpcodes: ["motion_movesteps"]
    }
  ];
  snapshot.blocks = [
    {
      id: "block-2",
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      spriteName: "Cat",
      topLevel: true
    }
  ];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["移动 10 步"],
    programAreaModules: [
      {
        id: "motion",
        label: "运动",
        blockCount: 1
      }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.coachResponse.recommendation?.root.opcode, "event_whenflagclicked");
  assert.equal(result.coachResponse.recommendation?.root.next?.opcode, "motion_movesteps");
  assert.equal(
    result.coachResponse.recommendation?.root.next?.next?.opcode,
    "looks_sayforsecs"
  );
  assert.equal(result.coachResponse.recommendation?.root.next?.next?.next, undefined);
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


test("CoachService math chicken-rabbit fallback recommends formula path instead of motion", async () => {
  const service = new CoachService(async () => {
    throw new Error("network should not be required for fallback");
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 2 }
  ];
  snapshot.globalVariables = [
    { id: "heads", name: "heads", value: 35, isCloud: false },
    { id: "feet", name: "feet", value: 94, isCloud: false }
  ];
  snapshot.sprites[0].variables = [
    { id: "heads", name: "heads", value: 35, isCloud: false },
    { id: "feet", name: "feet", value: 94, isCloud: false }
  ];
  snapshot.sprites[0].blockCount = 3;
  snapshot.sprites[0].scripts = [
    {
      spriteName: "Cat",
      event: "when green flag clicked",
      blockSequence: ["当绿旗被点击", "将 heads 设为 35", "将 feet 设为 94"],
      blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto"]
    }
  ];
  snapshot.detectedConcepts = ["event", "data"];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 heads 设为 35 -> 将 feet 设为 94"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "鸡兔同笼",
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.match(result.coachResponse.answerText, /兔子|rabbits|公式|求/);
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode.startsWith("motion_")),
    false
  );
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) =>
      ["operator_subtract", "operator_divide", "data_setvariableto"].includes(block.opcode)
    ),
    true
  );
});

test("CoachService math sum fallback recommends accumulator instead of turn/bounce", async () => {
  const service = new CoachService(async () => {
    throw new Error("network should not be required for fallback");
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 3 },
    { id: "control", label: "控制", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "n", name: "n", value: 10, isCloud: false },
    { id: "sum", name: "sum", value: 0, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].blockCount = 5;
  snapshot.sprites[0].scripts = [
    {
      spriteName: "Cat",
      event: "when green flag clicked",
      blockSequence: ["当绿旗被点击", "将 n 设为 10", "将 sum 设为 0", "将 i 设为 1", "重复执行"],
      blockOpcodes: [
        "event_whenflagclicked",
        "data_setvariableto",
        "data_setvariableto",
        "data_setvariableto",
        "control_repeat"
      ]
    }
  ];
  snapshot.detectedConcepts = ["event", "data", "control"];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 n 设为 10 -> 将 sum 设为 0 -> 将 i 设为 1 -> 重复执行"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "1到n求和",
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.match(result.coachResponse.answerText, /sum|累加|增加 i|i 增加/);
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) =>
      ["motion_turnright", "motion_movesteps", "motion_ifonedgebounce"].includes(block.opcode)
    ),
    false
  );
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode === "data_changevariableby"),
    true
  );
});

test("CoachService factorial fallback keeps product multiplication instead of sum accumulator", async () => {
  const service = new CoachService(async () => {
    throw new Error("network should not be required for fallback");
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 2 },
    { id: "control", label: "控制", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "product", name: "product", value: 1, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].blockCount = 4;
  snapshot.sprites[0].scripts = [
    {
      spriteName: "Cat",
      event: "when green flag clicked",
      blockSequence: ["当绿旗被点击", "将 product 设为 1", "将 i 设为 1", "重复执行 5 次"],
      blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "control_repeat"]
    }
  ];
  snapshot.detectedConcepts = ["event", "data", "control"];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 product 设为 1 -> 将 i 设为 1 -> 重复执行 5 次"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "用重复执行计算 5 的阶乘，也就是 1×2×3×4×5，并说出结果",
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.match(result.coachResponse.answerText, /阶乘|product|乘法/);
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => /sum|\bn\b/.test(block.reason)),
    false
  );
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) =>
      block.opcode === "data_setvariableto" && /product\s*\*\s*i/.test(block.reason)
    ),
    true
  );
});

test("CoachService drawing fallback avoids edge-bounce drift after a pen loop exists", async () => {
  const service = new CoachService(async () => {
    throw new Error("network should not be required for fallback");
  });

  const snapshot = createSnapshot();
  snapshot.loadedExtensions = ["pen"];
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "pen", label: "画笔", blockCount: 2 },
    { id: "control", label: "控制", blockCount: 1 },
    { id: "motion", label: "运动", blockCount: 2 }
  ];
  snapshot.sprites[0].blockCount = 6;
  snapshot.sprites[0].scripts = [
    {
      spriteName: "Cat",
      event: "when green flag clicked",
      blockSequence: ["当绿旗被点击", "全部擦除", "落笔", "重复执行 4 次", "移动 100 步", "右转 90 度"],
      blockOpcodes: [
        "event_whenflagclicked",
        "pen_clear",
        "pen_penDown",
        "control_repeat",
        "motion_movesteps",
        "motion_turnright"
      ]
    }
  ];
  snapshot.detectedConcepts = ["event", "pen", "control", "motion"];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 全部擦除 -> 落笔 -> 重复执行 4 次 -> 移动 100 步 -> 右转 90 度"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: ["pen"],
    loadedExtensions: ["pen"],
    goal: "用画笔和重复执行画一个正方形",
    aiConfig: createAiConfig({
      configured: false,
      apiKey: ""
    })
  });

  assert.equal(result.source, "fallback");
  assert.match(result.coachResponse.answerText, /正方形|画|抬笔|闭合/);
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) =>
      ["motion_ifonedgebounce", "sensing_touchingobject", "data_changevariableby"].includes(block.opcode)
    ),
    false
  );
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode === "pen_penUp"),
    true
  );
});

test("CoachService prompt context includes math task guidance for chicken-rabbit variables", async () => {
  let capturedRequest = null;
  const service = new CoachService(async (url, init) => {
    capturedRequest = {
      url,
      init,
      body: JSON.parse(init.body)
    };
    return createDeepSeekResponse(JSON.stringify({
                  summary: "先求兔子数量。",
                  recommendation: {
                    root: {
                      opcode: "data_setvariableto",
                      category: "变量",
                      label: "将变量设为",
                      reason: "保存兔子数量"
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.globalVariables = [
    { id: "heads", name: "heads", value: 35, isCloud: false },
    { id: "feet", name: "feet", value: 94, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 heads 设为 35", "将 feet 设为 94"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto"]
  };

  await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 heads 设为 35 -> 将 feet 设为 94"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 2 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "鸡兔同笼",
    aiConfig: createAiConfig()
  });

  assert.equal(capturedRequest.body.messages[0].content.includes("数学计算题"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("禁止把任务反转"), true);
  assert.equal(capturedRequest.body.messages[0].content.includes("motion_ifonedgebounce"), true);

  const promptContext = JSON.parse(capturedRequest.body.messages[1].content.split("\n\n").at(-1));
  assert.equal(promptContext.taskType, "math-chicken-rabbit");
  assert.match(promptContext.taskGuidance, /鸡兔同笼|禁止反转/);
  assert.equal(promptContext.analysisPriority.includes("数学题禁止任务反转"), true);
});


test("CoachService filters motion recommendations for math chicken-rabbit DeepSeek responses", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "让角色继续动起来并碰到边缘反弹。",
                  recommendation: {
                    root: {
                      opcode: "motion_movesteps",
                      category: "运动",
                      label: "移动 10 步",
                      reason: "先动起来",
                      next: {
                        opcode: "motion_ifonedgebounce",
                        category: "运动",
                        label: "碰到边缘就反弹",
                        reason: "别跑出舞台",
                        next: {
                          opcode: "data_setvariableto",
                          category: "变量",
                          label: "将变量设为",
                          reason: "保存兔子数量"
                        }
                      }
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.globalVariables = [
    { id: "heads", name: "heads", value: 35, isCloud: false },
    { id: "feet", name: "feet", value: 94, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 heads 设为 35", "将 feet 设为 94"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 heads 设为 35 -> 将 feet 设为 94"],
    programAreaModules: [
      { id: "event", label: "事件", blockCount: 1 },
      { id: "data", label: "变量", blockCount: 2 }
    ],
    usedExtensions: [],
    loadedExtensions: [],
    goal: "鸡兔同笼",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode.startsWith("motion_")),
    false
  );
  assert.equal(result.coachResponse.recommendedBlocks[0]?.opcode, "data_setvariableto");
});

test("CoachService filters edge-bounce recommendations for drawing DeepSeek responses", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "继续画正方形，不要跑出舞台。",
                  recommendation: {
                    root: {
                      opcode: "motion_ifonedgebounce",
                      category: "运动",
                      label: "碰到边缘就反弹",
                      reason: "别跑出舞台",
                      next: {
                        opcode: "pen_penUp",
                        category: "画笔",
                        label: "抬笔",
                        reason: "画完正方形后抬笔"
                      }
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.loadedExtensions = ["pen"];
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "pen", label: "画笔", blockCount: 2 },
    { id: "control", label: "控制", blockCount: 1 },
    { id: "motion", label: "运动", blockCount: 2 }
  ];
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "全部擦除", "落笔", "重复执行 4 次", "移动 100 步", "右转 90 度"],
    blockOpcodes: [
      "event_whenflagclicked",
      "pen_clear",
      "pen_penDown",
      "control_repeat",
      "motion_movesteps",
      "motion_turnright"
    ]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 全部擦除 -> 落笔 -> 重复执行 4 次 -> 移动 100 步 -> 右转 90 度"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: ["pen"],
    loadedExtensions: ["pen"],
    goal: "用画笔和重复执行画一个正方形",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode === "motion_ifonedgebounce"),
    false
  );
  assert.equal(result.coachResponse.recommendedBlocks[0]?.opcode, "pen_penUp");
});

test("CoachService filters ask recommendations for fixed upper-bound sum goals", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "先询问 n，再循环求和。",
                  recommendation: {
                    root: {
                      opcode: "sensing_askandwait",
                      category: "侦测",
                      label: "询问并等待",
                      reason: "询问 n",
                      next: {
                        opcode: "control_repeat",
                        category: "控制",
                        label: "重复执行",
                        reason: "重复 100 次",
                        substack: {
                          opcode: "data_changevariableby",
                          category: "变量",
                          label: "将变量增加",
                          reason: "sum 增加 i"
                        }
                      }
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 3 },
    { id: "control", label: "控制", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "n", name: "n", value: 100, isCloud: false },
    { id: "sum", name: "sum", value: 0, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 n 设为 100", "将 sum 设为 0", "将 i 设为 1"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "data_setvariableto"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 n 设为 100 -> 将 sum 设为 0 -> 将 i 设为 1"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "1+100 用重复执行求和，并说出结果",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(
    result.coachResponse.recommendedBlocks.some((block) => block.opcode === "sensing_askandwait"),
    false
  );
  assert.equal(result.coachResponse.recommendedBlocks[0]?.opcode, "control_repeat");
});

test("CoachService makes fixed sum output recommendations say the sum variable", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "循环结束后输出结果。",
                  recommendation: {
                    root: {
                      opcode: "looks_sayforsecs",
                      category: "外观",
                      label: "说 2 秒",
                      reason: "输出结果"
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 2 },
    { id: "control", label: "控制", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "sum", name: "sum", value: 0, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 sum 设为 0", "将 i 设为 1", "重复执行 100 次"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "control_repeat"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 sum 设为 0 -> 将 i 设为 1 -> 重复执行 100 次"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "1+2+3...+100 求和并说出结果",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendedBlocks[0]?.opcode, "looks_sayforsecs");
  assert.match(result.coachResponse.recommendedBlocks[0]?.reason ?? "", /sum/);
});

test("CoachService keeps custom accumulator variable name in fixed sum output recommendations", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "循环结束后输出结果。",
                  recommendation: {
                    root: {
                      opcode: "looks_sayforsecs",
                      category: "外观",
                      label: "说 2 秒",
                      reason: "输出结果"
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "data", label: "变量", blockCount: 2 },
    { id: "control", label: "控制", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "s", name: "s", value: 0, isCloud: false },
    { id: "i", name: "i", value: 1, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "将 s 设为 0", "将 i 设为 1", "重复执行 100 次"],
    blockOpcodes: ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "control_repeat"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 将 s 设为 0 -> 将 i 设为 1 -> 重复执行 100 次"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "1+2+3...+100 求和并说出结果",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendedBlocks[0]?.opcode, "looks_sayforsecs");
  assert.match(result.coachResponse.recommendedBlocks[0]?.reason ?? "", /s 变量/);
  assert.doesNotMatch(result.coachResponse.recommendedBlocks[0]?.reason ?? "", /sum 变量/);
});

test("CoachService treats square-number goals as math and keeps result output concrete", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "计算并输出结果。",
                  recommendation: {
                    root: {
                      opcode: "data_setvariableto",
                      category: "变量",
                      label: "将变量设为",
                      reason: "计算平方",
                      next: {
                        opcode: "looks_sayforsecs",
                        category: "外观",
                        label: "说 2 秒",
                        reason: "输出结果"
                      }
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "sensing", label: "侦测", blockCount: 2 },
    { id: "data", label: "变量", blockCount: 2 }
  ];
  snapshot.globalVariables = [
    { id: "number", name: "number", value: 0, isCloud: false },
    { id: "result", name: "result", value: 0, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "询问 请输入一个数 并等待", "将 number 设为 回答", "将 result 设为 0"],
    blockOpcodes: ["event_whenflagclicked", "sensing_askandwait", "data_setvariableto", "data_setvariableto"]
  };

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 询问请输入一个数 -> 将 number 设为 回答 -> 将 result 设为 0"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "输入一个数，计算它的平方并说出来",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendedBlocks[0]?.opcode, "data_setvariableto");
  assert.match(result.coachResponse.recommendedBlocks[0]?.reason ?? "", /result|number/);
  assert.equal(result.coachResponse.recommendedBlocks[1]?.opcode, "looks_sayforsecs");
  assert.match(result.coachResponse.recommendedBlocks[1]?.reason ?? "", /result/);
});

test("CoachService returns completed summary after square-number program can say the computed result", async () => {
  const service = new CoachService(async () => {
    return createDeepSeekResponse(JSON.stringify({
                  summary: "先准备累加结果变量 sum。",
                  recommendation: {
                    root: {
                      opcode: "data_setvariableto",
                      category: "变量",
                      label: "将变量设为",
                      reason: "把 sum 设为 0"
                    }
                  }
                }));
  });

  const snapshot = createSnapshot();
  snapshot.programAreaModules = [
    { id: "event", label: "事件", blockCount: 1 },
    { id: "sensing", label: "侦测", blockCount: 2 },
    { id: "data", label: "变量", blockCount: 2 },
    { id: "operator", label: "运算", blockCount: 1 },
    { id: "looks", label: "外观", blockCount: 1 }
  ];
  snapshot.globalVariables = [
    { id: "number", name: "number", value: 7, isCloud: false },
    { id: "result", name: "result", value: 49, isCloud: false }
  ];
  snapshot.sprites[0].variables = snapshot.globalVariables;
  snapshot.sprites[0].blockCount = 7;
  snapshot.sprites[0].scripts[0] = {
    spriteName: "Cat",
    event: "when green flag clicked",
    blockSequence: ["当绿旗被点击", "询问 请输入一个数 并等待", "将 number 设为 回答", "将 result 设为", "说 2 秒"],
    blockOpcodes: ["event_whenflagclicked", "sensing_askandwait", "data_setvariableto", "data_setvariableto", "looks_sayforsecs"]
  };
  snapshot.blocks = [
    { id: "flag", opcode: "event_whenflagclicked", category: "事件", label: "当绿旗被点击", spriteName: "Cat", topLevel: true },
    { id: "ask", opcode: "sensing_askandwait", category: "侦测", label: "询问并等待", spriteName: "Cat", topLevel: false },
    { id: "answer", opcode: "sensing_answer", category: "侦测", label: "回答", spriteName: "Cat", topLevel: false },
    { id: "set-number", opcode: "data_setvariableto", category: "变量", label: "将 number 设为", spriteName: "Cat", topLevel: false },
    { id: "set-result", opcode: "data_setvariableto", category: "变量", label: "将 result 设为", spriteName: "Cat", topLevel: false },
    { id: "multiply", opcode: "operator_multiply", category: "运算", label: "乘", spriteName: "Cat", topLevel: false },
    { id: "say", opcode: "looks_sayforsecs", category: "外观", label: "说 2 秒", spriteName: "Cat", topLevel: false }
  ];

  const result = await service.generateHint({
    snapshot,
    currentTargetPrograms: ["当绿旗被点击 -> 询问请输入一个数 -> 将 number 设为 回答 -> 将 result 设为 -> 说 2 秒"],
    programAreaModules: snapshot.programAreaModules,
    usedExtensions: [],
    loadedExtensions: [],
    goal: "输入一个数，计算它的平方并说出来",
    aiConfig: createAiConfig()
  });

  assert.equal(result.source, "deepseek");
  assert.equal(result.coachResponse.recommendedBlocks.length, 0);
  assert.match(result.coachResponse.answerText, /平方计算已经完成/);
});
