import {access, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {findDefaultAutomationScratchExecutablePath, parseLatestScratchLaunchInfo} from './automation-platform.mjs';
import {getDefaultPackagedCompanionBinaryPath} from './electron-paths.mjs';
import {
    buildSettingsUiSnapshotExpression,
    isSettingsUiReady
} from './desktop-companion-real-e2e-settings.mjs';

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
const requestedProjectFile = argv.get('--project-file') ?? null;
const companionDebugPort = Number(argv.get('--port') ?? '9346');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '45000');
const userDataDir =
    argv.get('--user-data-dir') ??
    path.join(verificationRoot, 'tmp-real-e2e-userdata');
const userDataDirCandidates = [userDataDir];
let activeUserDataDir = userDataDir;

function getConfigFilePath(userDataDir) {
    return path.join(userDataDir, 'desktop-companion.config.json');
}

function getLogFilePath(userDataDir) {
    return path.join(userDataDir, 'desktop-companion.log');
}

async function ensureReadable(filePath) {
    await access(filePath);
}

async function findDefaultProjectFile() {
    const desktopRoot = process.env.USERPROFILE ?? process.env.HOME ?? '';
    if (!desktopRoot) {
        return null;
    }
    const desktopDir = path.join(desktopRoot, 'Desktop');
    const entries = await readdir(desktopDir, {withFileTypes: true});
    const candidates = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.sb3')) {
            continue;
        }
        const fullPath = path.join(desktopDir, entry.name);
        const info = await stat(fullPath);
        candidates.push({fullPath, mtimeMs: info.mtimeMs});
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return candidates[0]?.fullPath ?? null;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, options = {}) {
    const timeout = options.timeoutMs ?? timeoutMs;
    const interval = options.intervalMs ?? 400;
    const deadline = Date.now() + timeout;
    let lastValue = null;
    while (Date.now() < deadline) {
        lastValue = await predicate();
        if (lastValue) {
            return lastValue;
        }
        await sleep(interval);
    }
    throw new Error(options.errorMessage ?? `Timed out after ${timeout}ms.`);
}

async function writeScratchConfig(scratchExecutablePath) {
    activeUserDataDir = userDataDir;
    await mkdir(userDataDir, {recursive: true});
    await writeFile(
        getConfigFilePath(userDataDir),
        JSON.stringify({scratchExecutablePath}, null, 2),
        'utf8'
    );
}

async function getLogSize() {
    try {
        const content = await readFile(getLogFilePath(userDataDir));
        return content.byteLength;
    } catch {
        return 0;
    }
}

async function readLogSince(offset) {
    try {
        const content = await readFile(getLogFilePath(userDataDir));
        return content.subarray(offset).toString('utf8');
    } catch {
        return '';
    }
}

async function waitForLogMarkers(markers, offset, errorMessage) {
    return await waitFor(async () => {
        const content = await readLogSince(offset);
        return markers.every(marker => content.includes(marker)) ? content : null;
    }, {
        timeoutMs,
        intervalMs: 500,
        errorMessage
    });
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

function pickSettingsTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(target => {
        const title = typeof target.title === 'string' ? target.title.trim() : '';
        const url = typeof target.url === 'string' ? target.url.toLowerCase() : '';
        return title.includes('DeepSeek 设置') || url.endsWith('/settings.html') || url.includes('settings.html');
    }) ?? null;
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
            if (!response.ok) {
                return null;
            }
            const parsed = await response.json();
            if (!Array.isArray(parsed)) {
                return null;
            }
            const preferredTarget = picker(parsed);
            if (!preferredTarget) {
                return null;
            }
            return {
                targets: parsed,
                preferredTarget
            };
        } catch {
            return null;
        }
    }, {
        timeoutMs,
        intervalMs: 500,
        errorMessage
    });
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
        const timer = setTimeout(() => {
            reject(new Error('Timed out while opening websocket.'));
        }, maxWaitMs);
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

