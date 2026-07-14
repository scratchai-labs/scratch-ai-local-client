/**
 * 鸡兔同笼完整公式路径加压：
 * 模拟学生从“已知头脚”到“算出兔/鸡并说出口”的逐步创作，
 * 每步等 DeepSeek 提示、对着做、截图。
 *
 * 阶段：
 *  A start     : 绿旗 + heads=35 + feet=94
 *  B partial   : 已有 rabbits=0（公式未完成）
 *  C mid-ask   : 已询问并写入 heads/feet，等待运算
 *  D near-done : 已有 rabbits 减法骨架，缺 chickens 与输出
 *
 * 用法：
 *   node tools/verification/scripts/verify-chicken-rabbit-formula-path.mjs
 *   node tools/verification/scripts/verify-chicken-rabbit-formula-path.mjs --follow-steps=4 --timeout-ms=120000
 */
import {access, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {findDefaultAutomationScratchExecutablePath, parseLatestScratchLaunchInfo} from './automation-platform.mjs';
import {getDefaultPackagedCompanionBinaryPath} from './electron-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const verificationRoot = path.join(workspaceRoot, 'tools', 'verification');

const argv = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.split('=');
        return [key, rest.join('=') || 'true'];
    })
);

const companionExe = argv.get('--companion-exe') ?? getDefaultPackagedCompanionBinaryPath(workspaceRoot);
const requestedScratchExe = argv.get('--scratch-exe') ?? null;
const companionDebugPort = Number(argv.get('--port') ?? '9381');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '120000');
const maxFollowSteps = Number(argv.get('--follow-steps') ?? '4');
const keepOpen = argv.get('--keep-open') === 'true';

const artifactDir =
    argv.get('--artifact-dir') ??
    path.join(process.cwd(), 'chicken-rabbit-formula-screenshots');
const userDataDir =
    argv.get('--user-data-dir') ??
    path.join(verificationRoot, 'tmp-chicken-rabbit-formula-userdata');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function ensureReadable(filePath) {
    await access(filePath);
}
async function waitFor(predicate, options = {}) {
    const timeout = options.timeoutMs ?? timeoutMs;
    const interval = options.intervalMs ?? 500;
    const deadline = Date.now() + timeout;
    let lastValue = null;
    while (Date.now() < deadline) {
        lastValue = await predicate();
        if (lastValue && !lastValue.__retryableError) return lastValue;
        await sleep(interval);
    }
    const baseMessage = typeof options.errorMessage === 'function'
        ? options.errorMessage()
        : (options.errorMessage ?? `Timed out after ${timeout}ms.`);
    const suffix = lastValue ? ` Last: ${JSON.stringify(lastValue).slice(0, 1800)}` : '';
    throw new Error(`${baseMessage}${suffix}`);
}
function getConfigFilePath(dir) {
    return path.join(dir, 'desktop-companion.config.json');
}
function getLogFilePath(dir) {
    return path.join(dir, 'desktop-companion.log');
}

