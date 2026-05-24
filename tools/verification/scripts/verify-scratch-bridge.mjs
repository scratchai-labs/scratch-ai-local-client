import {access, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:net';

import {summarizeProgramAreaModulesFromProject} from '@scratch-ai/shared';
import {isSupportedScratchExecutablePath} from './scratch-executable-paths.mjs';

const argv = new Map(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.split('=');
        return [key, rest.join('=') || 'true'];
    })
);

const executableNames = ['Scratch.exe', 'Scratch 3.exe'];
const requestedExe = argv.get('--exe') ?? null;
const shouldKillOnExit = argv.has('--kill-on-exit');
const timeoutMs = Number(argv.get('--timeout-ms') ?? '20000');
const debugPortArg = argv.get('--port');
const payloadTimeoutMs = Number(argv.get('--payload-timeout-ms') ?? String(timeoutMs));
const injectionAttempts = Number(argv.get('--injection-attempts') ?? '1');
const injectionSettleMs = Number(argv.get('--injection-settle-ms') ?? '8000');
const fullPayload = argv.has('--full-payload');
const includeVmDiagnostics = argv.has('--include-vm-diagnostics');
const loadExtensionId = argv.get('--load-extension') ?? null;
const addBlockOpcode = argv.get('--add-block-opcode') ?? null;
const scenario = argv.get('--scenario') ?? null;
const loadProjectFileArg = argv.get('--load-project-file') ?? null;
const postActionPayloadTimeoutMs = Number(argv.get('--post-action-payload-timeout-ms') ?? String(payloadTimeoutMs));
const postActionSettleMs = Number(argv.get('--post-action-settle-ms') ?? '1500');

function pushCandidate(candidates, value) {
    if (!value) return;
    const normalized = path.normalize(value.trim());
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
}

function pushScratchExecutableCandidate(candidates, baseDir, ...segments) {
    if (!baseDir) return;
    pushCandidate(candidates, path.join(baseDir, ...segments));
}

function buildScratchExecutableCandidates(env = process.env) {
    const candidates = [];
    pushScratchExecutableCandidate(candidates, env.ProgramFiles, 'Scratch 3', 'Scratch.exe');
    pushScratchExecutableCandidate(candidates, env.ProgramFiles, 'Scratch 3', 'Scratch 3.exe');
    pushScratchExecutableCandidate(candidates, env['ProgramFiles(x86)'], 'Scratch 3', 'Scratch.exe');
    pushScratchExecutableCandidate(candidates, env['ProgramFiles(x86)'], 'Scratch 3', 'Scratch 3.exe');
    pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, 'Programs', 'scratch-desktop', 'Scratch.exe');
    pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, 'Programs', 'scratch-desktop', 'Scratch 3.exe');
    pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, 'Programs', 'Scratch 3', 'Scratch.exe');
    pushScratchExecutableCandidate(candidates, env.LOCALAPPDATA, 'Programs', 'Scratch 3', 'Scratch 3.exe');
    return candidates;
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
    const directories = [
        process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : null,
        process.env.PUBLIC ? path.join(process.env.PUBLIC, 'Desktop') : null
    ].filter(Boolean);
    const results = [];
    for (const directory of directories) {
        let entries = [];
        try {
            entries = await readdir(directory);
        } catch {
            continue;
        }
        for (const entry of entries) {
            const lowered = entry.toLowerCase();
            if (!lowered.endsWith('.lnk') || !lowered.includes('scratch')) continue;
            const shortcutPath = path.join(directory, entry);
            try {
                const resolved = resolveShortcut(shortcutPath);
                results.push({
                    shortcutPath,
                    targetPath: resolved.target ? path.normalize(resolved.target) : '',
                    arguments: resolved.arguments || '',
                    workingDirectory: resolved.workingDirectory || '',
                    isScratchExecutable: resolved.target ? isSupportedScratchExecutablePath(resolved.target) : false
                });
            } catch (error) {
                results.push({
                    shortcutPath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    return results;
}

async function findExistingCandidates() {
    const existing = [];
    for (const candidate of buildScratchExecutableCandidates()) {
        try {
            await access(candidate);
            existing.push(candidate);
        } catch {
            // ignore missing candidates
        }
    }
    return existing;
}

function isInspectablePageTarget(target) {
    return target?.type === 'page' &&
        typeof target.webSocketDebuggerUrl === 'string' &&
        target.webSocketDebuggerUrl.length > 0 &&
        typeof target.url === 'string' &&
        !target.url.startsWith('devtools://') &&
        target.url !== 'about:blank';
}

function isScratchPageTarget(target) {
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

function pickScratchPageTarget(targets) {
    const inspectableTargets = targets.filter(isInspectablePageTarget);
    return inspectableTargets.find(isPrimaryScratchEditorTarget) ??
        inspectableTargets.find(isScratchPageTarget) ??
        inspectableTargets[0] ??
        null;
}

async function getAvailablePort() {
    const server = createServer();
    return await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Failed to allocate a local port.'));
                return;
            }
            const port = address.port;
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
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
                        preferredTarget: pickScratchPageTarget(parsed)
                    };
                }
                lastError = 'The /json/list response was not an array.';
            } else {
                lastError = `Unexpected HTTP status: ${response.status}`;
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return {
        ok: false,
        error: lastError ?? 'Timed out while waiting for Scratch /json/list'
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
            reject(new Error('Timed out while opening the Scratch debug websocket.'));
        }, maxWaitMs);
        socket.addEventListener('open', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error('Failed to connect to the Scratch debug websocket.'));
        });
    });
}

class ScratchBridgeServer {
    constructor() {
        this.token = randomUUID();
        this.port = null;
        this.server = null;
        this.payloads = [];
        this.errors = [];
        this.pendingResolve = null;
    }

    getToken() {
        return this.token;
    }

