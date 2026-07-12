import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../dist/session-manager.js";
import { StateStore } from "../dist/state-store.js";

function createBridgeServerMock() {
  return {
    handlers: { onPayload: null, onError: null },
    start: async () => {},
    stop: async () => {},
    getBaseUrl: () => "http://127.0.0.1:39000",
    getToken: () => "token",
    setHandlers(onPayload, onError) {
      this.handlers = { onPayload, onError };
    }
  };
}

function createAiConfigMock(overrides = {}) {
  return async () => ({
    configured: false,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    timeoutMs: 20000,
    configPath: "C:\\config\\deepseek.config.json",
    customKeyConfigured: false,
    ...overrides
  });
}

function createConfigStoreMock(initialPath = undefined) {
  let scratchExecutablePath = initialPath;
  let customAiApiKey;
  let customAiModel;
  let customAiPrompt;
  let lastScratchLocale;
  let aiHintTriggerMode = "auto";

  return {
    load: async () => ({
      ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
      ...(customAiApiKey ? { customAiApiKey } : {}),
      ...(customAiModel ? { customAiModel } : {}),
      ...(customAiPrompt ? { customAiPrompt } : {}),
      ...(lastScratchLocale ? { lastScratchLocale } : {}),
      aiHintTriggerMode
    }),
    saveScratchExecutablePath: async (value) => {
      scratchExecutablePath = value;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    saveCustomAiApiKey: async (value) => {
      customAiApiKey = value;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    clearCustomAiApiKey: async () => {
      customAiApiKey = undefined;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    saveCustomAiModel: async (value) => {
      customAiModel = value;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    clearCustomAiModel: async () => {
      customAiModel = undefined;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    saveCustomAiPrompt: async (value) => {
      customAiPrompt = value;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        aiHintTriggerMode
      };
    },
    clearCustomAiPrompt: async () => {
      customAiPrompt = undefined;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    saveAiHintTriggerMode: async (value) => {
      aiHintTriggerMode = value;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    },
    saveLastScratchLocale: async (value) => {
      lastScratchLocale = value;
      return {
        ...(scratchExecutablePath ? { scratchExecutablePath } : {}),
        ...(customAiApiKey ? { customAiApiKey } : {}),
        ...(customAiModel ? { customAiModel } : {}),
        ...(customAiPrompt ? { customAiPrompt } : {}),
        ...(lastScratchLocale ? { lastScratchLocale } : {}),
        aiHintTriggerMode
      };
    }
  };
}

function flushAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFakeTimer() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => currentTime,
    setTimeout: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, {
        callback,
        runAt: currentTime + Math.max(0, delayMs)
      });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    advance: async (ms) => {
      currentTime += ms;
      let ran = true;
      while (ran) {
        ran = false;
        const dueTimers = [...timers.entries()]
          .filter(([, timer]) => timer.runAt <= currentTime)
          .sort((a, b) => a[1].runAt - b[1].runAt);
        for (const [id, timer] of dueTimers) {
          if (!timers.has(id)) {
            continue;
          }
          timers.delete(id);
          timer.callback();
          ran = true;
          await flushAsyncWork();
        }
      }
    }
  };
}

function createLinearProjectData(opcodes) {
  const blocks = {};

  for (const [index, opcode] of opcodes.entries()) {
    const id = String.fromCharCode(97 + index);
    const nextId = index < opcodes.length - 1 ? String.fromCharCode(97 + index + 1) : null;
    blocks[id] = {
      opcode,
      next: nextId,
      parent: index === 0 ? null : String.fromCharCode(97 + index - 1),
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: index === 0
    };
  }

  return {
    targets: [
      {
        id: "sprite-a",
        name: "Cat",
        isStage: false,
        blocks
      }
    ]
  };
}

function createRepeatSubstackProjectData(substackOpcodes) {
  const blocks = {
    hat: {
      opcode: "event_whenflagclicked",
      next: "move",
      parent: null,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: true
    },
    move: {
      opcode: "motion_movesteps",
      next: "repeat",
      parent: "hat",
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: false
    },
    repeat: {
      opcode: "control_repeat",
      next: null,
      parent: "move",
      inputs: {
        SUBSTACK: [2, "sub-0"]
      },
      fields: {},
      shadow: false,
      topLevel: false
    }
  };

  for (const [index, opcode] of substackOpcodes.entries()) {
    const id = `sub-${index}`;
    const nextId = index < substackOpcodes.length - 1 ? `sub-${index + 1}` : null;
    blocks[id] = {
      opcode,
      next: nextId,
      parent: index === 0 ? "repeat" : `sub-${index - 1}`,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: false
    };
  }

  return {
    targets: [
      {
        id: "sprite-a",
        name: "Cat",
        isStage: false,
        blocks
      }
    ]
  };
}

test("SessionManager enters waiting state when Scratch path is not configured", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock(),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  const nextState = stateStore.getState();
  assert.equal(nextState.status, "waiting");
  assert.equal(nextState.scratchExecutablePath, undefined);
  assert.deepEqual(nextState.toolboxCategories, []);
  assert.deepEqual(nextState.usedExtensions, []);
  assert.deepEqual(nextState.loadedExtensions, []);
  assert.deepEqual(nextState.programAreaModules, []);
  assert.deepEqual(nextState.currentTargetPrograms, []);
  assert.equal(nextState.aiConfigured, false);
  assert.equal(nextState.aiCustomKeyConfigured, false);
  assert.equal(nextState.aiHintTriggerMode, "auto");
  assert.equal(nextState.aiStatus, "idle");
  assert.equal(nextState.statusText, "请先选择 Scratch 软件");
  assert.equal(nextState.detail.includes("请先选择本机的 Scratch 软件"), true);
});

test("SessionManager supports macOS with the same waiting flow", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "darwin",
    log: () => {},
    configStore: createConfigStoreMock("/Applications/Scratch.app/Contents/MacOS/Scratch"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  const nextState = stateStore.getState();
  assert.equal(nextState.status, "waiting");
  assert.equal(nextState.scratchExecutablePath, "/Applications/Scratch.app/Contents/MacOS/Scratch");
  assert.equal(nextState.statusText, "请从伴随程序打开已选 Scratch");
  assert.equal(nextState.detail.includes("已配置 Scratch 软件"), true);
});

test("SessionManager keeps unsupported status on Linux", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "linux",
    log: () => {},
    configStore: createConfigStoreMock(),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  const nextState = stateStore.getState();
  assert.equal(nextState.status, "unsupported");
  assert.equal(nextState.statusText, "当前版本暂不支持 Linux");
  assert.equal(nextState.detail, "当前版本已支持 Windows 和 macOS，请在受支持的平台运行这个伴随程序。");
});

