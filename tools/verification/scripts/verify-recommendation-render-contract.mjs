import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(scriptPath), "../../..");
const desktopDistDir = path.join(workspaceRoot, "apps/desktop-companion/dist");
const isElectronMain = Boolean(process.versions.electron);
const BATCH_RENDER_SIZE = 40;
const RECOMMENDATION_PARAM_KEYS = [
  "variable",
  "value",
  "changeBy",
  "message",
  "messageVariable",
  "repeatTimes",
  "question",
  "key",
  "list",
  "broadcast",
  "left",
  "right",
  "x",
  "y",
  "steps",
  "degrees",
  "secs"
];

function createBlock(opcode, overrides = {}) {
  return {
    opcode,
    category: "合同测试",
    label: opcode,
    reason: `验证 ${opcode} 可以被真实 scratch-blocks renderer 渲染。`,
    ...overrides
  };
}

function countStructureNodes(node) {
  if (!node) return 0;
  return 1 + ["condition", "substack", "substack2", "next"]
    .reduce((count, relation) => count + countStructureNodes(node[relation]), 0);
}

function createRendererState(xml, caseName) {
  return {
    status: "connected",
    statusText: "推荐渲染合同测试",
    currentTargetName: "合同测试角色",
    currentTargetPrograms: [caseName],
    currentTargetScriptXmlList: [xml],
    toolboxCategories: [],
    usedExtensions: [],
    loadedExtensions: ["pen"],
    programAreaModules: [],
    aiConfigured: false,
    aiStatus: "idle"
  };
}

function createRendererBatchState(cases) {
  return {
    status: "connected",
    statusText: "推荐渲染合同测试",
    currentTargetName: "合同测试角色",
    currentTargetPrograms: cases.map((item) => item.name),
    currentTargetScriptXmlList: cases.map((item) => item.xml),
    toolboxCategories: [],
    usedExtensions: [],
    loadedExtensions: ["pen"],
    programAreaModules: [],
    aiConfigured: false,
    aiStatus: "idle"
  };
}

async function runNodeLauncher() {
  const require = createRequire(import.meta.url);
  const electronBinary = require("electron");
  const launcherTempDir = await mkdtemp(path.join(os.tmpdir(), "scratch-ai-electron-launcher-"));
  const launcherPath = path.join(launcherTempDir, "main.cjs");
  await writeFile(
    launcherPath,
    `import(${JSON.stringify(pathToFileURL(scriptPath).href)}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
    "utf8"
  );

  try {
    const child = spawn(electronBinary, [launcherPath, "--electron-contract-child"], {
      cwd: workspaceRoot,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")
      ),
      stdio: "inherit"
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`Electron 推荐渲染合同测试被信号 ${signal} 终止。`));
          return;
        }
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await rm(launcherTempDir, { recursive: true, force: true });
  }
}

async function createContractPreload(tempDir) {
  const preloadPath = path.join(tempDir, "recommendation-render-contract-preload.cjs");
  const initialState = {
    status: "connected",
    statusText: "正在初始化推荐渲染合同测试",
    toolboxCategories: [],
    usedExtensions: [],
    loadedExtensions: ["pen"],
    programAreaModules: [],
    currentTargetPrograms: [],
    currentTargetScriptXmlList: [],
    aiConfigured: false,
    aiStatus: "idle"
  };

  await writeFile(
    preloadPath,
    `const { contextBridge } = require("electron");
let stateListener = null;
const initialState = ${JSON.stringify(initialState)};
contextBridge.exposeInMainWorld("desktopCompanionApi", {
  getInitialState: async () => initialState,
  onStateChange: (listener) => { stateListener = listener; },
  retryNow: async () => undefined,
  launchScratch: async () => undefined,
  chooseScratchExecutable: async () => undefined,
  openSettings: async () => undefined,
  requestAiHint: async () => undefined,
  saveLessonGoal: async () => undefined
});
contextBridge.exposeInMainWorld("recommendationRenderContract", {
  ready: () => typeof stateListener === "function",
  updateState: (state) => {
    if (typeof stateListener !== "function") {
      throw new Error("production renderer state listener is not ready");
    }
    stateListener(state);
  }
});
`,
    "utf8"
  );

  return preloadPath;
}

async function waitForRendererBridge(browserWindow) {
  await browserWindow.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const poll = () => {
        if (window.recommendationRenderContract?.ready()) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error("等待 production renderer bridge 超时"));
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    })
  `);
}