async function evaluateExpressionInTarget(target, expression) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitForWebSocketOpen(socket, timeoutMs);
    try {
        const connection = new CdpConnection(socket);
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
        return {
            ok: true,
            value: response.result?.value,
            type: response.result?.type
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    } finally {
        socket.close();
    }
}

function buildCompanionUiSnapshotExpression() {
    return `
(() => ({
  title: document.title,
  href: window.location.href,
  status: document.querySelector("#status")?.textContent?.trim() ?? null,
  detail: document.querySelector("#detail")?.textContent?.trim() ?? null,
  currentTarget: document.querySelector("#current-target")?.textContent?.trim() ?? null,
  scratchPath: document.querySelector("#scratch-path")?.textContent?.trim() ?? null,
  errorText: document.querySelector("#error")?.textContent?.trim() ?? null,
  buttons: {
    choose: document.querySelector("#choose-scratch-button") instanceof HTMLButtonElement
      ? document.querySelector("#choose-scratch-button").disabled
      : null,
    launch: document.querySelector("#launch-button") instanceof HTMLButtonElement
      ? document.querySelector("#launch-button").disabled
      : null,
    retry: document.querySelector("#retry-button") instanceof HTMLButtonElement
      ? document.querySelector("#retry-button").disabled
      : null,
    settings: document.querySelector("#settings-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-button").disabled
      : null
  },
  currentTargetPrograms: Array.from(document.querySelectorAll("#current-target-programs li"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean)
}))()
    `.trim();
}

async function readCompanionUiSnapshot(target) {
    const result = await evaluateExpressionInTarget(target, buildCompanionUiSnapshotExpression());
    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to read companion UI snapshot.');
    }
    return result.value ?? {};
}

async function waitForCompanionUi(target, predicate, errorMessage) {
    return await waitFor(async () => {
        const snapshot = await readCompanionUiSnapshot(target);
        return predicate(snapshot) ? snapshot : null;
    }, {
        timeoutMs,
        intervalMs: 500,
        errorMessage
    });
}

async function readSettingsUiSnapshot(target) {
    const result = await evaluateExpressionInTarget(target, buildSettingsUiSnapshotExpression());
    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to read settings UI snapshot.');
    }
    return result.value ?? {};
}

async function waitForSettingsUi(target, predicate, errorMessage) {
    return await waitFor(async () => {
        const snapshot = await readSettingsUiSnapshot(target);
        return predicate(snapshot) ? snapshot : null;
    }, {
        timeoutMs,
        intervalMs: 500,
        errorMessage
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
  button.click();
  return { ok: true, disabledImmediately: button.disabled };
})()
        `.trim()
    );
    if (!clickResult.ok) {
        throw new Error(clickResult.error ?? `Failed to click ${selector}.`);
    }
    return clickResult.value ?? {};
}

async function setSelectValue(target, selector, value) {
    const result = await evaluateExpressionInTarget(
        target,
        `
(() => {
  const select = document.querySelector(${JSON.stringify(selector)});
  if (!(select instanceof HTMLSelectElement)) {
    return { ok: false, error: "select-not-found" };
  }
  select.value = ${JSON.stringify(value)};
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, value: select.value };
})()
        `.trim()
    );
    if (!result.ok) {
        throw new Error(result.error ?? `Failed to set ${selector}.`);
    }
    return result.value ?? {};
}

function buildLoadProjectExpression(projectFilePath, projectFileBase64) {
    return `