test("SessionManager enters waiting state with the configured Scratch path", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  const nextState = stateStore.getState();
  assert.equal(nextState.status, "waiting");
  assert.equal(nextState.scratchExecutablePath, "C:\\Scratch 3.exe");
  assert.equal(nextState.aiStatus, "idle");
  assert.equal(nextState.aiModel, "deepseek-v4-flash");
  assert.equal(nextState.statusText, "请从伴随程序打开已选 Scratch");
  assert.equal(nextState.detail.includes("打开已选 Scratch"), true);
});

test("SessionManager derives current target programs from projectData", async () => {
  const stateStore = new StateStore();
  const bridgeServer = createBridgeServerMock();
  const manager = new SessionManager(stateStore, {
    bridgeServer,
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["motion", "looks"],
    loadedExtensions: ["music"],
    projectData: {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            a: {
              opcode: "event_whenflagclicked",
              next: "b",
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            },
            b: {
              opcode: "motion_movesteps",
              next: "c",
              parent: "a",
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            },
            c: {
              opcode: "motion_turnright",
              next: "d",
              parent: "b",
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            },
            d: {
              opcode: "pen_clear",
              next: null,
              parent: "c",
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    }
  });

  const nextState = stateStore.getState();
  assert.equal(nextState.status, "connected");
  assert.equal(nextState.currentTargetName, "Cat");
  assert.deepEqual(nextState.loadedExtensions, ["music"]);
  assert.deepEqual(
    nextState.programAreaModules.map((module) => ({
      id: module.id,
      blockCount: module.blockCount
    })),
    [
      { id: "motion", blockCount: 2 },
      { id: "pen", blockCount: 1 },
      { id: "event", blockCount: 1 }
    ]
  );
  assert.deepEqual(nextState.currentTargetPrograms, [
    "当绿旗被点击 -> 移动 10 步 -> 右转 15 度 -> 清空"
  ]);
  assert.equal(Array.isArray(nextState.currentTargetScriptXmlList), true);
  assert.equal(nextState.currentTargetScriptXmlList.length, 1);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="event_whenflagclicked"/);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="motion_movesteps"/);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="motion_turnright"/);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="pen_clear"/);
});

