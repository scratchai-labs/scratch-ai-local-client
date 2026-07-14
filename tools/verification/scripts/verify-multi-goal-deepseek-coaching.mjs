/**
 * 多目标 DeepSeek 真实辅导测试：
 * 真实打开教练程序 -> 真实点击打开 Scratch -> 输入 5 种本课目标 ->
 * 按 DeepSeek 提示跟做一轮，并截图/记录效果。
 *
 * 覆盖：
 * 1) 小游戏：接苹果小游戏
 * 2) 算法：1+100 用重复执行求和
 * 3) 绘制图形：画正方形
 * 4) 动画故事：自我介绍动画
 * 5) 交互数学：输入数字算平方
 *
 * 用法：
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --packaged=false --follow-steps=1
 */
import {access, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {findDefaultAutomationScratchExecutablePath, parseLatestScratchLaunchInfo} from './automation-platform.mjs';
import {getDefaultElectronBinaryPath, getDefaultPackagedCompanionBinaryPath} from './electron-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const verificationRoot = path.join(workspaceRoot, 'tools', 'verification');

const argv = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.split('=');
        return [key, rest.join('=') || 'true'];
    })
);

const usePackaged = argv.get('--packaged') !== 'false';
const companionExe =
    argv.get('--companion-exe') ??
    (usePackaged ? getDefaultPackagedCompanionBinaryPath(workspaceRoot) : getDefaultElectronBinaryPath(workspaceRoot));
const companionCwd =
    argv.get('--companion-cwd') ??
    (usePackaged ? path.dirname(companionExe) : path.join(workspaceRoot, 'apps', 'desktop-companion'));
const companionArgs = usePackaged
    ? []
    : [path.join(workspaceRoot, 'apps', 'desktop-companion', 'dist', 'main.js')];
const requestedScratchExe = argv.get('--scratch-exe') ?? null;
const companionDebugPort = Number(argv.get('--port') ?? '9407');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '150000');
const maxFollowSteps = Number(argv.get('--follow-steps') ?? '1');
const keepOpen = argv.get('--keep-open') === 'true';

const artifactDir =
    argv.get('--artifact-dir') ??
    path.join(process.cwd(), 'multi-goal-deepseek-screenshots');
const userDataDir =
    argv.get('--user-data-dir') ??
    path.join(verificationRoot, 'tmp-multi-goal-deepseek-userdata');

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
        aiHintTriggerMode: 'manual'
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
    let lastError = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        try {
            await withTargetConnection(target, async connection => {
                await connection.send('Page.enable');
                await connection.send('Runtime.enable');
                await connection.send('Runtime.evaluate', {
                    expression: `(() => { try { window.focus(); } catch {} return true; })()`,
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                }).catch(() => {});
                const response = await connection.send('Page.captureScreenshot', {
                    format: 'png',
                    fromSurface: true,
                    captureBeyondViewport: true
                });
                assert(typeof response.data === 'string' && response.data.length > 0, `Screenshot empty: ${outputPath}`);
                await writeFile(outputPath, Buffer.from(response.data, 'base64'));
            });
            return;
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (!/0 width|0 height|screenshot/i.test(message) || attempt === 6) throw error;
            await sleep(800 * attempt);
        }
    }
    throw lastError ?? new Error(`Screenshot failed: ${outputPath}`);
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
                lessonGoal: lastState.lessonGoal,
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
    return await withTargetConnection(target, async connection => {
        await connection.send('Runtime.enable');
        const targetInfo = await connection.send('Runtime.evaluate', {
            expression: `
(() => {
  const button = document.querySelector(${JSON.stringify(selector)});
  if (!(button instanceof HTMLButtonElement)) return { ok: false, error: "button-not-found" };
  button.scrollIntoView({ block: "center", inline: "center" });
  const rect = button.getBoundingClientRect();
  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    disabledBefore: button.disabled
  };
})()
            `.trim(),
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        const value = targetInfo.result?.value ?? {};
        if (!value.ok) throw new Error(value.error ?? `Failed to locate ${selector}.`);
        await connection.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: value.x, y: value.y, button: 'none'});
        await connection.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: value.x, y: value.y, button: 'left', clickCount: 1});
        await connection.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: value.x, y: value.y, button: 'left', clickCount: 1});
        await sleep(80);
        const after = await connection.send('Runtime.evaluate', {
            expression: `
(() => {
  const button = document.querySelector(${JSON.stringify(selector)});
  if (!(button instanceof HTMLButtonElement)) return { ok: false, error: "button-not-found-after-click" };
  return { ok: true, disabledImmediately: button.disabled };
})()
            `.trim(),
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        return after.result?.value ?? {ok: true};
    });
}

