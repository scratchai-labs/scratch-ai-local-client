import {access, readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

import {isSupportedScratchExecutablePath} from './scratch-executable-paths.mjs';

const argv = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.split('=');
        return [key, rest.join('=') || 'true'];
    })
);

const userDesktop = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : null;
const publicDesktop = process.env.PUBLIC ? path.join(process.env.PUBLIC, 'Desktop') : null;
const requestedExe = argv.get('--exe') ?? null;
const shouldLaunchDebug = argv.has('--launch-debug');
const shouldKillOnExit = argv.has('--kill-on-exit');
const shouldTestCdpEval = argv.has('--test-cdp-eval');
const port = Number(argv.get('--port') ?? '9333');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '15000');
const evaluationExpression = argv.get('--expression') ?? 'window.location.href';

const executableNames = ['Scratch.exe', 'Scratch 3.exe'];

function pushCandidate(candidates, value) {
    if (!value) return;
    const normalized = path.normalize(value.trim());
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
}

function buildScratchExecutableCandidates(env = process.env) {
    const candidates = [];
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)']];
    for (const root of roots) {
        for (const executableName of executableNames) {
            pushCandidate(candidates, root ? path.join(root, 'Scratch 3', executableName) : null);
        }
    }
    const localRoots = [
        ['Programs', 'scratch-desktop'],
        ['Programs', 'Scratch 3']
    ];
    for (const segments of localRoots) {
        for (const executableName of executableNames) {
            pushCandidate(
                candidates,
                env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, ...segments, executableName) : null
            );
        }
    }
    return candidates;
}

function isInspectablePageTarget(target) {
    return target?.type === 'page' &&
        typeof target.webSocketDebuggerUrl === 'string' &&
        target.webSocketDebuggerUrl.length > 0 &&
        typeof target.url === 'string' &&
        !target.url.startsWith('devtools://') &&
        target.url !== 'about:blank';
}

function isScratchEditorTarget(target) {
    if (!isInspectablePageTarget(target)) return false;
    const normalizedUrl = target.url.toLowerCase();
    if (!normalizedUrl.includes('/index.html')) return false;
    return !normalizedUrl.includes('?route=about') &&
        !normalizedUrl.includes('?route=privacy') &&
        !normalizedUrl.includes('?route=usb');
}

function isPrimaryScratchEditorTarget(target) {
    return isInspectablePageTarget(target) &&
        typeof target.url === 'string' &&
        target.url.toLowerCase().endsWith('/index.html');
}

function pickScratchEditorTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(isPrimaryScratchEditorTarget) ??
        inspectableTargets.find(isScratchEditorTarget) ??
        inspectableTargets[0] ??
        null;
}

function resolveShortcut(shortcutPath) {
    const command = [
        '$ws=New-Object -ComObject WScript.Shell;',
        `$sc=$ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');`,
        '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
        '$result=@{ target=$sc.TargetPath; arguments=$sc.Arguments; workingDirectory=$sc.WorkingDirectory };',
        '$result | ConvertTo-Json -Compress'
    ].join(' ');
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `Failed to resolve shortcut: ${shortcutPath}`);
    }
    return JSON.parse(result.stdout.trim());
}

async function findShortcutTargets() {
    const directories = [userDesktop, publicDesktop].filter(Boolean);
    const targets = [];
    for (const directory of directories) {
        let entries = [];
        try {
            entries = await readdir(directory);
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.toLowerCase().endsWith('.lnk') || !entry.toLowerCase().includes('scratch')) continue;
            const shortcutPath = path.join(directory, entry);
            try {
                const resolved = resolveShortcut(shortcutPath);
                if (resolved.target && isSupportedScratchExecutablePath(resolved.target)) {
                    targets.push({
                        shortcutPath,
                        targetPath: path.normalize(resolved.target),
                        arguments: resolved.arguments || '',
                        workingDirectory: resolved.workingDirectory || ''
                    });
                }
            } catch (error) {
                targets.push({
                    shortcutPath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    return targets;
}

async function findExistingCandidates() {
    const candidates = [];
    for (const candidate of buildScratchExecutableCandidates()) {
        try {
            await access(candidate);
            candidates.push(candidate);
        } catch {
            // ignore missing candidates
        }
    }
    return candidates;
}

async function waitForDebugTargets(debugPort, maxWaitMs) {
    const deadline = Date.now() + maxWaitMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
            if (response.ok) {
                const parsed = await response.json();
            if (Array.isArray(parsed)) {
                return {
                    ok: true,
                    targets: parsed,
                    preferredTarget: pickScratchEditorTarget(parsed)
                };
            }
            }
            lastError = `Unexpected HTTP status: ${response.status}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return {
        ok: false,
        error: lastError ?? 'Timed out while waiting for /json/list'
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
        const timer = setTimeout(() => reject(new Error('Timed out while opening CDP websocket')), maxWaitMs);
        socket.addEventListener('open', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error('Failed to open CDP websocket'));
        });
    });
}

async function evaluateTarget(target, expression) {
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
            expression,
            value: response.result?.value,
            type: response.result?.type
        };
    } catch (error) {
        return {
            ok: false,
            expression,
            error: error instanceof Error ? error.message : String(error)
        };
    } finally {
        socket.close();
    }
}

async function verifyRemoteDebugging(executablePath) {
    const child = spawn(executablePath, [`--remote-debugging-port=${port}`], {
        cwd: path.dirname(executablePath),
        detached: false,
        stdio: 'ignore',
        windowsHide: false
    });
    const pid = await new Promise((resolve, reject) => {
        child.once('spawn', () => {
            if (!child.pid) {
                reject(new Error('Scratch started without pid'));
                return;
            }
            resolve(child.pid);
        });
        child.once('error', reject);
    });
    const result = await waitForDebugTargets(port, timeoutMs);
    if (result.ok && shouldTestCdpEval && result.preferredTarget) {
        result.evaluation = await evaluateTarget(result.preferredTarget, evaluationExpression);
    }
    if (shouldKillOnExit && child.pid) {
        try {
            process.kill(child.pid);
        } catch {
            // ignore
        }
    }
    return {
        pid,
        port,
        ...result
    };
}

async function main() {
    const detectedCandidates = await findExistingCandidates();
    const shortcutTargets = await findShortcutTargets();
    const summary = {
        requestedExe,
        detectedCandidates,
        shortcutTargets
    };

    if (requestedExe && !isSupportedScratchExecutablePath(requestedExe)) {
        summary.requestedExeError = 'The provided --exe is not a supported Scratch executable path.';
    }

    if (shouldLaunchDebug && requestedExe) {
        summary.remoteDebugging = await verifyRemoteDebugging(requestedExe);
    }

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main();