async function seedUserData() {
    await rm(userDataDir, {recursive: true, force: true}).catch(() => {});
    await mkdir(userDataDir, {recursive: true});
    const sources = [
        path.join(process.env.HOME ?? '', 'Library/Application Support/com.scratchai.desktopcompanion/desktop-companion.config.json'),
        path.join(process.env.HOME ?? '', 'Library/Application Support/@scratch-ai/desktop-companion/desktop-companion.config.json')
    ];
    let baseConfig = {};
    for (const source of sources) {
        try { baseConfig = JSON.parse(await readFile(source, 'utf8')); break; } catch {}
    }
    const scratchExe =
        requestedScratchExe ??
        baseConfig.scratchExecutablePath ??
        (await findDefaultAutomationScratchExecutablePath()) ??
        '/Applications/Scratch 3.app/Contents/MacOS/Scratch 3';
    await ensureReadable(scratchExe);
    const config = {
        ...baseConfig,
        scratchExecutablePath: scratchExe,
        aiHintTriggerMode: 'auto'
    };
    await writeFile(getConfigFilePath(userDataDir), JSON.stringify(config, null, 2), 'utf8');
    return {scratchExe, config};
}
async function getLogSize() {
    try { return (await readFile(getLogFilePath(userDataDir))).byteLength; } catch { return 0; }
}
async function readLogSince(offset) {
    try { return (await readFile(getLogFilePath(userDataDir))).subarray(offset).toString('utf8'); } catch { return ''; }
}
function isInspectablePageTarget(target) {
    return target?.type === 'page' &&
        typeof target.webSocketDebuggerUrl === 'string' &&
        target.webSocketDebuggerUrl.length > 0 &&
        typeof target.url === 'string' &&
        !target.url.startsWith('devtools://') &&
        target.url !== 'about:blank';
}
function pickCompanionTarget(targets) {
    const list = targets.filter(isInspectablePageTarget);
    return list.find(t => {
        const title = typeof t.title === 'string' ? t.title.trim() : '';
        const url = typeof t.url === 'string' ? t.url.toLowerCase() : '';
        return title.includes('Scratch AI 教练') || url.endsWith('/index.html') || url.includes('index.html');
    }) ?? list[0] ?? null;
}
function pickScratchTarget(targets) {
    const list = targets.filter(isInspectablePageTarget);
    return list.find(t => typeof t.url === 'string' && t.url.toLowerCase().endsWith('/index.html')) ??
        list.find(t => {
            const u = typeof t.url === 'string' ? t.url.toLowerCase() : '';
            return u.includes('/index.html') && !u.includes('?route=');
        }) ?? list[0] ?? null;
}
async function waitForTargets(port, picker, errorMessage) {
    return await waitFor(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/list`);
            if (!response.ok) return null;
            const parsed = await response.json();
            if (!Array.isArray(parsed)) return null;
            const preferredTarget = picker(parsed);
            if (!preferredTarget) return null;
            return {targets: parsed, preferredTarget};
        } catch { return null; }
    }, {timeoutMs, intervalMs: 500, errorMessage});
}
class CdpConnection {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        this.socket.addEventListener('message', event => {
            const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
            if (!raw) return;
            let message;
            try { message = JSON.parse(raw); } catch { return; }
            if (typeof message.id !== 'number') return;
            const req = this.pending.get(message.id);
            if (!req) return;
            this.pending.delete(message.id);
            if (message.error?.message) req.reject(new Error(message.error.message));
            else req.resolve(message.result ?? {});
        });
    }
    send(method, params) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject});
            this.socket.send(JSON.stringify({id, method, params}));
        });
    }
}
async function waitForWebSocketOpen(socket, maxWaitMs) {
    if (socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out while opening websocket.')), maxWaitMs);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Failed to connect to websocket.')); });
    });
}
async function withTargetConnection(target, work) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitForWebSocketOpen(socket, timeoutMs);
    const connection = new CdpConnection(socket);
    try { return await work(connection); }
    finally { socket.close(); }
}
async function evaluateExpressionInTarget(target, expression) {
    return await withTargetConnection(target, async connection => {
        try {
            await connection.send('Runtime.enable');
            const response = await connection.send('Runtime.evaluate', {
                expression,
                awaitPromise: true,
                returnByValue: true,
                userGesture: true
            });
            if (response.exceptionDetails?.text) throw new Error(response.exceptionDetails.text);
            return {ok: true, value: response.result?.value, type: response.result?.type};
        } catch (error) {
            return {ok: false, error: error instanceof Error ? error.message : String(error)};
        }
    });
}
async function captureScreenshot(target, outputPath) {
    await mkdir(path.dirname(outputPath), {recursive: true});
    await withTargetConnection(target, async connection => {
        await connection.send('Page.enable');
        const response = await connection.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: true
        });
        assert(typeof response.data === 'string' && response.data.length > 0, `Screenshot empty: ${outputPath}`);
        await writeFile(outputPath, Buffer.from(response.data, 'base64'));
    });
}
async function readMainState(target) {
    const result = await evaluateExpressionInTarget(
        target,
        'window.desktopCompanionApi ? window.desktopCompanionApi.getInitialState() : null'
    );
    if (!result.ok) throw new Error(result.error ?? 'Failed to read desktop companion state.');
    if (!result.value || typeof result.value !== 'object') {
        throw new Error(`Desktop companion state unavailable: ${JSON.stringify(result.value)}`);
    }
    return result.value;
}
async function waitForMainState(target, predicate, errorMessage, options = {}) {
    let lastState = null;
    return await waitFor(async () => {
        try {
            const state = await readMainState(target);
            lastState = state;
            return predicate(state) ? state : null;
        } catch (error) {
            return {__retryableError: true, error: error instanceof Error ? error.message : String(error)};
        }
    }, {
        timeoutMs: options.timeoutMs ?? timeoutMs,
        intervalMs: options.intervalMs ?? 500,
        errorMessage: () => {
            const compact = lastState ? {
                status: lastState.status,
                aiStatus: lastState.aiStatus,
                aiProvider: lastState.aiProvider,
                programs: lastState.currentTargetPrograms,
                answerText: lastState.aiCoachResponse?.answerText,
                recommendedBlocks: (lastState.aiCoachResponse?.recommendedBlocks ?? []).map(b => b.opcode),
                aiError: lastState.aiError
            } : null;
            return `${errorMessage} Last state: ${JSON.stringify(compact).slice(0, 2200)}`;
        }
    });
}
async function clickButton(target, selector) {
    const clickResult = await evaluateExpressionInTarget(target, `
(() => {
  const button = document.querySelector(${JSON.stringify(selector)});
  if (!(button instanceof HTMLButtonElement)) return { ok: false, error: "button-not-found" };
  button.click();
  return { ok: true };
})()
    `.trim());
    if (!clickResult.ok) throw new Error(clickResult.error ?? `Failed to click ${selector}.`);
    return clickResult.value ?? {};
}

function findVmHelpersSource() {
    return `
  function isVmLike(value) {
    return Boolean(value && typeof value === "object" && value.runtime && Array.isArray(value.runtime.targets) && typeof value.toJSON === "function");
  }
  function findVmInFiberNode(node) {
    const queue = [node];
    const visited = new Set();
    while (queue.length > 0 && visited.size < 2500) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      for (const props of [current.memoizedProps, current.pendingProps, current.stateNode && current.stateNode.props]) {
        if (!props || typeof props !== "object") continue;
        if (isVmLike(props.vm)) return props.vm;
        if (isVmLike(props)) return props;
      }
      for (const key of ["child", "sibling", "return"]) {
        const nextNode = current[key];
        if (nextNode && !visited.has(nextNode)) queue.push(nextNode);
      }
    }
    return null;
  }
  function findVm() {
    for (const key of ["vm", "__scratchVm", "__vm"]) {
      try { if (isVmLike(window[key])) return window[key]; } catch {}
    }
    for (const element of Array.from(document.querySelectorAll("*"))) {
      const reactKeys = Object.getOwnPropertyNames(element).filter(key =>
        key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$") || key.startsWith("__reactInternalInstance$")
      );
      for (const reactKey of reactKeys) {
        const vm = findVmInFiberNode(element[reactKey]);
        if (vm) return vm;
      }
    }
    return null;
  }
  function sleep(ms) { return new Promise(resolve => window.setTimeout(resolve, ms)); }
  async function waitFor(check, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { if (check()) return true; } catch {}
      await sleep(200);
    }
    return false;
  }
  function makeId(prefix) { return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
  function getSpriteTarget(vm) { return (vm.runtime.targets || []).find(target => !target.isStage) || null; }
  function cloneProject(rawProject) {
    if (typeof rawProject === "string") return JSON.parse(rawProject);
    return JSON.parse(JSON.stringify(rawProject));
  }
  function notifyCapture(label) {
    if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
      window.__scratchDesktopCompanionCaptureNow(label);
    }
  }
  function ensureStageVariables(project, names) {
    const stage = project.targets.find(t => t.isStage) || project.targets[0];
    if (!stage.variables || typeof stage.variables !== "object") stage.variables = {};
    const ids = {};
    for (const name of names) {
      const existingEntry = Object.entries(stage.variables).find(([, value]) => Array.isArray(value) && value[0] === name);
      if (existingEntry) ids[name] = existingEntry[0];
      else {
        const id = makeId("var-" + name);
        stage.variables[id] = [name, 0];
        ids[name] = id;
      }
    }
    return { stage, ids };
  }
  function varField(name, ids) {
    return [name, ids[name] || makeId("var-" + name)];
  }
  function varReporter(name, ids) {
    // input style that references a variable reporter is hard; use plain number/text fallbacks for stability
    return null;
  }