async function typeLessonGoal(target, goalText) {
    return await withTargetConnection(target, async connection => {
        await connection.send('Runtime.enable');
        const targetInfo = await connection.send('Runtime.evaluate', {
            expression: `
(() => {
  const input = document.querySelector('#lesson-goal-input');
  if (!(input instanceof HTMLInputElement)) return { ok: false, error: "lesson-goal-input-missing" };
  input.scrollIntoView({ block: "center", inline: "center" });
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (descriptor && typeof descriptor.set === "function") descriptor.set.call(input, "");
  else input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const rect = input.getBoundingClientRect();
  return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()
            `.trim(),
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        const value = targetInfo.result?.value ?? {};
        if (!value.ok) throw new Error(value.error ?? 'Failed to locate lesson goal input.');
        await connection.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: value.x, y: value.y, button: 'none'});
        await connection.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: value.x, y: value.y, button: 'left', clickCount: 1});
        await connection.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: value.x, y: value.y, button: 'left', clickCount: 1});
        await connection.send('Input.insertText', {text: goalText});
        const after = await connection.send('Runtime.evaluate', {
            expression: `
(async () => {
  const input = document.querySelector('#lesson-goal-input');
  if (!(input instanceof HTMLInputElement)) return { ok: false, error: "lesson-goal-input-missing-after-type" };
  const expected = ${JSON.stringify(goalText)};
  let usedDomFallback = false;
  if (input.value !== expected) {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (descriptor && typeof descriptor.set === "function") descriptor.set.call(input, expected);
    else input.value = expected;
    usedDomFallback = true;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.blur();
  if (window.desktopCompanionApi && typeof window.desktopCompanionApi.saveLessonGoal === "function") {
    await window.desktopCompanionApi.saveLessonGoal(input.value);
  }
  return { ok: true, value: input.value, usedDomFallback, placeholder: input.placeholder || "" };
})()
            `.trim(),
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        return after.result?.value ?? {};
    });
}