async function renderXml(browserWindow, xml, caseName) {
  const state = createRendererState(xml, caseName);
  const serializedState = JSON.stringify(state);

  return browserWindow.webContents.executeJavaScript(`
    (async () => {
      window.recommendationRenderContract.updateState(${serializedState});
      const deadline = Date.now() + 10000;
      let host = null;
      while (Date.now() < deadline) {
        host = document.querySelector(".scratch-workspace-host");
        if (host && (host.querySelector(".blocklyBlock") || host.classList.contains("scratch-workspace-host-fallback"))) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      host = document.querySelector(".scratch-workspace-host");
      if (!host) {
        return { hostCount: 0, blockCount: 0, nonShadowBlockCount: 0, fallback: false, degraded: false, text: "" };
      }
      const blocks = Array.from(host.querySelectorAll(".blocklyBlock"));
      return {
        hostCount: document.querySelectorAll(".scratch-workspace-host").length,
        blockCount: blocks.length,
        nonShadowBlockCount: blocks.filter((block) => !block.classList.contains("blocklyShadow")).length,
        fallback: host.classList.contains("scratch-workspace-host-fallback"),
        degraded: host.classList.contains("scratch-workspace-host-degraded"),
        text: host.textContent || ""
      };
    })()
  `);
}

async function renderXmlBatch(browserWindow, cases) {
  const state = createRendererBatchState(cases);
  const serializedState = JSON.stringify(state);
  const expectedHostCount = cases.length;

  return browserWindow.webContents.executeJavaScript(`
    (async () => {
      window.recommendationRenderContract.updateState(${serializedState});
      const expectedHostCount = ${expectedHostCount};
      const deadline = Date.now() + 20000;
      let hosts = [];
      while (Date.now() < deadline) {
        hosts = Array.from(document.querySelectorAll("#current-target-programs .scratch-workspace-host"));
        if (
          hosts.length === expectedHostCount &&
          hosts.every((host) => host.querySelector(".blocklyBlock") || host.classList.contains("scratch-workspace-host-fallback"))
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      hosts = Array.from(document.querySelectorAll("#current-target-programs .scratch-workspace-host"));
      return hosts.map((host) => {
        const blocks = Array.from(host.querySelectorAll(".blocklyBlock"));
        return {
          hostCount: hosts.length,
          blockCount: blocks.length,
          nonShadowBlockCount: blocks.filter((block) => !block.classList.contains("blocklyShadow")).length,
          fallback: host.classList.contains("scratch-workspace-host-fallback"),
          degraded: host.classList.contains("scratch-workspace-host-degraded"),
          text: host.textContent || ""
        };
      });
    })()
  `);
}

function assertRenderedCase(caseName, result, minimumNonShadowBlocks = 1) {
  assert.ok(result, `${caseName}: 未找到对应的 scratch workspace host`);
  assert.equal(result.fallback, false, `${caseName}: 不应进入文字 fallback：${result.text}`);
  assert.equal(result.degraded, false, `${caseName}: 不应进入 root-only degraded 渲染`);
  assert.ok(
    result.nonShadowBlockCount >= minimumNonShadowBlocks,
    `${caseName}: 预期至少 ${minimumNonShadowBlocks} 个非 shadow block，实际 ${result.nonShadowBlockCount}`
  );
}

function assertCompleteRender(caseName, result, minimumNonShadowBlocks = 1) {
  assert.equal(result.hostCount, 1, `${caseName}: 应只生成一个 scratch workspace host`);
  assertRenderedCase(caseName, result, minimumNonShadowBlocks);
}

async function renderCasesInBatches(browserWindow, cases) {
  let renderedCount = 0;
  for (let index = 0; index < cases.length; index += BATCH_RENDER_SIZE) {
    const batch = cases.slice(index, index + BATCH_RENDER_SIZE);
    const results = await renderXmlBatch(browserWindow, batch);
    assert.equal(results.length, batch.length, `批量渲染应返回 ${batch.length} 个 host，实际 ${results.length}`);
    for (const [caseIndex, item] of batch.entries()) {
      assertRenderedCase(item.name, results[caseIndex], item.minimumNonShadowBlocks ?? 1);
    }
    renderedCount += batch.length;
  }
  return renderedCount;
}

