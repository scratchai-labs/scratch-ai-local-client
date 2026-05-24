import {access, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {
    getDefaultAutomationScratchPath,
    getDefaultElectronBinaryPath,
    getDefaultPackagedCompanionBinaryPath
} from './electron-paths.mjs';
import {probeElectronBinarySupport} from './runtime-support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const verificationRoot = path.join(workspaceRoot, 'tools', 'verification');
const screenshotDir = path.join(workspaceRoot, 'docs', 'assets', 'screenshots');
const screenshotPathDefault = path.join(screenshotDir, 'current-ui-desktop-companion-mock.png');

const argv = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.split('=');
        return [key, rest.join('=') || 'true'];
    })
);

const packagedAppMode = argv.has('--packaged-app');
const electronExe =
    argv.get('--electron-exe') ??
    (packagedAppMode
        ? getDefaultPackagedCompanionBinaryPath(workspaceRoot)
        : getDefaultElectronBinaryPath(workspaceRoot));
const appMain = packagedAppMode
    ? null
    : (
        argv.get('--app-main') ??
        path.join(workspaceRoot, 'apps', 'desktop-companion', 'dist', 'main.js')
    );
const mockStateFile =
    argv.get('--mock-state-file') ??
    path.join(verificationRoot, 'fixtures', 'desktop-companion-mock-state.json');
const debugPort = Number(argv.get('--port') ?? '9344');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '15000');
const screenshotPath = argv.get('--screenshot') ?? screenshotPathDefault;
const automationScratchPath = argv.get('--automation-scratch-path') ?? getDefaultAutomationScratchPath();
const userDataDir = path.join(verificationRoot, 'tmp-desktop-companion-ui-userdata');
const expectedProgram =
    '脚本 1: event_whenflagclicked -> control_forever -> motion_movesteps -> pen_clear';

async function ensureReadable(filePath) {
    await access(filePath);
}

function isInspectablePageTarget(target) {
    return target?.type === 'page' &&
        typeof target.webSocketDebuggerUrl === 'string' &&
        target.webSocketDebuggerUrl.length > 0 &&
        typeof target.url === 'string' &&
        !target.url.startsWith('devtools://') &&
        target.url !== 'about:blank';
}

