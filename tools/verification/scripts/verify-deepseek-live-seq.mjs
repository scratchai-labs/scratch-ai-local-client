import {access, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {findDefaultAutomationScratchExecutablePath, parseLatestScratchLaunchInfo} from './automation-platform.mjs';
import {getDefaultElectronBinaryPath} from './electron-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const verificationRoot = path.join(workspaceRoot, 'tools', 'verification');

const argv = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.split('=');
        return [key, rest.join('=') || 'true'];
    })
);

function getTextArg(name, fallbackValue) {
    const base64Value = argv.get(`${name}-base64`);
    if (typeof base64Value === 'string') {
        return Buffer.from(base64Value, 'base64').toString('utf8');
    }

    const directValue = argv.get(name);
    if (typeof directValue === 'string') {
        return directValue;
    }

    return fallbackValue;
}

const electronExe =
    argv.get('--electron-exe') ??
    getDefaultElectronBinaryPath(workspaceRoot);
const appMain =
    argv.get('--app-main') ??
    path.join(workspaceRoot, 'apps', 'desktop-companion', 'dist', 'main.js');
const requestedScratchExe = argv.get('--scratch-exe') ?? null;
const debugPort = Number(argv.get('--port') ?? '9352');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '90000');
const projectUrl = getTextArg(
    '--project-url',
    'https://raw.githubusercontent.com/tesths/scratchai/refs/heads/main/tools/verification/fixtures/projects/cat-and-a-mouse/source/Cat%20and%20a%20Mouse.sb3'
);
const deepseekApiKey = getTextArg('--deepseek-api-key', '');
const learningMode = argv.get('--learning-mode') === 'self-paced' ? 'self-paced' : 'follow-teacher';
const scratchProjectMode = argv.get('--scratch-project-mode') === 'blank' ? 'blank' : 'load';
const blankProjectDetailNeedle = '\u65b0\u9879\u76ee';
const artifactDir =
    argv.get('--artifact-dir') ??
    path.join(verificationRoot, 'artifacts', 'deepseek-live-seq-latest');
const userDataDir =
    argv.get('--user-data-dir') ??
    path.join(verificationRoot, 'tmp-live-deepseek-seq-userdata');
const summaryPath = path.join(artifactDir, 'summary.json');
const screenshotPaths = {
    mainInitial: path.join(artifactDir, '01-main-initial.png'),
    settingsBeforeSave: path.join(artifactDir, '02-settings-before-save.png'),
    settingsAfterSave: path.join(artifactDir, '03-settings-after-save.png'),
    mainAfterKeySave: path.join(artifactDir, '04-main-after-key-save.png'),
    mainFormFilled: path.join(artifactDir, '05-main-form-filled.png'),
    mainProjectUrlResult: path.join(artifactDir, '06-main-project-url-result.png'),
    mainScratchConnected: path.join(artifactDir, '07-main-scratch-connected.png'),
    scratchProjectLoaded: path.join(
        artifactDir,
        scratchProjectMode === 'blank' ? '08-scratch-blank-project.png' : '08-scratch-project-loaded.png'
    ),
    mainAfterScratchProjectLoad: path.join(
        artifactDir,
        scratchProjectMode === 'blank'
            ? '09-main-after-blank-scratch-connect.png'
            : '09-main-after-scratch-project-load.png'
    ),
    mainLiveAiResult: path.join(
        artifactDir,
        scratchProjectMode === 'blank' ? '10-main-blank-project-ai-result.png' : '10-main-live-ai-result.png'
    )
};
async function ensureReadable(filePath) {
    await access(filePath);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeDirectoryWithRetries(
    dirPath,
    {
        retries = 6,
        delayMs = 500,
        suppressFinalError = false
    } = {}
) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            await rm(dirPath, {recursive: true, force: true});
            return true;
        } catch (error) {
            lastError = error;
            const code = error?.code;
            const retryable = code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM';

            if (!retryable || attempt === retries) {
                if (suppressFinalError) {
                    return false;
                }

                throw error;
            }

            await sleep(delayMs * (attempt + 1));
        }
    }

    if (suppressFinalError) {
        return false;
    }

    throw lastError ?? new Error(`Failed to remove directory: ${dirPath}`);
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
    const nextConfig = JSON.stringify({scratchExecutablePath}, null, 2);
    await mkdir(userDataDir, {recursive: true});
    await writeFile(path.join(userDataDir, 'desktop-companion.config.json'), nextConfig, 'utf8');
}