function createStructureRenderCase(name, root, sanitizeRecommendedStructure, buildRecommendedStructureXml) {
  const structure = sanitizeRecommendedStructure({ root });
  assert.ok(structure, `${name}: 合法结构不应被净化器拒绝`);
  return {
    name,
    xml: buildRecommendedStructureXml(structure),
    minimumNonShadowBlocks: countStructureNodes(structure.root)
  };
}

function assertRelationPreserved(caseName, structure, relation, expectedOpcode) {
  assert.equal(
    structure?.root?.[relation]?.opcode,
    expectedOpcode,
    `${caseName}: ${relation} 关系应保留 ${expectedOpcode}`
  );
}

function createRelationMatrixCases({
  relation,
  parentOpcodes,
  childOpcodes,
  sanitizeRecommendedStructure,
  buildRecommendedStructureXml
}) {
  const cases = [];
  for (const parentOpcode of parentOpcodes) {
    for (const childOpcode of childOpcodes) {
      const name = `relation:${relation}:${parentOpcode}->${childOpcode}`;
      const root = createBlock(parentOpcode, {
        [relation]: createBlock(childOpcode)
      });
      const structure = sanitizeRecommendedStructure({ root });
      assertRelationPreserved(name, structure, relation, childOpcode);
      cases.push({
        name,
        xml: buildRecommendedStructureXml(structure),
        minimumNonShadowBlocks: countStructureNodes(structure.root)
      });
    }
  }
  return cases;
}

function createCanonicalMultiRelationCases({
  relationParents,
  conditionOpcodes,
  branchOpcodes,
  nextOpcodes,
  sanitizeRecommendedStructure,
  buildRecommendedStructureXml
}) {
  const cases = [];
  for (const parentOpcode of relationParents) {
    const root = createBlock(parentOpcode);
    if (conditionOpcodes.length > 0) {
      root.condition = createBlock(conditionOpcodes[0], { params: { key: "space" } });
    }
    if (branchOpcodes.length > 0) {
      root.substack = createBlock(branchOpcodes[0]);
    }
    if (parentOpcode === "control_if_else" && branchOpcodes.length > 1) {
      root.substack2 = createBlock(branchOpcodes[1]);
    }
    if (nextOpcodes.length > 0) {
      root.next = createBlock(nextOpcodes[0]);
    }
    cases.push(
      createStructureRenderCase(
        `relation:combined:${parentOpcode}`,
        root,
        sanitizeRecommendedStructure,
        buildRecommendedStructureXml
      )
    );
  }
  return cases;
}

