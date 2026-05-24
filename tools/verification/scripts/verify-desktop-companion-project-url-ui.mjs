import {access, mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {getDefaultElectronBinaryPath} from './electron-paths.mjs';
import {probeElectronBinarySupport} from './runtime-support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const verificationRoot = path.join(workspaceRoot, 'tools', 'verification');
const screenshotDir = path.join(workspaceRoot, 'docs', 'assets', 'screenshots');

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
const debugPort = Number(argv.get('--port') ?? '9348');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '45000');
const expectDeepSeek = argv.has('--expect-deepseek');
const projectUrl = getTextArg(
    '--project-url',
    'https://raw.githubusercontent.com/tesths/scratchai/refs/heads/main/tools/verification/fixtures/projects/cat-and-a-mouse/source/Cat%20and%20a%20Mouse.sb3'
);
const deepseekApiKey = getTextArg('--deepseek-api-key', '');
const learningMode = argv.get('--learning-mode') === 'self-paced' ? 'self-paced' : 'follow-teacher';
const appDataDir =
    argv.get('--appdata-dir') ??
    path.join(verificationRoot, 'tmp-project-url-ui-appdata');
const userDataDir = path.join(appDataDir, '@scratch-ai', 'desktop-companion');
const beforeScreenshotPath =
    argv.get('--before-screenshot') ??
    path.join(screenshotDir, 'current-ui-project-url-before.png');
const afterScreenshotPath =
    argv.get('--after-screenshot') ??
    path.join(screenshotDir, 'current-ui-project-url-after.png');

async function ensureReadable(filePath) {
    await access(filePath);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
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

function pickDesktopCompanionTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(target => {
        const title = typeof target.title === 'string' ? target.title.trim() : '';
        const url = typeof target.url === 'string' ? target.url.toLowerCase() : '';
        if (title.includes('Scratch AI')) {
            return true;
        }
        return title.includes('Scratch AI 教练') || url.endsWith('/index.html') || url.includes('index.html');
    }) ?? inspectableTargets[0] ?? null;
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
        await mkdir(path.dirname(outputPath), {recursive: true});
        await writeFile(outputPath, Buffer.from(response.data, 'base64'));
        return outputPath;
    });
}

function buildUiSnapshotExpression() {
    return `
(() => ({
  title: document.title,
  href: window.location.href,
  status: document.querySelector("#status")?.textContent?.trim() ?? null,
  detail: document.querySelector("#detail")?.textContent?.trim() ?? null,
  currentTarget: document.querySelector("#current-target")?.textContent?.trim() ?? null,
  updatedAt: document.querySelector("#updated-at")?.textContent?.trim() ?? null,
  scratchPath: document.querySelector("#scratch-path")?.textContent?.trim() ?? null,
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
    analyzeProjectUrl: document.querySelector("#analyze-project-url-button") instanceof HTMLButtonElement
      ? document.querySelector("#analyze-project-url-button").disabled
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
  aiDetectedIssues: Array.from(document.querySelectorAll("#ai-detected-issues li:not(.empty)"))
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

async function setFormValues(target, {projectUrlValue, learningModeValue}) {
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
        throw new Error(result.error ?? 'Failed to fill the form fields.');
    }

    return result.value ?? {};
}

async function main() {
    await ensureReadable(electronExe);
    await ensureReadable(appMain);

    const runtimeSupport = probeElectronBinarySupport(electronExe);
    if (!runtimeSupport.supported) {
        process.stdout.write(`${JSON.stringify({
            skipped: true,
            reason: runtimeSupport.reason,
            electronExe,
            appMain,
            expectDeepSeek,
            probe: runtimeSupport
        }, null, 2)}\n`);
        return;
    }

    await rm(appDataDir, {recursive: true, force: true});
    await mkdir(appDataDir, {recursive: true});

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
                APPDATA: appDataDir,
                DEEPSEEK_API_KEY: deepseekApiKey,
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

        const initialUi = await waitForUiSnapshot(
            targetResult.preferredTarget,
            timeoutMs,
            candidate =>
                candidate.projectUrlInputPresent === true &&
                candidate.buttons?.analyzeProjectUrl === false &&
                typeof candidate.status === 'string' &&
                candidate.status.length > 0
        );

        assert(
            initialUi.projectUrlInputPresent === true,
            `Project URL input did not render. Actual: ${JSON.stringify(initialUi)}`
        );
        assert(
            initialUi.buttons?.analyzeProjectUrl === false,
            `Project URL analyze button should be enabled. Actual: ${JSON.stringify(initialUi)}`
        );

        const savedBeforeScreenshotPath = await captureScreenshot(targetResult.preferredTarget, beforeScreenshotPath);
        const fillResult = await setFormValues(targetResult.preferredTarget, {
            projectUrlValue: projectUrl,
            learningModeValue: learningMode
        });
        assert(fillResult.ok === true, `Failed to set project URL form values. Actual: ${JSON.stringify(fillResult)}`);

        const analyzeClick = await clickButton(targetResult.preferredTarget, '#analyze-project-url-button');
        assert(
            analyzeClick.ok === true && analyzeClick.disabledImmediately === true,
            `Analyze project URL button did not disable immediately after click. Actual: ${JSON.stringify(analyzeClick)}`
        );

        const resultUi = await waitForUiSnapshot(
            targetResult.preferredTarget,
            timeoutMs,
            candidate =>
                candidate.currentTarget === 'cheese' &&
                Array.isArray(candidate.currentTargetPrograms) &&
                candidate.currentTargetPrograms.length > 0 &&
                Array.isArray(candidate.aiRecommendedBlocks) &&
                candidate.aiRecommendedBlocks.length > 0 &&
                (!expectDeepSeek || (
                    typeof candidate.aiStatus === 'string' &&
                    candidate.aiStatus.includes('DeepSeek') &&
                    !candidate.aiStatus.includes('本地提示')
                )) &&
                (candidate.errorText === '' || candidate.errorText === null)
        );

        assert(
            resultUi.currentTarget === 'cheese',
            `The project URL flow did not focus the expected target. Actual: ${JSON.stringify(resultUi)}`
        );
        assert(
            resultUi.currentTargetPrograms.length > 0,
            `The project URL flow did not render current target programs. Actual: ${JSON.stringify(resultUi)}`
        );
        assert(
            resultUi.aiRecommendedBlocks.length > 0,
            `The project URL flow did not render AI recommended blocks. Actual: ${JSON.stringify(resultUi)}`
        );
        if (expectDeepSeek) {
            assert(
                typeof resultUi.aiStatus === 'string' &&
                resultUi.aiStatus.includes('DeepSeek') &&
                !resultUi.aiStatus.includes('本地提示'),
                `The project URL flow did not use DeepSeek. Actual: ${JSON.stringify(resultUi)}`
            );
        }

        const savedAfterScreenshotPath = await captureScreenshot(targetResult.preferredTarget, afterScreenshotPath);

        const output = {
            electronExe,
            appMain,
            port: debugPort,
            appDataDir,
            userDataDir,
            expectDeepSeek,
            projectUrl,
            learningMode,
            screenshots: {
                before: savedBeforeScreenshotPath,
                after: savedAfterScreenshotPath
            },
            selectedTarget: {
                id: targetResult.preferredTarget.id,
                title: targetResult.preferredTarget.title,
                url: targetResult.preferredTarget.url
            },
            initialUi,
            fillResult,
            analyzeClick,
            resultUi
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