function getLogFilePath() {
    return path.join(userDataDir, 'desktop-companion.log');
}

async function getLogSize() {
    try {
        const content = await readFile(getLogFilePath());
        return content.byteLength;
    } catch {
        return 0;
    }
}

async function readLogSince(offset) {
    try {
        const content = await readFile(getLogFilePath());
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

function pickMainTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(target => {
        const title = typeof target.title === 'string' ? target.title.trim() : '';
        const url = typeof target.url === 'string' ? target.url.toLowerCase() : '';
        return title.includes('Scratch AI') || url.endsWith('/index.html') || url.includes('index.html');
    }) ?? inspectableTargets[0] ?? null;
}

function pickSettingsTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(target => {
        const title = typeof target.title === 'string' ? target.title.trim() : '';
        const url = typeof target.url === 'string' ? target.url.toLowerCase() : '';
        return title.includes('DeepSeek') || url.endsWith('/settings.html') || url.includes('settings.html');
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
            if (!rawData) {
                return;
            }

            let message;
            try {
                message = JSON.parse(rawData);
            } catch {
                return;
            }

            if (typeof message.id !== 'number') {
                return;
            }

            const request = this.pending.get(message.id);
            if (!request) {
                return;
            }

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
    if (socket.readyState === WebSocket.OPEN) {
        return;
    }

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

async function withTargetConnection(target, callback) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitForWebSocketOpen(socket, timeoutMs);

    try {
        const connection = new CdpConnection(socket);
        return await callback(connection);
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
        }
    });
}

async function captureScreenshot(target, outputPath) {
    return await withTargetConnection(target, async connection => {
        await connection.send('Page.enable');
        const response = await connection.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true
        });
        await writeFile(outputPath, Buffer.from(response.data, 'base64'));
        return outputPath;
    });
}

function buildMainUiSnapshotExpression() {
    return `
(() => ({
  title: document.title,
  href: window.location.href,
  status: document.querySelector("#status")?.textContent?.trim() ?? null,
  detail: document.querySelector("#detail")?.textContent?.trim() ?? null,
  currentTarget: document.querySelector("#current-target")?.textContent?.trim() ?? null,
  updatedAt: document.querySelector("#updated-at")?.textContent?.trim() ?? null,
  scratchPath: document.querySelector("#scratch-path")?.textContent?.trim() ?? null,
  aiConfigSummary: document.querySelector("#ai-config-summary")?.textContent?.trim() ?? null,
  aiStatus: document.querySelector("#ai-status")?.textContent?.trim() ?? null,
  aiAnswer: document.querySelector("#ai-answer")?.textContent?.trim() ?? null,
  aiNextStep: document.querySelector("#ai-next-step")?.textContent?.trim() ?? null,
  errorText: document.querySelector("#error")?.textContent?.trim() ?? null,
  projectUrlInputPresent: document.querySelector("#project-url-input") instanceof HTMLInputElement,
  projectUrlValue: document.querySelector("#project-url-input") instanceof HTMLInputElement
    ? document.querySelector("#project-url-input").value
    : null,
  learningModeValue: Array.from(document.querySelectorAll('input[name="learning-mode"]'))
    .find(element => element instanceof HTMLInputElement && element.checked) instanceof HTMLInputElement
    ? Array.from(document.querySelectorAll('input[name="learning-mode"]'))
        .find(element => element instanceof HTMLInputElement && element.checked).value
    : null,
  buttons: {
    launch: document.querySelector("#launch-button") instanceof HTMLButtonElement
      ? document.querySelector("#launch-button").disabled
      : null,
    retry: document.querySelector("#retry-button") instanceof HTMLButtonElement
      ? document.querySelector("#retry-button").disabled
      : null,
    settings: document.querySelector("#settings-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-button").disabled
      : null,
    generateAi: document.querySelector("#generate-ai-button") instanceof HTMLButtonElement
      ? document.querySelector("#generate-ai-button").disabled
      : null,
    analyzeProjectUrl: document.querySelector("#analyze-project-url-button") instanceof HTMLButtonElement
      ? document.querySelector("#analyze-project-url-button").disabled
      : null
  },
  currentTargetPrograms: Array.from(document.querySelectorAll("#current-target-programs li:not(.empty)"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean),
  aiRecommendedBlocks: Array.from(document.querySelectorAll("#ai-recommended-blocks li:not(.empty)"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean),
  aiDetectedIssues: Array.from(document.querySelectorAll("#ai-detected-issues li:not(.empty)"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean)
}))()
    `.trim();
}

