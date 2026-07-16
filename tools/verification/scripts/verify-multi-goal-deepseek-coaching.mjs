/**
 * 多目标 DeepSeek 真实辅导测试：
 * 真实打开教练程序 -> 真实点击打开 Scratch -> 输入 10 种本课目标 ->
 * 按 DeepSeek 提示跟做一轮，并截图/记录效果。
 *
 * 覆盖：
 * 1) 小游戏：接苹果小游戏
 * 2) 小游戏：躲避陨石
 * 3) 算法：1+100 用重复执行求和
 * 4) 复杂数学：鸡兔同笼
 * 5) 复杂数学：三个数求平均数
 * 6) 复杂数学：5 的阶乘
 * 7) 交互数学：输入数字算平方
 * 8) 绘制图形：正方形
 * 9) 绘制图形：三角形
 * 10) 绘制图形：五边形
 *
 * 用法：
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --packaged=false --follow-steps=1
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --case-ids=G4-chicken-rabbit,G7-square-number,G10-draw-pentagon
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --goal-suite=variable-visibility
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --goal-suite=real-world-stability
 *   node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --goal-suite=render-completeness-50
 */
import {access, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {findDefaultAutomationScratchExecutablePath, parseLatestScratchLaunchInfo} from './automation-platform.mjs';
import {getDefaultElectronBinaryPath, getDefaultPackagedCompanionBinaryPath} from './electron-paths.mjs';
import {
    VARIABLE_VISIBILITY_GOAL_CASES,
    VARIABLE_VISIBILITY_SEED_SPECS
} from './multi-goal-variable-visibility-cases.mjs';
import {
    REAL_WORLD_STABILITY_GOAL_CASES,
    REAL_WORLD_STABILITY_SEED_SPECS
} from './multi-goal-real-world-stability-cases.mjs';
import {
    RENDER_COMPLETENESS_50_GOAL_CASES,
    RENDER_COMPLETENESS_50_SEED_SPECS
} from './multi-goal-render-completeness-50-cases.mjs';

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
const goalSuite = argv.get('--goal-suite') ?? 'default';
const failOnWeak = argv.get('--fail-on-weak') === 'true';
const failOnRenderIssue = argv.get('--fail-on-render') !== 'false';
const requestedCaseIds = new Set(
    (argv.get('--case-ids') ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
);

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

async function readRenderedRecommendationState(target) {
    const result = await evaluateExpressionInTarget(target, `
(() => {
  const container = document.querySelector('#ai-recommended-blocks');
  const hosts = Array.from(container?.querySelectorAll('.scratch-workspace-host') || []);
  return {
    itemCount: container ? container.children.length : 0,
    xmlList: hosts.map(host => host.dataset?.xml || ''),
    hostStateList: hosts.map(host => {
      const blocks = Array.from(host.querySelectorAll('.blocklyBlock'));
      return {
        className: host.className || '',
        xmlLength: (host.dataset?.xml || '').length,
        fallbackText: host.dataset?.fallbackText || '',
        blockCount: blocks.length,
        nonShadowBlockCount: blocks.filter(block => !block.classList.contains('blocklyShadow')).length,
        svgCount: host.querySelectorAll('svg').length,
        fallback: host.classList.contains('scratch-workspace-host-fallback'),
        degraded: host.classList.contains('scratch-workspace-host-degraded'),
        text: (host.textContent || '').trim()
      };
    }),
    blockTextList: hosts.map(host =>
      Array.from(host.querySelectorAll('.blocklyText'))
        .map(node => (node.textContent || '').trim())
        .filter(Boolean)
    ),
    fallbackTextList: hosts.map(host => host.dataset?.fallbackText || ''),
    visibleText: container ? (container.textContent || '').trim() : ''
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
  const additionalSeedSpecs = ${JSON.stringify({
    ...VARIABLE_VISIBILITY_SEED_SPECS,
    ...REAL_WORLD_STABILITY_SEED_SPECS,
    ...RENDER_COMPLETENESS_50_SEED_SPECS
  })};
  const additionalSeedSpec = additionalSeedSpecs[seedName];

  if (additionalSeedSpec) {
    const variableEntries = Object.entries(additionalSeedSpec.variables || {});
    const { ids } = ensureStageVariables(project, variableEntries.map(([name]) => name));
    for (const extension of additionalSeedSpec.extensions || []) {
      if (!project.extensions.includes(extension)) project.extensions.push(extension);
    }

    const blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 }
    };
    let previousId = flagId;
    function appendStackBlock(opcode, inputs = {}, fields = {}) {
      const id = makeId(opcode);
      blocks[previousId].next = id;
      blocks[id] = { opcode, next: null, parent: previousId, inputs, fields, shadow: false, topLevel: false };
      previousId = id;
      return id;
    }

    const askedVariable = additionalSeedSpec.ask?.variable || null;
    if (additionalSeedSpec.ask) {
      appendStackBlock("sensing_askandwait", { QUESTION: [1, [10, additionalSeedSpec.ask.question]] });
      const answerId = makeId("answer");
      const setAnswerId = appendStackBlock(
        "data_setvariableto",
        { VALUE: [3, answerId, [10, "0"]] },
        { VARIABLE: varField(askedVariable, ids) }
      );
      blocks[answerId] = { opcode: "sensing_answer", next: null, parent: setAnswerId, inputs: {}, fields: {}, shadow: false, topLevel: false };
    }

    for (const [name, value] of variableEntries) {
      if (name === askedVariable) continue;
      appendStackBlock(
        "data_setvariableto",
        { VALUE: [1, [10, String(value)]] },
        { VARIABLE: varField(name, ids) }
      );
    }

    for (const opcode of additionalSeedSpec.beforeTailOpcodes || []) {
      appendStackBlock(opcode);
    }

    if (additionalSeedSpec.tail?.opcode === "control_repeat") {
      const timesInput = additionalSeedSpec.tail.countVariable
        ? [3, [12, additionalSeedSpec.tail.countVariable, ids[additionalSeedSpec.tail.countVariable]], [6, "10"]]
        : [1, [6, String(additionalSeedSpec.tail.count || "10")]];
      appendStackBlock("control_repeat", { TIMES: timesInput, SUBSTACK: [1, null] });
    } else if (additionalSeedSpec.tail?.opcode === "control_forever") {
      appendStackBlock("control_forever", { SUBSTACK: [1, null] });
    }
    sprite.blocks = blocks;
  } else if (seedName === "apple-game") {
    const { ids } = ensureStageVariables(project, ["score"]);
    const setScoreId = makeId("set-score");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setScoreId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setScoreId]: { opcode: "data_setvariableto", next: null, parent: flagId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("score", ids) }, shadow: false, topLevel: false }
    };
  } else if (seedName === "avoid-meteor") {
    const { ids } = ensureStageVariables(project, ["score", "time"]);
    const setScoreId = makeId("set-score");
    const setTimeId = makeId("set-time");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setScoreId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setScoreId]: { opcode: "data_setvariableto", next: setTimeId, parent: flagId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("score", ids) }, shadow: false, topLevel: false },
      [setTimeId]: { opcode: "data_setvariableto", next: null, parent: setScoreId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("time", ids) }, shadow: false, topLevel: false }
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
  } else if (seedName === "chicken-rabbit") {
    const { ids } = ensureStageVariables(project, ["heads", "feet", "rabbits", "chickens"]);
    const setHeadsId = makeId("set-heads");
    const setFeetId = makeId("set-feet");
    const setRabbitsId = makeId("set-rabbits");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setHeadsId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setHeadsId]: { opcode: "data_setvariableto", next: setFeetId, parent: flagId, inputs: { VALUE: [1, [10, "35"]] }, fields: { VARIABLE: varField("heads", ids) }, shadow: false, topLevel: false },
      [setFeetId]: { opcode: "data_setvariableto", next: setRabbitsId, parent: setHeadsId, inputs: { VALUE: [1, [10, "94"]] }, fields: { VARIABLE: varField("feet", ids) }, shadow: false, topLevel: false },
      [setRabbitsId]: { opcode: "data_setvariableto", next: null, parent: setFeetId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("rabbits", ids) }, shadow: false, topLevel: false }
    };
  } else if (seedName === "average-three") {
    const { ids } = ensureStageVariables(project, ["a", "b", "c", "total", "average"]);
    const askAId = makeId("ask-a");
    const setAId = makeId("set-a");
    const answerId = makeId("answer");
    const setTotalId = makeId("set-total");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: askAId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [askAId]: { opcode: "sensing_askandwait", next: setAId, parent: flagId, inputs: { QUESTION: [1, [10, "请输入第一个数"]] }, fields: {}, shadow: false, topLevel: false },
      [setAId]: { opcode: "data_setvariableto", next: setTotalId, parent: askAId, inputs: { VALUE: [3, answerId, [10, "0"]] }, fields: { VARIABLE: varField("a", ids) }, shadow: false, topLevel: false },
      [answerId]: { opcode: "sensing_answer", next: null, parent: setAId, inputs: {}, fields: {}, shadow: false, topLevel: false },
      [setTotalId]: { opcode: "data_setvariableto", next: null, parent: setAId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: varField("total", ids) }, shadow: false, topLevel: false }
    };
  } else if (seedName === "factorial-5") {
    const { ids } = ensureStageVariables(project, ["product", "i"]);
    const setProductId = makeId("set-product");
    const setIId = makeId("set-i");
    const repeatId = makeId("repeat");
    sprite.blocks = {
      [flagId]: { opcode: "event_whenflagclicked", next: setProductId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 70, y: 70 },
      [setProductId]: { opcode: "data_setvariableto", next: setIId, parent: flagId, inputs: { VALUE: [1, [10, "1"]] }, fields: { VARIABLE: varField("product", ids) }, shadow: false, topLevel: false },
      [setIId]: { opcode: "data_setvariableto", next: repeatId, parent: setProductId, inputs: { VALUE: [1, [10, "1"]] }, fields: { VARIABLE: varField("i", ids) }, shadow: false, topLevel: false },
      [repeatId]: { opcode: "control_repeat", next: null, parent: setIId, inputs: { TIMES: [1, [6, "5"]], SUBSTACK: [1, null] }, fields: {}, shadow: false, topLevel: false }
    };
  } else if (seedName === "draw-square" || seedName === "draw-triangle" || seedName === "draw-pentagon") {
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
  const recommendations = (Array.isArray(${JSON.stringify(recommendedBlocks)}) ? ${JSON.stringify(recommendedBlocks)} : [])
    .filter(b => b && typeof b.opcode === "string");
  const opcodes = recommendations
    .map(b => (b && typeof b.opcode === "string" ? b.opcode : null))
    .filter(Boolean);
  const recommendationText = recommendations
    .map(b => [b.label, b.reason, b.example].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();

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
  function varPrimitive(name) { return [12, name, varIds[name]]; }
  async function loadProjectWithBlocks(newBlocks, semanticKind, rebuiltOpcodes) {
    sprite.blocks = newBlocks;
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
      semanticKind,
      appliedOpcodes: opcodes,
      rebuiltOpcodes,
      reporterRecommended: opcodes.filter(op => reporterOpcodes.has(op)),
      currentTargetName: runtimeSprite?.sprite?.name ?? null,
      runtimeBlockCount: runtimeOpcodes.length,
      runtimeOpcodes
    });
  }
  function buildSumProgramBlocks() {
    const flagId = makeId("flag");
    const setSumId = makeId("set-sum");
    const setIId = makeId("set-i");
    const repeatId = makeId("repeat");
    const changeSumId = makeId("change-sum");
    const changeIId = makeId("change-i");
    const sayId = makeId("say-sum");
    return {
      [flagId]: { opcode: "event_whenflagclicked", next: setSumId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 80, y: 80 },
      [setSumId]: { opcode: "data_setvariableto", next: setIId, parent: flagId, inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: ["sum", varIds.sum] }, shadow: false, topLevel: false },
      [setIId]: { opcode: "data_setvariableto", next: repeatId, parent: setSumId, inputs: { VALUE: [1, [10, "1"]] }, fields: { VARIABLE: ["i", varIds.i] }, shadow: false, topLevel: false },
      [repeatId]: { opcode: "control_repeat", next: sayId, parent: setIId, inputs: { TIMES: [1, [6, "100"]], SUBSTACK: [2, changeSumId] }, fields: {}, shadow: false, topLevel: false },
      [changeSumId]: { opcode: "data_changevariableby", next: changeIId, parent: repeatId, inputs: { VALUE: [3, varPrimitive("i"), [4, "1"]] }, fields: { VARIABLE: ["sum", varIds.sum] }, shadow: false, topLevel: false },
      [changeIId]: { opcode: "data_changevariableby", next: null, parent: changeSumId, inputs: { VALUE: [1, [4, "1"]] }, fields: { VARIABLE: ["i", varIds.i] }, shadow: false, topLevel: false },
      [sayId]: { opcode: "looks_sayforsecs", next: null, parent: repeatId, inputs: { MESSAGE: [3, varPrimitive("sum"), [10, ""]], SECS: [1, [4, "2"]] }, fields: {}, shadow: false, topLevel: false }
    };
  }
  function buildSquareProgramBlocks() {
    const flagId = makeId("flag");
    const askId = makeId("ask-number");
    const setNumberId = makeId("set-number");
    const answerId = makeId("answer");
    const setResultId = makeId("set-result");
    const multiplyId = makeId("multiply");
    const sayId = makeId("say-result");
    return {
      [flagId]: { opcode: "event_whenflagclicked", next: askId, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 80, y: 80 },
      [askId]: { opcode: "sensing_askandwait", next: setNumberId, parent: flagId, inputs: { QUESTION: [1, [10, "请输入一个数"]] }, fields: {}, shadow: false, topLevel: false },
      [setNumberId]: { opcode: "data_setvariableto", next: setResultId, parent: askId, inputs: { VALUE: [3, answerId, [10, "0"]] }, fields: { VARIABLE: ["number", varIds.number] }, shadow: false, topLevel: false },
      [answerId]: { opcode: "sensing_answer", next: null, parent: setNumberId, inputs: {}, fields: {}, shadow: false, topLevel: false },
      [setResultId]: { opcode: "data_setvariableto", next: sayId, parent: setNumberId, inputs: { VALUE: [3, multiplyId, [4, "0"]] }, fields: { VARIABLE: ["result", varIds.result] }, shadow: false, topLevel: false },
      [multiplyId]: { opcode: "operator_multiply", next: null, parent: setResultId, inputs: { NUM1: [3, varPrimitive("number"), [4, "0"]], NUM2: [3, varPrimitive("number"), [4, "0"]] }, fields: {}, shadow: false, topLevel: false },
      [sayId]: { opcode: "looks_sayforsecs", next: null, parent: setResultId, inputs: { MESSAGE: [3, varPrimitive("result"), [10, ""]], SECS: [1, [4, "2"]] }, fields: {}, shadow: false, topLevel: false }
    };
  }

  if (
    varIds.sum &&
    varIds.i &&
    opcodes.some(op => op === "data_changevariableby" || op === "looks_sayforsecs" || op === "looks_say") &&
    /sum|累加|求和|输出结果|说话内容|5050/.test(recommendationText)
  ) {
    return await loadProjectWithBlocks(
      buildSumProgramBlocks(),
      "math-sum-semantic",
      ["event_whenflagclicked", "data_setvariableto", "data_setvariableto", "control_repeat", "data_changevariableby", "data_changevariableby", "looks_sayforsecs"]
    );
  }

  if (
    varIds.number &&
    varIds.result &&
    opcodes.some(op => op === "data_setvariableto" || op === "operator_multiply" || op === "looks_sayforsecs" || op === "looks_say") &&
    /平方|result|number|计算结果|输出结果|说话内容/.test(recommendationText)
  ) {
    return await loadProjectWithBlocks(
      buildSquareProgramBlocks(),
      "math-square-semantic",
      ["event_whenflagclicked", "sensing_askandwait", "data_setvariableto", "data_setvariableto", "operator_multiply", "looks_sayforsecs"]
    );
  }

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

function buildRunProjectAndCaptureResultExpression(runtimeCheck) {
    return `
(async () => {
${findVmHelpersSource()}
  const expectedText = ${JSON.stringify(runtimeCheck?.expectedText ?? "")};
  const answerText = ${JSON.stringify(runtimeCheck?.answer ?? null)};
  const vm = findVm();
  if (!vm || !vm.runtime) {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(getSpriteTarget(vm)), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "project-not-ready" });

  function getBubbleText() {
    const target = getSpriteTarget(vm);
    if (!target || typeof target.getCustomState !== "function") return "";
    return String(target.getCustomState("Scratch.looks")?.text ?? "");
  }
  function collectVariables() {
    const rawProject = (() => { try { return vm.toJSON(); } catch { return null; } })();
    const values = {};
    for (const target of rawProject?.targets || []) {
      for (const variable of Object.values(target.variables || {})) {
        if (Array.isArray(variable) && typeof variable[0] === "string") {
          values[variable[0]] = variable[1];
        }
      }
    }
    return values;
  }

  if (typeof vm.stopAll === "function") vm.stopAll();
  await sleep(300);
  if (typeof vm.greenFlag === "function") vm.greenFlag();
  else if (typeof vm.runtime.greenFlag === "function") vm.runtime.greenFlag();

  if (answerText !== null && answerText !== undefined) {
    await waitFor(() => {
      const text = getBubbleText();
      return /请输入|输入|number|数/.test(text);
    }, 3000);
    vm.runtime.emit("ANSWER", String(answerText));
  }

  let lastBubbleText = "";
  let matched = false;
  for (let i = 0; i < 80; i += 1) {
    const bubbleText = getBubbleText();
    if (bubbleText) lastBubbleText = bubbleText;
    if (expectedText && bubbleText.includes(expectedText)) {
      matched = true;
      lastBubbleText = bubbleText;
      break;
    }
    await sleep(100);
  }

  const variables = collectVariables();
  notifyCapture("runtime-check:" + expectedText);
  return JSON.stringify({
    ok: expectedText ? matched : Boolean(lastBubbleText),
    expectedText,
    answerText,
    bubbleText: lastBubbleText,
    variables,
    matched
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

const defaultGoalCases = [
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
        id: 'G2-avoid-meteor',
        kind: '小游戏',
        seed: 'avoid-meteor',
        goal: '做一个躲避陨石小游戏：左右键控制角色，碰到陨石就结束，存活时间加分',
        expectedOpcodes: ['event_whenkeypressed', 'motion_changexby', 'sensing_touchingobject', 'control_if', 'control_forever', 'data_changevariableby', 'control_stop'],
        expectedKeywords: ['陨石', '左右', '碰到', '结束', '存活', '加分'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '平方', '求和']
    },
    {
        id: 'G3-sum',
        kind: '算法',
        seed: 'sum-100',
        goal: '1+100 用重复执行求和，并说出结果',
        expectedOpcodes: ['control_repeat', 'data_changevariableby', 'data_setvariableto', 'operator_add', 'looks_say', 'looks_sayforsecs'],
        expectedKeywords: ['100', '重复', '求和', 'sum', '累加', '说出'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'motion_ifonedgebounce', 'looks_nextcostume', 'sensing_askandwait'],
        driftKeywords: ['苹果', '鸡兔', '反弹', '移动'],
        displayChecks: [
            { type: 'repeat-count', value: '100', label: '重复执行 100 次' },
            { type: 'change-variable-by-variable', target: 'sum', source: 'i', label: 'sum 增加 i' },
            { type: 'say-variable', variable: 'sum', label: '说出 sum 变量' }
        ],
        runtimeCheck: { expectedText: '5050' }
    },
    {
        id: 'G4-chicken-rabbit',
        kind: '复杂数学',
        seed: 'chicken-rabbit',
        goal: '鸡兔同笼：一共有 35 个头、94 条腿，计算鸡和兔各有多少并说出来',
        expectedOpcodes: ['data_setvariableto', 'operator_subtract', 'operator_multiply', 'operator_divide', 'looks_say', 'looks_sayforsecs'],
        expectedKeywords: ['鸡', '兔', '35', '94', 'heads', 'feet', 'rabbits', 'chickens', '公式', '说'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'motion_ifonedgebounce', 'looks_nextcostume', 'pen_clear'],
        driftKeywords: ['苹果', '反弹', '动画']
    },
    {
        id: 'G5-average-three',
        kind: '复杂数学',
        seed: 'average-three',
        goal: '输入三个数，计算这三个数的平均数并说出来',
        expectedOpcodes: ['sensing_askandwait', 'sensing_answer', 'data_setvariableto', 'operator_add', 'operator_divide', 'looks_say', 'looks_sayforsecs'],
        expectedKeywords: ['三个数', '平均', '输入', '相加', '除以', 'average', '说'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'pen_clear'],
        driftKeywords: ['苹果', '鸡兔', '反弹', '正方形']
    },
    {
        id: 'G6-factorial',
        kind: '复杂数学',
        seed: 'factorial-5',
        goal: '用重复执行计算 5 的阶乘，也就是 1×2×3×4×5，并说出结果',
        expectedOpcodes: ['control_repeat', 'data_setvariableto', 'data_changevariableby', 'operator_multiply', 'looks_say', 'looks_sayforsecs'],
        expectedKeywords: ['5', '阶乘', '重复', 'product', 'i', '乘', '说'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'pen_clear'],
        driftKeywords: ['苹果', '鸡兔', '正方形'],
        displayChecks: [
            { type: 'repeat-count', value: '5', label: '重复执行 5 次' }
        ]
    },
    {
        id: 'G7-square-number',
        kind: '交互数学',
        seed: 'square-number',
        goal: '输入一个数，计算它的平方并说出来',
        expectedOpcodes: ['sensing_askandwait', 'sensing_answer', 'operator_multiply', 'data_setvariableto', 'looks_say', 'looks_sayforsecs', 'operator_join'],
        expectedKeywords: ['输入', '平方', '乘', '结果', '说'],
        disallowedOpcodes: ['motion_movesteps', 'motion_turnright', 'motion_ifonedgebounce', 'looks_nextcostume', 'pen_clear'],
        driftKeywords: ['苹果', '鸡兔', '反弹', '求和', '累加', 'sum'],
        displayChecks: [
            { type: 'square-result', label: 'result = number * number' },
            { type: 'say-variable', variable: 'result', label: '说出 result 变量' }
        ],
        runtimeCheck: { answer: '7', expectedText: '49' }
    },
    {
        id: 'G8-draw-square',
        kind: '绘制图形',
        seed: 'draw-square',
        goal: '用画笔和重复执行画一个正方形',
        expectedOpcodes: ['pen_clear', 'pen_penDown', 'control_repeat', 'motion_movesteps', 'motion_turnright', 'pen_penUp'],
        expectedKeywords: ['画笔', '正方形', '重复', '移动', '转', '90'],
        disallowedOpcodes: ['operator_multiply', 'sensing_askandwait', 'data_changevariableby'],
        driftKeywords: ['鸡兔', '平方', '苹果'],
        displayChecks: [
            { type: 'repeat-count', value: '4', label: '重复执行 4 次' },
            { type: 'turn-degrees', value: '90', label: '右转 90 度' }
        ]
    },
    {
        id: 'G9-draw-triangle',
        kind: '绘制图形',
        seed: 'draw-triangle',
        goal: '用画笔和重复执行画一个等边三角形',
        expectedOpcodes: ['pen_clear', 'pen_penDown', 'control_repeat', 'motion_movesteps', 'motion_turnright', 'pen_penUp'],
        expectedKeywords: ['画笔', '三角形', '重复', '移动', '转', '120'],
        disallowedOpcodes: ['operator_multiply', 'sensing_askandwait', 'data_changevariableby'],
        driftKeywords: ['鸡兔', '平方', '苹果'],
        displayChecks: [
            { type: 'repeat-count', value: '3', label: '重复执行 3 次' },
            { type: 'turn-degrees', value: '120', label: '右转 120 度' }
        ]
    },
    {
        id: 'G10-draw-pentagon',
        kind: '绘制图形',
        seed: 'draw-pentagon',
        goal: '用画笔和重复执行画一个五边形',
        expectedOpcodes: ['pen_clear', 'pen_penDown', 'control_repeat', 'motion_movesteps', 'motion_turnright', 'pen_penUp'],
        expectedKeywords: ['画笔', '五边形', '重复', '移动', '转', '72'],
        disallowedOpcodes: ['operator_multiply', 'sensing_askandwait', 'data_changevariableby'],
        driftKeywords: ['鸡兔', '平方', '苹果'],
        displayChecks: [
            { type: 'repeat-count', value: '5', label: '重复执行 5 次' },
            { type: 'turn-degrees', value: '72', label: '右转 72 度' }
        ]
    }
];

const goalCases = goalSuite === 'variable-visibility'
    ? VARIABLE_VISIBILITY_GOAL_CASES
    : goalSuite === 'real-world-stability'
        ? REAL_WORLD_STABILITY_GOAL_CASES
        : goalSuite === 'render-completeness-50'
            ? RENDER_COMPLETENESS_50_GOAL_CASES
            : defaultGoalCases;
assert(
    goalSuite === 'default' ||
        goalSuite === 'variable-visibility' ||
        goalSuite === 'real-world-stability' ||
        goalSuite === 'render-completeness-50',
    `未知 --goal-suite：${goalSuite}`
);
const activeGoalCases = requestedCaseIds.size > 0
    ? goalCases.filter(testCase => requestedCaseIds.has(testCase.id))
    : goalCases;
assert(activeGoalCases.length > 0, `没有找到 --case-ids 指定的目标：${[...requestedCaseIds].join(', ')}`);

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getEntryRecommendationXmlList(entry) {
    return Array.isArray(entry.renderedRecommendation?.xmlList)
        ? entry.renderedRecommendation.xmlList.filter(xml => typeof xml === 'string' && xml.length > 0)
        : [];
}
function getRenderedXmlList(entries) {
    return entries
        .filter(entry => !String(entry.tag).endsWith('goal-typed'))
        .flatMap(entry => getEntryRecommendationXmlList(entry));
}
function decodeXmlText(value) {
    return String(value)
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&amp;', '&');
}
function analyzeVariableVisibility(entries) {
    const issues = [];
    const visibleVariableNames = new Set();
    for (const entry of entries.filter(item => !String(item.tag).endsWith('goal-typed'))) {
        const xmlList = getEntryRecommendationXmlList(entry);
        const blockTextList = Array.isArray(entry.renderedRecommendation?.blockTextList)
            ? entry.renderedRecommendation.blockTextList
            : [];
        xmlList.forEach((xml, index) => {
            const expectedCounts = new Map();
            for (const match of xml.matchAll(/<field name="VARIABLE"[^>]*>([^<]+)<\/field>/g)) {
                const variableName = decodeXmlText(match[1]).trim();
                if (!variableName) continue;
                expectedCounts.set(variableName, (expectedCounts.get(variableName) ?? 0) + 1);
            }
            const renderedCounts = new Map();
            for (const text of blockTextList[index] ?? []) {
                const normalized = String(text).trim();
                if (!normalized) continue;
                renderedCounts.set(normalized, (renderedCounts.get(normalized) ?? 0) + 1);
            }
            for (const [variableName, expectedCount] of expectedCounts) {
                const renderedCount = renderedCounts.get(variableName) ?? 0;
                if (renderedCount > 0) visibleVariableNames.add(variableName);
                if (renderedCount < expectedCount) {
                    issues.push(`${entry.tag}: 变量 ${variableName} 应显示 ${expectedCount} 次，实际可见 ${renderedCount} 次`);
                }
            }
        });
    }
    return {
        ok: issues.length === 0,
        issues,
        visibleVariableNames: [...visibleVariableNames]
    };
}
function hasFieldValue(xml, value) {
    return new RegExp(`<field name="NUM">${escapeRegex(value)}<\\/field>`).test(xml);
}
function hasInputFieldValue(xml, inputName, value) {
    return new RegExp(
        `<value name="${escapeRegex(inputName)}">[\\s\\S]*?<field name="NUM">${escapeRegex(value)}<\\/field>`
    ).test(xml);
}
function hasVariableReporter(xml, variableName) {
    return new RegExp(
        `<block type="data_variable">[\\s\\S]*?<field name="VARIABLE"[^>]*>${escapeRegex(variableName)}<\\/field>`
    ).test(xml);
}
function analyzeDisplayChecks(testCase, entries) {
    const issues = [];
    const xmlList = getRenderedXmlList(entries);
    const combinedXml = xmlList.join('\n');
    for (const check of testCase.displayChecks ?? []) {
        if (check.type === 'repeat-count') {
            const repeatXmlList = xmlList.filter(xml => xml.includes('type="control_repeat"'));
            if (
                repeatXmlList.length > 0 &&
                !repeatXmlList.some(xml => hasInputFieldValue(xml, 'TIMES', check.value))
            ) {
                issues.push(`${check.label}: 推荐区重复次数显示不匹配`);
            }
        } else if (check.type === 'turn-degrees') {
            const turnXmlList = xmlList.filter(xml => xml.includes('type="motion_turnright"') || xml.includes('type="motion_turnleft"'));
            if (
                turnXmlList.length > 0 &&
                !turnXmlList.some(xml => hasInputFieldValue(xml, 'DEGREES', check.value))
            ) {
                issues.push(`${check.label}: 推荐区转角显示不匹配`);
            }
        } else if (check.type === 'change-variable-by-variable') {
            const pattern = new RegExp(
                `<field name="VARIABLE"[^>]*>${escapeRegex(check.target)}<\\/field>[\\s\\S]*?<value name="VALUE">\\s*<block type="data_variable">[\\s\\S]*?<field name="VARIABLE"[^>]*>${escapeRegex(check.source)}<\\/field>`
            );
            const changeXmlList = xmlList.filter(xml => xml.includes('type="data_changevariableby"'));
            if (changeXmlList.length > 0 && !changeXmlList.some(xml => pattern.test(xml))) {
                issues.push(`${check.label}: 推荐区变量增量 reporter 显示不匹配`);
            }
        } else if (check.type === 'say-variable') {
            const sayXmlList = xmlList.filter(xml => xml.includes('type="looks_say"') || xml.includes('type="looks_sayforsecs"'));
            if (
                sayXmlList.length > 0 &&
                !sayXmlList.some(xml => hasVariableReporter(xml, check.variable))
            ) {
                issues.push(`${check.label}: 推荐区说话内容不是变量 reporter`);
            }
        } else if (check.type === 'square-result') {
            if (
                combinedXml.includes('type="data_setvariableto"') &&
                combinedXml.includes('>result</field>') &&
                !combinedXml.includes('type="operator_multiply"')
            ) {
                issues.push(`${check.label}: 推荐区平方公式未显示为乘法积木`);
            }
        } else if (check.type === 'xml-opcode') {
            if (!combinedXml.includes(`type="${check.opcode}"`)) {
                issues.push(`${check.label}: 推荐区缺少 ${check.opcode} 积木`);
            }
        }
    }
    return issues;
}

function analyzeRenderCompleteness(entries) {
    const issues = [];
    let renderedHostCount = 0;
    let renderedNonShadowBlockCount = 0;
    let renderedXmlCount = 0;
    let recommendationEntryCount = 0;

    for (const entry of entries.filter(item => !String(item.tag).endsWith('goal-typed'))) {
        const recommendedBlocks = entry.coach?.recommendedBlocks ?? [];
        if (recommendedBlocks.length === 0) continue;
        recommendationEntryCount += 1;

        const rendered = entry.renderedRecommendation ?? {};
        if (rendered.error) {
            issues.push(`${entry.tag}: 推荐区 DOM 读取失败：${rendered.error}`);
            continue;
        }

        const hostStateList = Array.isArray(rendered.hostStateList) ? rendered.hostStateList : [];
        if (hostStateList.length === 0) {
            issues.push(`${entry.tag}: 有推荐积木但没有 scratch-workspace-host`);
            continue;
        }

        renderedHostCount += hostStateList.length;
        hostStateList.forEach((host, index) => {
            const label = `${entry.tag}#${index + 1}`;
            if (!host.xmlLength) issues.push(`${label}: 推荐 XML 为空`);
            else renderedXmlCount += 1;
            if (host.fallback) issues.push(`${label}: 进入文字 fallback`);
            if (host.degraded) issues.push(`${label}: 使用降级 fallback XML`);
            if (host.svgCount < 1) issues.push(`${label}: 未生成 Blockly SVG`);
            if (host.nonShadowBlockCount < 1) {
                issues.push(`${label}: 未生成可见非 shadow 积木`);
            } else {
                renderedNonShadowBlockCount += host.nonShadowBlockCount;
            }
            if (!String(host.text || '').trim()) issues.push(`${label}: Blockly 可见文字为空`);
        });
    }

    if (recommendationEntryCount === 0) {
        issues.push('没有任何步骤产生推荐积木，无法判断推荐渲染');
    }

    return {
        ok: issues.length === 0,
        issues,
        recommendationEntryCount,
        renderedHostCount,
        renderedXmlCount,
        renderedNonShadowBlockCount
    };
}

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
    const runtimeEntry = entries.find(entry => entry.runtimeCheck);
    const runtimeCheck = runtimeEntry?.runtimeCheck ?? null;
    const runtimeOk = testCase.runtimeCheck ? Boolean(runtimeCheck?.ok) : true;
    const displayIssues = analyzeDisplayChecks(testCase, entries);
    const displayOk = displayIssues.length === 0;
    const variableVisibility = analyzeVariableVisibility(entries);
    const expectedVariableHits = (testCase.expectedVariables ?? []).filter(variableName =>
        variableVisibility.visibleVariableNames.includes(variableName)
    );
    const hasExpectedVariableEvidence =
        !Array.isArray(testCase.expectedVariables) ||
        testCase.expectedVariables.length === 0 ||
        expectedVariableHits.length > 0;
    const renderCompleteness = analyzeRenderCompleteness(entries);
    const rating =
        goalMatched &&
        hasRecommendedBlocks &&
        !drift &&
        runtimeOk &&
        displayOk &&
        variableVisibility.ok &&
        hasExpectedVariableEvidence &&
        renderCompleteness.ok
            ? 'good'
            : (goalMatched && !drift && runtimeOk && displayOk && variableVisibility.ok && hasExpectedVariableEvidence && renderCompleteness.ok ? 'ok' : 'weak');
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
        runtimeCheck,
        runtimeOk,
        displayIssues,
        displayOk,
        variableVisibilityOk: variableVisibility.ok,
        variableVisibilityIssues: variableVisibility.issues,
        visibleVariableNames: variableVisibility.visibleVariableNames,
        expectedVariableHits,
        hasExpectedVariableEvidence,
        renderCompletenessOk: renderCompleteness.ok,
        renderCompletenessIssues: renderCompleteness.issues,
        renderedHostCount: renderCompleteness.renderedHostCount,
        renderedXmlCount: renderCompleteness.renderedXmlCount,
        renderedNonShadowBlockCount: renderCompleteness.renderedNonShadowBlockCount,
        rating
    };
}

async function main() {
    await mkdir(artifactDir, {recursive: true});
    const {scratchExe, config} = await seedUserData();
    await ensureReadable(companionExe);

    console.log(JSON.stringify({
        phase: 'start',
        goalSuite,
        failOnWeak,
        usePackaged,
        companionExe,
        companionCwd,
        companionArgs,
        scratchExe,
        artifactDir,
        userDataDir,
        hasApiKey: Boolean(config.customAiApiKey),
        aiHintTriggerMode: config.aiHintTriggerMode,
        cases: activeGoalCases.map(item => ({id: item.id, kind: item.kind, goal: item.goal}))
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
        const renderedRecommendation = await readRenderedRecommendationState(mainTarget).catch(error => ({
            error: error instanceof Error ? error.message : String(error)
        }));
        const entry = {
            step: stepCounter,
            tag,
            mainScreenshot: mainPath,
            scratchScreenshot: scratchTargetLocal ? scratchPath : null,
            coach: state ? summarizeCoach(state) : null,
            layout,
            renderedRecommendation,
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
        if (testCase.runtimeCheck) {
            const runtimeResult = await evaluateExpressionInTarget(
                scratchTarget,
                buildRunProjectAndCaptureResultExpression(testCase.runtimeCheck)
            );
            const runtimeValue = runtimeResult.ok
                ? (typeof runtimeResult.value === 'string' ? JSON.parse(runtimeResult.value) : runtimeResult.value)
                : {ok: false, error: runtimeResult.error};
            await shot(mainTarget, scratchTarget, `${testCase.id}-runtime-check`, {
                caseId: testCase.id,
                kind: testCase.kind,
                runtimeCheck: runtimeValue
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

        for (const testCase of activeGoalCases) {
            console.log(`\n=== ${testCase.id} ${testCase.kind} ===`);
            await runGoalCase(mainTarget, testCase);
        }

        const caseEvaluations = activeGoalCases.map(testCase => evaluateCaseResult(
            testCase,
            timeline.filter(entry => entry.caseId === testCase.id)
        ));
        const failedCaseEvaluations = caseEvaluations.filter(item => item.rating !== 'good');
        const renderFailedCaseEvaluations = caseEvaluations.filter(item =>
            !item.renderCompletenessOk || !item.variableVisibilityOk
        );
        const summaryOk = failOnWeak
            ? failedCaseEvaluations.length === 0
            : (!failOnRenderIssue || renderFailedCaseEvaluations.length === 0);
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
            ok: summaryOk,
            renderOk: renderFailedCaseEvaluations.length === 0,
            semanticOk: failedCaseEvaluations.length === 0,
            artifactDir,
            goalSuite,
            failOnWeak,
            failOnRenderIssue,
            usePackaged,
            companionExe,
            scratchExe,
            companionDebugPort,
            scratchDebugPort: launchedScratchProcess?.debugPort ?? null,
            hasApiKey: Boolean(config.customAiApiKey),
            steps: timeline.length,
            screenshots: timeline.flatMap(item => [item.mainScreenshot, item.scratchScreenshot].filter(Boolean)),
            caseEvaluations,
            failedCaseEvaluations,
            renderFailedCaseEvaluations,
            uiLayoutSamples,
            timeline
        };
        await writeFile(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

        const lines = [
            '# Multi-Goal DeepSeek Coaching Report',
            '',
            `- goalSuite: ${summary.goalSuite}`,
            `- usePackaged: ${summary.usePackaged}`,
            `- steps: ${summary.steps}`,
            `- screenshots: ${summary.screenshots.length}`,
            `- hasApiKey: ${summary.hasApiKey}`,
            `- renderOk: ${summary.renderOk}`,
            `- semanticOk: ${summary.semanticOk}`,
            `- failOnWeak: ${summary.failOnWeak}`,
            `- failOnRenderIssue: ${summary.failOnRenderIssue}`,
            `- renderFailedCases: ${renderFailedCaseEvaluations.length}`,
            `- weakCases: ${failedCaseEvaluations.length}`,
            '',
            '## Case Evaluation',
            '| 目标 | 类型 | 评价 | DeepSeek | Fallback | 渲染完整 | 运行输出 | 显示校验 | 变量可见 | 可见变量 | 命中积木 | 命中关键词 | 漂移 |',
            '| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |'
        ];
        for (const item of caseEvaluations) {
            const runtimeText = item.runtimeCheck
                ? `${item.runtimeCheck.ok ? 'pass' : 'fail'}: expected ${item.runtimeCheck.expectedText}, got ${item.runtimeCheck.bubbleText || '(empty)'}`
                : '-';
            const renderText = item.renderCompletenessOk
                ? `pass (${item.renderedHostCount} host / ${item.renderedNonShadowBlockCount} blocks)`
                : item.renderCompletenessIssues.join('; ');
            const displayText = item.displayOk ? 'pass' : item.displayIssues.join('; ');
            const variableText = item.variableVisibilityOk ? 'pass' : item.variableVisibilityIssues.join('; ');
            lines.push(`| ${item.id} | ${item.kind} | ${item.rating} | ${item.deepseekCount} | ${item.fallbackCount} | ${renderText} | ${runtimeText} | ${displayText} | ${variableText} | ${item.visibleVariableNames.join(', ') || '-'} | ${item.expectedOpcodeHits.join(', ') || '-'} | ${item.keywordHits.join(', ') || '-'} | ${[...item.disallowedHits, ...item.driftHits].join(', ') || '-'} |`);
        }
        if (failedCaseEvaluations.length > 0) {
            lines.push('', '## Weak Cases');
            for (const item of failedCaseEvaluations) {
                lines.push(`- ${item.id}: rating=${item.rating}; render=${item.renderCompletenessOk ? 'pass' : item.renderCompletenessIssues.join('; ') || 'fail'}; display=${item.displayOk ? 'pass' : item.displayIssues.join('; ') || 'fail'}; variables=${item.variableVisibilityOk ? 'pass' : item.variableVisibilityIssues.join('; ') || 'fail'}`);
            }
        }
        if (renderFailedCaseEvaluations.length > 0) {
            lines.push('', '## Render Failed Cases');
            for (const item of renderFailedCaseEvaluations) {
                lines.push(`- ${item.id}: render=${item.renderCompletenessOk ? 'pass' : item.renderCompletenessIssues.join('; ') || 'fail'}; variables=${item.variableVisibilityOk ? 'pass' : item.variableVisibilityIssues.join('; ') || 'fail'}`);
            }
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
            if (item.runtimeCheck) {
                lines.push(`- runtime: expected ${item.runtimeCheck.expectedText}, got ${item.runtimeCheck.bubbleText || '(empty)'}, ok=${item.runtimeCheck.ok}`);
            }
            if (item.mainScreenshot) lines.push(`- companion: \`${path.basename(item.mainScreenshot)}\``);
            if (item.scratchScreenshot) lines.push(`- scratch: \`${path.basename(item.scratchScreenshot)}\``);
            lines.push('');
        }
        await writeFile(path.join(artifactDir, 'REPORT.md'), lines.join('\n'), 'utf8');

        process.stdout.write(`${JSON.stringify({
            ok: summary.ok,
            renderOk: summary.renderOk,
            semanticOk: summary.semanticOk,
            artifactDir,
            steps: summary.steps,
            screenshotCount: summary.screenshots.length,
            renderFailedCaseCount: renderFailedCaseEvaluations.length,
            weakCaseCount: failedCaseEvaluations.length,
            caseEvaluations: caseEvaluations.map(item => ({
                id: item.id,
                kind: item.kind,
                rating: item.rating,
                deepseekCount: item.deepseekCount,
                expectedOpcodeHits: item.expectedOpcodeHits,
                keywordHits: item.keywordHits,
                drift: item.drift,
                displayOk: item.displayOk,
                displayIssues: item.displayIssues,
                variableVisibilityOk: item.variableVisibilityOk,
                variableVisibilityIssues: item.variableVisibilityIssues,
                renderCompletenessOk: item.renderCompletenessOk,
                renderCompletenessIssues: item.renderCompletenessIssues,
                renderedHostCount: item.renderedHostCount,
                renderedXmlCount: item.renderedXmlCount,
                renderedNonShadowBlockCount: item.renderedNonShadowBlockCount,
                visibleVariableNames: item.visibleVariableNames,
                expectedVariableHits: item.expectedVariableHits,
                runtimeCheck: item.runtimeCheck
            }))
        }, null, 2)}\n`);
        if (!summary.ok) {
            process.exitCode = 1;
        }
    } finally {
        if (!keepOpen) {
            if (scratchTarget) await closeScratchTarget(scratchTarget);
            if (child.pid) { try { process.kill(child.pid); } catch {} }
            if (launchedScratchProcess?.pid) { try { process.kill(Number(launchedScratchProcess.pid)); } catch {} }
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