    getBaseUrl() {
        if (!this.port) {
            throw new Error('Bridge server has not started yet.');
        }
        return `http://127.0.0.1:${this.port}`;
    }

    async start() {
        if (this.server) return;
        this.server = http.createServer((request, response) => {
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Access-Control-Allow-Headers', 'content-type, x-monitor-token');
            response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (request.method === 'OPTIONS') {
                response.writeHead(204);
                response.end();
                return;
            }
            if (request.method === 'GET' && request.url === '/health') {
                response.writeHead(200, {'content-type': 'application/json'});
                response.end(JSON.stringify({ok: true}));
                return;
            }
            if (request.method !== 'POST' || request.url !== '/api/scratch-state') {
                response.writeHead(404);
                response.end();
                return;
            }
            if (request.headers['x-monitor-token'] !== this.token) {
                response.writeHead(401);
                response.end();
                return;
            }
            const chunks = [];
            request.on('data', chunk => {
                chunks.push(chunk);
            });
            request.on('end', () => {
                try {
                    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    this.payloads.push(payload);
                    if (this.pendingResolve) {
                        this.pendingResolve(payload);
                        this.pendingResolve = null;
                    }
                    response.writeHead(204);
                    response.end();
                } catch (error) {
                    this.errors.push(error instanceof Error ? error.message : String(error));
                    response.writeHead(400);
                    response.end();
                }
            });
            request.on('error', error => {
                this.errors.push(error.message);
                response.writeHead(500);
                response.end();
            });
        });
        await new Promise((resolve, reject) => {
            this.server.listen(0, '127.0.0.1', () => {
                const address = this.server.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('Failed to bind bridge server.'));
                    return;
                }
                this.port = address.port;
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    async waitForPayload(maxWaitMs) {
        if (this.payloads.length > 0) {
            return this.payloads[this.payloads.length - 1];
        }
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingResolve = null;
                reject(new Error('Timed out while waiting for Scratch bridge payload.'));
            }, maxWaitMs);
            this.pendingResolve = payload => {
                clearTimeout(timer);
                resolve(payload);
            };
        });
    }

    async waitForPayloadAfterCount(previousCount, maxWaitMs) {
        if (this.payloads.length > previousCount) {
            return this.payloads[this.payloads.length - 1];
        }
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingResolve = null;
                reject(new Error('Timed out while waiting for the next Scratch bridge payload.'));
            }, maxWaitMs);
            this.pendingResolve = payload => {
                clearTimeout(timer);
                resolve(payload);
            };
        });
    }

    async stop() {
        if (!this.server) return;
        const server = this.server;
        this.server = null;
        this.port = null;
        await new Promise((resolve, reject) => {
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}

function buildDesktopInjectionScript(apiBaseUrl, token) {
    return `
(() => {
  if (window.__scratchDesktopCompanionBridgeInstalled) {
    if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
      window.__scratchDesktopCompanionCaptureNow("reinject");
    }
    return "scratch-desktop-companion:already-installed";
  }

  window.__scratchDesktopCompanionBridgeInstalled = true;

  const API_BASE_URL = ${JSON.stringify(apiBaseUrl)};
  const TOKEN = ${JSON.stringify(token)};
  const CORE_PREFIXES = new Set([
    "argument",
    "colour",
    "control",
    "data",
    "event",
    "looks",
    "math",
    "motion",
    "operator",
    "procedures",
    "sensing",
    "sound"
  ]);
  const MODULE_LABELS = {
    motion: "运动",
    looks: "外观",
    sound: "声音",
    event: "事件",
    control: "控制",
    sensing: "侦测",
    operator: "运算",
    data: "变量和列表",
    procedures: "自制积木",
    colour: "颜色",
    pen: "画笔",
    music: "音乐",
    translate: "翻译",
    videoSensing: "视频侦测",
    text2speech: "文字转语音",
    microbit: "micro:bit",
    wedo2: "WeDo 2.0",
    makeymakey: "Makey Makey",
    ev3: "EV3",
    boost: "BOOST",
    gdxfor: "Go Direct Force & Acceleration",
    mesh: "Mesh"
  };

  let vmCandidate = null;
  let listenersAttached = false;
  let scheduledTimer = 0;
  const REACT_NODE_PREFIXES = ["__reactFiber$", "__reactContainer$", "__reactInternalInstance$"];

  function uniqueStrings(values) {
    const result = [];
    const seen = new Set();
    for (const rawValue of values || []) {
      if (typeof rawValue !== "string") {
        continue;
      }
      const value = rawValue.trim();
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  function getScratchPid() {
    try {
      if (typeof require === "function") {
        return require("node:process").pid;
      }
    } catch {}
    return undefined;
  }

  function normalizeExtensionId(prefix) {
    const normalized = String(prefix || "").replace(/[^\\w-]/g, "-");
    if (!normalized || CORE_PREFIXES.has(normalized)) {
      return null;
    }
    return normalized;
  }

  function getExtensionIdForOpcode(opcode) {
    if (typeof opcode !== "string") {
      return null;
    }
    const separatorIndex = opcode.indexOf("_");
    if (separatorIndex <= 0) {
      return null;
    }
    return normalizeExtensionId(opcode.slice(0, separatorIndex));
  }

  function getModuleIdForOpcode(opcode) {
    if (typeof opcode !== "string") {
      return null;
    }
    const separatorIndex = opcode.indexOf("_");
    if (separatorIndex <= 0) {
      return null;
    }
    const prefix = opcode.slice(0, separatorIndex);
    if (prefix === "argument") {
      return "procedures";
    }
    if (prefix === "math") {
      return "operator";
    }
    return CORE_PREFIXES.has(prefix) ? prefix : normalizeExtensionId(prefix);
  }

  function parseProjectData(rawProject) {
    if (!rawProject) {
      return null;
    }
    if (typeof rawProject === "string") {
      try {
        const parsed = JSON.parse(rawProject);
        return parsed && Array.isArray(parsed.targets) ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof rawProject === "object" && Array.isArray(rawProject.targets)) {
      return rawProject;
    }
    return null;
  }

  function getUsedExtensions(projectData) {
    const used = new Set();
    for (const target of projectData.targets || []) {
      const blocks = target && target.blocks ? Object.values(target.blocks) : [];
      for (const block of blocks) {
        const extensionId = getExtensionIdForOpcode(block && block.opcode);
        if (extensionId) {
          used.add(extensionId);
        }
      }
    }
    if (Array.isArray(projectData.monitors)) {
      for (const monitor of projectData.monitors) {
        const extensionId = getExtensionIdForOpcode(monitor && monitor.opcode);
        if (extensionId) {
          used.add(extensionId);
        }
      }
    }
    return Array.from(used).sort();
  }

  function getLoadedExtensions(vm) {
    try {
      return Array.from(vm.extensionManager._loadedExtensions.keys()).sort();
    } catch {
      return [];
    }
  }

  function isVmLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.runtime &&
      Array.isArray(value.runtime.targets) &&
      typeof value.toJSON === "function"
    );
  }

  function findVmOnWindow() {
    const knownKeys = ["vm", "__scratchVm", "__vm"];
    for (const key of knownKeys) {
      const candidate = window[key];
      if (isVmLike(candidate)) {
        return candidate;
      }
    }

    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const candidate = window[key];
        if (isVmLike(candidate)) {
          return candidate;
        }
        if (candidate && typeof candidate === "object" && "vm" in candidate && isVmLike(candidate.vm)) {
          return candidate.vm;
        }
      } catch {}
    }
    return null;
  }

  function findVmInFiberNode(node) {
    const queue = [node];
    const visited = new Set();

    while (queue.length > 0 && visited.size < 400) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) {
        continue;
      }
      visited.add(current);

      const candidateProps = [current.memoizedProps, current.pendingProps, current.stateNode && current.stateNode.props];
      for (const props of candidateProps) {
        if (!props || typeof props !== "object") {
          continue;
        }
        if ("vm" in props && isVmLike(props.vm)) {
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

  function findVmFromReactTree() {
    const candidates = document.querySelectorAll("#app, [class*='gui_page-wrapper'], [class*='gui_body-wrapper']");
    for (const element of candidates) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!REACT_NODE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          continue;
        }
        const maybeVm = findVmInFiberNode(element[key]);
        if (maybeVm) {
          return maybeVm;
        }
      }
    }
    return null;
  }

  function findToolboxXmlInFiberNode(node) {
    const queue = [node];
    const visited = new Set();

    while (queue.length > 0 && visited.size < 500) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) {
        continue;
      }
      visited.add(current);

      const candidateProps = [current.memoizedProps, current.pendingProps, current.stateNode && current.stateNode.props];
      for (const props of candidateProps) {
        if (!props || typeof props !== "object") {
          continue;
        }
        if (typeof props.toolboxXML === "string" && props.toolboxXML.includes("<category")) {
          return props.toolboxXML;
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

  function findToolboxXmlFromReactTree() {
    const candidates = document.querySelectorAll("#app, [class*='gui_page-wrapper'], [class*='gui_body-wrapper']");
    for (const element of candidates) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!REACT_NODE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          continue;
        }
        const toolboxXml = findToolboxXmlInFiberNode(element[key]);
        if (toolboxXml) {
          return toolboxXml;
        }
      }
    }
    return null;
  }

  function getToolboxCategoriesFromXml(toolboxXml) {
    if (typeof toolboxXml !== "string" || !toolboxXml) {
      return [];
    }
    try {
      const documentNode = new DOMParser().parseFromString(toolboxXml, "text/xml");
      const categories = Array.from(documentNode.querySelectorAll("category")).map((category) =>
        category.getAttribute("name") || category.getAttribute("toolboxitemid") || ""
      );
      return uniqueStrings(categories);
    } catch {
      return [];
    }
  }

  function getToolboxCategoriesFromDom() {
    const textSelectors = [
      ".scratchCategoryItemBubble",
      ".scratchCategoryItemLabel",
      ".scratchCategoryMenuItemLabel",
      ".blocklyTreeLabel",
      ".blocklyFlyoutLabelText text",
      ".blocklyTreeRow text"
    ];
    const values = [];
    for (const selector of textSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = element.textContent;
        if (text) {
          values.push(text);
        }
      }
    }
    return uniqueStrings(values);
  }

  function getToolboxCategories() {
    const toolboxXml = findToolboxXmlFromReactTree();
    const xmlCategories = getToolboxCategoriesFromXml(toolboxXml);
    const domCategories = getToolboxCategoriesFromDom();
    if (xmlCategories.length > 0) {
      const hasUnresolvedBlocklyTokens = xmlCategories.some((category) => /^%\\{BKY_[A-Z0-9_]+\\}$/.test(category));
      if (hasUnresolvedBlocklyTokens && domCategories.length >= xmlCategories.length) {
        return domCategories;
      }
      return xmlCategories;
    }
    return domCategories;
  }

  function ensureVm() {
    if (vmCandidate && isVmLike(vmCandidate)) {
      return vmCandidate;
    }
    vmCandidate = findVmOnWindow() || findVmFromReactTree();
    return vmCandidate;
  }

  function getCurrentTargetMeta(vm) {
    const target = vm && vm.editingTarget ? vm.editingTarget : null;
    return {
      id: target && typeof target.id === "string" ? target.id : undefined,
      name:
        (target && target.sprite && typeof target.sprite.name === "string" && target.sprite.name) ||
        (target && typeof target.getName === "function" && target.getName()) ||
        undefined,
      isStage: target ? Boolean(target.isStage) : undefined
    };
  }

  function pickProjectTarget(projectData, currentTargetMeta) {
    const targets = Array.isArray(projectData && projectData.targets) ? projectData.targets : [];
    if (targets.length === 0) {
      return null;
    }
    if (currentTargetMeta && currentTargetMeta.id) {
      const byId = targets.find((target) => target && target.id === currentTargetMeta.id);
      if (byId) {
        return byId;
      }
    }
    if (currentTargetMeta && currentTargetMeta.name) {
      const byName = targets.find((target) => target && target.name === currentTargetMeta.name);
      if (byName) {
        return byName;
      }
    }
    return targets.find((target) => target && target.isStage === false) || targets[0] || null;
  }

  function getProgramAreaModules(projectData, currentTargetMeta) {
    const target = pickProjectTarget(projectData, currentTargetMeta);
    const blocks = target && target.blocks ? Object.values(target.blocks) : [];
    const counts = new Map();
    for (const block of blocks) {
      if (!block || block.shadow === true || typeof block.opcode !== "string") {
        continue;
      }
      const moduleId = getModuleIdForOpcode(block.opcode);
      if (!moduleId) {
        continue;
      }
      counts.set(moduleId, (counts.get(moduleId) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, blockCount]) => ({
        id,
        label: MODULE_LABELS[id] || id,
        blockCount
      }))
      .sort((left, right) => {
        if (right.blockCount !== left.blockCount) {
          return right.blockCount - left.blockCount;
        }
        return String(left.label).localeCompare(String(right.label), "zh-CN");
      });
  }

  function postSnapshot(source) {
    const toolboxCategories = getToolboxCategories();
    const vm = ensureVm();
    if (!vm && toolboxCategories.length === 0) {
      return;
    }
    if (vm) {
      installListeners(vm);
    }

    let rawProject = null;
    if (vm) {
      try {
        rawProject = vm.toJSON();
      } catch {}
    }

    const projectData = parseProjectData(rawProject);
    const currentTargetMeta = vm ? getCurrentTargetMeta(vm) : {};
    const programAreaModules = projectData ? getProgramAreaModules(projectData, currentTargetMeta) : [];

    fetch(API_BASE_URL + "/api/scratch-state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-monitor-token": TOKEN
      },
      body: JSON.stringify({
        bridgeVersion: "1",
        source,
        capturedAt: new Date().toISOString(),
        scratchPid: getScratchPid(),
        currentTargetId: currentTargetMeta.id,
        currentTargetName: currentTargetMeta.name,
        currentTargetIsStage: currentTargetMeta.isStage,
        toolboxCategories,
        loadedExtensions: vm ? getLoadedExtensions(vm) : [],
        usedExtensions: projectData ? getUsedExtensions(projectData) : [],
        programAreaModules,
        projectData
      })
    }).catch(() => {});
  }

  function scheduleSnapshot(source) {
    if (scheduledTimer) {
      window.clearTimeout(scheduledTimer);
    }
    scheduledTimer = window.setTimeout(() => postSnapshot(source), 500);
  }

  function installListeners(vm) {
    if (listenersAttached || typeof vm.on !== "function") {
      return;
    }
    listenersAttached = true;
    vm.on("PROJECT_CHANGED", () => scheduleSnapshot("project-changed"));
    vm.on("EXTENSION_ADDED", () => scheduleSnapshot("extension-added"));
  }

  window.__scratchDesktopCompanionCaptureNow = postSnapshot;

  window.addEventListener("keyup", () => scheduleSnapshot("keyup"), true);
  window.addEventListener("pointerup", () => scheduleSnapshot("pointerup"), true);
  window.setInterval(() => postSnapshot("heartbeat"), 4000);
  postSnapshot("bootstrap");

  return "scratch-desktop-companion:installed";
})();
`.trim();
}

async function launchScratch(executablePath, forcedPort) {
    await access(executablePath);
    const debugPort = forcedPort ?? await getAvailablePort();
    const child = spawn(executablePath, [`--remote-debugging-port=${debugPort}`], {
        cwd: path.dirname(executablePath),
        stdio: 'ignore',
        windowsHide: false
    });
    const pid = await new Promise((resolve, reject) => {
        child.once('spawn', () => {
            if (!child.pid) {
                reject(new Error('Scratch started without a pid.'));
                return;
            }
            resolve(child.pid);
        });
        child.once('error', reject);
    });
    return {
        child,
        pid,
        debugPort
    };
}

async function injectBridgeScript(target, script, maxWaitMs) {
    return await evaluateExpressionInTarget(target, script, maxWaitMs, {
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        replMode: true,
        includeCommandLineAPI: true
    });
}

async function evaluateExpressionInTarget(target, expression, maxWaitMs, params = {}) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitForWebSocketOpen(socket, maxWaitMs);
    try {
        const connection = new CdpConnection(socket);
        await connection.send('Runtime.enable');
        const evaluationResponse = await connection.send('Runtime.evaluate', {
            expression,
            ...params
        });
        if (evaluationResponse.exceptionDetails?.text) {
            throw new Error(evaluationResponse.exceptionDetails.text);
        }
        return {
            ok: true,
            value: evaluationResponse.result?.value,
            type: evaluationResponse.result?.type
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

function buildBridgeDiagnostics(target, bridgeServer) {
    const manualPostExpression = `
(() => fetch(${JSON.stringify(bridgeServer.getBaseUrl() + '/api/scratch-state')}, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-monitor-token": ${JSON.stringify(bridgeServer.getToken())}
  },
  body: JSON.stringify({
    bridgeVersion: "1",
    source: "manual-diagnostic",
    toolboxCategories: ["diagnostic"],
    loadedExtensions: [],
    usedExtensions: [],
    projectData: null
  })
}).then(() => "manual-diagnostic-post-sent"))()
`.trim();

    const stateExpression = `
(() => {
  function isVmLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.runtime &&
      Array.isArray(value.runtime.targets) &&
      typeof value.toJSON === "function"
    );
  }
  const vmishKeys = Object.getOwnPropertyNames(window).filter(key => /vm/i.test(key)).slice(0, 40);
  let discoveredVmKey = null;
  for (const key of vmishKeys) {
    try {
      if (isVmLike(window[key])) {
        discoveredVmKey = key;
        break;
      }
      if (window[key] && typeof window[key] === "object" && isVmLike(window[key].vm)) {
        discoveredVmKey = key + ".vm";
        break;
      }
    } catch {}
  }
  const app = document.querySelector("#app");
  const reactKeys = node => node ? Object.keys(node).filter(key => key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$")).slice(0, 20) : [];
  const classSamples = Array.from(document.querySelectorAll("[class]"))
    .map(element => String(element.className || "").trim())
    .filter(Boolean)
    .slice(0, 50);
  return {
    href: window.location.href,
    readyState: document.readyState,
    title: document.title,
    hasApp: Boolean(document.querySelector("#app")),
    appTag: app ? app.tagName : null,
    appClass: app ? String(app.className || "") : null,
    appReactKeys: reactKeys(app),
    bodyReactKeys: reactKeys(document.body),
    bridgeInstalled: Boolean(window.__scratchDesktopCompanionBridgeInstalled),
    hasCaptureNow: typeof window.__scratchDesktopCompanionCaptureNow,
    vmishKeys,
    discoveredVmKey,
    classSamples,
    toolboxTexts: Array.from(document.querySelectorAll(".blocklyTreeLabel,.scratchCategoryItemLabel,.scratchCategoryItemBubble,.blocklyFlyoutLabelText text,.blocklyTreeRow text"))
      .map(element => (element.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 30)
  };
})()
`.trim();

    const captureNowExpression = `
(() => {
  if (typeof window.__scratchDesktopCompanionCaptureNow !== "function") {
    return "capture-now-missing";
  }
  window.__scratchDesktopCompanionCaptureNow("manual-trigger");
  return "capture-now-called";
})()
`.trim();

    return {
        selectedTarget: {
            id: target.id,
            title: target.title,
            url: target.url
        },
        manualPostExpression,
        stateExpression,
        captureNowExpression
    };
}

function buildVmDiagnosticsExpression() {
    return `
(() => {
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
        ["memoizedProps", current.memoizedProps],
        ["pendingProps", current.pendingProps],
        ["stateNode.props", current.stateNode && current.stateNode.props]
      ];
      for (const [label, props] of candidateProps) {
        if (!props || typeof props !== "object") {
          continue;
        }
        if ("vm" in props && isVmLike(props.vm)) {
          return {
            source: label + ".vm",
            propKeys: Object.keys(props).slice(0, 20),
            targetCount: props.vm.runtime.targets.length
          };
        }
        if (isVmLike(props)) {
          return {
            source: label,
            propKeys: Object.keys(props).slice(0, 20),
            targetCount: props.runtime.targets.length
          };
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
  const elements = Array.from(document.querySelectorAll("*"));
  let reactCarrierCount = 0;
  const reactPropertyNames = new Set();
  for (const element of elements) {
    const propertyNames = Object.getOwnPropertyNames(element);
    for (const propertyName of propertyNames) {
      if (propertyName.startsWith("__react")) {
        reactPropertyNames.add(propertyName);
      }
    }
    const reactKeys = propertyNames.filter(key =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactContainer$") ||
      key.startsWith("__reactInternalInstance$")
    );
    if (reactKeys.length === 0) {
      continue;
    }
    reactCarrierCount += 1;
    for (const reactKey of reactKeys) {
      const match = findVmInFiberNode(element[reactKey]);
      if (match) {
        return {
          found: true,
          reactCarrierCount,
          elementTag: element.tagName,
          elementId: element.id || null,
          elementClass: typeof element.className === "string" ? element.className : null,
          reactKey,
          match
        };
      }
    }
  }
  return {
    found: false,
    reactCarrierCount,
    elementCount: elements.length,
    reactPropertyNames: Array.from(reactPropertyNames).slice(0, 30)
  };
})()
`.trim();
}

function buildCatMotionExpression(settleMs) {
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
  function cloneProject(rawProject) {
    if (typeof rawProject === "string") {
      return JSON.parse(rawProject);
    }
    return JSON.parse(JSON.stringify(rawProject));
  }
  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }
  function getSpriteTarget(vm) {
    return (vm.runtime.targets || []).find(target => !target.isStage) || null;
  }
  function getPosition(target) {
    return {
      x: typeof target?.x === "number" ? target.x : null,
      y: typeof target?.y === "number" ? target.y : null,
      direction: typeof target?.direction === "number" ? target.direction : null
    };
  }

  const vm = findVm();
  if (!vm || !vm.runtime) {
    return JSON.stringify({
      ok: false,
      scenario: "cat-motion",
      error: "vm-not-found"
    });
  }

  const ready = await waitFor(() => Boolean(getSpriteTarget(vm) && vm.editingTarget), 10000);
  if (!ready) {
    return JSON.stringify({
      ok: false,
      scenario: "cat-motion",
      error: "project-not-ready",
      targetCount: Array.isArray(vm.runtime.targets) ? vm.runtime.targets.length : null
    });
  }

  const project = cloneProject(vm.toJSON());
  if (!project || !Array.isArray(project.targets) || project.targets.length === 0) {
    return JSON.stringify({
      ok: false,
      scenario: "cat-motion",
      error: "project-json-empty"
    });
  }

  const spriteTarget = project.targets.find(target => !target.isStage) || project.targets[0];
  const flagId = makeId("event-when-flag-clicked");
  const foreverId = makeId("control-forever");
  const moveId = makeId("motion-move-10");

  spriteTarget.blocks = {
    [flagId]: {
      opcode: "event_whenflagclicked",
      next: foreverId,
      parent: null,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: true,
      x: 120,
      y: 100
    },
    [foreverId]: {
      opcode: "control_forever",
      next: null,
      parent: flagId,
      inputs: {
        SUBSTACK: [2, moveId]
      },
      fields: {},
      shadow: false,
      topLevel: false
    },
    [moveId]: {
      opcode: "motion_movesteps",
      next: null,
      parent: foreverId,
      inputs: {
        STEPS: [1, [4, "10"]]
      },
      fields: {},
      shadow: false,
      topLevel: false
    }
  };
  spriteTarget.x = 0;
  spriteTarget.y = 0;
  spriteTarget.direction = 90;
  spriteTarget.visible = true;

  if (!Array.isArray(project.extensions)) {
    project.extensions = [];
  }

  if (typeof vm.stopAll === "function") {
    vm.stopAll();
  }
  await vm.loadProject(JSON.stringify(project));

  const loaded = await waitFor(() => {
    const target = getSpriteTarget(vm);
    const blockCount = target?.blocks?._blocks ? Object.keys(target.blocks._blocks).length : 0;
    return Boolean(target && blockCount >= 3);
  }, 10000);
  if (!loaded) {
    return JSON.stringify({
      ok: false,
      scenario: "cat-motion",
      error: "project-load-timeout"
    });
  }

  const runtimeSprite = getSpriteTarget(vm);
  if (!runtimeSprite) {
    return JSON.stringify({
      ok: false,
      scenario: "cat-motion",
      error: "runtime-sprite-missing"
    });
  }

  if (typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }
  if (typeof runtimeSprite.setXY === "function") {
    runtimeSprite.setXY(0, 0);
  }
  if (typeof runtimeSprite.setDirection === "function") {
    runtimeSprite.setDirection(90);
  } else {
    runtimeSprite.direction = 90;
  }

  await sleep(${JSON.stringify(settleMs)});
  if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
    window.__scratchDesktopCompanionCaptureNow("manual-project-mutation:cat-motion-loaded");
  }

  const beforePosition = getPosition(runtimeSprite);
  if (typeof vm.greenFlag !== "function") {
    return JSON.stringify({
      ok: false,
      scenario: "cat-motion",
      error: "green-flag-api-missing"
    });
  }

  vm.greenFlag();
  await sleep(1200);
  const afterPosition = getPosition(runtimeSprite);
  if (typeof vm.stopAll === "function") {
    vm.stopAll();
  }
  if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
    window.__scratchDesktopCompanionCaptureNow("manual-project-mutation:cat-motion-ran");
  }

  const deltaX =
    typeof beforePosition.x === "number" && typeof afterPosition.x === "number"
      ? afterPosition.x - beforePosition.x
      : null;
  const deltaY =
    typeof beforePosition.y === "number" && typeof afterPosition.y === "number"
      ? afterPosition.y - beforePosition.y
      : null;

  return JSON.stringify({
    ok: true,
    scenario: "cat-motion",
    currentTargetName: runtimeSprite.sprite ? runtimeSprite.sprite.name : null,
    beforePosition,
    afterPosition,
    deltaX,
    deltaY,
    moved: Boolean(deltaX || deltaY),
    loadedExtensions: vm.extensionManager && vm.extensionManager._loadedExtensions
      ? Array.from(vm.extensionManager._loadedExtensions.keys()).sort()
      : []
  });
})()
`.trim();
}

function buildLoadProjectFileExpression(projectFilePath, projectFileBase64, settleMs) {
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
  function getNodeRequire() {
    try {
      if (typeof require === "function") {
        return require;
      }
    } catch {}
    try {
      if (typeof window.require === "function") {
        return window.require;
      }
    } catch {}
    return null;
  }
  function decodeBase64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }
  function normalizeBinaryToArrayBuffer(value) {
    if (value instanceof ArrayBuffer) {
      return value;
    }
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    return null;
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
    return JSON.stringify({
      ok: false,
      error: "vm-not-found"
    });
  }

  const ready = await waitFor(() => Boolean(Array.isArray(vm.runtime.targets) && vm.runtime.targets.length > 0), 10000);
  if (!ready) {
    return JSON.stringify({
      ok: false,
      error: "project-not-ready",
      targetCount: Array.isArray(vm.runtime.targets) ? vm.runtime.targets.length : null
    });
  }

  let projectBuffer = null;
  const nodeRequire = getNodeRequire();
  if (nodeRequire) {
    try {
      const fs = nodeRequire("node:fs");
      const raw = fs.readFileSync(${JSON.stringify(projectFilePath)});
      projectBuffer = normalizeBinaryToArrayBuffer(raw);
    } catch {}
  }
  if (!projectBuffer) {
    projectBuffer = decodeBase64ToArrayBuffer(${JSON.stringify(projectFileBase64)});
  }
  if (!projectBuffer) {
    return JSON.stringify({
      ok: false,
      error: "project-file-read-failed"
    });
  }

  if (typeof vm.stopAll === "function") {
    vm.stopAll();
  }
  await vm.loadProject(projectBuffer);

  const loaded = await waitFor(() => {
    const project = parseProject(vm.toJSON());
    return Boolean(project && Array.isArray(project.targets) && project.targets.length > 0);
  }, 15000);
  if (!loaded) {
    return JSON.stringify({
      ok: false,
      error: "project-load-timeout"
    });
  }

  const runtimeSprite = getSpriteTarget(vm);
  if (runtimeSprite && typeof vm.setEditingTarget === "function" && runtimeSprite.id) {
    vm.setEditingTarget(runtimeSprite.id);
  }

  await sleep(${JSON.stringify(settleMs)});
  if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
    window.__scratchDesktopCompanionCaptureNow(${JSON.stringify(`manual-project-load:${projectFilePath}`)});
  }

  const project = parseProject(vm.toJSON());
  return JSON.stringify({
    ok: true,
    loadedProjectFile: ${JSON.stringify(projectFilePath)},
    currentTargetName: vm.editingTarget && vm.editingTarget.sprite ? vm.editingTarget.sprite.name : null,
    projectTargetCount: Array.isArray(project?.targets) ? project.targets.length : 0,
    projectTargetNames: Array.isArray(project?.targets)
      ? project.targets.map(target => String(target?.name ?? ""))
      : [],
    loadedExtensions: vm.extensionManager && vm.extensionManager._loadedExtensions
      ? Array.from(vm.extensionManager._loadedExtensions.keys()).sort()
      : [],
    projectExtensions: Array.isArray(project?.extensions) ? project.extensions.slice().sort() : []
  });
})()
`.trim();
}

