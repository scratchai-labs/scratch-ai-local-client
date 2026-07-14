/**
 * 多项目学生模拟联调：
 * 真实打开伴随程序 + Scratch，像学生一样从不同题材作品起步，
 * 等待 DeepSeek 提示，再按推荐积木“对着做”，并逐步截图。
 *
 * 覆盖：
 * 1) motion-basic   运动基础
 * 2) chicken-rabbit 鸡兔同笼（变量/运算/说出口）
 * 3) cat-mouse      复杂完整游戏
 *
 * 用法：
 *   node tools/verification/scripts/verify-student-sim-multi-project.mjs
 *   node tools/verification/scripts/verify-student-sim-multi-project.mjs --follow-steps=3 --timeout-ms=120000
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
const companionDebugPort = Number(argv.get('--port') ?? '9371');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '120000');
const maxFollowSteps = Number(argv.get('--follow-steps') ?? '3');
const keepOpen = argv.get('--keep-open') === 'true';
const complexProjectFile =
    argv.get('--complex-project') ??
    path.join(verificationRoot, 'fixtures', 'projects', 'cat-and-a-mouse', 'source', 'Cat and a Mouse.sb3');

const artifactDir =
    argv.get('--artifact-dir') ??
    path.join(process.cwd(), 'student-sim-multi-project-screenshots');

const userDataDir =
    argv.get('--user-data-dir') ??
    path.join(verificationRoot, 'tmp-student-sim-multi-project-userdata');

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
        try {
            baseConfig = JSON.parse(await readFile(source, 'utf8'));
            break;
        } catch {}
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
        // 学生课堂更像“做完一小步再点生成”，这里用 manual 更贴近“对着做”
        // 但为了自动联调效率，仍默认 auto，并在每步后主动点生成
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
        } catch {
            return null;
        }
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
                aiModel: lastState.aiModel,
                currentTargetName: lastState.currentTargetName,
                programs: lastState.currentTargetPrograms,
                answerText: lastState.aiCoachResponse?.answerText,
                nextStep: lastState.aiCoachResponse?.nextStep,
                recommendedBlocks: (lastState.aiCoachResponse?.recommendedBlocks ?? []).map(b => b.opcode),
                aiError: lastState.aiError,
                error: lastState.error
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
  const disabledBefore = button.disabled;
  button.click();
  return { ok: true, disabledBefore, disabledImmediately: button.disabled };
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
      if (existingEntry) {
        ids[name] = existingEntry[0];
      } else {
        const id = makeId("var-" + name);
        stage.variables[id] = [name, 0];
        ids[name] = id;
      }
    }
    return { stage, ids };
  }
`;
}

function buildLoadProjectExpression(projectFilePath, projectFileBase64) {
    return `
(async () => {
${findVmHelpersSource()}
  function decodeBase64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  const vm = findVm();
  if (!vm || typeof vm.loadProject !== "function") return JSON.stringify({ ok: false, error: "vm-not-found" });
  const ready = await waitFor(() => Boolean(vm.runtime && Array.isArray(vm.runtime.targets)), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "runtime-not-ready" });
  if (typeof vm.stopAll === "function") vm.stopAll();
  await vm.loadProject(decodeBase64ToArrayBuffer(${JSON.stringify(projectFileBase64)}));
  await sleep(1000);
  const sprite = getSpriteTarget(vm);
  if (sprite && typeof vm.setEditingTarget === "function" && sprite.id) vm.setEditingTarget(sprite.id);
  notifyCapture(${JSON.stringify(`load:${projectFilePath}`)});
  const project = (() => { try { return vm.toJSON(); } catch { return null; } })();
  return JSON.stringify({
    ok: true,
    loadedProjectFile: ${JSON.stringify(projectFilePath)},
    currentTargetName: vm.editingTarget?.sprite?.name ?? null,
    projectTargetCount: Array.isArray(project?.targets) ? project.targets.length : 0,
    projectTargetNames: Array.isArray(project?.targets) ? project.targets.map(t => String(t?.name ?? "")) : []
  });
})()
    `.trim();
}

function buildSeedProjectExpression(seedName) {
    // seedName: motion-basic | chicken-rabbit-start | chicken-rabbit-partial
    return `
(async () => {
${findVmHelpersSource()}
  const seedName = ${JSON.stringify(seedName)};
  const vm = findVm();
  if (!vm || !vm.runtime || typeof vm.toJSON !== "function" || typeof vm.loadProject !== "function") {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "project-not-ready" });

  const project = cloneProject(vm.toJSON());
  const sprite = project.targets.find(t => !t.isStage) || project.targets[0];
  if (!sprite) return JSON.stringify({ ok: false, error: "sprite-missing" });

  // reset sprite scripts
  sprite.blocks = {};
  sprite.x = 0;
  sprite.y = 0;
  sprite.direction = 90;
  sprite.visible = true;

  if (seedName === "motion-basic") {
    const flagId = makeId("flag");
    sprite.blocks = {
      [flagId]: {
        opcode: "event_whenflagclicked",
        next: null,
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 100,
        y: 100
      }
    };
  } else if (seedName === "chicken-rabbit-start") {
    // Student just started 鸡兔同笼: only green flag + known totals as comments via variables set
    const { ids } = ensureStageVariables(project, ["heads", "feet", "chickens", "rabbits"]);
    const flagId = makeId("flag");
    const setHeadsId = makeId("set-heads");
    const headsValId = makeId("heads-val");
    const setFeetId = makeId("set-feet");
    const feetValId = makeId("feet-val");
    sprite.blocks = {
      [flagId]: {
        opcode: "event_whenflagclicked",
        next: setHeadsId,
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 80,
        y: 80
      },
      [setHeadsId]: {
        opcode: "data_setvariableto",
        next: setFeetId,
        parent: flagId,
        inputs: { VALUE: [1, [10, "35"]] },
        fields: { VARIABLE: ["heads", ids.heads] },
        shadow: false,
        topLevel: false
      },
      [setFeetId]: {
        opcode: "data_setvariableto",
        next: null,
        parent: setHeadsId,
        inputs: { VALUE: [1, [10, "94"]] },
        fields: { VARIABLE: ["feet", ids.feet] },
        shadow: false,
        topLevel: false
      }
    };
  } else if (seedName === "chicken-rabbit-partial") {
    // Student already set totals and started formula for rabbits = (feet - 2*heads)/2 incomplete
    const { ids } = ensureStageVariables(project, ["heads", "feet", "chickens", "rabbits"]);
    const flagId = makeId("flag");
    const setHeadsId = makeId("set-heads");
    const setFeetId = makeId("set-feet");
    const setRabbitsId = makeId("set-rabbits");
    // VALUE left as plain "0" to look incomplete; AI should suggest operators
    sprite.blocks = {
      [flagId]: {
        opcode: "event_whenflagclicked",
        next: setHeadsId,
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 70,
        y: 70
      },
      [setHeadsId]: {
        opcode: "data_setvariableto",
        next: setFeetId,
        parent: flagId,
        inputs: { VALUE: [1, [10, "35"]] },
        fields: { VARIABLE: ["heads", ids.heads] },
        shadow: false,
        topLevel: false
      },
      [setFeetId]: {
        opcode: "data_setvariableto",
        next: setRabbitsId,
        parent: setHeadsId,
        inputs: { VALUE: [1, [10, "94"]] },
        fields: { VARIABLE: ["feet", ids.feet] },
        shadow: false,
        topLevel: false
      },
      [setRabbitsId]: {
        opcode: "data_setvariableto",
        next: null,
        parent: setFeetId,
        inputs: { VALUE: [1, [10, "0"]] },
        fields: { VARIABLE: ["rabbits", ids.rabbits] },
        shadow: false,
        topLevel: false
      }
    };
  } else {
    return JSON.stringify({ ok: false, error: "unknown-seed", seedName });
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
  notifyCapture("seed:" + seedName);
  const runtimeOpcodes = runtimeSprite?.blocks?._blocks
    ? Object.values(runtimeSprite.blocks._blocks).map(b => b.opcode)
    : [];
  return JSON.stringify({
    ok: runtimeOpcodes.length > 0,
    seedName,
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
    if (opcode === "event_whenkeypressed") return { KEY_OPTION: ["space", null] };
    if (opcode === "control_stop") return { STOP_OPTION: ["all", null] };
    if (opcode === "data_setvariableto" || opcode === "data_changevariableby" || opcode === "data_showvariable" || opcode === "data_hidevariable") {
      const name = varIds.rabbits ? "rabbits" : "score";
      const id = varIds[name] || varIds.score || "variable-id";
      return { VARIABLE: [name, id] };
    }
    return {};
  }
  function defaultInputsForOpcode(opcode) {
    const number = (name, value) => ({ [name]: [1, [4, String(value)]] });
    const text = (name, value) => ({ [name]: [1, [10, String(value)]] });
    const positive = (name, value) => ({ [name]: [1, [5, String(value)]] });
    const angle = (name, value) => ({ [name]: [1, [8, String(value)]] });
    switch (opcode) {
      case "motion_movesteps": return number("STEPS", 10);
      case "motion_turnright":
      case "motion_turnleft": return angle("DEGREES", 15);
      case "motion_gotoxy": return { X: [1, [4, "0"]], Y: [1, [4, "0"]] };
      case "looks_say":
      case "looks_think": return text("MESSAGE", "Hello");
      case "looks_sayforsecs":
      case "looks_thinkforsecs": return { MESSAGE: [1, [10, "Hello"]], SECS: [1, [4, "2"]] };
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
      case "sensing_touchingobject": return { TOUCHINGOBJECTMENU: [1, ["_edge_", null]] };
      default: return {};
    }
  }

  const hatOpcodes = new Set([
    "event_whenflagclicked","event_whenkeypressed","event_whenthisspriteclicked",
    "event_whenbackdropswitchesto","event_whengreaterthan","event_whenbroadcastreceived","control_start_as_clone"
  ]);
  const containerOpcodes = new Set([
    "control_forever","control_repeat","control_if","control_if_else","control_repeat_until"
  ]);

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

  // ensure common vars for math projects
  const { ids: varIds } = ensureStageVariables(project, ["heads", "feet", "chickens", "rabbits", "score"]);

  const existing = sprite.blocks && typeof sprite.blocks === "object" ? sprite.blocks : {};
  const topIds = Object.keys(existing).filter(id => existing[id] && existing[id].topLevel === true && existing[id].shadow !== true);
  let bestTop = null;
  let bestLen = -1;
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
      if (block.shadow !== true && typeof block.opcode === "string") keptOpcodes.push(block.opcode);
      if (block.next) cursor = block.next;
      else if (block.inputs && Array.isArray(block.inputs.SUBSTACK) && typeof block.inputs.SUBSTACK[1] === "string") cursor = block.inputs.SUBSTACK[1];
      else cursor = null;
    }
  }

  let working = keptOpcodes.concat(opcodes);
  working = working.filter((op, i) => i === 0 || op !== working[i - 1]);
  if (!working.length || !hatOpcodes.has(working[0])) {
    working = ["event_whenflagclicked", ...working.filter(op => !hatOpcodes.has(op))];
  } else {
    working = [working[0], ...working.slice(1).filter(op => !hatOpcodes.has(op))];
  }

  // If recommended includes pure reporter ops only, attach as setvariable value chain fallback:
  // we still place them linearly; Scratch may not execute reporters alone, but coaching visibility is enough.
  const blocks = {};
  const createdIds = [];
  let previousId = null;
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
    if (isTop) { record.x = 100; record.y = 100; }
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
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) vm.setEditingTarget(runtimeSprite.id);
  await sleep(900);
  notifyCapture(${JSON.stringify(label || 'apply-recommended')});
  const runtimeOpcodes = runtimeSprite?.blocks?._blocks ? Object.values(runtimeSprite.blocks._blocks).map(b => b.opcode) : [];
  return JSON.stringify({
    ok: Boolean(loaded && runtimeOpcodes.length > 0),
    error: loaded ? (runtimeOpcodes.length > 0 ? null : "blocks-empty-after-load") : "project-load-timeout",
    appliedOpcodes: opcodes,
    rebuiltOpcodes: working,
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
        recommendationRootOpcode: response?.recommendation?.root?.opcode ?? null,
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

function pad(num) {
    return String(num).padStart(2, '0');
}

async function closeScratchTarget(target) {
    if (!target?.webSocketDebuggerUrl) return false;
    try {
        return await withTargetConnection(target, async connection => {
            await connection.send('Page.enable');
            await connection.send('Runtime.enable');
            await connection.send('Runtime.evaluate', {
                expression: `(() => { window.onbeforeunload = null; return true; })()`,
                awaitPromise: true,
                returnByValue: true,
                userGesture: true
            }).catch(() => {});
            await connection.send('Page.close').catch(() => {});
            return true;
        });
    } catch {
        return false;
    }
}

async function main() {
    await mkdir(artifactDir, {recursive: true});
    const {scratchExe, config} = await seedUserData();
    await ensureReadable(companionExe);
    await ensureReadable(complexProjectFile);

    console.log(JSON.stringify({
        phase: 'start',
        companionExe,
        scratchExe,
        artifactDir,
        userDataDir,
        hasApiKey: Boolean(config.customAiApiKey),
        aiHintTriggerMode: config.aiHintTriggerMode,
        projects: ['motion-basic', 'chicken-rabbit-start', 'chicken-rabbit-partial', 'cat-mouse']
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
            console.log(`  answer=${(entry.coach.answerText || '').slice(0, 140)}`);
            console.log(`  blocks=${(entry.coach.recommendedBlocks || []).map(b => b.opcode).join(' -> ') || '(none)'}`);
        }
        return entry;
    }

    async function refreshScratchTarget() {
        if (!launchedScratchProcess?.debugPort) return scratchTarget;
        const result = await waitForTargets(
            launchedScratchProcess.debugPort,
            pickScratchTarget,
            'scratch target missing'
        );
        scratchTarget = result.preferredTarget;
        return scratchTarget;
    }

    async function studentFollowLoop(mainTarget, projectTag, maxSteps) {
        let coachState = await readMainState(mainTarget);
        for (let follow = 1; follow <= maxSteps; follow += 1) {
            const beforeUpdatedAt = coachState.aiLastUpdatedAt ?? null;
            const recommended = coachState.aiCoachResponse?.recommendedBlocks ?? [];
            if (!recommended.length) {
                timeline.push({
                    step: ++stepCounter,
                    tag: `${projectTag}-no-more-blocks-${follow}`,
                    note: 'AI returned no recommended blocks',
                    coach: summarizeCoach(coachState)
                });
                break;
            }

            await refreshScratchTarget();
            const applyResult = await evaluateExpressionInTarget(
                scratchTarget,
                buildApplyRecommendedBlocksExpression(recommended, `${projectTag}-follow-${follow}`)
            );
            const applyValue = applyResult.ok
                ? (typeof applyResult.value === 'string' ? JSON.parse(applyResult.value) : applyResult.value)
                : {ok: false, error: applyResult.error};

            if (!applyValue?.ok) {
                await shot(mainTarget, scratchTarget, `${projectTag}-apply-failed-${follow}`, {
                    applied: applyValue,
                    recommended
                });
                break;
            }

            await sleep(1200);
            await shot(mainTarget, scratchTarget, `${projectTag}-applied-${follow}`, {
                applied: applyValue,
                note: `student applied: ${(applyValue.appliedOpcodes || []).join(' -> ')}`
            });

            try {
                coachState = await forceGenerate(mainTarget, {
                    minUpdatedAt: beforeUpdatedAt,
                    errorMessage: `${projectTag} follow ${follow}: AI missing`,
                    timeoutMs: 90000
                });
                await shot(mainTarget, scratchTarget, `${projectTag}-follow-${follow}`, {
                    applied: applyValue
                });
            } catch (error) {
                await shot(mainTarget, scratchTarget, `${projectTag}-follow-timeout-${follow}`, {
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

        // ========== Project 1: motion-basic ==========
        {
            console.log('seeding motion-basic...');
            const seed = await evaluateExpressionInTarget(scratchTarget, buildSeedProjectExpression('motion-basic'));
            console.log('motion seed raw', JSON.stringify(seed).slice(0, 500));
            let seedValue;
            try {
                seedValue = seed.ok ? (typeof seed.value === 'string' ? JSON.parse(seed.value) : seed.value) : {ok: false, error: seed.error};
            } catch (error) {
                seedValue = {ok: false, error: `parse-failed:${error instanceof Error ? error.message : String(error)}`, raw: seed};
            }
            assert(seedValue?.ok, `motion seed failed: ${JSON.stringify(seedValue)}`);
            await waitForMainState(mainTarget, s => s.status === 'connected' && Array.isArray(s.currentTargetPrograms) && s.currentTargetPrograms.length > 0, 'motion seed not synced');
            const coach = await forceGenerate(mainTarget, {errorMessage: 'motion AI missing'});
            await shot(mainTarget, scratchTarget, 'P1-motion-after-seed', {seed: seedValue, note: 'Project1 motion: only green flag'});
            await studentFollowLoop(mainTarget, 'P1-motion', maxFollowSteps);
        }

        // ========== Project 2: chicken-rabbit start ==========
        {
            await refreshScratchTarget();
            const seed = await evaluateExpressionInTarget(scratchTarget, buildSeedProjectExpression('chicken-rabbit-start'));
            const seedValue = seed.ok ? (typeof seed.value === 'string' ? JSON.parse(seed.value) : seed.value) : {ok: false, error: seed.error};
            if (!seedValue?.ok) {
                await shot(mainTarget, scratchTarget, 'P2-chicken-seed-failed', {seed: seedValue});
            } else {
                await waitForMainState(mainTarget, s => s.status === 'connected' && Array.isArray(s.currentTargetPrograms) && s.currentTargetPrograms.length > 0, 'chicken seed not synced');
                await forceGenerate(mainTarget, {errorMessage: 'chicken AI missing'});
                await shot(mainTarget, scratchTarget, 'P2-chicken-after-seed', {
                    seed: seedValue,
                    note: 'Project2 chicken-rabbit: set heads=35 feet=94, wait formula hint'
                });
                await studentFollowLoop(mainTarget, 'P2-chicken', maxFollowSteps);
            }
        }

        // ========== Project 3: chicken-rabbit partial ==========
        {
            await refreshScratchTarget();
            const seed = await evaluateExpressionInTarget(scratchTarget, buildSeedProjectExpression('chicken-rabbit-partial'));
            const seedValue = seed.ok ? (typeof seed.value === 'string' ? JSON.parse(seed.value) : seed.value) : {ok: false, error: seed.error};
            if (!seedValue?.ok) {
                await shot(mainTarget, scratchTarget, 'P3-chicken-partial-seed-failed', {seed: seedValue});
            } else {
                await waitForMainState(mainTarget, s => s.status === 'connected' && Array.isArray(s.currentTargetPrograms) && s.currentTargetPrograms.length > 0, 'chicken partial not synced');
                await forceGenerate(mainTarget, {errorMessage: 'chicken partial AI missing'});
                await shot(mainTarget, scratchTarget, 'P3-chicken-partial-after-seed', {
                    seed: seedValue,
                    note: 'Project3 chicken-rabbit partial: rabbits still 0, need operators'
                });
                await studentFollowLoop(mainTarget, 'P3-chicken-partial', Math.max(2, maxFollowSteps - 1));
            }
        }

        // ========== Project 4: complex cat-mouse ==========
        {
            await refreshScratchTarget();
            const complexBase64 = (await readFile(complexProjectFile)).toString('base64');
            const load = await evaluateExpressionInTarget(
                scratchTarget,
                buildLoadProjectExpression(complexProjectFile, complexBase64)
            );
            const loadValue = load.ok ? (typeof load.value === 'string' ? JSON.parse(load.value) : load.value) : {ok: false, error: load.error};
            if (!loadValue?.ok) {
                await shot(mainTarget, scratchTarget, 'P4-complex-load-failed', {loaded: loadValue});
            } else {
                await waitForMainState(
                    mainTarget,
                    s => s.status === 'connected' && Array.isArray(s.currentTargetPrograms) && s.currentTargetPrograms.length > 0,
                    'complex not synced',
                    {timeoutMs: Math.max(timeoutMs, 90000)}
                );
                try {
                    await forceGenerate(mainTarget, {
                        errorMessage: 'complex AI missing',
                        timeoutMs: Math.max(timeoutMs, 120000)
                    });
                } catch (error) {
                    await shot(mainTarget, scratchTarget, 'P4-complex-ai-timeout', {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                await shot(mainTarget, scratchTarget, 'P4-complex-cat-mouse', {
                    loaded: loadValue,
                    note: 'Project4 complex complete game'
                });
                // 复杂项目只跟 1 步，避免破坏多角色结构太久
                await studentFollowLoop(mainTarget, 'P4-complex', 1);
            }
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
            projects: {
                motion: timeline.filter(i => String(i.tag).includes('P1-motion') || String(i.tag).includes('motion')),
                chicken: timeline.filter(i => String(i.tag).includes('P2-chicken') || String(i.tag).includes('P3-chicken')),
                complex: timeline.filter(i => String(i.tag).includes('P4-complex') || String(i.tag).includes('cat-mouse'))
            },
            timeline
        };
        await writeFile(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

        // markdown report
        const lines = [
            '# Student Sim Multi-Project Report',
            '',
            `- steps: ${summary.steps}`,
            `- screenshots: ${summary.screenshots.length}`,
            `- hasApiKey: ${summary.hasApiKey}`,
            '',
            '## Projects',
            '- P1 motion-basic',
            '- P2 chicken-rabbit-start (heads/feet given)',
            '- P3 chicken-rabbit-partial (formula incomplete)',
            '- P4 cat-and-mouse complex game',
            ''
        ];
        for (const item of timeline) {
            const c = item.coach || {};
            const blocks = (c.recommendedBlocks || []).map(b => b.opcode).join(' -> ') || '(none)';
            lines.push(`## step ${item.step}: ${item.tag}`);
            lines.push(`- provider: ${c.aiProvider ?? 'null'}`);
            lines.push(`- blocks: ${blocks}`);
            lines.push(`- answer: ${(c.answerText || '').replace(/\n/g, ' ')}`);
            if (item.mainScreenshot) lines.push(`- companion: \`${path.basename(item.mainScreenshot)}\``);
            if (item.scratchScreenshot) lines.push(`- scratch: \`${path.basename(item.scratchScreenshot)}\``);
            lines.push('');
        }
        await writeFile(path.join(artifactDir, 'REPORT.md'), lines.join('\n'), 'utf8');

        process.stdout.write(`${JSON.stringify({
            ok: true,
            artifactDir,
            steps: summary.steps,
            screenshotCount: summary.screenshots.length,
            motionSteps: summary.projects.motion.length,
            chickenSteps: summary.projects.chicken.length,
            complexSteps: summary.projects.complex.length
        }, null, 2)}\n`);
    } finally {
        if (!keepOpen) {
            if (scratchTarget) await closeScratchTarget(scratchTarget);
            if (child.pid) { try { process.kill(child.pid); } catch {} }
            if (launchedScratchProcess?.pid) { try { process.kill(Number(launchedScratchProcess.pid)); } catch {} }
            try { spawn('pkill', ['-f', 'Scratch 3'], {stdio: 'ignore'}); } catch {}
            try { spawn('pkill', ['-f', 'ScratchDesktopCompanion'], {stdio: 'ignore'}); } catch {}
        } else {
            console.log('keep-open=true');
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
