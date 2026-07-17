import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_POLL_INTERVAL_MS = 300;

export function isInspectablePageTarget(target) {
  return target?.type === "page" &&
    typeof target.webSocketDebuggerUrl === "string" &&
    target.webSocketDebuggerUrl.length > 0 &&
    typeof target.url === "string" &&
    !target.url.startsWith("devtools://") &&
    target.url !== "about:blank";
}

function pickInspectableTarget(targets, predicate, fallback = false) {
  const inspectableTargets = targets.filter(isInspectablePageTarget);
  return inspectableTargets.find(predicate) ?? (fallback ? inspectableTargets[0] ?? null : null);
}

export function pickDesktopCompanionTarget(targets) {
  return pickInspectableTarget(targets, target => {
    const title = typeof target.title === "string" ? target.title.trim() : "";
    const url = typeof target.url === "string" ? target.url.toLowerCase() : "";
    return title.includes("Scratch AI 教练") || url.endsWith("/index.html") || url.includes("index.html");
  }, true);
}

export function pickSettingsTarget(targets) {
  return pickInspectableTarget(targets, target => {
    const title = typeof target.title === "string" ? target.title.trim() : "";
    const url = typeof target.url === "string" ? target.url.toLowerCase() : "";
    return title.includes("DeepSeek 设置") || url.endsWith("/settings.html") || url.includes("settings.html");
  });
}

export function pickScratchTarget(targets) {
  const inspectableTargets = targets.filter(isInspectablePageTarget);
  return inspectableTargets.find(target =>
    typeof target.url === "string" && target.url.toLowerCase().endsWith("/index.html")
  ) ?? inspectableTargets.find(target => {
    const url = typeof target.url === "string" ? target.url.toLowerCase() : "";
    return url.includes("/index.html") &&
      !url.includes("?route=about") &&
      !url.includes("?route=privacy") &&
      !url.includes("?route=usb");
  }) ?? inspectableTargets[0] ?? null;
}

async function fetchTargets(port, fetchImpl) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`Unexpected HTTP status: ${response.status}`);
  }
  const targets = await response.json();
  if (!Array.isArray(targets)) {
    throw new Error("The /json/list response was not an array.");
  }
  return targets;
}

export async function waitForTarget(port, maxWaitMs, picker, errorMessage, options = {}) {
  const {
    fetchImpl = fetch,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
  } = options;
  const deadline = Date.now() + maxWaitMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets(port, fetchImpl);
      const preferredTarget = picker(targets);
      if (preferredTarget) {
        return { ok: true, targets, preferredTarget };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleepImpl(pollIntervalMs);
  }

  return {
    ok: false,
    error: errorMessage ?? lastError ?? "Timed out while waiting for the requested Electron target."
  };
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("message", event => {
      const rawData = typeof event.data === "string" ? event.data : String(event.data ?? "");
      if (!rawData) return;
      let message;
      try {
        message = JSON.parse(rawData);
      } catch {
        return;
      }
      if (typeof message.id !== "number") return;
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
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForWebSocketOpen(socket, maxWaitMs, WebSocketImpl) {
  if (socket.readyState === WebSocketImpl.OPEN) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out while opening the desktop companion websocket."));
    }, maxWaitMs);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Failed to connect to the desktop companion websocket."));
    }, { once: true });
  });
}

export async function withCdpConnection(target, options, callback) {
  const {
    timeoutMs,
    WebSocketImpl = WebSocket
  } = options;
  const socket = new WebSocketImpl(target.webSocketDebuggerUrl);
  try {
    await waitForWebSocketOpen(socket, timeoutMs, WebSocketImpl);
    return await callback(new CdpConnection(socket));
  } finally {
    socket.close();
  }
}

export async function evaluateExpressionInTarget(target, expression, options) {
  try {
    return await withCdpConnection(target, options, async connection => {
      await connection.send("Runtime.enable");
      const response = await connection.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: options.userGesture ?? true
      });
      if (response.exceptionDetails?.text) {
        throw new Error(response.exceptionDetails.text);
      }
      return {
        ok: true,
        value: response.result?.value,
        type: response.result?.type
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function captureScreenshot(target, outputPath, options) {
  return await withCdpConnection(target, options, async connection => {
    await connection.send("Page.enable");
    const response = await connection.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true
    });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(response.data, "base64"));
    return outputPath;
  });
}