function buildSettingsSnapshotExpression() {
    return `
(() => ({
  title: document.title,
  href: window.location.href,
  status: document.querySelector("#settings-status")?.textContent?.trim() ?? null,
  modelValue: document.querySelector("#settings-custom-ai-model") instanceof HTMLSelectElement
    ? document.querySelector("#settings-custom-ai-model").value
    : null,
  feedback: document.querySelector("#settings-feedback")?.textContent?.trim() ?? null,
  errorText: document.querySelector("#settings-error")?.textContent?.trim() ?? null,
  buttons: {
    save: document.querySelector("#settings-save-custom-ai-api-key-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-save-custom-ai-api-key-button").disabled
      : null,
    clear: document.querySelector("#settings-clear-custom-ai-api-key-button") instanceof HTMLButtonElement
      ? document.querySelector("#settings-clear-custom-ai-api-key-button").disabled
      : null
  }
}))()
    `.trim();
}

async function readMainUiSnapshot(target) {
    const result = await evaluateExpressionInTarget(target, buildMainUiSnapshotExpression());
    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to read the main UI snapshot.');
    }

    return result.value ?? {};
}

async function readSettingsSnapshot(target) {
    const result = await evaluateExpressionInTarget(target, buildSettingsSnapshotExpression());
    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to read the settings snapshot.');
    }

    return result.value ?? {};
}

async function readMainState(target) {
    const result = await evaluateExpressionInTarget(
        target,
        'window.desktopCompanionApi ? window.desktopCompanionApi.getInitialState() : null'
    );

    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to read desktop companion state.');
    }

    if (!result.value || typeof result.value !== 'object') {
        throw new Error(`Desktop companion state was unavailable: ${JSON.stringify(result.value)}`);
    }

    return result.value;
}

async function waitForMainUiSnapshot(target, predicate, errorMessage) {
    return await waitFor(async () => {
        const snapshot = await readMainUiSnapshot(target);
        return predicate(snapshot) ? snapshot : null;
    }, {
        timeoutMs,
        intervalMs: 400,
        errorMessage
    });
}

async function waitForSettingsSnapshot(target, predicate, errorMessage) {
    return await waitFor(async () => {
        const snapshot = await readSettingsSnapshot(target);
        return predicate(snapshot) ? snapshot : null;
    }, {
        timeoutMs,
        intervalMs: 400,
        errorMessage
    });
}

