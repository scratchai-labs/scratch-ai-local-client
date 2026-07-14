/**
 * 多轮真实联调：启动桌面伴随程序 + Scratch，按 AI 推荐积木逐步搭建，
 * 每一步截图并记录提示内容，观察不同复杂度下辅导是否合理。
 *
 * 用法（仓库根目录）：
 *   node tools/verification/scripts/verify-progressive-click-coaching.mjs
 *   node tools/verification/scripts/verify-progressive-click-coaching.mjs --rounds=3 --timeout-ms=120000
 *
 * 截图默认写到当前工作目录（仓库根）下的 progressive-click-screenshots/。
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
const companionDebugPort = Number(argv.get('--port') ?? '9361');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '120000');
const maxFollowSteps = Number(argv.get('--follow-steps') ?? '4');
const keepOpen = argv.get('--keep-open') === 'true';
const complexProjectFile =
    argv.get('--complex-project') ??
    path.join(
        verificationRoot,
        'fixtures',
        'projects',
        'cat-and-a-mouse',
        'source',
        'Cat and a Mouse.sb3'
    );

const artifactDir =
    argv.get('--artifact-dir') ??
    path.join(process.cwd(), 'progressive-click-screenshots');

const userDataDir =
    argv.get('--user-data-dir') ??
    path.join(verificationRoot, 'tmp-progressive-click-userdata');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
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
        if (lastValue && !lastValue.__retryableError) {
            return lastValue;
        }
        await sleep(interval);
    }
    const suffix = lastValue ? ` Last: ${JSON.stringify(lastValue).slice(0, 1800)}` : '';
    const baseMessage = typeof options.errorMessage === 'function'
        ? options.errorMessage()
        : (options.errorMessage ?? `Timed out after ${timeout}ms.`);
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
        } catch {
            // try next
        }
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
        // 自动模式：作品有效变化后自动请求 AI
        aiHintTriggerMode: 'auto'
    };
    await writeFile(getConfigFilePath(userDataDir), JSON.stringify(config, null, 2), 'utf8');
    return {scratchExe, config};
}

async function getLogSize() {
    try {
        return (await readFile(getLogFilePath(userDataDir))).byteLength;
    } catch {
        return 0;
    }
}

async function readLogSince(offset) {
    try {
        return (await readFile(getLogFilePath(userDataDir))).subarray(offset).toString('utf8');
    } catch {
        return '';
    }
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
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(target => {
        const title = typeof target.title === 'string' ? target.title.trim() : '';
        const url = typeof target.url === 'string' ? target.url.toLowerCase() : '';
        return title.includes('Scratch AI 教练') || url.endsWith('/index.html') || url.includes('index.html');
    }) ?? inspectableTargets[0] ?? null;
}

function pickScratchTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(target =>
        typeof target.url === 'string' && target.url.toLowerCase().endsWith('/index.html')
    ) ?? inspectableTargets.find(target => {
        const normalizedUrl = typeof target.url === 'string' ? target.url.toLowerCase() : '';
        return normalizedUrl.includes('/index.html') &&
            !normalizedUrl.includes('?route=about') &&
            !normalizedUrl.includes('?route=privacy') &&
            !normalizedUrl.includes('?route=usb');
    }) ?? inspectableTargets[0] ?? null;
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
            const rawData = typeof event.data === 'string' ? event.data : String(event.data ?? '');
            if (!rawData) return;
            let message;
            try {
                message = JSON.parse(rawData);
            } catch {
                return;
            }
            if (typeof message.id !== 'number') return;
            const request = this.pending.get(message.id);
            if (!request) return;
            this.pending.delete(message.id);
            if (message.error?.message) {
                request.reject(new Error(message.error.message));
                return;
            }
            request.resolve(message.result ?? {});
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
        socket.addEventListener('open', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error('Failed to connect to websocket.'));
        });
    });
}

async function withTargetConnection(target, work) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitForWebSocketOpen(socket, timeoutMs);
    const connection = new CdpConnection(socket);
    try {
        return await work(connection);
    } finally {
        socket.close();
    }
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
            if (response.exceptionDetails?.text) {
                throw new Error(response.exceptionDetails.text);
            }
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

function buildMainUiSnapshotExpression() {
    return `
(() => ({
  title: document.title,
  status: document.querySelector("#status")?.textContent?.trim() ?? null,
  detail: document.querySelector("#detail")?.textContent?.trim() ?? null,
  currentTarget: document.querySelector("#current-target")?.textContent?.trim() ?? null,
  updatedAt: document.querySelector("#updated-at")?.textContent?.trim() ?? null,
  scratchPath: document.querySelector("#scratch-path")?.textContent?.trim() ?? null,
  aiSource: document.querySelector("#ai-source")?.textContent?.trim() ?? null,
  aiStatus: document.querySelector("#ai-status")?.textContent?.trim() ?? null,
  aiAnswer: document.querySelector("#ai-answer")?.textContent?.trim() ?? null,
  errorText: document.querySelector("#error")?.textContent?.trim() ?? null,
  buttons: {
    launch: document.querySelector("#launch-button") instanceof HTMLButtonElement
      ? document.querySelector("#launch-button").disabled
      : null,
    retry: document.querySelector("#retry-button") instanceof HTMLButtonElement
      ? document.querySelector("#retry-button").disabled
      : null,
    generateAi: document.querySelector("#generate-ai-button") instanceof HTMLButtonElement
      ? document.querySelector("#generate-ai-button").disabled
      : null
  },
  currentTargetPrograms: Array.from(document.querySelectorAll("#current-target-programs li:not(.empty)"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean),
  aiRecommendedBlocks: Array.from(document.querySelectorAll("#ai-recommended-blocks li:not(.empty)"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean),
  recommendedReasons: Array.from(document.querySelectorAll(".recommended-reason-list li, .recommended-reason-item"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean)
}))()
    `.trim();
}

async function readMainUiSnapshot(target) {
    const result = await evaluateExpressionInTarget(target, buildMainUiSnapshotExpression());
    if (!result.ok) throw new Error(result.error ?? 'Failed to read main UI snapshot.');
    return result.value ?? {};
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
            return {
                __retryableError: true,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }, {
        timeoutMs: options.timeoutMs ?? timeoutMs,
        intervalMs: options.intervalMs ?? 500,
        errorMessage: () => {
            const compact = lastState
                ? {
                    status: lastState.status,
                    aiStatus: lastState.aiStatus,
                    aiProvider: lastState.aiProvider,
                    aiModel: lastState.aiModel,
                    currentTargetName: lastState.currentTargetName,
                    programs: lastState.currentTargetPrograms,
                    answerText: lastState.aiCoachResponse?.answerText,
                    nextStep: lastState.aiCoachResponse?.nextStep,
                    recommendedBlocks: (lastState.aiCoachResponse?.recommendedBlocks ?? []).map(block => block.opcode),
                    aiError: lastState.aiError,
                    error: lastState.error
                }
                : null;
            return `${errorMessage} Last state: ${JSON.stringify(compact).slice(0, 2200)}`;
        }
    });
}

async function clickButton(target, selector) {
    const clickResult = await evaluateExpressionInTarget(
        target,
        `
(() => {
  const button = document.querySelector(${JSON.stringify(selector)});
  if (!(button instanceof HTMLButtonElement)) {
    return { ok: false, error: "button-not-found" };
  }
  const disabledBefore = button.disabled;
  button.click();
  return { ok: true, disabledBefore, disabledImmediately: button.disabled };
})()
        `.trim()
    );
    if (!clickResult.ok) throw new Error(clickResult.error ?? `Failed to click ${selector}.`);
    return clickResult.value ?? {};
}

function findVmHelpersSource() {
    return `
  function isVmLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.runtime &&
      Array.isArray(value.runtime.targets) &&
      typeof value.toJSON === "function"
    );
  }
  function findVmInFiberNode(node) {
    const queue = [node];
    const visited = new Set();
    while (queue.length > 0 && visited.size < 2500) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      const candidateProps = [
        current.memoizedProps,
        current.pendingProps,
        current.stateNode && current.stateNode.props
      ];
      for (const props of candidateProps) {
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
      try {
        if (isVmLike(window[key])) return window[key];
      } catch {}
    }
    const elements = Array.from(document.querySelectorAll("*"));
    for (const element of elements) {
      const reactKeys = Object.getOwnPropertyNames(element).filter(key =>
        key.startsWith("__reactFiber$") ||
        key.startsWith("__reactContainer$") ||
        key.startsWith("__reactInternalInstance$")
      );
      for (const reactKey of reactKeys) {
        const vm = findVmInFiberNode(element[reactKey]);
        if (vm) return vm;
      }
    }
    return null;
  }
  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }
  async function waitFor(check, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (check()) return true;
      } catch {}
      await sleep(200);
    }
    return false;
  }
  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }
  function getSpriteTarget(vm) {
    return (vm.runtime.targets || []).find(target => !target.isStage) || null;
  }
  function cloneProject(rawProject) {
    if (typeof rawProject === "string") return JSON.parse(rawProject);
    return JSON.parse(JSON.stringify(rawProject));
  }
  function notifyCapture(label) {
    if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
      window.__scratchDesktopCompanionCaptureNow(label);
    }
  }
`;
}

function buildApplyRecommendedBlocksExpression(recommendedBlocks, label) {
    return `
(async () => {
${findVmHelpersSource()}

  function defaultFieldsForOpcode(opcode) {
    if (opcode === "event_whenkeypressed") return { KEY_OPTION: ["space", null] };
    if (opcode === "event_whenbackdropswitchesto") return { BACKDROP: ["backdrop1", null] };
    if (opcode === "sound_play" || opcode === "sound_playuntildone") return { SOUND_MENU: ["Meow", null] };
    if (opcode === "looks_switchcostumeto") return { COSTUME: ["costume1", null] };
    if (opcode === "looks_switchbackdropto" || opcode === "looks_switchbackdroptoandwait") {
      return { BACKDROP: ["backdrop1", null] };
    }
    if (opcode === "control_stop") return { STOP_OPTION: ["all", null] };
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
      case "motion_pointindirection": return angle("DIRECTION", 90);
      case "motion_gotoxy": return { X: [1, [4, "0"]], Y: [1, [4, "0"]] };
      case "motion_glidesecstoxy": return { SECS: [1, [4, "1"]], X: [1, [4, "0"]], Y: [1, [4, "0"]] };
      case "motion_changexby": return number("DX", 10);
      case "motion_setx": return number("X", 0);
      case "motion_changeyby": return number("DY", 10);
      case "motion_sety": return number("Y", 0);
      case "looks_say":
      case "looks_think": return text("MESSAGE", "Hello");
      case "looks_sayforsecs":
      case "looks_thinkforsecs": return { MESSAGE: [1, [10, "Hello"]], SECS: [1, [4, "2"]] };
      case "looks_changesizeby": return number("CHANGE", 10);
      case "looks_setsizeto": return number("SIZE", 100);
      case "sound_changevolumeby": return number("VOLUME", -10);
      case "sound_setvolumeto": return number("VOLUME", 100);
      case "control_wait": return positive("DURATION", 1);
      case "control_repeat": return number("TIMES", 10);
      case "sensing_askandwait": return text("QUESTION", "What is your name?");
      case "sensing_touchingobject":
        return { TOUCHINGOBJECTMENU: [1, ["_edge_", null]] };
      default:
        return {};
    }
  }

  const hatOpcodes = new Set([
    "event_whenflagclicked",
    "event_whenkeypressed",
    "event_whenthisspriteclicked",
    "event_whenbackdropswitchesto",
    "event_whengreaterthan",
    "event_whenbroadcastreceived",
    "control_start_as_clone"
  ]);
  const containerOpcodes = new Set([
    "control_forever",
    "control_repeat",
    "control_if",
    "control_if_else",
    "control_repeat_until"
  ]);

  const opcodes = (Array.isArray(${JSON.stringify(recommendedBlocks)}) ? ${JSON.stringify(recommendedBlocks)} : [])
    .map(block => (block && typeof block.opcode === "string" ? block.opcode : null))
    .filter(Boolean);

  const vm = findVm();
  if (!vm || !vm.runtime || typeof vm.toJSON !== "function" || typeof vm.loadProject !== "function") {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }

  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) {
    return JSON.stringify({ ok: false, error: "project-not-ready" });
  }

  // Rebuild a clean project JSON: keep stage + sprite metadata, replace sprite scripts with
  // existing non-shadow stack opcodes + newly recommended opcodes as one progressive chain.
  const project = cloneProject(vm.toJSON());
  const sprite = project.targets.find(target => !target.isStage) || project.targets[0];
  if (!sprite) {
    return JSON.stringify({ ok: false, error: "sprite-missing" });
  }

  const existing = sprite.blocks && typeof sprite.blocks === "object" ? sprite.blocks : {};
  const existingOpcodes = [];
  const topIds = Object.keys(existing).filter(id => existing[id] && existing[id].topLevel === true && existing[id].shadow !== true);
  function walk(id, bag) {
    if (!id || !existing[id] || bag.has(id)) return;
    bag.add(id);
    const block = existing[id];
    if (block.shadow === true) return;
    if (typeof block.opcode === "string") existingOpcodes.push(block.opcode);
    if (block.next) walk(block.next, bag);
    if (block.inputs) {
      for (const value of Object.values(block.inputs)) {
        if (Array.isArray(value) && typeof value[1] === "string") walk(value[1], bag);
      }
    }
  }
  // Prefer the longest top-level chain.
  let bestTop = null;
  let bestLen = -1;
  for (const topId of topIds) {
    const bag = new Set();
    walk(topId, bag);
    if (bag.size > bestLen) {
      bestLen = bag.size;
      bestTop = topId;
    }
  }
  const keptOpcodes = [];
  if (bestTop) {
    const bag = new Set();
    // collect ordered main spine only (next chain + first substack) for simplicity
    let cursor = bestTop;
    const seen = new Set();
    while (cursor && existing[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      const block = existing[cursor];
      if (block.shadow !== true && typeof block.opcode === "string") {
        keptOpcodes.push(block.opcode);
      }
      // enter first available substack if present and no next
      const sub = block.inputs && (block.inputs.SUBSTACK || block.inputs.SUBSTACK2);
      if (block.next) {
        cursor = block.next;
      } else if (Array.isArray(sub) && typeof sub[1] === "string") {
        cursor = sub[1];
      } else {
        cursor = null;
      }
    }
  }

  let working = keptOpcodes.concat(opcodes);
  // Deduplicate consecutive identical opcodes to avoid runaway growth
  working = working.filter((opcode, index) => index === 0 || opcode !== working[index - 1]);
  if (!working.length || !hatOpcodes.has(working[0])) {
    working = ["event_whenflagclicked", ...working.filter(op => !hatOpcodes.has(op))];
  } else {
    // only one leading hat
    working = [working[0], ...working.slice(1).filter(op => !hatOpcodes.has(op))];
  }

  // Build a simple readable structure:
  // flag -> (optional forever) -> body chain
  // If recommendation includes forever/repeat, place subsequent stackable blocks inside it.
  const blocks = {};
  const createdIds = [];
  let firstBodyInsideContainer = null;
  let containerId = null;
  let previousId = null;
  let rootId = null;

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
      fields: defaultFieldsForOpcode(opcode),
      shadow: false,
      topLevel: isTop
    };
    if (isTop) {
      record.x = 100;
      record.y = 100;
      rootId = id;
    }
    blocks[id] = record;

    if (previousId) {
      const prev = blocks[previousId];
      if (containerOpcodes.has(prev.opcode) && !(prev.inputs && prev.inputs.SUBSTACK)) {
        prev.inputs = { ...(prev.inputs || {}), SUBSTACK: [2, id] };
        record.parent = previousId;
        containerId = previousId;
        firstBodyInsideContainer = id;
      } else if (containerId && previousId !== containerId) {
        // continue inside / after body in the container chain
        prev.next = id;
        record.parent = previousId;
      } else {
        prev.next = id;
        record.parent = previousId;
      }
    }

    if (containerOpcodes.has(opcode) && !containerId) {
      containerId = id;
    }
    previousId = id;
  }

  sprite.blocks = blocks;
  sprite.x = typeof sprite.x === "number" ? sprite.x : 0;
  sprite.y = typeof sprite.y === "number" ? sprite.y : 0;
  sprite.direction = typeof sprite.direction === "number" ? sprite.direction : 90;
  if (!Array.isArray(project.extensions)) project.extensions = [];

  if (typeof vm.stopAll === "function") vm.stopAll();
  await vm.loadProject(JSON.stringify(project));

  const loaded = await waitFor(() => {
    const target = getSpriteTarget(vm);
    const count = target?.blocks?._blocks ? Object.keys(target.blocks._blocks).length : 0;
    return Boolean(target && count >= Math.min(createdIds.length, 1));
  }, 15000);

  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }

  await sleep(900);
  notifyCapture(${JSON.stringify(label || 'apply-recommended')});

  const runtimeBlocks = runtimeSprite?.blocks?._blocks
    ? Object.values(runtimeSprite.blocks._blocks).map(block => block.opcode)
    : [];

  return JSON.stringify({
    ok: Boolean(loaded && runtimeBlocks.length > 0),
    error: loaded ? (runtimeBlocks.length > 0 ? null : "blocks-empty-after-load") : "project-load-timeout",
    appliedOpcodes: opcodes,
    rebuiltOpcodes: working,
    createdIds,
    currentTargetName: runtimeSprite?.sprite?.name ?? null,
    runtimeBlockCount: runtimeBlocks.length,
    runtimeOpcodes: runtimeBlocks
  });
})()
    `.trim();
}

function buildSimpleMotionScenarioExpression() {
    return `
(async () => {
${findVmHelpersSource()}
  const vm = findVm();
  if (!vm || !vm.runtime) {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) {
    return JSON.stringify({ ok: false, error: "project-not-ready" });
  }

  const project = cloneProject(vm.toJSON());
  const sprite = project.targets.find(target => !target.isStage) || project.targets[0];
  const flagId = makeId("event-whenflagclicked");
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
  sprite.x = 0;
  sprite.y = 0;
  sprite.direction = 90;
  sprite.visible = true;
  if (!Array.isArray(project.extensions)) project.extensions = [];

  if (typeof vm.stopAll === "function") vm.stopAll();
  await vm.loadProject(JSON.stringify(project));
  await waitFor(() => {
    const target = getSpriteTarget(vm);
    const count = target?.blocks?._blocks ? Object.keys(target.blocks._blocks).length : 0;
    return count >= 1;
  }, 10000);

  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }
  await sleep(700);
  notifyCapture("seed-simple-flag");

  return JSON.stringify({
    ok: true,
    scenario: "simple-flag",
    currentTargetName: runtimeSprite?.sprite?.name ?? null,
    blockCount: runtimeSprite?.blocks?._blocks ? Object.keys(runtimeSprite.blocks._blocks).length : 0
  });
})()
    `.trim();
}

function buildMediumScenarioExpression() {
    return `
(async () => {
${findVmHelpersSource()}
  const vm = findVm();
  if (!vm || !vm.runtime) {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "project-not-ready" });

  const project = cloneProject(vm.toJSON());
  const sprite = project.targets.find(target => !target.isStage) || project.targets[0];
  const flagId = makeId("flag");
  const foreverId = makeId("forever");
  const moveId = makeId("move");
  const bounceId = makeId("bounce");

  sprite.blocks = {
    [flagId]: {
      opcode: "event_whenflagclicked",
      next: foreverId,
      parent: null,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: true,
      x: 90,
      y: 90
    },
    [foreverId]: {
      opcode: "control_forever",
      next: null,
      parent: flagId,
      inputs: { SUBSTACK: [2, moveId] },
      fields: {},
      shadow: false,
      topLevel: false
    },
    [moveId]: {
      opcode: "motion_movesteps",
      next: bounceId,
      parent: foreverId,
      inputs: { STEPS: [1, [4, "10"]] },
      fields: {},
      shadow: false,
      topLevel: false
    },
    [bounceId]: {
      opcode: "motion_ifonedgebounce",
      next: null,
      parent: moveId,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: false
    }
  };
  sprite.x = 0;
  sprite.y = 0;
  sprite.direction = 90;
  if (!Array.isArray(project.extensions)) project.extensions = [];
  if (typeof vm.stopAll === "function") vm.stopAll();
  await vm.loadProject(JSON.stringify(project));
  await waitFor(() => {
    const target = getSpriteTarget(vm);
    return target?.blocks?._blocks && Object.keys(target.blocks._blocks).length >= 4;
  }, 10000);
  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }
  await sleep(800);
  notifyCapture("seed-medium-edge-bounce");
  return JSON.stringify({
    ok: true,
    scenario: "medium-edge-bounce",
    currentTargetName: runtimeSprite?.sprite?.name ?? null,
    blockCount: runtimeSprite?.blocks?._blocks ? Object.keys(runtimeSprite.blocks._blocks).length : 0
  });
})()
    `.trim();
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
  if (!vm || typeof vm.loadProject !== "function") {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }
  const ready = await waitFor(() => Boolean(vm.runtime && Array.isArray(vm.runtime.targets)), 10000);
  if (!ready) return JSON.stringify({ ok: false, error: "runtime-not-ready" });
  if (typeof vm.stopAll === "function") vm.stopAll();
  const buffer = decodeBase64ToArrayBuffer(${JSON.stringify(projectFileBase64)});
  await vm.loadProject(buffer);
  await sleep(1000);
  const sprite = getSpriteTarget(vm);
  if (sprite && typeof vm.setEditingTarget === "function" && sprite.id) {
    vm.setEditingTarget(sprite.id);
  }
  notifyCapture(${JSON.stringify(`load-project:${projectFilePath}`)});
  const project = (() => {
    try { return vm.toJSON(); } catch { return null; }
  })();
  return JSON.stringify({
    ok: true,
    loadedProjectFile: ${JSON.stringify(projectFilePath)},
    currentTargetName: vm.editingTarget?.sprite?.name ?? null,
    projectTargetCount: Array.isArray(project?.targets) ? project.targets.length : 0,
    projectTargetNames: Array.isArray(project?.targets)
      ? project.targets.map(target => String(target?.name ?? ""))
      : []
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
    const allowEmptyRecommendation = options.allowEmptyRecommendation === true;
    return await waitForMainState(
        mainTarget,
        state => {
            if (state.status !== 'connected') return false;
            if (state.aiStatus === 'loading') return false;
            if (state.aiStatus !== 'ready' && state.aiStatus !== 'error') return false;
            if (minUpdatedAt && state.aiLastUpdatedAt && state.aiLastUpdatedAt <= minUpdatedAt) {
                return false;
            }
            if (state.aiStatus === 'ready' && state.aiCoachResponse) {
                const hasText =
                    typeof state.aiCoachResponse.answerText === 'string' &&
                    state.aiCoachResponse.answerText.length > 0;
                const recCount = (state.aiCoachResponse.recommendedBlocks ?? []).length;
                if (!hasText) return false;
                if (!allowEmptyRecommendation && recCount === 0) {
                    // 完整作品允许无推荐积木
                    if (!state.aiCoachResponse.nextStep) return false;
                }
                return true;
            }
            return state.aiStatus === 'error';
        },
        options.errorMessage ?? 'AI coach result did not arrive.',
        {timeoutMs: options.timeoutMs ?? timeoutMs}
    );
}

async function forceGenerateIfNeeded(mainTarget) {
    const state = await readMainState(mainTarget);
    if (state.aiStatus === 'ready' && state.aiCoachResponse) {
        return state;
    }
    if (state.aiStatus === 'loading') {
        return await waitForCoachResult(mainTarget, {
            errorMessage: 'AI was loading but never finished.',
            allowEmptyRecommendation: true
        });
    }
    // 手动点一次生成按钮兜底
    const click = await clickButton(mainTarget, '#generate-ai-button');
    if (click.ok !== true) {
        throw new Error(`generate button failed: ${JSON.stringify(click)}`);
    }
    return await waitForCoachResult(mainTarget, {
        errorMessage: 'AI did not return after clicking generate.',
        allowEmptyRecommendation: true
    });
}

async function closeScratchTarget(target) {
    if (!target?.webSocketDebuggerUrl) return false;
    try {
        return await withTargetConnection(target, async connection => {
            await connection.send('Page.enable');
            await connection.send('Runtime.enable');
            await connection.send('Runtime.evaluate', {
                expression: `
(() => {
  window.onbeforeunload = null;
  window.addEventListener('beforeunload', event => {
    event.stopImmediatePropagation();
  }, true);
  return true;
})()
                `.trim(),
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

function pad(num) {
    return String(num).padStart(2, '0');
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
        aiHintTriggerMode: config.aiHintTriggerMode
    }, null, 2));

    const child = spawn(
        companionExe,
        [`--remote-debugging-port=${companionDebugPort}`],
        {
            cwd: path.dirname(companionExe),
            env: {
                ...process.env,
                SCRATCH_AI_USER_DATA_DIR: userDataDir
            },
            stdio: 'ignore',
            windowsHide: false
        }
    );

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
        if (scratchTargetLocal) {
            await captureScreenshot(scratchTargetLocal, scratchPath);
        }
        const state = await readMainState(mainTarget).catch(() => null);
        const ui = await readMainUiSnapshot(mainTarget).catch(() => null);
        const entry = {
            step: stepCounter,
            tag,
            mainScreenshot: mainPath,
            scratchScreenshot: scratchTargetLocal ? scratchPath : null,
            coach: state ? summarizeCoach(state) : null,
            ui: ui
                ? {
                    status: ui.status,
                    currentTarget: ui.currentTarget,
                    aiSource: ui.aiSource,
                    aiStatus: ui.aiStatus,
                    aiAnswer: ui.aiAnswer,
                    programs: ui.currentTargetPrograms,
                    recommended: ui.aiRecommendedBlocks,
                    reasons: ui.recommendedReasons
                }
                : null,
            ...extra
        };
        timeline.push(entry);
        await writeFile(
            path.join(artifactDir, 'timeline.json'),
            JSON.stringify({artifactDir, timeline}, null, 2),
            'utf8'
        );
        console.log(`[step ${stepCounter}] ${tag}`);
        if (entry.coach) {
            console.log(`  provider=${entry.coach.aiProvider} model=${entry.coach.aiModel}`);
            console.log(`  answer=${(entry.coach.answerText || '').slice(0, 120)}`);
            console.log(`  blocks=${(entry.coach.recommendedBlocks || []).map(b => b.opcode).join(' -> ') || '(none)'}`);
        }
        return entry;
    }

    try {
        const companionTargetResult = await waitForTargets(
            companionDebugPort,
            pickCompanionTarget,
            '找不到桌面伴随程序页面。'
        );
        const mainTarget = companionTargetResult.preferredTarget;

        await waitForMainState(
            mainTarget,
            state => typeof state.status === 'string' && Boolean(state.scratchExecutablePath),
            '伴随程序 UI 未就绪。'
        );
        await shot(mainTarget, null, 'main-initial');

        const launchLogOffset = await getLogSize();
        const launchClick = await clickButton(mainTarget, '#launch-button');
        assert(launchClick.ok === true, `打开 Scratch 失败: ${JSON.stringify(launchClick)}`);

        const launchLogContent = await waitFor(async () => {
            const content = await readLogSince(launchLogOffset);
            return content.includes('Scratch launched pid=') && content.includes('Bridge script injected via CDP')
                ? content
                : null;
        }, {errorMessage: '日志未出现 Scratch 启动/注入成功标记。'});

        launchedScratchProcess = parseLatestScratchLaunchInfo(launchLogContent);
        assert(launchedScratchProcess?.debugPort, '未能解析 Scratch debug port。');

        await waitForMainState(
            mainTarget,
            state => state.status === 'connected',
            '未成功连接到 Scratch。'
        );

        const scratchTargetResult = await waitForTargets(
            launchedScratchProcess.debugPort,
            pickScratchTarget,
            '找不到 Scratch 调试页面。'
        );
        scratchTarget = scratchTargetResult.preferredTarget;
        await shot(mainTarget, scratchTarget, 'connected-blank');

        // =========================
        // Round A: 简单从绿旗起步，跟 AI 提示连续搭
        // =========================
        const seedSimple = await evaluateExpressionInTarget(scratchTarget, buildSimpleMotionScenarioExpression());
        assert(seedSimple.ok, `seed simple failed: ${JSON.stringify(seedSimple)}`);
        const seedSimpleValue = typeof seedSimple.value === 'string' ? JSON.parse(seedSimple.value) : seedSimple.value;
        assert(seedSimpleValue?.ok, `seed simple value failed: ${JSON.stringify(seedSimpleValue)}`);

        await waitForMainState(
            mainTarget,
            state =>
                state.status === 'connected' &&
                Array.isArray(state.currentTargetPrograms) &&
                state.currentTargetPrograms.length > 0,
            '简单脚本未同步到伴随程序。'
        );

        let coachState = await forceGenerateIfNeeded(mainTarget);
        await shot(mainTarget, scratchTarget, 'roundA-after-seed-flag', {
            seed: seedSimpleValue,
            note: 'Round A 起点：仅“当绿旗被点击”'
        });

        for (let follow = 1; follow <= maxFollowSteps; follow += 1) {
            const beforeUpdatedAt = coachState.aiLastUpdatedAt ?? null;
            const recommended = coachState.aiCoachResponse?.recommendedBlocks ?? [];
            if (!recommended.length) {
                timeline.push({
                    step: ++stepCounter,
                    tag: `roundA-follow-${follow}-no-more-blocks`,
                    note: 'AI 未再返回推荐积木，结束 Round A 跟随。',
                    coach: summarizeCoach(coachState)
                });
                break;
            }

            const applyResult = await evaluateExpressionInTarget(
                scratchTarget,
                buildApplyRecommendedBlocksExpression(recommended, `roundA-follow-${follow}`)
            );
            const applyValue = applyResult.ok
                ? (typeof applyResult.value === 'string' ? JSON.parse(applyResult.value) : applyResult.value)
                : { ok: false, error: applyResult.error };
            if (!applyValue?.ok) {
                await shot(mainTarget, scratchTarget, `roundA-apply-failed-${follow}`, {
                    applied: applyValue,
                    recommended,
                    note: 'apply failed, stop following round A'
                });
                break;
            }

            // 等待程序同步后强制生成，避免卡在自动提示稳定期
            await sleep(1500);
            await waitForMainState(
                mainTarget,
                state =>
                    state.status === 'connected' &&
                    Array.isArray(state.currentTargetPrograms) &&
                    state.currentTargetPrograms.length > 0,
                `Round A follow ${follow}: 程序未同步。`
            );

            await shot(mainTarget, scratchTarget, `roundA-applied-${follow}`, {
                applied: applyValue,
                note: '积木已应用，准备请求 AI'
            });

            // 等当前 loading 结束后再点生成，确保拿到新一轮
            await waitForMainState(
                mainTarget,
                state => state.aiStatus !== 'loading',
                `Round A follow ${follow}: 等待上一轮 AI 结束。`,
                {timeoutMs: 60000}
            );
            await clickButton(mainTarget, '#generate-ai-button');
            try {
                coachState = await waitForCoachResult(mainTarget, {
                    minUpdatedAt: beforeUpdatedAt,
                    allowEmptyRecommendation: true,
                    errorMessage: `Round A follow ${follow}: AI missing`,
                    timeoutMs: 90000
                });
                await shot(mainTarget, scratchTarget, `roundA-follow-${follow}`, {
                    applied: applyValue,
                    note: `applied: ${(applyValue.appliedOpcodes || []).join(' -> ')}`
                });
            } catch (error) {
                await shot(mainTarget, scratchTarget, `roundA-follow-timeout-${follow}`, {
                    applied: applyValue,
                    error: error instanceof Error ? error.message : String(error)
                });
                break;
            }
        }

        // =========================
        // Round B: 中等复杂度（移动 + 碰到边缘就反弹）
        // =========================
        const seedMedium = await evaluateExpressionInTarget(scratchTarget, buildMediumScenarioExpression());
        const seedMediumValue = seedMedium.ok
            ? (typeof seedMedium.value === 'string' ? JSON.parse(seedMedium.value) : seedMedium.value)
            : { ok: false, error: seedMedium.error };

        if (!seedMediumValue?.ok) {
            await shot(mainTarget, scratchTarget, 'roundB-seed-failed', {
                seed: seedMediumValue,
                note: 'Round B seed failed, continue to complex project'
            });
        } else {
            await waitForMainState(
                mainTarget,
                state =>
                    state.status === 'connected' &&
                    Array.isArray(state.currentTargetPrograms) &&
                    state.currentTargetPrograms.length > 0,
                'medium scenario not synced'
            );

            await sleep(1000);
            let mediumState = await readMainState(mainTarget);
            if (mediumState.aiStatus !== 'loading') {
                await clickButton(mainTarget, '#generate-ai-button');
            }
            mediumState = await waitForCoachResult(mainTarget, {
                allowEmptyRecommendation: true,
                errorMessage: 'Round B AI missing'
            });
            await shot(mainTarget, scratchTarget, 'roundB-medium-edge-bounce', {
                seed: seedMediumValue,
                note: 'Round B medium: flag + forever + move + bounce'
            });

            for (let follow = 1; follow <= 2; follow += 1) {
                const beforeUpdatedAt = mediumState.aiLastUpdatedAt ?? null;
                const recommended = mediumState.aiCoachResponse?.recommendedBlocks ?? [];
                if (!recommended.length) break;

                const applyResult = await evaluateExpressionInTarget(
                    scratchTarget,
                    buildApplyRecommendedBlocksExpression(recommended, `roundB-follow-${follow}`)
                );
                const applyValue = applyResult.ok
                    ? (typeof applyResult.value === 'string' ? JSON.parse(applyResult.value) : applyResult.value)
                    : { ok: false, error: applyResult.error };
                if (!applyValue?.ok) {
                    await shot(mainTarget, scratchTarget, `roundB-apply-failed-${follow}`, {
                        applied: applyValue,
                        recommended
                    });
                    break;
                }

                await sleep(1500);
                await shot(mainTarget, scratchTarget, `roundB-applied-${follow}`, {
                    applied: applyValue,
                    note: 'medium blocks applied'
                });
                await waitForMainState(
                    mainTarget,
                    state => state.aiStatus !== 'loading',
                    `Round B follow ${follow}: wait previous AI`,
                    {timeoutMs: 60000}
                );
                await clickButton(mainTarget, '#generate-ai-button');
                try {
                    mediumState = await waitForCoachResult(mainTarget, {
                        minUpdatedAt: beforeUpdatedAt,
                        allowEmptyRecommendation: true,
                        errorMessage: `Round B follow ${follow}: AI missing`,
                        timeoutMs: 60000
                    });
                    await shot(mainTarget, scratchTarget, `roundB-follow-${follow}`, {
                        applied: applyValue
                    });
                } catch (error) {
                    await shot(mainTarget, scratchTarget, `roundB-follow-timeout-${follow}`, {
                        applied: applyValue,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    break;
                }
            }
        }

        // =========================
        // Round C: 复杂完整作品 Cat and a Mouse
        // =========================
        // Refresh scratch target before complex load
        try {
            const latestScratch = await waitForTargets(
                launchedScratchProcess.debugPort,
                pickScratchTarget,
                'scratch target missing before complex load'
            );
            scratchTarget = latestScratch.preferredTarget;
        } catch (error) {
            await shot(mainTarget, null, 'roundC-scratch-missing', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        const complexBase64 = (await readFile(complexProjectFile)).toString('base64');
        const loadComplex = await evaluateExpressionInTarget(
            scratchTarget,
            buildLoadProjectExpression(complexProjectFile, complexBase64)
        );
        const loadComplexValue = loadComplex.ok
            ? (typeof loadComplex.value === 'string' ? JSON.parse(loadComplex.value) : loadComplex.value)
            : { ok: false, error: loadComplex.error };

        if (!loadComplexValue?.ok) {
            await shot(mainTarget, scratchTarget, 'roundC-load-failed', {
                loaded: loadComplexValue,
                note: 'complex project load failed'
            });
        } else {
            await waitForMainState(
                mainTarget,
                state =>
                    state.status === 'connected' &&
                    Array.isArray(state.currentTargetPrograms) &&
                    state.currentTargetPrograms.length > 0 &&
                    (state.currentTargetName === loadComplexValue.currentTargetName ||
                        (loadComplexValue.projectTargetNames || []).includes(state.currentTargetName)),
                'complex project not synced',
                {timeoutMs: Math.max(timeoutMs, 90000)}
            );

            await sleep(1500);
            let complexState = await readMainState(mainTarget);
            if (complexState.aiStatus !== 'loading') {
                await clickButton(mainTarget, '#generate-ai-button');
            }
            try {
                complexState = await waitForCoachResult(mainTarget, {
                    allowEmptyRecommendation: true,
                    errorMessage: 'Round C AI missing',
                    timeoutMs: Math.max(timeoutMs, 120000)
                });
            } catch (error) {
                complexState = await readMainState(mainTarget);
                await shot(mainTarget, scratchTarget, 'roundC-ai-timeout', {
                    loaded: loadComplexValue,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
            await shot(mainTarget, scratchTarget, 'roundC-complex-cat-and-mouse', {
                loaded: loadComplexValue,
                note: 'Round C complex project: Cat and a Mouse'
            });

            const complexRecommended = complexState.aiCoachResponse?.recommendedBlocks ?? [];
            if (complexRecommended.length > 0) {
                const beforeUpdatedAt = complexState.aiLastUpdatedAt ?? null;
                const applyResult = await evaluateExpressionInTarget(
                    scratchTarget,
                    buildApplyRecommendedBlocksExpression(complexRecommended, 'roundC-follow-1')
                );
                const applyValue = applyResult.ok
                    ? (typeof applyResult.value === 'string' ? JSON.parse(applyResult.value) : applyResult.value)
                    : { ok: false, error: applyResult.error };
                if (applyValue?.ok) {
                    await sleep(1500);
                    await shot(mainTarget, scratchTarget, 'roundC-applied-1', {
                        applied: applyValue,
                        note: 'complex recommended blocks applied'
                    });
                    await waitForMainState(
                        mainTarget,
                        state => state.aiStatus !== 'loading',
                        'Round C follow: wait previous AI',
                        {timeoutMs: 60000}
                    );
                    await clickButton(mainTarget, '#generate-ai-button');
                    complexState = await waitForCoachResult(mainTarget, {
                        minUpdatedAt: beforeUpdatedAt,
                        allowEmptyRecommendation: true,
                        errorMessage: 'Round C follow AI missing',
                        timeoutMs: Math.max(timeoutMs, 120000)
                    });
                    await shot(mainTarget, scratchTarget, 'roundC-follow-1', {
                        applied: applyValue
                    });
                } else {
                    await shot(mainTarget, scratchTarget, 'roundC-apply-failed-1', {
                        applied: applyValue,
                        recommended: complexRecommended
                    });
                }
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
            rounds: {
                A: timeline.filter(item => String(item.tag).includes('roundA')),
                B: timeline.filter(item => String(item.tag).includes('roundB')),
                C: timeline.filter(item => String(item.tag).includes('roundC'))
            },
            timeline
        };

        await writeFile(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
        process.stdout.write(`${JSON.stringify({
            ok: true,
            artifactDir,
            steps: summary.steps,
            screenshotCount: summary.screenshots.length,
            roundA: summary.rounds.A.length,
            roundB: summary.rounds.B.length,
            roundC: summary.rounds.C.length
        }, null, 2)}\n`);
    } finally {
        if (!keepOpen) {
            if (scratchTarget) {
                await closeScratchTarget(scratchTarget);
            }
            if (child.pid) {
                try { process.kill(child.pid); } catch {}
            }
            if (launchedScratchProcess?.pid) {
                try { process.kill(Number(launchedScratchProcess.pid)); } catch {}
            }
            // 额外清理可能残留的 Scratch
            try {
                spawn('pkill', ['-f', 'Scratch 3'], {stdio: 'ignore'});
            } catch {}
        } else {
            console.log('keep-open=true, 进程保留，请手动关闭。');
        }
    }
}

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