test("SessionManager clears cached scripts after the current target programs are deleted", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "workspace-update",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat 2",
    toolboxCategories: ["event"],
    projectData: {
      targets: [{
        id: "sprite-a",
        name: "Cat 2",
        isStage: false,
        blocks: {
          flag: {
            opcode: "event_whenflagclicked",
            next: null,
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
          }
        }
      }]
    }
  });
  assert.equal(stateStore.getState().currentTargetScriptXmlList.length, 1);

  manager.handlePayload({
    source: "workspace-update",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat 2",
    toolboxCategories: ["event"],
    currentTargetWorkspaceXmlList: [
      '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenflagclicked"></block></xml>'
    ],
    projectData: {
      targets: [{
        id: "sprite-a",
        name: "Cat 2",
        isStage: false,
        blocks: {}
      }]
    }
  });

  assert.deepEqual(stateStore.getState().currentTargetPrograms, []);
  assert.deepEqual(stateStore.getState().currentTargetScriptBlocks, []);
  assert.deepEqual(stateStore.getState().currentTargetScriptXmlList, []);
});

test("SessionManager derives nested stack blocks from projectData", async () => {
  const stateStore = new StateStore();
  const bridgeServer = createBridgeServerMock();
  const manager = new SessionManager(stateStore, {
    bridgeServer,
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "control", "motion"],
    loadedExtensions: [],
    projectData: {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            hat: {
              opcode: "event_whenflagclicked",
              next: "repeat",
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            },
            repeat: {
              opcode: "control_repeat",
              next: null,
              parent: "hat",
              inputs: {
                SUBSTACK: [2, "move"]
              },
              fields: {},
              shadow: false,
              topLevel: false
            },
            move: {
              opcode: "motion_movesteps",
              next: null,
              parent: "repeat",
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    }
  });

  const nextState = stateStore.getState();
  assert.deepEqual(nextState.currentTargetPrograms, [
    "当绿旗被点击 -> 重复执行 -> 移动 10 步"
  ]);
  assert.equal(nextState.currentTargetScriptXmlList.length, 1);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="control_repeat"/);
  assert.match(nextState.currentTargetScriptXmlList[0], /<statement name="SUBSTACK">/);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="motion_movesteps"/);
});

test("SessionManager renders each current target script as a separate vertical item", async () => {
  const stateStore = new StateStore();
  const bridgeServer = createBridgeServerMock();
  const manager = new SessionManager(stateStore, {
    bridgeServer,
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  const officialXml =
    '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenflagclicked"></block></xml>';

  manager.handlePayload({
    source: "workspace-update",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event"],
    currentTargetWorkspaceXmlList: [officialXml],
    projectData: {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            generated: {
              opcode: "looks_sayforsecs",
              next: null,
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            }
          }
        }
      ]
    }
  });

  const nextState = stateStore.getState();
  assert.equal(nextState.currentTargetScriptXmlList.length, 1);
  assert.notEqual(nextState.currentTargetScriptXmlList[0], officialXml);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="looks_sayforsecs"/);
});

test("SessionManager falls back to generated script XML when official workspace XML has no blocks", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "workspace-update",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    currentTargetWorkspaceXmlList: [
      '<xml xmlns="http://www.w3.org/1999/xhtml"><variables><variable type="" id="v">score</variable></variables></xml>'
    ],
    projectData: {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            a: {
              opcode: "event_whenflagclicked",
              next: "b",
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true,
              x: 10,
              y: 12
            },
            b: {
              opcode: "motion_movesteps",
              next: null,
              parent: "a",
              inputs: {
                STEPS: [1, [4, "10"]]
              },
              fields: {},
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    }
  });

  const nextState = stateStore.getState();
  assert.equal(nextState.currentTargetScriptXmlList.length, 1);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="event_whenflagclicked"/);
  assert.match(nextState.currentTargetScriptXmlList[0], /type="motion_movesteps"/);
  assert.doesNotMatch(nextState.currentTargetScriptXmlList[0], /<variables>/);
});

test("SessionManager returns fallback AI hints when DeepSeek key is not configured", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["motion", "control"],
    projectData: {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            a: {
              opcode: "event_whenflagclicked",
              next: "b",
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            },
            b: {
              opcode: "motion_movesteps",
              next: null,
              parent: "a",
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    }
  });

  await manager.requestAiHint("让小猫一直走");

  const nextState = stateStore.getState();
  assert.equal(nextState.aiStatus, "ready");
  assert.equal(nextState.aiProvider, "fallback");
  assert.equal(nextState.aiModel, "local-heuristic");
  assert.equal(typeof nextState.aiCoachResponse?.answerText, "string");
  assert.equal(nextState.aiCoachResponse?.recommendedBlocks.length > 0, true);
});

