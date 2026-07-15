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

function assertCompleteRender(caseName, result, minimumNonShadowBlocks = 1) {
  assert.equal(result.hostCount, 1, `${caseName}: 应只生成一个 scratch workspace host`);
  assert.equal(result.fallback, false, `${caseName}: 不应进入文字 fallback：${result.text}`);
  assert.equal(result.degraded, false, `${caseName}: 不应进入 root-only degraded 渲染`);
  assert.ok(
    result.nonShadowBlockCount >= minimumNonShadowBlocks,
    `${caseName}: 预期至少 ${minimumNonShadowBlocks} 个非 shadow block，实际 ${result.nonShadowBlockCount}`
  );
}

async function runElectronContract() {
  const { app, BrowserWindow } = await import("electron");
  const {
    SUPPORTED_RECOMMENDED_BLOCK_OPCODES,
    buildRecommendedBlockXml,
    buildRecommendedStructureXml
  } = await import(pathToFileURL(path.join(desktopDistDir, "scratch-block-xml.js")).href);
  const { sanitizeRecommendedStructure } = await import(
    pathToFileURL(path.join(desktopDistDir, "recommended-structure.js")).href
  );

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

    console.log(`[render-contract] 验证 ${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.length} 个推荐 opcode...`);
    for (const opcode of SUPPORTED_RECOMMENDED_BLOCK_OPCODES) {
      const xml = buildRecommendedBlockXml(createBlock(opcode));
      const result = await renderXml(browserWindow, xml, `single:${opcode}`);
      assertCompleteRender(`single:${opcode}`, result);
    }

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
      `[render-contract] 通过：${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.length} 个单积木、${legalStructures.length} 个合法结构、1 个变量名可见性、${terminalStructures.length} 个 terminal 非法 next 用例。`
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