async function readLayoutMetrics(target) {
    const result = await evaluateExpressionInTarget(target, `
(() => {
  const rectOf = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const buttonRects = Array.from(document.querySelectorAll('.action-row .button')).map(button => {
    const rect = button.getBoundingClientRect();
    return { text: button.textContent.trim(), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    actionPanel: rectOf('.action-panel'),
    actionHeading: rectOf('.action-heading'),
    actionRow: rectOf('.action-row'),
    lessonGoalRow: rectOf('.lesson-goal-row'),
    lessonGoalInput: rectOf('#lesson-goal-input'),
    lessonGoalValue: document.querySelector('#lesson-goal-input')?.value || '',
    buttonRects
  };
})()
    `.trim());
    return result.ok ? result.value : {error: result.error};
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
  function getStageTarget(project) {
    return project.targets.find(t => t.isStage) || project.targets[0];
  }
  function collectStageVariables(project) {
    const stage = getStageTarget(project);
    if (!stage.variables || typeof stage.variables !== "object") stage.variables = {};
    const ids = {};
    for (const [id, value] of Object.entries(stage.variables)) {
      if (Array.isArray(value) && typeof value[0] === "string") ids[value[0]] = id;
    }
    return { stage, ids };
  }
  function ensureStageVariables(project, names) {
    const { stage, ids } = collectStageVariables(project);
    for (const name of names) {
      if (!ids[name]) {
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
`;
}

function buildSeedExpression(seedName) {
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
  sprite.blocks = {};
  sprite.x = 0;
  sprite.y = 0;
  sprite.direction = 90;
  sprite.visible = true;
  const stage = project.targets.find(t => t.isStage) || project.targets[0];
  if (stage) stage.variables = {};
  if (!Array.isArray(project.extensions)) project.extensions = [];

  const flagId = makeId("flag");

  if (seedName === "apple-game") {
    const { ids } = ensureStageVariables(project, ["score"]);
    const setScoreId = makeId("set-score");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setScoreId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setScoreId]: { opcode: "data_setvariableto", next: null, parent: flagId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("score", ids) }, shadow: false, topLevel: false }
    };
  } else if (seedName === "sum-100") {
    const { ids } = ensureStageVariables(project, ["sum", "i"]);
    const setSumId = makeId("set-sum");
    const setIId = makeId("set-i");
    const repeatId = makeId("repeat");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setSumId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setSumId]: { opcode: "data_setvariableto", next: setIId, parent: flagId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("sum", ids) }, shadow: false, topLevel: false },
      [setIId]: { opcode: "data_setvariableto", next: repeatId, parent: setSumId, inputs: { VALUE: [1, [10, "1"]] }, fields: { VARIABLE: varField("i", ids) }, shadow: false, topLevel: false },
      [repeatId]: { opcode: "control_repeat", next: null, parent: setIId, inputs: { TIMES: [1, [6, "100"]], SUBSTACK: [1, null] }, fields: {}, shadow: false, topLevel: false }
    };
  } else if (seedName === "draw-square") {
    if (!project.extensions.includes("pen")) project.extensions.push("pen");
    const clearId = makeId("pen-clear");
    const downId = makeId("pen-down");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: clearId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [clearId]: { opcode: "pen_clear", next: downId, parent: flagId, inputs: {}, fields: {}, shadow: false, topLevel: false },
      [downId]: { opcode: "pen_penDown", next: null, parent: clearId, inputs: {}, fields: {}, shadow: false, topLevel: false }
    };
  } else if (seedName === "story-intro") {
    const sayId = makeId("say");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: sayId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [sayId]: { opcode: "looks_sayforsecs", next: null, parent: flagId, inputs: { MESSAGE: [1, [10, "大家好，我是小猫"]], SECS: [1, [4, "2"]] }, fields: {}, shadow: false, topLevel: false }
    };
  } else if (seedName === "square-number") {
    const { ids } = ensureStageVariables(project, ["number", "result"]);
    const askId = makeId("ask-number");
    const setNumberId = makeId("set-number");
    const answerId = makeId("answer");
    const setResultId = makeId("set-result");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: askId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [askId]: { opcode: "sensing_askandwait", next: setNumberId, parent: flagId, inputs: { QUESTION: [1, [10, "请输入一个数"]] }, fields: {}, shadow: false, topLevel: false },
      [setNumberId]: { opcode: "data_setvariableto", next: setResultId, parent: askId, inputs: { VALUE: [3, answerId, [10, "0"]] }, fields: { VARIABLE: varField("number", ids) }, shadow: false, topLevel: false },
      [answerId]: { opcode: "sensing_answer", next: null, parent: setNumberId, inputs: {}, fields: {}, shadow: false, topLevel: false },
      [setResultId]: { opcode: "data_setvariableto", next: null, parent: setNumberId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("result", ids) }, shadow: false, topLevel: false }
    };
  } else {
    return JSON.stringify({ ok: false, error: "unknown-seed", seedName });
  }

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
  await sleep(1000);
  notifyCapture("seed:" + seedName);
  const runtimeOpcodes = runtimeSprite?.blocks?._blocks ? Object.values(runtimeSprite.blocks._blocks).map(b => b.opcode) : [];
  const rawProject = (() => { try { return vm.toJSON(); } catch { return null; } })();
  return JSON.stringify({
    ok: Boolean(loaded && runtimeOpcodes.length > 0),
    error: loaded ? (runtimeOpcodes.length > 0 ? null : "blocks-empty-after-load") : "project-load-timeout",
    seedName,
    currentTargetName: runtimeSprite?.sprite?.name ?? null,
    runtimeBlockCount: runtimeOpcodes.length,
    runtimeOpcodes,
    projectExtensions: Array.isArray(rawProject?.extensions) ? rawProject.extensions : []
  });
})()
    `.trim();
}

function buildApplyRecommendedBlocksExpression(recommendedBlocks, label) {
    return `
(async () => {
${findVmHelpersSource()}
  function defaultFieldsForOpcode(opcode, varIds) {
    if (opcode === "event_whenkeypressed") return { KEY_OPTION: ["right arrow", null] };
    if (opcode === "control_stop") return { STOP_OPTION: ["all", null] };
    if (opcode === "looks_gotofrontback") return { FRONT_BACK: ["front", null] };
    if (opcode === "looks_goforwardbackwardlayers") return { FORWARD_BACKWARD: ["forward", null] };
    if (opcode === "looks_changeeffectby" || opcode === "looks_seteffectto") return { EFFECT: ["COLOR", null] };
    if (opcode === "data_setvariableto" || opcode === "data_changevariableby" || opcode === "data_showvariable" || opcode === "data_hidevariable") {
      const prefer = ["sum", "result", "score", "i", "number"];
      for (const name of prefer) {
        if (varIds[name]) return { VARIABLE: [name, varIds[name]] };
      }
      const first = Object.entries(varIds)[0] || ["score", "variable-id"];
      return { VARIABLE: [first[0], first[1]] };
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
      case "motion_turnleft": return angle("DEGREES", 90);
      case "motion_gotoxy": return { X: [1, [4, "0"]], Y: [1, [4, "0"]] };
      case "motion_glidesecstoxy": return { SECS: [1, [4, "1"]], X: [1, [4, "0"]], Y: [1, [4, "0"]] };
      case "motion_pointindirection": return angle("DIRECTION", 90);
      case "motion_changexby": return number("DX", 10);
      case "motion_setx": return number("X", 0);
      case "motion_changeyby": return number("DY", 10);
      case "motion_sety": return number("Y", 0);
      case "looks_say":
      case "looks_think": return text("MESSAGE", "结果");
      case "looks_sayforsecs":
      case "looks_thinkforsecs": return { MESSAGE: [1, [10, "结果"]], SECS: [1, [4, "2"]] };
      case "looks_changesizeby": return number("CHANGE", 10);
      case "looks_setsizeto": return number("SIZE", 100);
      case "looks_changeeffectby": return number("CHANGE", 25);
      case "looks_seteffectto": return number("VALUE", 0);
      case "sound_changeeffectby": return number("VALUE", 10);
      case "sound_seteffectto": return number("VALUE", 0);
      case "sound_changevolumeby": return number("VOLUME", -10);
      case "sound_setvolumeto": return number("VOLUME", 100);
      case "control_wait": return positive("DURATION", 1);
      case "control_repeat": return { TIMES: [1, [6, "4"]] };
      case "control_repeat_until":
      case "control_if":
      case "control_if_else": return { CONDITION: [1, [10, ""]] };
      case "data_setvariableto": return { VALUE: [1, [10, "0"]] };
      case "data_changevariableby": return { VALUE: [1, [4, "1"]] };
      case "data_addtolist": return { ITEM: [1, [10, "项目"]] };
      case "data_deleteoflist": return { INDEX: [1, [7, "1"]] };
      case "data_insertatlist": return { INDEX: [1, [7, "1"]], ITEM: [1, [10, "项目"]] };
      case "data_replaceitemoflist": return { INDEX: [1, [7, "1"]], ITEM: [1, [10, "项目"]] };
      case "operator_add":
      case "operator_subtract":
      case "operator_multiply":
      case "operator_divide":
      case "operator_mod":
        return { NUM1: [1, [4, "2"]], NUM2: [1, [4, "2"]] };
      case "operator_join": return { STRING1: [1, [10, "结果是"]], STRING2: [1, [10, "0"]] };
      case "sensing_askandwait": return text("QUESTION", "请输入一个数");
      case "sensing_touchingobject": return { TOUCHINGOBJECTMENU: [1, ["_edge_", null]] };
      case "sensing_keypressed": return { KEY_OPTION: [1, ["right arrow", null]] };
      case "sensing_distanceto": return { DISTANCETOMENU: [1, ["_mouse_", null]] };
      case "pen_setPenColorToColor": return { COLOR: [1, [9, "#ff4d6a"]] };
      case "pen_changePenSizeBy": return number("SIZE", 1);
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
    "sensing_answer","sensing_timer","sensing_keypressed","sensing_touchingobject","sensing_mousedown","sensing_distanceto",
    "data_variable","data_itemoflist","data_itemnumoflist","data_lengthoflist","data_listcontainsitem"
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
  const { ids: varIds } = collectStageVariables(project);

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
      if (block.shadow !== true && typeof block.opcode === "string" && !reporterOpcodes.has(block.opcode)) {
        keptOpcodes.push(block.opcode);
      }
      if (block.next) cursor = block.next;
      else if (block.inputs && Array.isArray(block.inputs.SUBSTACK) && typeof block.inputs.SUBSTACK[1] === "string") cursor = block.inputs.SUBSTACK[1];
      else cursor = null;
    }
  }

  const stackableRecommended = opcodes.filter(op => !reporterOpcodes.has(op));
  const reporterRecommended = opcodes.filter(op => reporterOpcodes.has(op));
  let working = keptOpcodes.concat(stackableRecommended);
  working = working.filter((op, i) => i === 0 || op !== working[i - 1]);
  if (!working.length || !hatOpcodes.has(working[0])) {
    working = ["event_whenflagclicked", ...working.filter(op => !hatOpcodes.has(op))];
  } else {
    working = [working[0], ...working.slice(1).filter(op => !hatOpcodes.has(op))];
  }
  if (reporterRecommended.length > 0 && !working.includes("data_setvariableto")) {
    working.push("data_setvariableto");
  }
  if (working.some(op => op.startsWith("data_")) && Object.keys(varIds).length === 0) {
    Object.assign(varIds, ensureStageVariables(project, ["result"]).ids);
  }

  const blocks = {};
  const createdIds = [];
  let previousId = null;
  let lastSetVarId = null;
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
    blocks[id] = record;
    if (previousId) {
      const prev = blocks[previousId];
      if (containerOpcodes.has(prev.opcode) && !(prev.inputs && Array.isArray(prev.inputs.SUBSTACK) && prev.inputs.SUBSTACK[1])) {
        prev.inputs = { ...(prev.inputs || {}), SUBSTACK: [2, id] };
        record.parent = previousId;
      } else {
        prev.next = id;
        record.parent = previousId;
      }
    }
    if (opcode === "data_setvariableto") lastSetVarId = id;
    previousId = id;
  }

  if (reporterRecommended.length > 0) {
    const op = reporterRecommended[0];
    const opId = makeId(op.replace(/[^a-z0-9_]/gi, "_"));
    blocks[opId] = {
      opcode: op,
      next: null,
      parent: lastSetVarId,
      inputs: defaultInputsForOpcode(op),
      fields: defaultFieldsForOpcode(op, varIds),
      shadow: false,
      topLevel: false
    };
    createdIds.push(opId);
    if (lastSetVarId && blocks[lastSetVarId]) {
      blocks[lastSetVarId].inputs = {
        ...(blocks[lastSetVarId].inputs || {}),
        VALUE: [3, opId, [4, "0"]]
      };
    }
  }

  sprite.blocks = blocks;
  if (!Array.isArray(project.extensions)) project.extensions = [];
  if (opcodes.some(op => op.startsWith("pen_")) && !project.extensions.includes("pen")) {
    project.extensions.push("pen");
  }
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
  await sleep(1000);
  notifyCapture(${JSON.stringify(label || 'apply-recommended')});
  const runtimeOpcodes = runtimeSprite?.blocks?._blocks ? Object.values(runtimeSprite.blocks._blocks).map(b => b.opcode) : [];
  return JSON.stringify({
    ok: Boolean(loaded && runtimeOpcodes.length > 0),
    error: loaded ? (runtimeOpcodes.length > 0 ? null : "blocks-empty-after-load") : "project-load-timeout",
    appliedOpcodes: opcodes,
    rebuiltOpcodes: working,
    reporterRecommended,
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
        lessonGoal: state?.lessonGoal ?? null,
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

const goalCases = [
    {
        id: 'G1-game',
        kind: '小游戏',
        seed: 'apple-game',
        goal: '做一个接苹果小游戏：左右键控制角色，接到苹果加分',
        expectedOpcodes: ['event_whenkeypressed', 'motion_changexby', 'motion_movesteps', 'sensing_touchingobject', 'data_changevariableby', 'control_if', 'control_forever'],
        expectedKeywords: ['苹果', '左右', '按键', '接到', '加分', '得分'],
        disallowedOpcodes: ['operator_multiply', 'operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '平方', '求和']
    },
    {
        id: 'G2-sum',
        kind: '算法',
        seed: 'sum-100',
        goal: '1+100 用重复执行求和，并说出结果',
        expectedOpcodes: ['control_repeat', 'data_changevariableby', 'data_setvariableto', 'operator_add', 'looks_say', 'looks_sayforsecs'],
        expectedKeywords: ['100', '重复', '求和', 'sum', '累加', '说出'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'motion_ifonedgebounce', 'looks_nextcostume', 'sensing_askandwait'],
        driftKeywords: ['苹果', '鸡兔', '反弹', '移动']
    },
    {
        id: 'G3-draw',
        kind: '绘制图形',
        seed: 'draw-square',
        goal: '用画笔和重复执行画一个正方形',
        expectedOpcodes: ['pen_clear', 'pen_penDown', 'control_repeat', 'motion_movesteps', 'motion_turnright', 'pen_penUp'],
        expectedKeywords: ['画笔', '正方形', '重复', '移动', '转'],
        disallowedOpcodes: ['operator_multiply', 'sensing_askandwait', 'data_changevariableby'],
        driftKeywords: ['鸡兔', '平方', '苹果']
    },
    {
        id: 'G4-story',
        kind: '动画故事',
        seed: 'story-intro',
        goal: '做一个角色自我介绍动画：点击绿旗后说话、移动、切换造型',
        expectedOpcodes: ['looks_say', 'looks_sayforsecs', 'motion_movesteps', 'looks_nextcostume', 'control_wait'],
        expectedKeywords: ['自我介绍', '说', '移动', '造型', '动画'],
        disallowedOpcodes: ['operator_multiply', 'operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '平方']
    },
    {
        id: 'G5-square-number',
        kind: '交互数学',
        seed: 'square-number',
        goal: '输入一个数，计算它的平方并说出来',
        expectedOpcodes: ['sensing_askandwait', 'sensing_answer', 'operator_multiply', 'data_setvariableto', 'looks_say', 'looks_sayforsecs', 'operator_join'],
        expectedKeywords: ['输入', '平方', '乘', '结果', '说'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'motion_ifonedgebounce', 'looks_nextcostume', 'pen_clear'],
        driftKeywords: ['苹果', '鸡兔', '反弹']
    }
];

function evaluateCaseResult(testCase, entries) {
    const coachEntries = entries
        .filter(entry => !String(entry.tag).endsWith('goal-typed'))
        .map(entry => entry.coach)
        .filter(Boolean);
    const allText = coachEntries.map(coach => coach.answerText || '').join('\n');
    const allOpcodes = coachEntries.flatMap(coach => (coach.recommendedBlocks || []).map(block => block.opcode));
    const expectedOpcodeHits = testCase.expectedOpcodes.filter(opcode => allOpcodes.includes(opcode));
    const keywordHits = testCase.expectedKeywords.filter(keyword => allText.includes(keyword));
    const disallowedHits = testCase.disallowedOpcodes.filter(opcode => allOpcodes.includes(opcode));
    const driftHits = testCase.driftKeywords.filter(keyword => allText.includes(keyword));
    const deepseekCount = coachEntries.filter(coach => /deepseek/i.test(String(coach.aiProvider ?? ''))).length;
    const fallbackCount = coachEntries.filter(coach => coach.aiProvider && !/deepseek/i.test(String(coach.aiProvider))).length;
    const hasRecommendedBlocks = allOpcodes.length > 0;
    const goalMatched =
        keywordHits.length > 0 ||
        expectedOpcodeHits.length > 0 ||
        (testCase.kind === '算法' && /sum|求和|累加|重复/.test(allText));
    const drift = disallowedHits.length > 0 || driftHits.length > 0;
    return {
        id: testCase.id,
        kind: testCase.kind,
        goal: testCase.goal,
        deepseekCount,
        fallbackCount,
        hasRecommendedBlocks,
        expectedOpcodeHits,
        keywordHits,
        disallowedHits,
        driftHits,
        goalMatched,
        drift,
        rating: goalMatched && hasRecommendedBlocks && !drift ? 'good' : (goalMatched && !drift ? 'ok' : 'weak')
    };
}

async function main() {
    await mkdir(artifactDir, {recursive: true});
    const {scratchExe, config} = await seedUserData();
    await ensureReadable(companionExe);

    console.log(JSON.stringify({
        phase: 'start',
        usePackaged,
        companionExe,
        companionCwd,
        companionArgs,
        scratchExe,
        artifactDir,
        userDataDir,
        hasApiKey: Boolean(config.customAiApiKey),
        aiHintTriggerMode: config.aiHintTriggerMode,
        cases: goalCases.map(item => ({id: item.id, kind: item.kind, goal: item.goal}))
    }, null, 2));

    const child = spawn(companionExe, [...companionArgs, `--remote-debugging-port=${companionDebugPort}`], {
        cwd: companionCwd,
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
        const layout = await readLayoutMetrics(mainTarget).catch(() => null);
        const entry = {
            step: stepCounter,
            tag,
            mainScreenshot: mainPath,
            scratchScreenshot: scratchTargetLocal ? scratchPath : null,
            coach: state ? summarizeCoach(state) : null,
            layout,
            ...extra
        };
        timeline.push(entry);
        await writeFile(path.join(artifactDir, 'timeline.json'), JSON.stringify({artifactDir, timeline}, null, 2), 'utf8');
        console.log(`[step ${stepCounter}] ${tag}`);
        if (entry.coach) {
            console.log(`  provider=${entry.coach.aiProvider} model=${entry.coach.aiModel}`);
            console.log(`  goal=${entry.coach.lessonGoal || '(empty)'}`);
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

    async function runGoalCase(mainTarget, testCase) {
        await refreshScratchTarget();
        const typedGoal = await typeLessonGoal(mainTarget, testCase.goal);
        await waitForMainState(
            mainTarget,
            state => (state.lessonGoal || '') === testCase.goal,
            `${testCase.id} lesson goal not saved`,
            {timeoutMs: 20000}
        );
        await sleep(600);
        await shot(mainTarget, scratchTarget, `${testCase.id}-goal-typed`, {
            caseId: testCase.id,
            kind: testCase.kind,
            expectedGoal: testCase.goal,
            typedGoal
        });

        const seed = await evaluateExpressionInTarget(scratchTarget, buildSeedExpression(testCase.seed));
        const seedValue = seed.ok
            ? (typeof seed.value === 'string' ? JSON.parse(seed.value) : seed.value)
            : {ok: false, error: seed.error};
        if (!seedValue?.ok) {
            await shot(mainTarget, scratchTarget, `${testCase.id}-seed-failed`, {
                caseId: testCase.id,
                kind: testCase.kind,
                seed: seedValue
            });
            return;
        }
        await waitForMainState(
            mainTarget,
            state => state.status === 'connected' && Array.isArray(state.currentTargetPrograms) && state.currentTargetPrograms.length > 0,
            `${testCase.id} seed not synced`,
            {timeoutMs: 45000}
        );
        await forceGenerate(mainTarget, {
            errorMessage: `${testCase.id} AI missing`,
            timeoutMs: Math.max(timeoutMs, 120000)
        }).catch(error => {
            console.error(`${testCase.id} initial AI error`, error);
        });
        await shot(mainTarget, scratchTarget, `${testCase.id}-after-seed`, {
            caseId: testCase.id,
            kind: testCase.kind,
            seed: seedValue
        });

        let coachState = await readMainState(mainTarget);
        for (let follow = 1; follow <= maxFollowSteps; follow += 1) {
            const recommended = coachState.aiCoachResponse?.recommendedBlocks ?? [];
            if (!recommended.length) {
                await shot(mainTarget, scratchTarget, `${testCase.id}-no-blocks-${follow}`, {
                    caseId: testCase.id,
                    kind: testCase.kind,
                    note: 'AI returned no recommended blocks'
                });
                break;
            }
            const beforeUpdatedAt = coachState.aiLastUpdatedAt ?? null;
            const applyResult = await evaluateExpressionInTarget(
                scratchTarget,
                buildApplyRecommendedBlocksExpression(recommended, `${testCase.id}-follow-${follow}`)
            );
            const applyValue = applyResult.ok
                ? (typeof applyResult.value === 'string' ? JSON.parse(applyResult.value) : applyResult.value)
                : {ok: false, error: applyResult.error};
            await sleep(1000);
            await shot(mainTarget, scratchTarget, `${testCase.id}-applied-${follow}`, {
                caseId: testCase.id,
                kind: testCase.kind,
                applied: applyValue
            });
            if (!applyValue?.ok) break;
            coachState = await forceGenerate(mainTarget, {
                minUpdatedAt: beforeUpdatedAt,
                errorMessage: `${testCase.id} follow ${follow}: AI missing`,
                timeoutMs: Math.max(timeoutMs, 120000)
            }).catch(async error => {
                await shot(mainTarget, scratchTarget, `${testCase.id}-follow-timeout-${follow}`, {
                    caseId: testCase.id,
                    kind: testCase.kind,
                    error: error instanceof Error ? error.message : String(error)
                });
                return await readMainState(mainTarget);
            });
            await shot(mainTarget, scratchTarget, `${testCase.id}-follow-${follow}`, {
                caseId: testCase.id,
                kind: testCase.kind,
                applied: applyValue
            });
        }
    }

    try {
        const companionTargetResult = await waitForTargets(companionDebugPort, pickCompanionTarget, 'companion page missing');
        const mainTarget = companionTargetResult.preferredTarget;
        await waitForMainState(mainTarget, s => typeof s.status === 'string' && Boolean(s.scratchExecutablePath), 'companion not ready');
        await sleep(1200);
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

        for (const testCase of goalCases) {
            console.log(`\n=== ${testCase.id} ${testCase.kind} ===`);
            await runGoalCase(mainTarget, testCase);
        }

        const caseEvaluations = goalCases.map(testCase => evaluateCaseResult(
            testCase,
            timeline.filter(entry => entry.caseId === testCase.id)
        ));
        const uiLayoutSamples = timeline
            .filter(entry => entry.layout?.lessonGoalInput)
            .map(entry => ({
                step: entry.step,
                tag: entry.tag,
                actionRow: entry.layout.actionRow,
                lessonGoalRow: entry.layout.lessonGoalRow,
                lessonGoalInput: entry.layout.lessonGoalInput,
                buttonRects: entry.layout.buttonRects
            }));
        const summary = {
            ok: true,
            artifactDir,
            usePackaged,
            companionExe,
            scratchExe,
            companionDebugPort,
            scratchDebugPort: launchedScratchProcess?.debugPort ?? null,
            hasApiKey: Boolean(config.customAiApiKey),
            steps: timeline.length,
            screenshots: timeline.flatMap(item => [item.mainScreenshot, item.scratchScreenshot].filter(Boolean)),
            caseEvaluations,
            uiLayoutSamples,
            timeline
        };
        await writeFile(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

        const lines = [
            '# Multi-Goal DeepSeek Coaching Report',
            '',
            `- usePackaged: ${summary.usePackaged}`,
            `- steps: ${summary.steps}`,
            `- screenshots: ${summary.screenshots.length}`,
            `- hasApiKey: ${summary.hasApiKey}`,
            '',
            '## Case Evaluation',
            '| 目标 | 类型 | 评价 | DeepSeek | Fallback | 命中积木 | 命中关键词 | 漂移 |',
            '| --- | --- | --- | ---: | ---: | --- | --- | --- |'
        ];
        for (const item of caseEvaluations) {
            lines.push(`| ${item.id} | ${item.kind} | ${item.rating} | ${item.deepseekCount} | ${item.fallbackCount} | ${item.expectedOpcodeHits.join(', ') || '-'} | ${item.keywordHits.join(', ') || '-'} | ${[...item.disallowedHits, ...item.driftHits].join(', ') || '-'} |`);
        }
        lines.push('', '## UI Layout Samples');
        for (const sample of uiLayoutSamples.slice(0, 8)) {
            lines.push(`- step ${sample.step} ${sample.tag}: input ${Math.round(sample.lessonGoalInput.width)}x${Math.round(sample.lessonGoalInput.height)}, action row ${Math.round(sample.actionRow.width)}x${Math.round(sample.actionRow.height)}`);
        }
        lines.push('', '## Timeline');
        for (const item of timeline) {
            const c = item.coach || {};
            const blocks = (c.recommendedBlocks || []).map(b => b.opcode).join(' -> ') || '(none)';
            lines.push(`### step ${item.step}: ${item.tag}`);
            lines.push(`- provider: ${c.aiProvider ?? 'null'}`);
            lines.push(`- goal: ${(c.lessonGoal || '').replace(/\n/g, ' ')}`);
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
            caseEvaluations: caseEvaluations.map(item => ({
                id: item.id,
                kind: item.kind,
                rating: item.rating,
                deepseekCount: item.deepseekCount,
                expectedOpcodeHits: item.expectedOpcodeHits,
                keywordHits: item.keywordHits,
                drift: item.drift
            }))
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
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
});