test("SessionManager reminds the user to add a DeepSeek key after one local fallback", async () => {
  const stateStore = new StateStore();
  let hintCallCount = 0;
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    coachService: {
      generateHint: async () => {
        hintCallCount += 1;
        return {
          source: "fallback",
          model: "local-heuristic",
          coachResponse: {
            answerText: "先给一次基础提示。",
            recommendedBlocks: [
              {
                opcode: "motion_movesteps",
                category: "运动",
                label: "移动 10 步",
                reason: "先让角色动起来。"
              }
            ],
            nextStep: "先让角色动起来。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["motion"],
    projectData: createLinearProjectData(["event_whenflagclicked", "motion_movesteps"])
  });

  await manager.requestAiHint();
  assert.equal(hintCallCount, 1);
  assert.equal(stateStore.getState().aiProvider, "fallback");
  assert.equal(stateStore.getState().aiModel, "local-heuristic");

  await manager.requestAiHint();
  const remindedState = stateStore.getState();
  assert.equal(hintCallCount, 1);
  assert.equal(remindedState.aiProvider, "fallback");
  assert.equal(remindedState.aiModel, "local-reminder");
  assert.match(remindedState.aiCoachResponse?.answerText ?? "", /DeepSeek Key/);
  assert.equal(remindedState.aiCoachResponse?.recommendedBlocks.length, 0);
  assert.match(remindedState.aiError ?? "", /DeepSeek Key/);
});

test("SessionManager does not auto refresh hints when hint trigger mode is manual", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: {
      load: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: "manual"
      }),
      saveScratchExecutablePath: async (value) => ({
        scratchExecutablePath: value,
        aiHintTriggerMode: "manual"
      }),
      saveCustomAiApiKey: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiApiKey: value,
        aiHintTriggerMode: "manual"
      }),
      clearCustomAiApiKey: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: "manual"
      }),
      saveCustomAiModel: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiModel: value,
        aiHintTriggerMode: "manual"
      }),
      clearCustomAiModel: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: "manual"
      }),
      saveCustomAiPrompt: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiPrompt: value,
        aiHintTriggerMode: "manual"
      }),
      clearCustomAiPrompt: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: "manual"
      }),
      saveAiHintTriggerMode: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: value
      })
    },
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "先补一个起步积木。",
            recommendedBlocks: [],
            nextStep: "先补一个起步积木。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData(["event_whenflagclicked", "motion_movesteps"])
  });

  await flushAsyncWork();

  assert.equal(stateStore.getState().aiHintTriggerMode, "manual");
  assert.equal(capturedOptions.length, 0);
});

test("SessionManager queues an automatic hint refresh when Scratch blocks change during loading", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];
  const fakeTimer = createFakeTimer();
  let resolveFirstRequest;
  let requestCount = 0;
  const firstRequestGate = new Promise((resolve) => {
    resolveFirstRequest = resolve;
  });

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        requestCount += 1;
        if (requestCount === 1) {
          await firstRequestGate;
        }
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "继续补下一块。",
            recommendedBlocks: [],
            nextStep: "继续补下一块。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {},
    now: fakeTimer.now,
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData(["event_whenflagclicked", "motion_movesteps"])
  });

  await flushAsyncWork();
  assert.equal(capturedOptions.length, 0);

  await fakeTimer.advance(3000);
  assert.equal(capturedOptions.length, 1);
  assert.deepEqual(capturedOptions[0].currentTargetPrograms, ["当绿旗被点击 -> 移动 10 步"]);

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData([
      "event_whenflagclicked",
      "motion_movesteps",
      "motion_turnright"
    ])
  });

  await fakeTimer.advance(3000);
  await flushAsyncWork();
  assert.equal(capturedOptions.length, 1);

  resolveFirstRequest();
  await flushAsyncWork();
  await fakeTimer.advance(3000);

  assert.equal(capturedOptions.length, 2);
  assert.deepEqual(capturedOptions[1].currentTargetPrograms, [
    "当绿旗被点击 -> 移动 10 步 -> 右转 15 度"
  ]);
});

test("SessionManager keeps the current recommendation visible while a changed block waits for refresh", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];
  const fakeTimer = createFakeTimer();

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: capturedOptions.length === 1 ? "先移动十步。" : "再右转十五度。",
            recommendation: {
              root: { opcode: capturedOptions.length === 1 ? "motion_movesteps" : "motion_turnright" }
            },
            recommendedBlocks: [],
            nextStep: capturedOptions.length === 1 ? "先移动十步。" : "再右转十五度。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {},
    now: fakeTimer.now,
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout
  });

  await manager.start();
  manager.handlePayload({
    source: "project-changed",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData(["event_whenflagclicked"])
  });

  await fakeTimer.advance(2000);
  const currentHint = stateStore.getState().aiCoachResponse;
  assert.equal(currentHint?.answerText, "先移动十步。");

  manager.handlePayload({
    source: "workspace-update",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData(["event_whenflagclicked", "looks_sayforsecs"])
  });

  assert.equal(stateStore.getState().aiStatus, "ready");
  assert.equal(stateStore.getState().aiCoachResponse, currentHint);
  await fakeTimer.advance(1999);
  assert.equal(capturedOptions.length, 1);
  assert.equal(stateStore.getState().aiCoachResponse, currentHint);

  await fakeTimer.advance(1);
  assert.equal(capturedOptions.length, 2);
  assert.equal(stateStore.getState().aiCoachResponse?.answerText, "再右转十五度。");
});