`;
}

function buildSeedExpression(stageName) {
    return `
(async () => {
${findVmHelpersSource()}
  const stageName = ${JSON.stringify(stageName)};
  const vm = findVm();
  if (!vm || !vm.runtime || typeof vm.toJSON !== "function" || typeof vm.loadProject !== "function") {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "project-not-ready" });

  const project = cloneProject(vm.toJSON());
  const sprite = project.targets.find(t => !t.isStage) || project.targets[0];
  if (!sprite) return JSON.stringify({ ok: false, error: "sprite-missing" });
  sprite.blocks = {};
  sprite.x = 0; sprite.y = 0; sprite.direction = 90; sprite.visible = true;
  const { ids } = ensureStageVariables(project, ["heads", "feet", "chickens", "rabbits"]);

  const flagId = makeId("flag");
  const setHeadsId = makeId("set-heads");
  const setFeetId = makeId("set-feet");
  const setRabbitsId = makeId("set-rabbits");
  const setChickensId = makeId("set-chickens");
  const askHeadsId = makeId("ask-heads");
  const askFeetId = makeId("ask-feet");
  const sayId = makeId("say");
  const subId = makeId("sub");
  const mulId = makeId("mul");
  const divId = makeId("div");

  if (stageName === "A-start") {
    // 学生刚写下已知条件：头35 脚94
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setHeadsId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setHeadsId]: { opcode: "data_setvariableto", next: setFeetId, parent: flagId, inputs: { VALUE: [1, [10, "35"]] }, fields: { VARIABLE: varField("heads", ids) }, shadow: false, topLevel: false },
      [setFeetId]: { opcode: "data_setvariableto", next: null, parent: setHeadsId, inputs: { VALUE: [1, [10, "94"]] }, fields: { VARIABLE: varField("feet", ids) }, shadow: false, topLevel: false }
    };
  } else if (stageName === "B-partial-rabbits-zero") {
    // 学生想算兔子，但还写成 0
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setHeadsId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setHeadsId]: { opcode: "data_setvariableto", next: setFeetId, parent: flagId, inputs: { VALUE: [1, [10, "35"]] }, fields: { VARIABLE: varField("heads", ids) }, shadow: false, topLevel: false },
      [setFeetId]: { opcode: "data_setvariableto", next: setRabbitsId, parent: setHeadsId, inputs: { VALUE: [1, [10, "94"]] }, fields: { VARIABLE: varField("feet", ids) }, shadow: false, topLevel: false },
      [setRabbitsId]: { opcode: "data_setvariableto", next: null, parent: setFeetId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("rabbits", ids) }, shadow: false, topLevel: false }
    };
  } else if (stageName === "C-ask-input") {
    // 学生改成可输入：先问头，再问脚，再准备算兔子
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: askHeadsId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 60, y: 60 },
      [askHeadsId]: { opcode: "sensing_askandwait", next: setHeadsId, parent: flagId, inputs: { QUESTION: [1, [10, "How many heads?"]] }, fields: {}, shadow: false, topLevel: false },
      [setHeadsId]: { opcode: "data_setvariableto", next: askFeetId, parent: askHeadsId, inputs: { VALUE: [1, [10, "answer"]] }, fields: { VARIABLE: varField("heads", ids) }, shadow: false, topLevel: false },
      [askFeetId]: { opcode: "sensing_askandwait", next: setFeetId, parent: setHeadsId, inputs: { QUESTION: [1, [10, "How many feet?"]] }, fields: {}, shadow: false, topLevel: false },
      [setFeetId]: { opcode: "data_setvariableto", next: setRabbitsId, parent: askFeetId, inputs: { VALUE: [1, [10, "answer"]] }, fields: { VARIABLE: varField("feet", ids) }, shadow: false, topLevel: false },
      [setRabbitsId]: { opcode: "data_setvariableto", next: null, parent: setFeetId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("rabbits", ids) }, shadow: false, topLevel: false }
    };
  } else if (stageName === "D-near-formula") {
    // 学生已写出 rabbits = feet - 2*heads 的近似减法骨架，但还没 /2，也没算 chickens，也没输出
    // VALUE of rabbits uses subtract(94, 70) as literal stand-in for (feet - 2*heads)
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setHeadsId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 50, y: 50 },
      [setHeadsId]: { opcode: "data_setvariableto", next: setFeetId, parent: flagId, inputs: { VALUE: [1, [10, "35"]] }, fields: { VARIABLE: varField("heads", ids) }, shadow: false, topLevel: false },
      [setFeetId]: { opcode: "data_setvariableto", next: setRabbitsId, parent: setHeadsId, inputs: { VALUE: [1, [10, "94"]] }, fields: { VARIABLE: varField("feet", ids) }, shadow: false, topLevel: false },
      [setRabbitsId]: {
        opcode: "data_setvariableto",
        next: null,
        parent: setFeetId,
        inputs: { VALUE: [3, subId, [4, "0"]] },
        fields: { VARIABLE: varField("rabbits", ids) },
        shadow: false,
        topLevel: false
      },
      [subId]: {
        opcode: "operator_subtract",
        next: null,
        parent: setRabbitsId,
        inputs: {
          NUM1: [1, [4, "94"]],
          NUM2: [1, [4, "70"]]
        },
        fields: {},
        shadow: false,
        topLevel: false
      }
    };
  } else if (stageName === "E-need-output") {
    // 学生几乎做完：rabbits 与 chickens 都有，但缺说出口/验算
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setHeadsId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 40 },
      [setHeadsId]: { opcode: "data_setvariableto", next: setFeetId, parent: flagId, inputs: { VALUE: [1, [10, "35"]] }, fields: { VARIABLE: varField("heads", ids) }, shadow: false, topLevel: false },
      [setFeetId]: { opcode: "data_setvariableto", next: setRabbitsId, parent: setHeadsId, inputs: { VALUE: [1, [10, "94"]] }, fields: { VARIABLE: varField("feet", ids) }, shadow: false, topLevel: false },
      [setRabbitsId]: { opcode: "data_setvariableto", next: setChickensId, parent: setFeetId, inputs: { VALUE: [1, [10, "12"]] }, fields: { VARIABLE: varField("rabbits", ids) }, shadow: false, topLevel: false },
      [setChickensId]: { opcode: "data_setvariableto", next: null, parent: setRabbitsId, inputs: { VALUE: [1, [10, "23"]] }, fields: { VARIABLE: varField("chickens", ids) }, shadow: false, topLevel: false }
    };
  } else {
    return JSON.stringify({ ok: false, error: "unknown-stage", stageName });
  }

  if (!Array.isArray(project.extensions)) project.extensions = [];
  if (typeof vm.stopAll === "function") vm.stopAll();
  await vm.loadProject(JSON.stringify(project));
  await waitFor(() => {
    const target = getSpriteTarget(vm);
    const count = target?.blocks?._blocks ? Object.keys(target.blocks._blocks).length : 0;
    return count > 0;
  }, 12000);
  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }
  await sleep(800);
  notifyCapture("seed:" + stageName);
  const runtimeOpcodes = runtimeSprite?.blocks?._blocks
    ? Object.values(runtimeSprite.blocks._blocks).map(b => b.opcode)
    : [];
  return JSON.stringify({
    ok: runtimeOpcodes.length > 0,
    stageName,
    currentTargetName: runtimeSprite?.sprite?.name ?? null,
    runtimeBlockCount: runtimeOpcodes.length,
    runtimeOpcodes
  });
})()
    `.trim();
}

function buildApplyRecommendedBlocksExpression(recommendedBlocks, label) {
    return `