(async () => {
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
    while (queue.length > 0 && visited.size < 2000) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) {
        continue;
      }
      visited.add(current);
      const candidateProps = [
        current.memoizedProps,
        current.pendingProps,
        current.stateNode && current.stateNode.props
      ];
      for (const props of candidateProps) {
        if (!props || typeof props !== "object") {
          continue;
        }
        if (isVmLike(props.vm)) {
          return props.vm;
        }
        if (isVmLike(props)) {
          return props;
        }
      }
      for (const key of ["child", "sibling", "return"]) {
        const nextNode = current[key];
        if (nextNode && !visited.has(nextNode)) {
          queue.push(nextNode);
        }
      }
    }
    return null;
  }
  function findVm() {
    const windowVmKeys = ["vm", "__scratchVm", "__vm"];
    for (const key of windowVmKeys) {
      try {
        if (isVmLike(window[key])) {
          return window[key];
        }
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
        if (vm) {
          return vm;
        }
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
        if (check()) {
          return true;
        }
      } catch {}
      await sleep(200);
    }
    return false;
  }
  function getSpriteTarget(vm) {
    return (vm.runtime.targets || []).find(target => !target.isStage) || null;
  }
  function decodeBase64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }
  function parseProject(rawProject) {
    if (typeof rawProject === "string") {
      try {
        return JSON.parse(rawProject);
      } catch {
        return null;
      }
    }
    return rawProject && typeof rawProject === "object" ? rawProject : null;
  }

  const vm = findVm();
  if (!vm || !vm.runtime || typeof vm.loadProject !== "function") {
    return JSON.stringify({ ok: false, error: "vm-not-found" });
  }

  const ready = await waitFor(() => Boolean(Array.isArray(vm.runtime.targets) && vm.runtime.targets.length > 0), 10000);
  if (!ready) {
    return JSON.stringify({ ok: false, error: "project-not-ready" });
  }

  const projectBuffer = decodeBase64ToArrayBuffer(${JSON.stringify(projectFileBase64)});
  if (typeof vm.stopAll === "function") {
    vm.stopAll();
  }
  await vm.loadProject(projectBuffer);

  const loaded = await waitFor(() => {
    const project = parseProject(vm.toJSON());
    return Boolean(project && Array.isArray(project.targets) && project.targets.length > 0);
  }, 15000);
  if (!loaded) {
    return JSON.stringify({ ok: false, error: "project-load-timeout" });
  }

  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }

  await sleep(1800);
  if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
    window.__scratchDesktopCompanionCaptureNow("e2e-project-load");
  }

  const project = parseProject(vm.toJSON());
  return JSON.stringify({
    ok: true,
    loadedProjectFile: ${JSON.stringify(projectFilePath)},
    currentTargetName: vm.editingTarget && vm.editingTarget.sprite ? vm.editingTarget.sprite.name : null,
    projectTargetCount: Array.isArray(project?.targets) ? project.targets.length : 0
  });
})()
    `.trim();
}

async function main() {
    await ensureReadable(companionExe);

    const scratchExe = requestedScratchExe ?? await findDefaultAutomationScratchExecutablePath();
    assert(scratchExe, 'No supported Scratch executable path was found for the real E2E test.');
    await ensureReadable(scratchExe);
    await rm(userDataDir, {recursive: true, force: true});
    await mkdir(userDataDir, {recursive: true});

    const projectFile = requestedProjectFile ?? await findDefaultProjectFile();
    assert(projectFile, 'No .sb3 file was found on the desktop for the real E2E test.');
    await ensureReadable(projectFile);

    await writeScratchConfig(scratchExe);

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
    try {
        const companionTargetResult = await waitForTargets(
            companionDebugPort,
            pickCompanionTarget,
            'Failed to find the packaged desktop companion target.'
        );

        const initialUi = await waitForCompanionUi(
            companionTargetResult.preferredTarget,
            snapshot =>
                typeof snapshot.status === 'string' &&
                typeof snapshot.buttons?.launch === 'boolean' &&
                typeof snapshot.buttons?.settings === 'boolean' &&
                snapshot.scratchPath === scratchExe,
            'Desktop companion UI did not become ready.'
        );

        const launchLogOffset = await getLogSize();
        const launchClick = await clickButton(companionTargetResult.preferredTarget, '#launch-button');
        assert(
            launchClick.ok === true,
            `Launch button did not click successfully. Actual: ${JSON.stringify(launchClick)}`
        );

        const launchLogContent = await waitForLogMarkers(
            ['Scratch launched pid=', 'Bridge script injected via CDP'],
            launchLogOffset,
            'Desktop companion log did not show a successful launch/injection sequence.'
        );
        launchedScratchProcess = parseLatestScratchLaunchInfo(launchLogContent);
        assert(
            launchedScratchProcess?.debugPort,
            `The desktop companion log did not expose a Scratch debug port: ${launchLogContent}`
        );

        const blankProjectUi = await waitForCompanionUi(
            companionTargetResult.preferredTarget,
            snapshot =>
                snapshot.status === '已连接到 Scratch Desktop' &&
                snapshot.scratchPath === scratchExe &&
                snapshot.errorText === '',
            'Desktop companion did not connect to the freshly launched Scratch instance.'
        );

        const scratchTargetResult = await waitForTargets(
            launchedScratchProcess.debugPort,
            pickScratchTarget,
            'Failed to find the Scratch debug target.'
        );

        const projectFileBase64 = (await readFile(projectFile)).toString('base64');
        const loadProjectResult = await evaluateExpressionInTarget(
            scratchTargetResult.preferredTarget,
            buildLoadProjectExpression(projectFile, projectFileBase64)
        );
        assert(
            loadProjectResult.ok === true,
            `Failed to evaluate project load expression: ${JSON.stringify(loadProjectResult)}`
        );

        const parsedLoadProjectResult =
            typeof loadProjectResult.value === 'string'
                ? JSON.parse(loadProjectResult.value)
                : (loadProjectResult.value ?? {});
        assert(
            parsedLoadProjectResult.ok === true,
            `Scratch did not load the project file successfully: parsed=${JSON.stringify(parsedLoadProjectResult)} raw=${JSON.stringify(loadProjectResult)}`
        );

        const projectUi = await waitForCompanionUi(
            companionTargetResult.preferredTarget,
            snapshot =>
                snapshot.status === '已连接到 Scratch Desktop' &&
                snapshot.currentTarget === parsedLoadProjectResult.currentTargetName &&
                Array.isArray(snapshot.currentTargetPrograms) &&
                snapshot.currentTargetPrograms.some(program => program !== '当前角色还没有可读取的程序。'),
            'Desktop companion did not update to the loaded Scratch project state.'
        );

        const retryLogOffset = await getLogSize();
        const retryClick = await clickButton(companionTargetResult.preferredTarget, '#retry-button');
        assert(
            retryClick.ok === true,
            `Retry button did not click successfully. Actual: ${JSON.stringify(retryClick)}`
        );

        const retryLogContent = await waitForLogMarkers(
            ['Preparing controlled injection', 'Bridge script injected via CDP'],
            retryLogOffset,
            'Desktop companion log did not show a retry injection sequence.'
        );

        const retryUi = await waitForCompanionUi(
            companionTargetResult.preferredTarget,
            snapshot =>
                snapshot.status === '已连接到 Scratch Desktop' &&
                snapshot.currentTarget === parsedLoadProjectResult.currentTargetName &&
                Array.isArray(snapshot.currentTargetPrograms) &&
                snapshot.currentTargetPrograms.some(program => program !== '当前角色还没有可读取的程序。') &&
                snapshot.errorText === '',
            'Desktop companion did not reconnect to Scratch after clicking retry.'
        );

        const settingsClick = await clickButton(companionTargetResult.preferredTarget, '#settings-button');
        assert(
            settingsClick.ok === true,
            `Settings button did not click successfully. Actual: ${JSON.stringify(settingsClick)}`
        );

        const settingsTargetResult = await waitForTargets(
            companionDebugPort,
            pickSettingsTarget,
            'Failed to find the packaged DeepSeek settings target.'
        );

        const settingsUi = await waitForSettingsUi(
            settingsTargetResult.preferredTarget,
            snapshot => isSettingsUiReady(snapshot),
            'Packaged DeepSeek settings window did not finish rendering.'
        );

        assert(
            settingsUi.hintTriggerModeValue === 'auto',
            `Expected the default hint trigger mode to be auto, got: ${JSON.stringify(settingsUi)}`
        );

        const hintModeChange = await setSelectValue(
            settingsTargetResult.preferredTarget,
            '#settings-ai-hint-trigger-mode',
            'manual'
        );
        assert(
            hintModeChange.ok === true,
            `Hint trigger mode select did not accept manual. Actual: ${JSON.stringify(hintModeChange)}`
        );

        const hintModeSaveClick = await clickButton(
            settingsTargetResult.preferredTarget,
            '#settings-save-ai-hint-trigger-mode-button'
        );
        assert(
            hintModeSaveClick.ok === true,
            `Hint trigger mode save button did not click successfully. Actual: ${JSON.stringify(hintModeSaveClick)}`
        );

        const savedSettingsUi = await waitForSettingsUi(
            settingsTargetResult.preferredTarget,
            snapshot =>
                snapshot.hintTriggerModeValue === 'manual' &&
                typeof snapshot.feedbackText === 'string' &&
                snapshot.feedbackText.includes('手动点击') &&
                snapshot.buttons?.saveHintTriggerMode === false,
            'Hint trigger mode did not persist to manual mode in the settings UI.'
        );

        const savedConfig = JSON.parse(
            await readFile(getConfigFilePath(userDataDir), 'utf8')
        );
        assert(
            savedConfig.aiHintTriggerMode === 'manual',
            `Expected saved aiHintTriggerMode to be manual, got: ${JSON.stringify(savedConfig)}`
        );

        const manualRetryLogOffset = await getLogSize();
        const manualRetryClick = await clickButton(companionTargetResult.preferredTarget, '#retry-button');
        assert(
            manualRetryClick.ok === true,
            `Retry button did not click successfully after switching hint mode. Actual: ${JSON.stringify(manualRetryClick)}`
        );

        const manualRetryLogContent = await waitForLogMarkers(
            ['Preparing controlled injection', 'Bridge script injected via CDP'],
            manualRetryLogOffset,
            'Desktop companion log did not show a retry injection sequence after switching hint mode.'
        );

        const manualRetryUi = await waitForCompanionUi(
            companionTargetResult.preferredTarget,
            snapshot =>
                snapshot.status === '已连接到 Scratch Desktop' &&
                snapshot.detail?.includes('AI 会继续根据当前作品进度，给出下一步建议。'),
            'Desktop companion did not switch the connected detail copy to manual hint mode.'
        );

        const output = {
            companionExe,
            scratchExe,
            projectFile,
            userDataDir,
            userDataDirCandidates,
            activeUserDataDir,
            companionDebugPort,
            scratchDebugPort: launchedScratchProcess.debugPort,
            selectedCompanionTarget: {
                id: companionTargetResult.preferredTarget.id,
                title: companionTargetResult.preferredTarget.title,
                url: companionTargetResult.preferredTarget.url
            },
            selectedScratchTarget: {
                id: scratchTargetResult.preferredTarget.id,
                title: scratchTargetResult.preferredTarget.title,
                url: scratchTargetResult.preferredTarget.url
            },
            launchClick,
            loadProjectResult: parsedLoadProjectResult,
            initialUi,
            blankProjectUi,
            projectUi,
            retryClick,
            retryUi,
            settingsClick,
            settingsUi,
            savedSettingsUi,
            manualRetryClick,
            manualRetryUi,
            savedConfig,
            logChecks: {
                launchMarkersPresent: launchLogContent.includes('Bridge script injected via CDP'),
                retryMarkersPresent: retryLogContent.includes('Preparing controlled injection'),
                manualRetryMarkersPresent: manualRetryLogContent.includes('Preparing controlled injection')
            }
        };

        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } finally {
        if (child.pid) {
            try {
                process.kill(child.pid);
            } catch {
                // ignore cleanup errors
            }
        }
        if (launchedScratchProcess?.pid) {
            try {
                process.kill(Number(launchedScratchProcess.pid));
            } catch {
                // ignore cleanup errors
            }
        }
    }
}

await main();