test("SessionManager auto refreshes changed Scratch blocks after two quiet seconds", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];
  const fakeTimer = createFakeTimer();

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "继续补下一块。",
            recommendedBlocks: [],
            nextStep: "继续补下一块。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {},
    now: fakeTimer.now,
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData(["event_whenflagclicked", "motion_movesteps"])
  });

  await fakeTimer.advance(2000);
  assert.equal(capturedOptions.length, 1);

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData: createLinearProjectData([
      "event_whenflagclicked",
      "motion_movesteps",
      "motion_turnright"
    ])
  });

  await fakeTimer.advance(1999);
  assert.equal(capturedOptions.length, 1);

  await fakeTimer.advance(1);
  assert.equal(capturedOptions.length, 2);
  assert.deepEqual(capturedOptions[1].currentTargetPrograms, [
    "当绿旗被点击 -> 移动 10 步 -> 右转 15 度"
  ]);
});

test("SessionManager does not auto request repeatedly from heartbeat payloads with the same project snapshot", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];
  const fakeTimer = createFakeTimer();

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "继续补下一块。",
            recommendedBlocks: [],
            nextStep: "继续补下一块。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {},
    now: fakeTimer.now,
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout
  });

  await manager.start();

  const projectData = createLinearProjectData(["event_whenflagclicked", "motion_movesteps"]);

  manager.handlePayload({
    source: "project-changed",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData
  });

  await fakeTimer.advance(2000);
  assert.equal(capturedOptions.length, 1);

  manager.handlePayload({
    source: "heartbeat",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion"],
    projectData
  });

  await fakeTimer.advance(4000);
  assert.equal(capturedOptions.length, 1);
  assert.deepEqual(stateStore.getState().currentTargetPrograms, ["当绿旗被点击 -> 移动 10 步"]);
});

test("SessionManager reminds for a DeepSeek key instead of generating endless fallback recommendations", async () => {
  const stateStore = new StateStore();
  const fakeTimer = createFakeTimer();

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {},
    now: fakeTimer.now,
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout
  });

  await manager.start();

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion", "control", "sensing"],
    projectData: createLinearProjectData(["event_whenflagclicked", "motion_movesteps"])
  });

  await fakeTimer.advance(3000);
  await flushAsyncWork();

  const firstHint = stateStore.getState().aiCoachResponse;
  assert.equal(firstHint?.recommendation?.root.opcode, "control_repeat");

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["event", "motion", "control", "sensing"],
    projectData: createRepeatSubstackProjectData([
      "motion_turnright",
      "motion_movesteps"
    ])
  });

  await fakeTimer.advance(3000);
  await flushAsyncWork();

  const nextHint = stateStore.getState().aiCoachResponse;
  assert.equal(nextHint?.recommendation, undefined);
  assert.equal(nextHint?.recommendedBlocks.length, 0);
  assert.match(nextHint?.answerText ?? "", /DeepSeek Key/);
  assert.equal(stateStore.getState().aiModel, "local-reminder");
});

test("SessionManager returns an error when requesting a hint before Scratch connects", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  await manager.requestAiHint("让小猫先动起来");

  const nextState = stateStore.getState();
  assert.equal(nextState.status, "waiting");
  assert.equal(nextState.aiStatus, "error");
  assert.equal(nextState.aiProvider, undefined);
  assert.equal(nextState.aiCoachResponse, undefined);
  assert.equal(nextState.aiError, "还没读取到可分析的 Scratch 项目，请先从伴随程序打开已选 Scratch 并进入作品。");
});