function createParameterVariantRoots() {
  return [
    {
      name: "params:motion-x-y-steps-degrees",
      coveredKeys: ["x", "y", "steps", "degrees"],
      root: createBlock("motion_gotoxy", {
        params: { x: "-100", y: "height" },
        next: createBlock("motion_movesteps", {
          params: { steps: "speed" },
          next: createBlock("motion_turnright", { params: { degrees: "angle" } })
        })
      })
    },
    {
      name: "params:duration-message-variable",
      coveredKeys: ["messageVariable", "secs"],
      root: createBlock("looks_sayforsecs", {
        params: { messageVariable: "score", secs: "3" }
      })
    },
    {
      name: "params:message-text",
      coveredKeys: ["message"],
      root: createBlock("looks_say", {
        params: { message: "你好，Scratch" }
      })
    },
    {
      name: "params:ask-answer-to-variable",
      coveredKeys: ["question", "variable", "value"],
      root: createBlock("sensing_askandwait", {
        params: { question: "请输入答案" },
        next: createBlock("data_setvariableto", {
          params: { variable: "答案", value: "sensing_answer" }
        })
      })
    },
    {
      name: "params:change-by-variable",
      coveredKeys: ["changeBy"],
      root: createBlock("data_changevariableby", {
        params: { variable: "sum", changeBy: "i" }
      })
    },
    {
      name: "params:repeat-times-variable",
      coveredKeys: ["repeatTimes"],
      root: createBlock("control_repeat", {
        params: { repeatTimes: "n" },
        substack: createBlock("data_changevariableby", {
          params: { variable: "sum", changeBy: "i" }
        })
      })
    },
    {
      name: "params:key-event-and-condition",
      coveredKeys: ["key"],
      root: createBlock("event_whenkeypressed", {
        params: { key: "right arrow" },
        next: createBlock("control_if", {
          condition: createBlock("sensing_keypressed", { params: { key: "space" } }),
          substack: createBlock("looks_say", { params: { message: "按到了" } })
        })
      })
    },
    {
      name: "params:list-and-listlength",
      coveredKeys: ["list"],
      root: createBlock("data_addtolist", {
        params: { list: "购物清单", value: "item" },
        next: createBlock("looks_say", { params: { messageVariable: "listlength(购物清单)" } })
      })
    },
    {
      name: "params:broadcast-send-and-receive",
      coveredKeys: ["broadcast"],
      root: createBlock("event_whenbroadcastreceived", {
        params: { broadcast: "准备" },
        next: createBlock("event_broadcastandwait", { params: { broadcast: "开始" } })
      })
    },
    {
      name: "params:left-right-comparison",
      coveredKeys: ["left", "right"],
      root: createBlock("control_if_else", {
        condition: createBlock("operator_equals", {
          params: { left: "password", right: "text:scratch" }
        }),
        substack: createBlock("looks_say", { params: { message: "通过" } }),
        substack2: createBlock("looks_say", { params: { message: "密码错误" } })
      })
    },
    {
      name: "params:value-arithmetic-formula",
      coveredKeys: ["value"],
      root: createBlock("data_setvariableto", {
        params: { variable: "rabbits", value: "(feet - 2 * heads) / 2" },
        next: createBlock("looks_say", { params: { messageVariable: "rabbits" } })
      })
    },
    {
      name: "params:value-special-round-mod-join",
      coveredKeys: ["value", "left", "right"],
      root: createBlock("data_setvariableto", {
        params: { variable: "rounded", value: "round(number)" },
        next: createBlock("data_setvariableto", {
          params: { variable: "remainder", value: "number % 5" },
          next: createBlock("looks_say", { params: { messageVariable: "join(text:余数, remainder)" } })
        })
      })
    }
  ];
}

function createParameterVariantCases(sanitizeRecommendedStructure, buildRecommendedStructureXml) {
  const roots = createParameterVariantRoots();
  const coveredKeys = new Set(roots.flatMap((scenario) => scenario.coveredKeys));
  const uncoveredKeys = RECOMMENDATION_PARAM_KEYS.filter((key) => !coveredKeys.has(key));
  assert.deepEqual(uncoveredKeys, [], `推荐 params key 未覆盖：${uncoveredKeys.join(", ")}`);

  return roots.map((scenario) =>
    createStructureRenderCase(
      scenario.name,
      scenario.root,
      sanitizeRecommendedStructure,
      buildRecommendedStructureXml
    )
  );
}