function pickDesktopCompanionTarget(targets) {
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

async function waitForTargets(port, maxWaitMs) {
    const deadline = Date.now() + maxWaitMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/list`);
            if (response.ok) {
                const parsed = await response.json();
                if (Array.isArray(parsed)) {
                    return {
                        ok: true,
                        targets: parsed,
                        preferredTarget: pickDesktopCompanionTarget(parsed)
                    };
                }
                lastError = 'The /json/list response was not an array.';
            } else {
                lastError = `Unexpected HTTP status: ${response.status}`;
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    return {
        ok: false,
        error: lastError ?? 'Timed out while waiting for Electron /json/list'
    };
}

async function waitForTarget(port, maxWaitMs, picker, errorMessage) {
    const deadline = Date.now() + maxWaitMs;
    let lastError = null;
    while (Date.now() < deadline) {
        const result = await waitForTargets(port, Math.min(2000, Math.max(1000, deadline - Date.now())));
        if (result.ok && Array.isArray(result.targets)) {
            const preferredTarget = picker(result.targets);
            if (preferredTarget) {
                return {
                    ok: true,
                    targets: result.targets,
                    preferredTarget
                };
            }
        } else if (!result.ok) {
            lastError = result.error;
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    return {
        ok: false,
        error: errorMessage ?? lastError ?? 'Timed out while waiting for the requested Electron target.'
    };
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
            reject(new Error('Timed out while opening the desktop companion websocket.'));
        }, maxWaitMs);
        socket.addEventListener('open', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error('Failed to connect to the desktop companion websocket.'));
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

async function captureScreenshot(target, outputPath) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitForWebSocketOpen(socket, timeoutMs);
    try {
        const connection = new CdpConnection(socket);
        await connection.send('Page.enable');
        const response = await connection.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true
        });
        await mkdir(path.dirname(outputPath), {recursive: true});
        await writeFile(outputPath, Buffer.from(response.data, 'base64'));
        return outputPath;
    } finally {
        socket.close();
    }
}

function buildUiSnapshotExpression() {
    return `
(() => ({
  title: document.title,
  href: window.location.href,
  hasApi: typeof window.desktopCompanionApi,
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
  projectUrlInputPresent: document.querySelector("#project-url-input") instanceof HTMLInputElement,
  currentTargetPrograms: Array.from(document.querySelectorAll("#current-target-programs li"))
    .map(element => (element.textContent || "").trim())
    .filter(Boolean)
}))()
    `.trim();
}

async function readUiSnapshot(target) {
    const uiState = await evaluateExpressionInTarget(target, buildUiSnapshotExpression());
    if (!uiState.ok) {
        throw new Error(uiState.error ?? 'Failed to evaluate the desktop companion UI state.');
    }
    return uiState.value ?? {};
}

async function waitForUiSnapshot(target, maxWaitMs, predicate = null) {
    const deadline = Date.now() + maxWaitMs;
    let lastValue = null;
    while (Date.now() < deadline) {
        lastValue = await readUiSnapshot(target);
        if (!predicate || predicate(lastValue)) {
            return lastValue;
        }

        await new Promise(resolve => setTimeout(resolve, 400));
    }

    return lastValue ?? {};
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

async function readSettingsSnapshot(target) {
    const uiState = await evaluateExpressionInTarget(target, buildSettingsSnapshotExpression());
    if (!uiState.ok) {
        throw new Error(uiState.error ?? 'Failed to evaluate the settings UI state.');
    }
    return uiState.value ?? {};
}

async function waitForSettingsSnapshot(target, maxWaitMs, predicate = null) {
    const deadline = Date.now() + maxWaitMs;
    let lastValue = null;
    while (Date.now() < deadline) {
        lastValue = await readSettingsSnapshot(target);
        if (!predicate || predicate(lastValue)) {
            return lastValue;
        }

        await new Promise(resolve => setTimeout(resolve, 400));
    }

    return lastValue ?? {};
}

async function clickButton(target, selector) {
    const clickResult = await evaluateExpressionInTarget(
        target,
        `
(() => {
  const button = document.querySelector(${JSON.stringify(selector)});
  if (!(button instanceof HTMLButtonElement)) {
    return {
      ok: false,
      error: "button-not-found"
    };
  }

  button.click();
  return {
    ok: true,
    disabledImmediately: button.disabled
  };
})()
        `.trim()
    );

    if (!clickResult.ok) {
        throw new Error(clickResult.error ?? `Failed to click button ${selector}.`);
    }

    return clickResult.value ?? {};
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function main() {
    await ensureReadable(electronExe);
    if (appMain) {
        await ensureReadable(appMain);
    }
    await ensureReadable(mockStateFile);

    const runtimeSupport = probeElectronBinarySupport(electronExe);
    if (!runtimeSupport.supported) {
        process.stdout.write(`${JSON.stringify({
            skipped: true,
            reason: runtimeSupport.reason,
            electronExe,
            appMain: appMain ?? undefined,
            probe: runtimeSupport
        }, null, 2)}\n`);
        return;
    }

    const spawnArgs = [
        `--remote-debugging-port=${debugPort}`
    ];
    if (appMain) {
        spawnArgs.push(appMain);
    }
    spawnArgs.push('--automation-actions');
    spawnArgs.push(`--automation-scratch-path=${automationScratchPath}`);

    const child = spawn(
        electronExe,
        spawnArgs,
        {
            cwd: appMain ? path.dirname(appMain) : path.dirname(electronExe),
            env: {
                ...process.env,
                DESKTOP_COMPANION_MOCK_STATE_FILE: mockStateFile,
                DESKTOP_COMPANION_AUTOMATION_ACTIONS: '1',
                DESKTOP_COMPANION_AUTOMATION_SCRATCH_PATH: automationScratchPath,
                SCRATCH_AI_USER_DATA_DIR: userDataDir
            },
            stdio: 'ignore',
            windowsHide: false
        }
    );

    try {
        const targetResult = await waitForTargets(debugPort, timeoutMs);
        if (!targetResult.ok || !targetResult.preferredTarget) {
            throw new Error(targetResult.error ?? 'Failed to find the desktop companion target.');
        }

        const value = await waitForUiSnapshot(
            targetResult.preferredTarget,
            timeoutMs,
            candidate =>
                candidate.status === '已连接到 Scratch Desktop' &&
                candidate.currentTarget === 'Cat' &&
                Array.isArray(candidate.currentTargetPrograms) &&
                candidate.currentTargetPrograms.includes(expectedProgram)
        );
        assert(
            value.status === '已连接到 Scratch Desktop',
            `Desktop companion status did not render the mock state. Actual: ${JSON.stringify(value)}`
        );
        assert(
            value.currentTarget === 'Cat',
            `Desktop companion did not render the current target. Actual: ${JSON.stringify(value)}`
        );
        assert(Array.isArray(value.currentTargetPrograms), 'Desktop companion did not render the current program list.');
        assert(
            value.currentTargetPrograms.includes(expectedProgram),
            `Desktop companion did not render the current target program. Actual: ${JSON.stringify(value)}`
        );
        assert(value.buttons?.choose === false, `Choose button should be enabled. Actual: ${JSON.stringify(value)}`);
        assert(value.buttons?.launch === false, `Launch button should be enabled. Actual: ${JSON.stringify(value)}`);
        assert(value.buttons?.retry === false, `Retry button should be enabled. Actual: ${JSON.stringify(value)}`);
        assert(value.buttons?.settings === false, `Settings button should be enabled. Actual: ${JSON.stringify(value)}`);
        assert(
            value.projectUrlInputPresent === false,
            `Project URL input should not exist in the local-only UI. Actual: ${JSON.stringify(value)}`
        );

        const savedScreenshotPath = await captureScreenshot(targetResult.preferredTarget, screenshotPath);

        const chooseClick = await clickButton(targetResult.preferredTarget, '#choose-scratch-button');
        assert(
            chooseClick.ok === true && chooseClick.disabledImmediately === true,
            `Choose Scratch button did not disable immediately after click. Actual: ${JSON.stringify(chooseClick)}`
        );
        const chooseState = await waitForUiSnapshot(
            targetResult.preferredTarget,
            timeoutMs,
            candidate =>
                candidate.detail === 'automation:chooseScratchExecutable#1' &&
                candidate.scratchPath === automationScratchPath &&
                candidate.buttons?.choose === false
        );
        assert(
            chooseState.detail === 'automation:chooseScratchExecutable#1',
            `Choose Scratch action did not update the UI detail. Actual: ${JSON.stringify(chooseState)}`
        );
        assert(
            chooseState.scratchPath === automationScratchPath,
            `Choose Scratch action did not update the Scratch path. Actual: ${JSON.stringify(chooseState)}`
        );

        const launchClick = await clickButton(targetResult.preferredTarget, '#launch-button');
        assert(
            launchClick.ok === true && launchClick.disabledImmediately === true,
            `Launch Scratch button did not disable immediately after click. Actual: ${JSON.stringify(launchClick)}`
        );
        const launchState = await waitForUiSnapshot(
            targetResult.preferredTarget,
            timeoutMs,
            candidate =>
                candidate.detail === 'automation:launchScratch#1' &&
                candidate.buttons?.launch === false
        );
        assert(
            launchState.detail === 'automation:launchScratch#1',
            `Launch Scratch action did not update the UI detail. Actual: ${JSON.stringify(launchState)}`
        );
        assert(
            launchState.errorText === '',
            `Launch Scratch action rendered an error. Actual: ${JSON.stringify(launchState)}`
        );

        const retryClick = await clickButton(targetResult.preferredTarget, '#retry-button');
        assert(
            retryClick.ok === true && retryClick.disabledImmediately === true,
            `Retry button did not disable immediately after click. Actual: ${JSON.stringify(retryClick)}`
        );
        const retryState = await waitForUiSnapshot(
            targetResult.preferredTarget,
            timeoutMs,
            candidate =>
                candidate.detail === 'automation:retry#1' &&
                candidate.buttons?.retry === false
        );
        assert(
            retryState.detail === 'automation:retry#1',
            `Retry action did not update the UI detail. Actual: ${JSON.stringify(retryState)}`
        );
        assert(
            retryState.errorText === '',
            `Retry action rendered an error. Actual: ${JSON.stringify(retryState)}`
        );

        const settingsClick = await clickButton(targetResult.preferredTarget, '#settings-button');
        assert(
            settingsClick.ok === true,
            `Settings button click failed. Actual: ${JSON.stringify(settingsClick)}`
        );

        const settingsTargetResult = await waitForTarget(
            debugPort,
            timeoutMs,
            pickSettingsTarget,
            'Failed to find the DeepSeek settings target.'
        );
        assert(settingsTargetResult.ok && settingsTargetResult.preferredTarget, settingsTargetResult.error);
        const settingsTarget = settingsTargetResult.preferredTarget;

        const settingsState = await waitForSettingsSnapshot(
            settingsTarget,
            timeoutMs,
            candidate =>
                candidate.title === 'DeepSeek 设置' &&
                candidate.status !== '正在读取当前配置…' &&
                typeof candidate.modelValue === 'string' &&
                candidate.modelValue.length > 0 &&
                candidate.buttons?.save === false
        );
        assert(
            settingsState.title === 'DeepSeek 设置',
            `Settings window did not open with the expected title. Actual: ${JSON.stringify(settingsState)}`
        );
        assert(
            typeof settingsState.modelValue === 'string' && settingsState.modelValue.length > 0,
            `Settings window did not render the model selector. Actual: ${JSON.stringify(settingsState)}`
        );
        assert(
            settingsState.buttons?.save === false,
            `Settings save button should be enabled. Actual: ${JSON.stringify(settingsState)}`
        );

        const output = {
            electronExe,
            appMain,
            mockStateFile,
            port: debugPort,
            selectedTarget: {
                id: targetResult.preferredTarget.id,
                title: targetResult.preferredTarget.title,
                url: targetResult.preferredTarget.url
            },
            screenshotPath: savedScreenshotPath,
            ui: value,
            buttonChecks: {
                chooseClick,
                chooseState,
                launchClick,
                launchState,
                retryClick,
                retryState,
                settingsClick,
                settingsState
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
    }
}

await main();