test("SessionManager only sends the connected Scratch project when generating hints", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "先补一个最小起步脚本。",
            recommendedBlocks: [],
            nextStep: "先补一个最小起步脚本。",
            detectedIssues: [],
            followUpQuestion: "你想先做哪一步？"
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  manager.handlePayload({
    source: "bootstrap",
    currentTargetId: "sprite-new",
    currentTargetName: "角色1",
    currentTargetIsStage: false,
    toolboxCategories: ["motion", "looks", "control"],
    projectData: {
      targets: [
        {
          id: "stage",
          name: "Stage",
          isStage: true,
          blocks: {}
        },
        {
          id: "sprite-new",
          name: "角色1",
          isStage: false,
          blocks: {
            start: {
              opcode: "event_whenflagclicked",
              next: null,
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            }
          }
        }
      ]
    }
  });

  await manager.requestAiHint();

  const lastOptions = capturedOptions.at(-1);
  assert.equal(lastOptions.snapshot.currentTarget, "角色1");
  assert.deepEqual(lastOptions.currentTargetPrograms, ["当绿旗被点击"]);
  assert.equal("referenceSnapshot" in lastOptions, false);
  assert.equal("referenceSourceLabel" in lastOptions, false);

  const nextState = stateStore.getState();
  assert.equal(nextState.aiProvider, "deepseek");
  assert.equal(nextState.detail.includes("自动刷新下一步建议"), true);
  assert.equal(nextState.detail.includes("教师参考作品"), false);
});

test("SessionManager clears hints and skips AI requests for blank Scratch projects", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "先补一个最小起步脚本。",
            recommendedBlocks: [],
            nextStep: "先补一个最小起步脚本。",
            detectedIssues: []
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  manager.handlePayload({
    source: "bootstrap",
    currentTargetId: "sprite-new",
    currentTargetName: "角色1",
    currentTargetIsStage: false,
    toolboxCategories: ["motion", "looks", "control"],
    projectData: {
      targets: [
        {
          id: "stage",
          name: "Stage",
          isStage: true,
          blocks: {}
        },
        {
          id: "sprite-new",
          name: "角色1",
          isStage: false,
          blocks: {}
        }
      ]
    }
  });

  await manager.requestAiHint();

  assert.equal(capturedOptions.length, 0);
  const nextState = stateStore.getState();
  assert.equal(nextState.aiStatus, "idle");
  assert.equal(nextState.aiCoachResponse, undefined);
  assert.equal(nextState.detail.includes("新项目"), true);
});

test("SessionManager can switch to a saved custom AI key", async () => {
  const stateStore = new StateStore();
  let savedCustomKey = "";
  let savedMode = "auto";
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: {
      load: async () => ({ scratchExecutablePath: "C:\\Scratch 3.exe", aiHintTriggerMode: savedMode }),
      saveScratchExecutablePath: async (value) => ({
        scratchExecutablePath: value,
        customAiApiKey: savedCustomKey || undefined,
        aiHintTriggerMode: savedMode
      }),
      saveCustomAiApiKey: async (value) => {
        savedCustomKey = value;
        return { scratchExecutablePath: "C:\\Scratch 3.exe", customAiApiKey: value, aiHintTriggerMode: savedMode };
      },
      clearCustomAiApiKey: async () => {
        savedCustomKey = "";
        return { scratchExecutablePath: "C:\\Scratch 3.exe", aiHintTriggerMode: savedMode };
      },
      saveCustomAiModel: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiApiKey: savedCustomKey || undefined,
        customAiModel: value,
        aiHintTriggerMode: savedMode
      }),
      clearCustomAiModel: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiApiKey: savedCustomKey || undefined,
        aiHintTriggerMode: savedMode
      }),
      saveCustomAiPrompt: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiPrompt: value,
        aiHintTriggerMode: savedMode
      }),
      clearCustomAiPrompt: async () => ({ scratchExecutablePath: "C:\\Scratch 3.exe", aiHintTriggerMode: savedMode }),
      saveAiHintTriggerMode: async (value) => {
        savedMode = value;
        return {
          scratchExecutablePath: "C:\\Scratch 3.exe",
          customAiApiKey: savedCustomKey || undefined,
          aiHintTriggerMode: savedMode
        };
      }
    },
    loadAiConfig: async (_configPath, options) => ({
      configured: Boolean(options?.customApiKey),
      baseUrl: "https://api.deepseek.com",
      model: options?.customModel ?? "deepseek-v4-flash",
      timeoutMs: 20000,
      configPath: "C:\\config\\deepseek.config.json",
      customKeyConfigured: Boolean(options?.customApiKey),
      source: options?.customApiKey ? "custom" : undefined,
      ...(options?.customApiKey ? { apiKey: options.customApiKey } : {})
    }),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  await manager.saveCustomAiApiKey("sk-custom-demo");

  const nextState = stateStore.getState();
  assert.equal(nextState.aiConfigured, true);
  assert.equal(nextState.aiCustomKeyConfigured, true);
  assert.equal(nextState.aiConfigSource, "custom");
  assert.equal(nextState.aiHintTriggerMode, "manual");

  await manager.clearCustomAiApiKey();
  const clearedState = stateStore.getState();
  assert.equal(clearedState.aiConfigured, false);
  assert.equal(clearedState.aiCustomKeyConfigured, false);
});