async function runElectronContract() {
  const {
    SUPPORTED_RECOMMENDED_BLOCK_OPCODES,
    buildRecommendedBlockXml,
    buildRecommendedStructureXml
  } = await import(pathToFileURL(path.join(desktopDistDir, "scratch-block-xml.js")).href);
  const { sanitizeRecommendedStructure } = await import(
    pathToFileURL(path.join(desktopDistDir, "recommended-structure.js")).href
  );
  const {
    canRenderRecommendedBlockAtPosition,
    canUseRecommendedBlockRelation
  } = await import(pathToFileURL(path.join(desktopDistDir, "recommended-block-capabilities.js")).href);
  const { app, BrowserWindow } = await import("electron");

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "scratch-ai-render-contract-"));
  let browserWindow;
  const rendererDiagnostics = [];

  try {
    const preloadPath = await createContractPreload(tempDir);
    await app.whenReady();

    browserWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: preloadPath
      }
    });
    browserWindow.webContents.on("console-message", (details) => {
      if (details.level === "warning" || details.level === "error") {
        rendererDiagnostics.push(details.message);
      }
    });
    browserWindow.webContents.on("render-process-gone", (_event, details) => {
      rendererDiagnostics.push(`render-process-gone: ${details.reason}`);
    });

    await browserWindow.loadFile(path.join(desktopDistDir, "index.html"));
    await waitForRendererBridge(browserWindow);

    console.log(`[render-contract] 验证 ${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.length} 个推荐 opcode 单块...`);
    const singleBlockCases = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.map((opcode) => ({
      name: `single:${opcode}`,
      xml: buildRecommendedBlockXml(createBlock(opcode)),
      minimumNonShadowBlocks: 1
    }));
    await renderCasesInBatches(browserWindow, singleBlockCases);

    const legalStructures = [
      {
        name: "hat-next-chain",
        root: createBlock("event_whenflagclicked", {
          next: createBlock("motion_movesteps", {
            params: { steps: "10" },
            next: createBlock("looks_sayforsecs", { params: { message: "完成", secs: "2" } })
          })
        })
      },
      {
        name: "repeat-substack-next",
        root: createBlock("control_repeat", {
          params: { repeatTimes: "3" },
          substack: createBlock("motion_turnright", {
            params: { degrees: "15" },
            next: createBlock("motion_movesteps", { params: { steps: "10" } })
          }),
          next: createBlock("looks_show")
        })
      },
      {
        name: "if-else-five-node",
        root: createBlock("control_if_else", {
          condition: createBlock("sensing_keypressed"),
          substack: createBlock("motion_turnright", { params: { degrees: "15" } }),
          substack2: createBlock("motion_turnleft", { params: { degrees: "15" } }),
          next: createBlock("control_stop")
        })
      },
      {
        name: "forever-substack",
        root: createBlock("control_forever", {
          substack: createBlock("motion_ifonedgebounce")
        })
      }
    ];

    console.log(`[render-contract] 验证 ${legalStructures.length} 个合法结构...`);
    for (const scenario of legalStructures) {
      const structure = sanitizeRecommendedStructure({ root: scenario.root });
      assert.ok(structure, `${scenario.name}: 合法结构不应被净化器拒绝`);
      const expectedNodeCount = countStructureNodes(structure.root);
      const result = await renderXml(
        browserWindow,
        buildRecommendedStructureXml(structure),
        `structure:${scenario.name}`
      );
      assertCompleteRender(`structure:${scenario.name}`, result, expectedNodeCount);
    }

    const rootOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canRenderRecommendedBlockAtPosition(opcode, "root")
    );
    const nextParentOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canUseRecommendedBlockRelation(opcode, "next")
    );
    const nextChildOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canRenderRecommendedBlockAtPosition(opcode, "next")
    );
    const conditionParentOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canUseRecommendedBlockRelation(opcode, "condition")
    );
    const conditionOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canRenderRecommendedBlockAtPosition(opcode, "condition")
    );
    const substackParentOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canUseRecommendedBlockRelation(opcode, "substack")
    );
    const substackOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canRenderRecommendedBlockAtPosition(opcode, "substack")
    );
    const substack2ParentOpcodes = SUPPORTED_RECOMMENDED_BLOCK_OPCODES.filter((opcode) =>
      canUseRecommendedBlockRelation(opcode, "substack2")
    );

    const rootStructureCases = rootOpcodes.map((opcode) =>
      createStructureRenderCase(
        `root:${opcode}`,
        createBlock(opcode),
        sanitizeRecommendedStructure,
        buildRecommendedStructureXml
      )
    );
    console.log(`[render-contract] 穷举 ${rootStructureCases.length} 个结构化 root...`);
    await renderCasesInBatches(browserWindow, rootStructureCases);

    const relationCases = [
      ...createRelationMatrixCases({
        relation: "next",
        parentOpcodes: nextParentOpcodes,
        childOpcodes: nextChildOpcodes,
        sanitizeRecommendedStructure,
        buildRecommendedStructureXml
      }),
      ...createRelationMatrixCases({
        relation: "condition",
        parentOpcodes: conditionParentOpcodes,
        childOpcodes: conditionOpcodes,
        sanitizeRecommendedStructure,
        buildRecommendedStructureXml
      }),
      ...createRelationMatrixCases({
        relation: "substack",
        parentOpcodes: substackParentOpcodes,
        childOpcodes: substackOpcodes,
        sanitizeRecommendedStructure,
        buildRecommendedStructureXml
      }),
      ...createRelationMatrixCases({
        relation: "substack2",
        parentOpcodes: substack2ParentOpcodes,
        childOpcodes: substackOpcodes,
        sanitizeRecommendedStructure,
        buildRecommendedStructureXml
      })
    ];
    console.log(`[render-contract] 穷举 ${relationCases.length} 个合法关系 pair...`);
    await renderCasesInBatches(browserWindow, relationCases);

    const combinedRelationCases = createCanonicalMultiRelationCases({
      relationParents: substackParentOpcodes,
      conditionOpcodes,
      branchOpcodes: substackOpcodes,
      nextOpcodes: nextChildOpcodes,
      sanitizeRecommendedStructure,
      buildRecommendedStructureXml
    });
    console.log(`[render-contract] 验证 ${combinedRelationCases.length} 个多关系组合结构...`);
    await renderCasesInBatches(browserWindow, combinedRelationCases);

    const parameterVariantCases = createParameterVariantCases(
      sanitizeRecommendedStructure,
      buildRecommendedStructureXml
    );
    console.log(`[render-contract] 验证 ${parameterVariantCases.length} 个 params 协议变体...`);
    await renderCasesInBatches(browserWindow, parameterVariantCases);

    const terminalStructures = [
      createBlock("control_forever", {
        substack: createBlock("motion_movesteps", { params: { steps: "10" } }),
        next: createBlock("looks_show")
      }),
      createBlock("control_stop", { next: createBlock("looks_show") }),
      createBlock("control_delete_this_clone", { next: createBlock("looks_show") })
    ];

    console.log("[render-contract] 验证仅被 reporter 引用的变量名可见...");
    const variableReporterResult = await renderXml(
      browserWindow,
      buildRecommendedStructureXml({
        root: createBlock("control_repeat", {
          params: { repeatTimes: "n" }
        })
      }),
      "structure:reporter-variable-name"
    );
    assertCompleteRender("structure:reporter-variable-name", variableReporterResult);
    assert.match(
      variableReporterResult.text,
      /n/,
      "structure:reporter-variable-name: 重复执行里的变量 reporter 应显示 n，而不是空圆形"
    );

    console.log("[render-contract] 验证 terminal block 的 next 会在渲染前被移除...");
    for (const root of terminalStructures) {
      const structure = sanitizeRecommendedStructure({ root });
      assert.ok(structure, `${root.opcode}: terminal 结构根节点应被保留`);
      assert.equal(
        structure.root.next,
        undefined,
        `${root.opcode}: terminal block 的 next 必须在结构净化/编译阶段移除`
      );
      const xml = buildRecommendedStructureXml(structure);
      assert.doesNotMatch(xml, /<next>/, `${root.opcode}: 编译后的 XML 不得包含 next`);
      const result = await renderXml(browserWindow, xml, `terminal:${root.opcode}`);
      assertCompleteRender(`terminal:${root.opcode}`, result, countStructureNodes(structure.root));
    }

    console.log(
      `[render-contract] 通过：${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.length} 个单积木、${legalStructures.length} 个样例结构、${rootStructureCases.length} 个 root、${relationCases.length} 个关系 pair、${combinedRelationCases.length} 个多关系组合、${parameterVariantCases.length} 个 params 变体、1 个变量名可见性、${terminalStructures.length} 个 terminal 非法 next 用例。`
    );
  } catch (error) {
    if (rendererDiagnostics.length > 0) {
      console.error("[render-contract] renderer diagnostics:");
      for (const message of rendererDiagnostics.slice(-20)) console.error(`  - ${message}`);
    }
    throw error;
  } finally {
    browserWindow?.destroy();
    await rm(tempDir, { recursive: true, force: true });
    app.quit();
  }
}

if (isElectronMain) {
  try {
    await runElectronContract();
  } catch (error) {
    console.error("[render-contract] 失败：", error);
    process.exitCode = 1;
  }
} else {
  await runNodeLauncher();
}