async function waitForMainState(target, predicate, errorMessage) {
    return await waitFor(async () => {
        const state = await readMainState(target);
        return predicate(state) ? state : null;
    }, {
        timeoutMs,
        intervalMs: 400,
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

async function setSettingsApiKey(target, apiKey) {
    const result = await evaluateExpressionInTarget(
        target,
        `
(() => {
  const input = document.querySelector("#settings-custom-ai-api-key");
  if (!(input instanceof HTMLInputElement)) {
    return { ok: false, error: "settings-api-key-input-missing" };
  }

  input.value = ${JSON.stringify(apiKey)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, length: input.value.length };
})()
        `.trim()
    );

    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to fill the DeepSeek API key input.');
    }

    return result.value ?? {};
}

async function setMainFormValues(target, {projectUrlValue, learningModeValue}) {
    const result = await evaluateExpressionInTarget(
        target,
        `
(() => {
  const projectUrlInput = document.querySelector("#project-url-input");
  const learningModeInput = document.querySelector(
    'input[name="learning-mode"][value=' + JSON.stringify(${JSON.stringify(learningModeValue)}) + ']'
  );
  if (!(projectUrlInput instanceof HTMLInputElement)) {
    return { ok: false, error: "project-url-input-missing" };
  }
  if (!(learningModeInput instanceof HTMLInputElement)) {
    return { ok: false, error: "learning-mode-input-missing" };
  }

  projectUrlInput.value = ${JSON.stringify(projectUrlValue)};
  projectUrlInput.dispatchEvent(new Event("input", { bubbles: true }));
  projectUrlInput.dispatchEvent(new Event("change", { bubbles: true }));

  learningModeInput.checked = true;
  learningModeInput.dispatchEvent(new Event("input", { bubbles: true }));
  learningModeInput.dispatchEvent(new Event("change", { bubbles: true }));

  return {
    ok: true,
    projectUrlValue: projectUrlInput.value,
    learningModeValue: learningModeInput.value
  };
})()
        `.trim()
    );

    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to fill the main form.');
    }

    return result.value ?? {};
}

async function loadProjectFromBuffer(target, sourceLabel, projectBufferBase64) {
    const result = await evaluateExpressionInTarget(
        target,
        `
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

  async function waitFor(check, maxWaitMs) {
    const deadline = Date.now() + maxWaitMs;
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
    return { ok: false, error: "vm-not-found" };
  }

  const ready = await waitFor(() => Boolean(Array.isArray(vm.runtime.targets) && vm.runtime.targets.length > 0), 10000);
  if (!ready) {
    return { ok: false, error: "project-not-ready" };
  }

  if (typeof vm.stopAll === "function") {
    vm.stopAll();
  }

  const projectBuffer = decodeBase64ToArrayBuffer(${JSON.stringify(projectBufferBase64)});
  await vm.loadProject(projectBuffer);

  const loaded = await waitFor(() => {
    const project = parseProject(vm.toJSON());
    return Boolean(project && Array.isArray(project.targets) && project.targets.length > 0);
  }, 15000);
  if (!loaded) {
    return { ok: false, error: "project-load-timeout" };
  }

  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }

  await sleep(1800);
  if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
    window.__scratchDesktopCompanionCaptureNow("live-e2e-project-load");
  }

  const project = parseProject(vm.toJSON());
  return {
    ok: true,
    loadedProjectSource: ${JSON.stringify(sourceLabel)},
    currentTargetName: vm.editingTarget && vm.editingTarget.sprite ? vm.editingTarget.sprite.name : null,
    projectTargetCount: Array.isArray(project?.targets) ? project.targets.length : 0
  };
})()
        `.trim()
    );

    if (!result.ok) {
        throw new Error(result.error ?? 'Failed to evaluate Scratch project load expression.');
    }

    return result.value ?? {};
}

function sanitizeProcessInfo(processInfo) {
    return processInfo ? {
        pid: processInfo.pid,
        debugPort: processInfo.debugPort
    } : null;
}

async function fetchProjectBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch project URL ${url}: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function main() {
    assert(deepseekApiKey.trim().length > 0, 'A non-empty DeepSeek API key is required.');
    await ensureReadable(electronExe);
    await ensureReadable(appMain);
    const scratchExe = requestedScratchExe ?? await findDefaultAutomationScratchExecutablePath();
    assert(scratchExe, 'No supported Scratch executable path was found for the live sequence test.');
    await ensureReadable(scratchExe);

    const projectBuffer = await fetchProjectBuffer(projectUrl);
    assert(projectBuffer.length > 0, `The project URL did not return any data: ${projectUrl}`);

    await removeDirectoryWithRetries(artifactDir);
    await removeDirectoryWithRetries(userDataDir);
    await mkdir(artifactDir, {recursive: true});
    await mkdir(userDataDir, {recursive: true});
    await writeScratchConfig(scratchExe);

    const child = spawn(
        electronExe,
        [
            `--remote-debugging-port=${debugPort}`,
            appMain
        ],
        {
            cwd: path.dirname(appMain),
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
        const mainTargetResult = await waitForTargets(
            debugPort,
            pickMainTarget,
            'Failed to find the desktop companion main window.'
        );
        const mainTarget = mainTargetResult.preferredTarget;

        const initialMainUi = await waitForMainUiSnapshot(
            mainTarget,
            candidate =>
                candidate.projectUrlInputPresent === true &&
                candidate.buttons?.launch === false &&
                candidate.buttons?.settings === false &&
                typeof candidate.status === 'string' &&
                candidate.status.length > 0 &&
                typeof candidate.scratchPath === 'string' &&
                candidate.scratchPath.includes('Scratch'),
            'The main desktop companion UI did not finish rendering.'
        );
        const initialMainState = await readMainState(mainTarget);
        await captureScreenshot(mainTarget, screenshotPaths.mainInitial);

        const settingsClick = await clickButton(mainTarget, '#settings-button');
        assert(settingsClick.ok === true, `Settings button click failed: ${JSON.stringify(settingsClick)}`);

        const settingsTargetResult = await waitForTargets(
            debugPort,
            pickSettingsTarget,
            'Failed to find the DeepSeek settings window.'
        );
        const settingsTarget = settingsTargetResult.preferredTarget;

        const settingsBefore = await waitForSettingsSnapshot(
            settingsTarget,
            candidate =>
                candidate.title?.includes('DeepSeek') &&
                candidate.buttons?.save === false &&
                typeof candidate.modelValue === 'string' &&
                candidate.modelValue.length > 0,
            'The DeepSeek settings window did not finish rendering.'
        );
        await captureScreenshot(settingsTarget, screenshotPaths.settingsBeforeSave);

        const keyFillResult = await setSettingsApiKey(settingsTarget, deepseekApiKey);
        assert(
            keyFillResult.length === deepseekApiKey.length,
            `The DeepSeek API key input was not filled correctly: ${JSON.stringify(keyFillResult)}`
        );

        const saveKeyClick = await clickButton(settingsTarget, '#settings-save-custom-ai-api-key-button');
        assert(saveKeyClick.ok === true, `Saving the DeepSeek API key failed: ${JSON.stringify(saveKeyClick)}`);

        const mainStateAfterKeySave = await waitForMainState(
            mainTarget,
            candidate => candidate.aiConfigured === true && candidate.aiConfigSource === 'custom',
            'The saved DeepSeek key did not propagate back to the main window.'
        );
        const settingsAfterSave = await waitForSettingsSnapshot(
            settingsTarget,
            candidate =>
                typeof candidate.feedback === 'string' &&
                candidate.feedback.length > 0 &&
                typeof candidate.modelValue === 'string' &&
                candidate.modelValue.length > 0,
            'The DeepSeek settings window did not show save feedback.'
        );
        await captureScreenshot(settingsTarget, screenshotPaths.settingsAfterSave);
        const mainAfterKeySaveUi = await waitForMainUiSnapshot(
            mainTarget,
            candidate =>
                typeof candidate.aiConfigSummary === 'string' &&
                candidate.aiConfigSummary.length > 0 &&
                candidate.errorText === '',
            'The main window did not refresh after saving the DeepSeek key.'
        );
        await captureScreenshot(mainTarget, screenshotPaths.mainAfterKeySave);

        const formFillResult = await setMainFormValues(mainTarget, {
            projectUrlValue: projectUrl,
            learningModeValue: learningMode
        });
        assert(
            formFillResult.projectUrlValue === projectUrl && formFillResult.learningModeValue === learningMode,
            `The main form was not filled correctly: ${JSON.stringify(formFillResult)}`
        );
        const mainFormFilledUi = await waitForMainUiSnapshot(
            mainTarget,
            candidate => candidate.projectUrlValue === projectUrl && candidate.learningModeValue === learningMode,
            'The main form values did not render in the UI.'
        );
        await captureScreenshot(mainTarget, screenshotPaths.mainFormFilled);

        const analyzeClick = await clickButton(mainTarget, '#analyze-project-url-button');
        assert(
            analyzeClick.ok === true && analyzeClick.disabledImmediately === true,
            `Analyze project URL button did not respond as expected: ${JSON.stringify(analyzeClick)}`
        );

        const projectUrlState = await waitForMainState(
            mainTarget,
            candidate =>
                candidate.status === 'waiting' &&
                candidate.currentTargetName === 'cheese' &&
                Array.isArray(candidate.currentTargetPrograms) &&
                candidate.currentTargetPrograms.length > 0 &&
                candidate.aiStatus === 'ready' &&
                candidate.aiCoachResponse &&
                typeof candidate.aiCoachResponse.answerText === 'string' &&
                candidate.aiCoachResponse.answerText.length > 0,
            'The project URL analysis flow did not finish successfully.'
        );
        const projectUrlUi = await waitForMainUiSnapshot(
            mainTarget,
            candidate =>
                candidate.currentTarget === 'cheese' &&
                Array.isArray(candidate.currentTargetPrograms) &&
                candidate.currentTargetPrograms.length > 0 &&
                typeof candidate.aiAnswer === 'string' &&
                candidate.aiAnswer.length > 0 &&
                typeof candidate.aiNextStep === 'string' &&
                candidate.aiNextStep.length > 0 &&
                (candidate.errorText === '' || candidate.errorText === null),
            'The project URL analysis results did not render correctly.'
        );
        await captureScreenshot(mainTarget, screenshotPaths.mainProjectUrlResult);

        const launchClick = await clickButton(mainTarget, '#launch-button');
        assert(
            launchClick.ok === true && launchClick.disabledImmediately === true,
            `Launch Scratch button did not respond as expected: ${JSON.stringify(launchClick)}`
        );

        const launchLogOffset = await getLogSize();
        const launchLogContent = await waitForLogMarkers(
            ['Scratch launched pid=', 'Bridge script injected via CDP'],
            launchLogOffset,
            'The desktop companion log did not show a successful Scratch launch and injection sequence.'
        );
        launchedScratchProcess = parseLatestScratchLaunchInfo(launchLogContent);
        assert(
            launchedScratchProcess?.debugPort,
            `The desktop companion log did not expose a Scratch debug port: ${launchLogContent}`
        );

        const connectedMainState = await waitForMainState(
            mainTarget,
            candidate =>
                candidate.status === 'connected' &&
                candidate.scratchExecutablePath === scratchExe &&
                candidate.error === undefined,
            'The desktop companion did not connect to Scratch.'
        );
        const connectedMainUi = await waitForMainUiSnapshot(
            mainTarget,
            candidate =>
                typeof candidate.status === 'string' &&
                candidate.status.includes('Scratch') &&
                candidate.buttons?.generateAi === false &&
                (candidate.errorText === '' || candidate.errorText === null),
            'The main window did not show a healthy Scratch-connected state.'
        );
        await captureScreenshot(mainTarget, screenshotPaths.mainScratchConnected);

        const scratchTargetResult = await waitForTargets(
            launchedScratchProcess.debugPort,
            pickScratchTarget,
            'Failed to find the Scratch debug target.'
        );
        const scratchTarget = scratchTargetResult.preferredTarget;

        let loadProjectResult = null;
        let scratchProjectState = null;
        let scratchProjectUi = null;

        if (scratchProjectMode === 'load') {
            loadProjectResult = await loadProjectFromBuffer(
                scratchTarget,
                projectUrl,
                projectBuffer.toString('base64')
            );
            assert(
                loadProjectResult.ok === true &&
                typeof loadProjectResult.currentTargetName === 'string' &&
                loadProjectResult.currentTargetName.length > 0,
                `Scratch did not load the remote project successfully: ${JSON.stringify(loadProjectResult)}`
            );
            await captureScreenshot(scratchTarget, screenshotPaths.scratchProjectLoaded);

            scratchProjectState = await waitForMainState(
                mainTarget,
                candidate =>
                    candidate.status === 'connected' &&
                    candidate.currentTargetName === loadProjectResult.currentTargetName &&
                    Array.isArray(candidate.currentTargetPrograms) &&
                    candidate.currentTargetPrograms.length > 0,
                'The main window did not refresh after the Scratch project was loaded.'
            );
            scratchProjectUi = await waitForMainUiSnapshot(
                mainTarget,
                candidate =>
                    candidate.currentTarget === loadProjectResult.currentTargetName &&
                    Array.isArray(candidate.currentTargetPrograms) &&
                    candidate.currentTargetPrograms.length > 0,
                'The post-load Scratch state did not render in the main UI.'
            );
        } else {
            await captureScreenshot(scratchTarget, screenshotPaths.scratchProjectLoaded);

            scratchProjectState = await waitForMainState(
                mainTarget,
                candidate =>
                    candidate.status === 'connected' &&
                    typeof candidate.currentTargetName === 'string' &&
                    candidate.currentTargetName.length > 0 &&
                    Array.isArray(candidate.currentTargetPrograms) &&
                    candidate.currentTargetPrograms.length === 0 &&
                    typeof candidate.detail === 'string' &&
                    candidate.detail.includes(blankProjectDetailNeedle),
                'The main window did not preserve imported project guidance after a blank Scratch project connected.'
            );
            scratchProjectUi = await waitForMainUiSnapshot(
                mainTarget,
                candidate =>
                    typeof candidate.currentTarget === 'string' &&
                    candidate.currentTarget.length > 0 &&
                    Array.isArray(candidate.currentTargetPrograms) &&
                    candidate.currentTargetPrograms.length === 0 &&
                    typeof candidate.detail === 'string' &&
                    candidate.detail.includes(blankProjectDetailNeedle),
                'The blank Scratch project state did not render correctly in the main UI.'
            );
        }
        await captureScreenshot(mainTarget, screenshotPaths.mainAfterScratchProjectLoad);

        const generateAiClick = await clickButton(mainTarget, '#generate-ai-button');
        assert(
            generateAiClick.ok === true && generateAiClick.disabledImmediately === true,
            `Generate AI button did not respond as expected: ${JSON.stringify(generateAiClick)}`
        );

        const liveAiState = await waitForMainState(
            mainTarget,
            candidate =>
                candidate.status === 'connected' &&
                candidate.aiStatus === 'ready' &&
                candidate.aiProvider === 'deepseek' &&
                typeof candidate.aiModel === 'string' &&
                candidate.aiModel.length > 0 &&
                typeof candidate.aiLastUpdatedAt === 'string' &&
                candidate.aiLastUpdatedAt !== projectUrlState.aiLastUpdatedAt &&
                candidate.aiCoachResponse &&
                typeof candidate.aiCoachResponse.answerText === 'string' &&
                candidate.aiCoachResponse.answerText.length > 0 &&
                typeof candidate.aiCoachResponse.nextStep === 'string' &&
                candidate.aiCoachResponse.nextStep.length > 0,
            'The live AI hint did not return from DeepSeek.'
        );
        const liveAiUi = await waitForMainUiSnapshot(
            mainTarget,
            candidate =>
                typeof candidate.aiStatus === 'string' &&
                candidate.aiStatus.includes('DeepSeek') &&
                !candidate.aiStatus.includes('本地提示') &&
                typeof candidate.aiAnswer === 'string' &&
                candidate.aiAnswer.length > 0 &&
                typeof candidate.aiNextStep === 'string' &&
                candidate.aiNextStep.length > 0,
            'The live AI result did not render as a DeepSeek response in the UI.'
        );
        await captureScreenshot(mainTarget, screenshotPaths.mainLiveAiResult);

        const output = {
            artifactDir,
            summaryPath,
            screenshots: Object.values(screenshotPaths),
            projectUrl,
            learningMode,
            scratchProjectMode,
            electronExe,
            appMain,
            scratchExe,
            userDataDir,
            targets: {
                main: {
                    id: mainTarget.id,
                    title: mainTarget.title,
                    url: mainTarget.url
                },
                settings: {
                    id: settingsTarget.id,
                    title: settingsTarget.title,
                    url: settingsTarget.url
                },
                scratch: {
                    id: scratchTarget.id,
                    title: scratchTarget.title,
                    url: scratchTarget.url
                }
            },
            processes: {
                scratch: sanitizeProcessInfo(launchedScratchProcess)
            },
            checks: {
                projectUrlAiProvider: projectUrlState.aiProvider,
                projectUrlAiModel: projectUrlState.aiModel,
                liveAiProvider: liveAiState.aiProvider,
                liveAiModel: liveAiState.aiModel,
                scratchCurrentTarget:
                    loadProjectResult?.currentTargetName ??
                    scratchProjectState?.currentTargetName ??
                    null
            },
            initialMainUi,
            initialMainState,
            settingsBefore,
            settingsAfterSave,
            mainStateAfterKeySave,
            mainAfterKeySaveUi,
            mainFormFilledUi,
            projectUrlState,
            projectUrlUi,
            connectedMainState,
            connectedMainUi,
            loadProjectResult,
            scratchProjectState,
            scratchProjectUi,
            liveAiState,
            liveAiUi
        };

        await writeFile(summaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
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

        await sleep(1200);

        const removedAppData = await removeDirectoryWithRetries(userDataDir, {
            suppressFinalError: true
        });
        if (!removedAppData) {
            console.warn(
                `[verify-deepseek-live-seq] Failed to remove temp user data directory after retries: ${userDataDir}`
            );
        }
    }
}

await main();