test("SessionManager does not expose the saved custom AI key through public state or logs", async () => {
  const stateStore = new StateStore();
  const logs = [];
  const secretKey = "sk-custom-secret-123456";
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: (message, error) => {
      logs.push(`${message} ${error ? String(error) : ""}`);
    },
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: async (_configPath, options) => ({
      configured: Boolean(options?.customApiKey),
      baseUrl: "https://api.deepseek.com",
      model: options?.customModel ?? "deepseek-v4-flash",
      timeoutMs: 20000,
      configPath: "C:\\config\\deepseek.config.json",
      customKeyConfigured: Boolean(options?.customApiKey),
      source: options?.customApiKey ? "custom" : undefined,
      ...(options?.customApiKey ? { apiKey: options.customApiKey } : {})
    }),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  await manager.saveCustomAiApiKey(secretKey);

  const serializedState = JSON.stringify(stateStore.getState());
  assert.equal(serializedState.includes(secretKey), false);
  assert.equal(logs.join("\n").includes(secretKey), false);
});

test("SessionManager saves a custom AI model and exposes it in state", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: async (_configPath, options) => {
      capturedOptions.push(options);
      return {
        configured: Boolean(options?.customApiKey),
        baseUrl: "https://api.deepseek.com",
        model: options?.customModel ?? "deepseek-v4-flash",
        timeoutMs: 20000,
        configPath: "C:\\config\\deepseek.config.json",
        customKeyConfigured: Boolean(options?.customApiKey),
        source: options?.customApiKey ? "custom" : undefined,
        ...(options?.customApiKey ? { apiKey: options.customApiKey } : {})
      };
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  await manager.saveCustomAiModel("deepseek-v4-pro");

  const nextState = stateStore.getState();
  assert.equal(nextState.aiModel, "deepseek-v4-pro");
  assert.equal(nextState.aiCustomModelConfigured, true);
  assert.equal(nextState.aiCustomModel, "deepseek-v4-pro");
  assert.deepEqual(capturedOptions.at(-1), {
    customApiKey: undefined,
    customModel: "deepseek-v4-pro"
  });
});

test("SessionManager saves AI hint trigger mode and exposes it in state", async () => {
  const stateStore = new StateStore();
  let savedMode = "auto";
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: {
      load: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: savedMode
      }),
      saveScratchExecutablePath: async (value) => ({
        scratchExecutablePath: value,
        aiHintTriggerMode: savedMode
      }),
      saveCustomAiApiKey: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiApiKey: value,
        aiHintTriggerMode: savedMode
      }),
      clearCustomAiApiKey: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: savedMode
      }),
      saveCustomAiModel: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiModel: value,
        aiHintTriggerMode: savedMode
      }),
      clearCustomAiModel: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: savedMode
      }),
      saveCustomAiPrompt: async (value) => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        customAiPrompt: value,
        aiHintTriggerMode: savedMode
      }),
      clearCustomAiPrompt: async () => ({
        scratchExecutablePath: "C:\\Scratch 3.exe",
        aiHintTriggerMode: savedMode
      }),
      saveAiHintTriggerMode: async (value) => {
        savedMode = value;
        return {
          scratchExecutablePath: "C:\\Scratch 3.exe",
          aiHintTriggerMode: savedMode
        };
      }
    },
    loadAiConfig: createAiConfigMock(),
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  assert.equal(stateStore.getState().aiHintTriggerMode, "auto");

  await manager.saveAiHintTriggerMode("manual");
  assert.equal(stateStore.getState().aiHintTriggerMode, "manual");

  await manager.saveAiHintTriggerMode("auto");
  assert.equal(stateStore.getState().aiHintTriggerMode, "auto");
});