function buildProjectMutationExpression(options) {
    if (options.scenario === 'cat-motion') {
        return buildCatMotionExpression(options.settleMs);
    }
    if (options.projectFilePath) {
        return buildLoadProjectFileExpression(
            options.projectFilePath,
            options.projectFileBase64,
            options.settleMs
        );
    }
    const {extensionId, blockOpcode, settleMs} = options;
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
  const vm = findVm();
  if (!vm || !vm.extensionManager) {
    return JSON.stringify({
      ok: false,
      error: "vm-not-found"
    });
  }
  if (${JSON.stringify(extensionId)} && !vm.extensionManager.isExtensionLoaded(${JSON.stringify(extensionId)})) {
    await vm.extensionManager.loadExtensionURL(${JSON.stringify(extensionId)});
  }
  if (${JSON.stringify(blockOpcode)}) {
    const blockId = "diagnostic-block-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const block = {
      id: blockId,
      opcode: ${JSON.stringify(blockOpcode)},
      next: null,
      parent: null,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: true,
      x: 80,
      y: 80
    };
    if (typeof vm.shareBlocksToTarget === "function" && vm.editingTarget && vm.editingTarget.id) {
      await vm.shareBlocksToTarget([block], vm.editingTarget.id);
    } else if (vm.editingTarget && vm.editingTarget.blocks && typeof vm.editingTarget.blocks.createBlock === "function") {
      vm.editingTarget.blocks.createBlock(block);
      if (typeof vm.editingTarget.blocks.updateTargetSpecificBlocks === "function") {
        vm.editingTarget.blocks.updateTargetSpecificBlocks(vm.editingTarget.isStage);
      }
    } else {
      return JSON.stringify({
        ok: false,
        error: "block-api-missing"
      });
    }
  }
  await new Promise(resolve => window.setTimeout(resolve, ${JSON.stringify(settleMs)}));
  if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
    window.__scratchDesktopCompanionCaptureNow(${JSON.stringify(
      `manual-project-mutation:${extensionId ?? 'none'}:${blockOpcode ?? 'none'}`
    )});
  }
  return JSON.stringify({
    ok: true,
    extensionId: ${JSON.stringify(extensionId)},
    blockOpcode: ${JSON.stringify(blockOpcode)},
    loadedExtensions: vm.extensionManager._loadedExtensions ? Array.from(vm.extensionManager._loadedExtensions.keys()).sort() : [],
    projectExtensions: (() => {
      try {
        const project = vm.toJSON();
        return Array.isArray(project && project.extensions) ? project.extensions.slice().sort() : [];
      } catch {
        return [];
      }
    })(),
    currentTargetName: vm.editingTarget && vm.editingTarget.sprite ? vm.editingTarget.sprite.name : null
  });
})()
`.trim();
}

function summarizePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const projectData = payload.projectData && typeof payload.projectData === 'object' ? payload.projectData : null;
    return {
        bridgeVersion: payload.bridgeVersion ?? null,
        source: payload.source ?? null,
        capturedAt: payload.capturedAt ?? null,
        scratchPid: payload.scratchPid ?? null,
        currentTargetId: payload.currentTargetId ?? null,
        currentTargetName: payload.currentTargetName ?? null,
        currentTargetIsStage: payload.currentTargetIsStage ?? null,
        toolboxCategories: Array.isArray(payload.toolboxCategories) ? payload.toolboxCategories : [],
        loadedExtensions: Array.isArray(payload.loadedExtensions) ? payload.loadedExtensions : [],
        usedExtensions: Array.isArray(payload.usedExtensions) ? payload.usedExtensions : [],
        programAreaModules: Array.isArray(payload.programAreaModules)
            ? payload.programAreaModules
            : projectData
                ? summarizeProgramAreaModulesFromProject(projectData, {
                    id: payload.currentTargetId,
                    name: payload.currentTargetName
                })
                : [],
        projectTargetCount: Array.isArray(projectData?.targets) ? projectData.targets.length : 0,
        projectMonitorCount: Array.isArray(projectData?.monitors) ? projectData.monitors.length : 0
    };
}

async function main() {
    const detectedCandidates = await findExistingCandidates();
    const shortcutTargets = await findShortcutTargets();
    const scratchExecutablePath = requestedExe ?? detectedCandidates[0] ?? shortcutTargets.find(item => item.isScratchExecutable)?.targetPath ?? null;
    if (!scratchExecutablePath) {
        throw new Error('No Scratch executable path was found.');
    }
    if (!isSupportedScratchExecutablePath(scratchExecutablePath)) {
        throw new Error(`Unsupported Scratch executable path: ${scratchExecutablePath}`);
    }

    const loadProjectFilePath = loadProjectFileArg ? path.resolve(loadProjectFileArg) : null;
    const loadProjectFileBase64 = loadProjectFilePath
        ? (await access(loadProjectFilePath).then(() => readFile(loadProjectFilePath))).toString('base64')
        : null;

    const bridgeServer = new ScratchBridgeServer();
    await bridgeServer.start();

    let launchSession = null;
    try {
        launchSession = await launchScratch(scratchExecutablePath, debugPortArg ? Number(debugPortArg) : null);
        let targetResult = null;
        let injectionResult = null;
        let payload;
        let postAction = null;
        const injectionHistory = [];
        const injectionScript = buildDesktopInjectionScript(bridgeServer.getBaseUrl(), bridgeServer.getToken());
        for (let attempt = 1; attempt <= injectionAttempts; attempt += 1) {
            targetResult = await waitForTargets(launchSession.debugPort, timeoutMs);
            if (!targetResult.ok || !targetResult.preferredTarget) {
                throw new Error(targetResult.error ?? 'Failed to find a Scratch debug target.');
            }
            injectionResult = await injectBridgeScript(targetResult.preferredTarget, injectionScript, timeoutMs);
            injectionHistory.push({
                attempt,
                targetId: targetResult.preferredTarget.id,
                targetUrl: targetResult.preferredTarget.url,
                result: injectionResult
            });
            if (!injectionResult.ok) {
                throw new Error(`Bridge injection failed: ${injectionResult.error}`);
            }
            try {
                payload = await bridgeServer.waitForPayload(Math.min(payloadTimeoutMs, injectionSettleMs));
                if (payload) {
                    break;
                }
            } catch {
                if (attempt === injectionAttempts) {
                    break;
                }
            }
        }
        if (payload && (loadExtensionId || addBlockOpcode || scenario || loadProjectFilePath)) {
            const payloadCountBeforeAction = bridgeServer.payloads.length;
            const actionEvaluation = await evaluateExpressionInTarget(
                targetResult.preferredTarget,
                buildProjectMutationExpression({
                    extensionId: loadExtensionId,
                    blockOpcode: addBlockOpcode,
                    scenario,
                    projectFilePath: loadProjectFilePath,
                    projectFileBase64: loadProjectFileBase64,
                    settleMs: postActionSettleMs
                }),
                timeoutMs,
                {
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                }
            );
            let actionPayload = null;
            let actionPayloadError = null;
            try {
                actionPayload = await bridgeServer.waitForPayloadAfterCount(
                    payloadCountBeforeAction,
                    postActionPayloadTimeoutMs
                );
            } catch (error) {
                actionPayloadError = error instanceof Error ? error.message : String(error);
            }
            postAction = {
                loadExtensionId,
                addBlockOpcode,
                scenario,
                loadProjectFilePath,
                evaluation: actionEvaluation,
                payload: actionPayload,
                payloadError: actionPayloadError
            };
            if (actionPayload) {
                payload = actionPayload;
            }
        }
        let diagnostics = null;
        if (!payload) {
            const error = new Error('Timed out while waiting for Scratch bridge payload.');
            diagnostics = buildBridgeDiagnostics(targetResult.preferredTarget, bridgeServer);
            diagnostics.bridgeState = await evaluateExpressionInTarget(
                targetResult.preferredTarget,
                diagnostics.stateExpression,
                timeoutMs,
                {
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                }
            );
            diagnostics.manualPost = await evaluateExpressionInTarget(
                targetResult.preferredTarget,
                diagnostics.manualPostExpression,
                timeoutMs,
                {
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                }
            );
            try {
                diagnostics.manualPostPayload = await bridgeServer.waitForPayload(5000);
            } catch (manualPostError) {
                diagnostics.manualPostPayloadError = manualPostError instanceof Error ? manualPostError.message : String(manualPostError);
            }
            diagnostics.captureNow = await evaluateExpressionInTarget(
                targetResult.preferredTarget,
                diagnostics.captureNowExpression,
                timeoutMs,
                {
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                }
            );
            try {
                payload = await bridgeServer.waitForPayload(8000);
            } catch {
                throw new Error(JSON.stringify({
                    message: error instanceof Error ? error.message : String(error),
                    diagnostics: {
                        selectedTarget: diagnostics.selectedTarget,
                        bridgeState: diagnostics.bridgeState,
                        manualPost: diagnostics.manualPost,
                        manualPostPayload: diagnostics.manualPostPayload ? summarizePayload(diagnostics.manualPostPayload) : null,
                        manualPostPayloadError: diagnostics.manualPostPayloadError ?? null,
                        captureNow: diagnostics.captureNow,
                        bridgeErrors: bridgeServer.errors
                    }
                }, null, 2));
            }
        }
        const output = {
            scratchExecutablePath,
            detectedCandidates,
            shortcutTargets,
            launch: {
                pid: launchSession.pid,
                debugPort: launchSession.debugPort
            },
            selectedTarget: {
                id: targetResult.preferredTarget.id,
                title: targetResult.preferredTarget.title,
                url: targetResult.preferredTarget.url
            },
            injection: {
                result: injectionResult.value,
                attempts: injectionHistory
            },
            postAction: postAction ? {
                loadExtensionId: postAction.loadExtensionId,
                addBlockOpcode: postAction.addBlockOpcode,
                loadProjectFilePath: postAction.loadProjectFilePath,
                evaluation: postAction.evaluation,
                payload: postAction.payload ? (fullPayload ? postAction.payload : summarizePayload(postAction.payload)) : null,
                payloadError: postAction.payloadError
            } : null,
            diagnostics,
            payload: fullPayload ? payload : summarizePayload(payload),
            bridgeErrors: bridgeServer.errors
        };
        if (includeVmDiagnostics) {
            output.vmDiagnostics = await evaluateExpressionInTarget(
                targetResult.preferredTarget,
                buildVmDiagnosticsExpression(),
                timeoutMs,
                {
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                }
            );
        }
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } finally {
        await bridgeServer.stop();
        if (shouldKillOnExit && launchSession?.child?.pid) {
            try {
                process.kill(launchSession.child.pid);
            } catch {
                // ignore cleanup errors
            }
        }
    }
}

await main();