(async () => {
${findVmHelpersSource()}
  function defaultFieldsForOpcode(opcode, varIds) {
    if (opcode === "data_setvariableto" || opcode === "data_changevariableby" || opcode === "data_showvariable" || opcode === "data_hidevariable") {
      // prefer rabbits then chickens then heads
      const prefer = ["rabbits", "chickens", "heads", "feet"];
      for (const name of prefer) {
        if (varIds[name]) return { VARIABLE: [name, varIds[name]] };
      }
      return { VARIABLE: ["rabbits", varIds.rabbits || "variable-id"] };
    }
    return {};
  }
  function defaultInputsForOpcode(opcode) {
    const number = (name, value) => ({ [name]: [1, [4, String(value)]] });
    const text = (name, value) => ({ [name]: [1, [10, String(value)]] });
    const positive = (name, value) => ({ [name]: [1, [5, String(value)]] });
    switch (opcode) {
      case "looks_say":
      case "looks_think": return text("MESSAGE", "chickens and rabbits");
      case "looks_sayforsecs":
      case "looks_thinkforsecs": return { MESSAGE: [1, [10, "chickens and rabbits"]], SECS: [1, [4, "2"]] };
      case "control_wait": return positive("DURATION", 1);
      case "control_repeat": return number("TIMES", 10);
      case "data_setvariableto": return { VALUE: [1, [10, "0"]] };
      case "data_changevariableby": return { VALUE: [1, [4, "1"]] };
      case "operator_add":
      case "operator_subtract":
      case "operator_multiply":
      case "operator_divide":
      case "operator_mod":
        return { NUM1: [1, [4, "1"]], NUM2: [1, [4, "2"]] };
      case "sensing_askandwait": return text("QUESTION", "How many heads?");
      case "sensing_answer": return {};
      default: return {};
    }
  }

  const hatOpcodes = new Set([
    "event_whenflagclicked","event_whenkeypressed","event_whenthisspriteclicked",
    "event_whenbackdropswitchesto","event_whengreaterthan","event_whenbroadcastreceived","control_start_as_clone"
  ]);
  const reporterOpcodes = new Set([
    "operator_add","operator_subtract","operator_multiply","operator_divide","operator_mod",
    "operator_random","operator_lt","operator_equals","operator_gt","operator_and","operator_or","operator_not",
    "operator_join","operator_letter_of","operator_length","operator_contains","operator_round","operator_mathop",
    "sensing_answer","sensing_timer","data_variable"
  ]);
  const containerOpcodes = new Set(["control_forever","control_repeat","control_if","control_if_else","control_repeat_until"]);

  const opcodes = (Array.isArray(${JSON.stringify(recommendedBlocks)}) ? ${JSON.stringify(recommendedBlocks)} : [])
    .map(b => (b && typeof b.opcode === "string" ? b.opcode : null))
    .filter(Boolean);

  const vm = findVm();
  if (!vm || !vm.runtime || typeof vm.toJSON !== "function" || typeof vm.loadProject !== "function") {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "project-not-ready" });

  const project = cloneProject(vm.toJSON());
  const sprite = project.targets.find(t => !t.isStage) || project.targets[0];
  if (!sprite) return JSON.stringify({ ok: false, error: "sprite-missing" });
  const { ids: varIds } = ensureStageVariables(project, ["heads", "feet", "chickens", "rabbits"]);

  const existing = sprite.blocks && typeof sprite.blocks === "object" ? sprite.blocks : {};
  const topIds = Object.keys(existing).filter(id => existing[id] && existing[id].topLevel === true && existing[id].shadow !== true);
  let bestTop = null, bestLen = -1;
  for (const topId of topIds) {
    let len = 0, cursor = topId, seen = new Set();
    while (cursor && existing[cursor] && !seen.has(cursor)) {
      seen.add(cursor); len += 1;
      const block = existing[cursor];
      if (block.next) cursor = block.next;
      else if (block.inputs && Array.isArray(block.inputs.SUBSTACK) && typeof block.inputs.SUBSTACK[1] === "string") cursor = block.inputs.SUBSTACK[1];
      else cursor = null;
    }
    if (len > bestLen) { bestLen = len; bestTop = topId; }
  }

  const keptOpcodes = [];
  if (bestTop) {
    let cursor = bestTop;
    const seen = new Set();
    while (cursor && existing[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      const block = existing[cursor];
      if (block.shadow !== true && typeof block.opcode === "string" && !reporterOpcodes.has(block.opcode)) {
        // keep stack blocks only on spine; reporters are usually nested
        keptOpcodes.push(block.opcode);
      } else if (block.shadow !== true && typeof block.opcode === "string" && reporterOpcodes.has(block.opcode)) {
        // ignore pure nested reporters in spine reconstruction
      }
      if (block.next) cursor = block.next;
      else if (block.inputs && Array.isArray(block.inputs.SUBSTACK) && typeof block.inputs.SUBSTACK[1] === "string") cursor = block.inputs.SUBSTACK[1];
      else cursor = null;
    }
  }

  // Build working stack opcodes: keep previous spine + append recommended stackable ops
  const stackableRecommended = opcodes.filter(op => !reporterOpcodes.has(op) || op === "sensing_answer");
  const reporterRecommended = opcodes.filter(op => reporterOpcodes.has(op) && op !== "sensing_answer");
  let working = keptOpcodes.concat(stackableRecommended);
  working = working.filter((op, i) => i === 0 || op !== working[i - 1]);
  if (!working.length || !hatOpcodes.has(working[0])) {
    working = ["event_whenflagclicked", ...working.filter(op => !hatOpcodes.has(op))];
  } else {
    working = [working[0], ...working.slice(1).filter(op => !hatOpcodes.has(op))];
  }

  // If AI only recommended reporters (e.g. operator_subtract), attach them into the last setvariable VALUE
  if (reporterRecommended.length > 0 && !stackableRecommended.length) {
    // ensure a setvariable rabbits exists at end
    if (!working.includes("data_setvariableto")) working.push("data_setvariableto");
  }

  const blocks = {};
  const createdIds = [];
  let previousId = null;
  let lastSetVarId = null;
  let containerId = null;

  for (let index = 0; index < working.length; index += 1) {
    const opcode = working[index];
    const id = makeId(opcode.replace(/[^a-z0-9_]/gi, "_"));
    createdIds.push(id);
    const isTop = index === 0;
    const record = {
      opcode,
      next: null,
      parent: null,
      inputs: defaultInputsForOpcode(opcode),
      fields: defaultFieldsForOpcode(opcode, varIds),
      shadow: false,
      topLevel: isTop
    };
    if (isTop) { record.x = 80; record.y = 80; }
    // alternate setvariable targets for chicken/rabbit path
    if (opcode === "data_setvariableto") {
      const setCount = createdIds.filter((x, i) => working[i] === "data_setvariableto").length;
      // rough: first free set after heads/feet tends to rabbits, next chickens
      if (setCount >= 3) record.fields = { VARIABLE: varField("chickens", varIds) };
      else if (setCount >= 2) record.fields = { VARIABLE: varField("rabbits", varIds) };
      lastSetVarId = id;
    }
    blocks[id] = record;
    if (previousId) {
      const prev = blocks[previousId];
      if (containerOpcodes.has(prev.opcode) && !(prev.inputs && prev.inputs.SUBSTACK)) {
        prev.inputs = { ...(prev.inputs || {}), SUBSTACK: [2, id] };
        record.parent = previousId;
        containerId = previousId;
      } else {
        prev.next = id;
        record.parent = previousId;
      }
    }
    if (containerOpcodes.has(opcode) && !containerId) containerId = id;
    previousId = id;
  }

  // Attach first recommended operator under last data_setvariableto VALUE when useful
  if (reporterRecommended.length > 0) {
    const op = reporterRecommended[0];
    const opId = makeId(op.replace(/[^a-z0-9_]/gi, "_"));
    createdIds.push(opId);
    const opBlock = {
      opcode: op,
      next: null,
      parent: lastSetVarId,
      inputs: defaultInputsForOpcode(op),
      fields: {},
      shadow: false,
      topLevel: false
    };
    // better defaults for chicken-rabbit formula
    if (op === "operator_subtract") {
      opBlock.inputs = { NUM1: [1, [4, "94"]], NUM2: [1, [4, "70"]] };
    } else if (op === "operator_multiply") {
      opBlock.inputs = { NUM1: [1, [4, "2"]], NUM2: [1, [4, "35"]] };
    } else if (op === "operator_divide") {
      opBlock.inputs = { NUM1: [1, [4, "24"]], NUM2: [1, [4, "2"]] };
    } else if (op === "operator_add") {
      opBlock.inputs = { NUM1: [1, [4, "12"]], NUM2: [1, [4, "23"]] };
    }
    blocks[opId] = opBlock;
    if (lastSetVarId && blocks[lastSetVarId]) {
      blocks[lastSetVarId].inputs = {
        ...(blocks[lastSetVarId].inputs || {}),
        VALUE: [3, opId, [4, "0"]]
      };
      blocks[opId].parent = lastSetVarId;
    } else if (previousId && blocks[previousId]) {
      // fallback linear
      blocks[previousId].next = opId;
      blocks[opId].parent = previousId;
    }
  }

  // If looks_say recommended, ensure message mentions variables conceptually
  for (const id of Object.keys(blocks)) {
    if (blocks[id].opcode === "looks_say" || blocks[id].opcode === "looks_sayforsecs") {
      blocks[id].inputs = {
        ...(blocks[id].inputs || {}),
        MESSAGE: [1, [10, "chickens=?, rabbits=?"]]
      };
    }
  }

  sprite.blocks = blocks;
  if (!Array.isArray(project.extensions)) project.extensions = [];
  if (typeof vm.stopAll === "function") vm.stopAll();
  await vm.loadProject(JSON.stringify(project));
  const loaded = await waitFor(() => {
    const target = getSpriteTarget(vm);
    const count = target?.blocks?._blocks ? Object.keys(target.blocks._blocks).length : 0;
    return Boolean(target && count > 0);
  }, 15000);
  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }
  await sleep(900);
  notifyCapture(${JSON.stringify(label || 'apply-recommended')});
  const runtimeOpcodes = runtimeSprite?.blocks?._blocks ? Object.values(runtimeSprite.blocks._blocks).map(b => b.opcode) : [];
  return JSON.stringify({
    ok: Boolean(loaded && runtimeOpcodes.length > 0),
    error: loaded ? (runtimeOpcodes.length > 0 ? null : "blocks-empty-after-load") : "project-load-timeout",
    appliedOpcodes: opcodes,
    rebuiltOpcodes: working,
    reporterRecommended,
    createdIds,
    currentTargetName: runtimeSprite?.sprite?.name ?? null,
    runtimeBlockCount: runtimeOpcodes.length,
    runtimeOpcodes
  });
})()
    `.trim();
}

function summarizeCoach(state) {
    const response = state?.aiCoachResponse ?? null;
    return {
        aiStatus: state?.aiStatus ?? null,
        aiProvider: state?.aiProvider ?? null,
        aiModel: state?.aiModel ?? null,
        currentTargetName: state?.currentTargetName ?? null,
        programs: state?.currentTargetPrograms ?? [],
        answerText: response?.answerText ?? null,
        nextStep: response?.nextStep ?? null,
        recommendedBlocks: (response?.recommendedBlocks ?? []).map(block => ({
            opcode: block.opcode,
            reason: block.reason ?? block.label ?? null
        })),
        aiError: state?.aiError ?? null
    };
}
async function waitForCoachResult(mainTarget, options = {}) {
    const minUpdatedAt = options.minUpdatedAt ?? null;
    return await waitForMainState(
        mainTarget,
        state => {
            if (state.status !== 'connected') return false;
            if (state.aiStatus === 'loading') return false;
            if (state.aiStatus !== 'ready' && state.aiStatus !== 'error') return false;
            if (minUpdatedAt && state.aiLastUpdatedAt && state.aiLastUpdatedAt <= minUpdatedAt) return false;
            if (state.aiStatus === 'ready' && state.aiCoachResponse) {
                return typeof state.aiCoachResponse.answerText === 'string' && state.aiCoachResponse.answerText.length > 0;
            }
            return state.aiStatus === 'error';
        },
        options.errorMessage ?? 'AI coach result did not arrive.',
        {timeoutMs: options.timeoutMs ?? timeoutMs}
    );
}
async function forceGenerate(mainTarget, options = {}) {
    await waitForMainState(mainTarget, s => s.aiStatus !== 'loading', 'wait previous AI', {timeoutMs: 60000}).catch(() => {});
    await clickButton(mainTarget, '#generate-ai-button');
    return await waitForCoachResult(mainTarget, {
        minUpdatedAt: options.minUpdatedAt ?? null,
        errorMessage: options.errorMessage ?? 'AI did not return after generate click.',
        timeoutMs: options.timeoutMs ?? timeoutMs
    });
}
function pad(num) { return String(num).padStart(2, '0'); }
async function closeScratchTarget(target) {
    if (!target?.webSocketDebuggerUrl) return false;
    try {
        return await withTargetConnection(target, async connection => {
            await connection.send('Page.enable');
            await connection.send('Runtime.enable');
            await connection.send('Runtime.evaluate', {
                expression: `(() => { window.onbeforeunload = null; return true; })()`,
                awaitPromise: true, returnByValue: true, userGesture: true
            }).catch(() => {});
            await connection.send('Page.close').catch(() => {});
            return true;
        });
    } catch { return false; }
}

async function main() {
    await mkdir(artifactDir, {recursive: true});
    const {scratchExe, config} = await seedUserData();
    await ensureReadable(companionExe);

    const stages = [
        {name: 'A-start', tag: 'A-start', note: 'heads=35 feet=94 only', follow: maxFollowSteps},
        {name: 'B-partial-rabbits-zero', tag: 'B-partial', note: 'rabbits still 0', follow: maxFollowSteps},
        {name: 'C-ask-input', tag: 'C-ask', note: 'ask heads/feet then compute', follow: maxFollowSteps},
        {name: 'D-near-formula', tag: 'D-near', note: 'subtract skeleton for rabbits, missing /2 and chickens', follow: maxFollowSteps},
        {name: 'E-need-output', tag: 'E-output', note: 'numbers set, need say/verify', follow: Math.max(2, maxFollowSteps - 1)}
    ];

    console.log(JSON.stringify({
        phase: 'start',
        companionExe,
        scratchExe,
        artifactDir,
        hasApiKey: Boolean(config.customAiApiKey),
        stages: stages.map(s => s.name),
        maxFollowSteps
    }, null, 2));

    const child = spawn(companionExe, [`--remote-debugging-port=${companionDebugPort}`], {
        cwd: path.dirname(companionExe),
        env: {...process.env, SCRATCH_AI_USER_DATA_DIR: userDataDir},
        stdio: 'ignore',
        windowsHide: false
    });

    let launchedScratchProcess = null;
    let scratchTarget = null;
    let stepCounter = 0;
    const timeline = [];

    async function shot(mainTarget, scratchTargetLocal, tag, extra = {}) {
        stepCounter += 1;
        const prefix = `${pad(stepCounter)}-${tag}`;
        const mainPath = path.join(artifactDir, `${prefix}-companion.png`);
        const scratchPath = path.join(artifactDir, `${prefix}-scratch.png`);
        await captureScreenshot(mainTarget, mainPath);
        if (scratchTargetLocal) await captureScreenshot(scratchTargetLocal, scratchPath);
        const state = await readMainState(mainTarget).catch(() => null);
        const entry = {
            step: stepCounter,
            tag,
            mainScreenshot: mainPath,
            scratchScreenshot: scratchTargetLocal ? scratchPath : null,
            coach: state ? summarizeCoach(state) : null,
            ...extra
        };
        timeline.push(entry);
        await writeFile(path.join(artifactDir, 'timeline.json'), JSON.stringify({artifactDir, timeline}, null, 2), 'utf8');
        console.log(`[step ${stepCounter}] ${tag}`);
        if (entry.coach) {
            console.log(`  provider=${entry.coach.aiProvider} model=${entry.coach.aiModel}`);
            console.log(`  answer=${(entry.coach.answerText || '').slice(0, 160)}`);
            console.log(`  blocks=${(entry.coach.recommendedBlocks || []).map(b => b.opcode).join(' -> ') || '(none)'}`);
        }
        return entry;
    }

    async function refreshScratchTarget() {
        if (!launchedScratchProcess?.debugPort) return scratchTarget;
        const result = await waitForTargets(launchedScratchProcess.debugPort, pickScratchTarget, 'scratch target missing');
        scratchTarget = result.preferredTarget;
        return scratchTarget;
    }

    async function studentFollowLoop(mainTarget, stageTag, maxSteps) {
        let coachState = await readMainState(mainTarget);
        for (let follow = 1; follow <= maxSteps; follow += 1) {
            const beforeUpdatedAt = coachState.aiLastUpdatedAt ?? null;
            const recommended = coachState.aiCoachResponse?.recommendedBlocks ?? [];
            if (!recommended.length) {
                timeline.push({
                    step: ++stepCounter,
                    tag: `${stageTag}-no-more-blocks-${follow}`,
                    note: 'AI returned no recommended blocks',
                    coach: summarizeCoach(coachState)
                });
                break;
            }
            await refreshScratchTarget();
            const applyResult = await evaluateExpressionInTarget(
                scratchTarget,
                buildApplyRecommendedBlocksExpression(recommended, `${stageTag}-follow-${follow}`)
            );
            const applyValue = applyResult.ok
                ? (typeof applyResult.value === 'string' ? JSON.parse(applyResult.value) : applyResult.value)
                : {ok: false, error: applyResult.error};
            if (!applyValue?.ok) {
                await shot(mainTarget, scratchTarget, `${stageTag}-apply-failed-${follow}`, {applied: applyValue, recommended});
                break;
            }
            await sleep(1200);
            await shot(mainTarget, scratchTarget, `${stageTag}-applied-${follow}`, {
                applied: applyValue,
                note: `student applied: ${(applyValue.appliedOpcodes || []).join(' -> ')}`
            });
            try {
                coachState = await forceGenerate(mainTarget, {
                    minUpdatedAt: beforeUpdatedAt,
                    errorMessage: `${stageTag} follow ${follow}: AI missing`,
                    timeoutMs: 90000
                });
                await shot(mainTarget, scratchTarget, `${stageTag}-follow-${follow}`, {applied: applyValue});
            } catch (error) {
                await shot(mainTarget, scratchTarget, `${stageTag}-follow-timeout-${follow}`, {
                    applied: applyValue,
                    error: error instanceof Error ? error.message : String(error)
                });
                break;
            }
        }
        return coachState;
    }

    try {
        const companionTargetResult = await waitForTargets(companionDebugPort, pickCompanionTarget, 'companion page missing');
        const mainTarget = companionTargetResult.preferredTarget;
        await waitForMainState(mainTarget, s => typeof s.status === 'string' && Boolean(s.scratchExecutablePath), 'companion not ready');
        await shot(mainTarget, null, 'main-initial');

        const launchLogOffset = await getLogSize();
        const launchClick = await clickButton(mainTarget, '#launch-button');
        assert(launchClick.ok === true, `launch failed: ${JSON.stringify(launchClick)}`);
        const launchLogContent = await waitFor(async () => {
            const content = await readLogSince(launchLogOffset);
            return content.includes('Scratch launched pid=') && content.includes('Bridge script injected via CDP') ? content : null;
        }, {errorMessage: 'launch/injection markers missing'});
        launchedScratchProcess = parseLatestScratchLaunchInfo(launchLogContent);
        assert(launchedScratchProcess?.debugPort, 'scratch debug port missing');
        await waitForMainState(mainTarget, s => s.status === 'connected', 'not connected to Scratch');
        await refreshScratchTarget();
        await shot(mainTarget, scratchTarget, 'connected-blank');

        for (const stage of stages) {
            console.log(`\n=== STAGE ${stage.name} ===`);
            await refreshScratchTarget();
            const seed = await evaluateExpressionInTarget(scratchTarget, buildSeedExpression(stage.name));
            const seedValue = seed.ok
                ? (typeof seed.value === 'string' ? JSON.parse(seed.value) : seed.value)
                : {ok: false, error: seed.error};
            if (!seedValue?.ok) {
                await shot(mainTarget, scratchTarget, `${stage.tag}-seed-failed`, {seed: seedValue});
                continue;
            }
            await waitForMainState(
                mainTarget,
                s => s.status === 'connected' && Array.isArray(s.currentTargetPrograms) && s.currentTargetPrograms.length > 0,
                `${stage.name} not synced`
            );
            try {
                await forceGenerate(mainTarget, {errorMessage: `${stage.name} AI missing`});
            } catch (error) {
                await shot(mainTarget, scratchTarget, `${stage.tag}-ai-timeout`, {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
            await shot(mainTarget, scratchTarget, `${stage.tag}-after-seed`, {
                seed: seedValue,
                note: stage.note
            });
            await studentFollowLoop(mainTarget, stage.tag, stage.follow);
        }

        const summary = {
            ok: true,
            artifactDir,
            companionExe,
            scratchExe,
            companionDebugPort,
            scratchDebugPort: launchedScratchProcess?.debugPort ?? null,
            hasApiKey: Boolean(config.customAiApiKey),
            steps: timeline.length,
            screenshots: timeline.flatMap(item => [item.mainScreenshot, item.scratchScreenshot].filter(Boolean)),
            stages: Object.fromEntries(stages.map(stage => [
                stage.tag,
                timeline.filter(item => String(item.tag).includes(stage.tag)).map(item => ({
                    step: item.step,
                    tag: item.tag,
                    provider: item.coach?.aiProvider ?? null,
                    blocks: (item.coach?.recommendedBlocks || []).map(b => b.opcode),
                    answer: item.coach?.answerText ?? null
                }))
            ])),
            timeline
        };
        await writeFile(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

        const lines = [
            '# Chicken-Rabbit Formula Path Report',
            '',
            `- steps: ${summary.steps}`,
            `- screenshots: ${summary.screenshots.length}`,
            `- hasApiKey: ${summary.hasApiKey}`,
            '',
            '## Stages',
            '- A-start: heads/feet given',
            '- B-partial: rabbits=0 incomplete',
            '- C-ask: ask input then compute',
            '- D-near: subtract skeleton present',
            '- E-output: numbers ready, need output',
            ''
        ];
        for (const item of timeline) {
            const c = item.coach || {};
            const blocks = (c.recommendedBlocks || []).map(b => b.opcode).join(' -> ') || '(none)';
            lines.push(`## step ${item.step}: ${item.tag}`);
            lines.push(`- provider: ${c.aiProvider ?? 'null'}`);
            lines.push(`- blocks: ${blocks}`);
            lines.push(`- answer: ${(c.answerText || '').replace(/\\n/g, ' ')}`);
            if (item.mainScreenshot) lines.push(`- companion: ${path.basename(item.mainScreenshot)}`);
            if (item.scratchScreenshot) lines.push(`- scratch: ${path.basename(item.scratchScreenshot)}`);
            lines.push('');
        }
        await writeFile(path.join(artifactDir, 'REPORT.md'), lines.join('\n'), 'utf8');

        process.stdout.write(`${JSON.stringify({
            ok: true,
            artifactDir,
            steps: summary.steps,
            screenshotCount: summary.screenshots.length,
            stageCounts: Object.fromEntries(Object.entries(summary.stages).map(([k, v]) => [k, v.length]))
        }, null, 2)}\n`);
    } finally {
        if (!keepOpen) {
            if (scratchTarget) await closeScratchTarget(scratchTarget);
            if (child.pid) { try { process.kill(child.pid); } catch {} }
            if (launchedScratchProcess?.pid) { try { process.kill(Number(launchedScratchProcess.pid)); } catch {} }
            try { spawn('pkill', ['-f', 'Scratch 3'], {stdio: 'ignore'}); } catch {}
            try { spawn('pkill', ['-f', 'ScratchDesktopCompanion'], {stdio: 'ignore'}); } catch {}
        }
    }
}

process.on('uncaughtException', err => { console.error('uncaughtException', err); });
process.on('unhandledRejection', err => { console.error('unhandledRejection', err); });
await main().catch(async error => {
    const failure = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        artifactDir
    };
    try {
        await mkdir(artifactDir, {recursive: true});
        await writeFile(path.join(artifactDir, 'failure.json'), JSON.stringify(failure, null, 2), 'utf8');
    } catch {}
    console.error(error);
    process.exitCode = 1;
});