test("SessionManager can test a typed DeepSeek key without saving it", async () => {
  const stateStore = new StateStore();
  const testedConfigs = [];
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: async (_configPath, options) => ({
      configured: Boolean(options?.customApiKey),
      apiKey: options?.customApiKey,
      baseUrl: "https://api.deepseek.com",
      model: options?.customModel ?? "deepseek-v4-flash",
      timeoutMs: 20_000,
      configPath: "C:\\config\\deepseek.config.json",
      customKeyConfigured: Boolean(options?.customApiKey),
      source: options?.customApiKey ? "custom" : undefined
    }),
    validateDeepSeekApiKey: async (config) => {
      testedConfigs.push(config);
      return {
        message: "DeepSeek Key 可用，当前账号可正常请求 DeepSeek。"
      };
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  const message = await manager.testCustomAiApiKey("sk-typed-demo");

  assert.equal(message, "DeepSeek Key 可用，当前账号可正常请求 DeepSeek。");
  assert.equal(testedConfigs.length, 1);
  assert.equal(testedConfigs[0].apiKey, "sk-typed-demo");
  assert.equal(stateStore.getState().aiCustomKeyConfigured, false);
});

test("SessionManager can test the saved DeepSeek key when no new key is typed", async () => {
  const stateStore = new StateStore();
  const testedConfigs = [];
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: async (_configPath, options) => ({
      configured: Boolean(options?.customApiKey),
      apiKey: options?.customApiKey,
      baseUrl: "https://api.deepseek.com",
      model: options?.customModel ?? "deepseek-v4-flash",
      timeoutMs: 20_000,
      configPath: "C:\\config\\deepseek.config.json",
      customKeyConfigured: Boolean(options?.customApiKey),
      source: options?.customApiKey ? "custom" : undefined
    }),
    validateDeepSeekApiKey: async (config) => {
      testedConfigs.push(config);
      return {
        message: "DeepSeek Key 可用，当前账号可正常请求 DeepSeek。"
      };
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();
  await manager.saveCustomAiApiKey("sk-saved-demo");
  const message = await manager.testCustomAiApiKey();

  assert.equal(message, "DeepSeek Key 可用，当前账号可正常请求 DeepSeek。");
  assert.equal(testedConfigs.at(-1)?.apiKey, "sk-saved-demo");
});

test("SessionManager requires a typed or saved DeepSeek key before testing", async () => {
  const stateStore = new StateStore();
  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock(),
    validateDeepSeekApiKey: async () => {
      throw new Error("should not reach validator");
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {}
  });

  await manager.start();

  await assert.rejects(() => manager.testCustomAiApiKey(), /请先输入 DeepSeek API Key，或先保存后再测试/);
});

test("SessionManager saves a custom teacher prompt and reuses it for hint generation", async () => {
  const stateStore = new StateStore();
  const capturedOptions = [];
  const fakeTimer = createFakeTimer();

  const manager = new SessionManager(stateStore, {
    bridgeServer: createBridgeServerMock(),
    platform: "win32",
    log: () => {},
    configStore: createConfigStoreMock("C:\\Scratch 3.exe"),
    loadAiConfig: createAiConfigMock({
      configured: true,
      apiKey: "sk-test-demo",
      source: "custom",
      customKeyConfigured: true
    }),
    coachService: {
      generateHint: async (options) => {
        capturedOptions.push(options);
        return {
          source: "deepseek",
          model: "deepseek-v4-flash",
          coachResponse: {
            answerText: "先做碰撞判断。",
            recommendedBlocks: [],
            nextStep: "先做碰撞判断。",
            detectedIssues: [],
            followUpQuestion: "想先在哪个角色里补？"
          }
        };
      }
    },
    scratchLauncher: {},
    scratchRemoteDebugger: {},
    now: fakeTimer.now,
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout
  });

  await manager.start();
  assert.equal(stateStore.getState().aiDefaultPrompt?.includes("你是 Scratch 小学编程助教"), true);
  assert.equal(stateStore.getState().aiCustomPrompt, undefined);
  await manager.saveCustomAiPrompt("请优先提醒碰撞和加分。");

  manager.handlePayload({
    source: "test",
    currentTargetId: "sprite-a",
    currentTargetName: "Cat",
    toolboxCategories: ["motion", "control"],
    projectData: {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            a: {
              opcode: "event_whenflagclicked",
              next: "b",
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            },
            b: {
              opcode: "motion_movesteps",
              next: null,
              parent: "a",
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    }
  });

  await fakeTimer.advance(3000);

  const lastOptions = capturedOptions.at(-1);
  assert.equal(lastOptions.customSystemPrompt, "请优先提醒碰撞和加分。");
  assert.equal(stateStore.getState().aiCustomPromptConfigured, true);
  assert.equal(stateStore.getState().aiCustomPrompt, "请优先提醒碰撞和加分。");

  await manager.clearCustomAiPrompt();
  assert.equal(stateStore.getState().aiCustomPromptConfigured, false);
  assert.equal(stateStore.getState().aiCustomPrompt, undefined);
  assert.equal(stateStore.getState().aiDefaultPrompt?.includes("你是 Scratch 小学编程助教"), true);
});
