const SCRATCH_TARGET_WAIT_INTERVAL_MS = 500;
const DEFAULT_CDP_TIMEOUT_MS = 15_000;

interface ScratchRemoteDebuggerTarget {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface CdpPendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface ScratchRemoteDebuggerDependencies {
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}

interface InjectBridgeScriptOptions {
  port: number;
  script: string;
  timeoutMs?: number;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isInspectablePageTarget(target: ScratchRemoteDebuggerTarget) {
  return (
    target.type === "page" &&
    typeof target.webSocketDebuggerUrl === "string" &&
    target.webSocketDebuggerUrl.length > 0 &&
    typeof target.url === "string" &&
    !target.url.startsWith("devtools://") &&
    target.url !== "about:blank"
  );
}

function isScratchPageTarget(target: ScratchRemoteDebuggerTarget) {
  if (!isInspectablePageTarget(target)) {
    return false;
  }

  const normalizedUrl = target.url!.toLowerCase();
  if (!normalizedUrl.includes("/index.html")) {
    return false;
  }

  return !normalizedUrl.includes("?route=about") &&
    !normalizedUrl.includes("?route=privacy") &&
    !normalizedUrl.includes("?route=usb");
}

function isPrimaryScratchEditorTarget(target: ScratchRemoteDebuggerTarget) {
  return isInspectablePageTarget(target) &&
    typeof target.url === "string" &&
    target.url.toLowerCase().endsWith("/index.html");
}

function pickScratchPageTarget(targets: ScratchRemoteDebuggerTarget[]) {
  const inspectableTargets = targets.filter((target) => isInspectablePageTarget(target));
  return inspectableTargets.find((target) => isPrimaryScratchEditorTarget(target)) ??
    inspectableTargets.find((target) => isScratchPageTarget(target)) ??
    inspectableTargets[0];
}

class CdpConnection {
  private nextId = 1;

  private readonly pending = new Map<number, CdpPendingRequest>();

  constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener("message", (event) => {
      const rawData = typeof event.data === "string" ? event.data : String(event.data ?? "");
      if (!rawData) {
        return;
      }

      let message: any;
      try {
        message = JSON.parse(rawData);
      } catch {
        return;
      }

      if (typeof message.id !== "number") {
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

  async send(method: string, params?: Record<string, unknown>) {
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return await new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(message);
    });
  }
}

async function waitForWebSocketOpen(socket: WebSocket, timeoutMs: number) {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out while connecting to the Scratch debug target."));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Failed to connect to the Scratch debug target."));
    });
  });
}

export class ScratchRemoteDebugger {
  private readonly fetchImpl: typeof fetch;

  private readonly WebSocketImpl: typeof WebSocket;

  constructor(dependencies: ScratchRemoteDebuggerDependencies = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.WebSocketImpl = dependencies.WebSocket ?? WebSocket;
  }

  async injectBridgeScript(options: InjectBridgeScriptOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_CDP_TIMEOUT_MS;
    const target = await this.waitForScratchTarget(options.port, timeoutMs);
    const socket = new this.WebSocketImpl(target.webSocketDebuggerUrl ?? "");

    await waitForWebSocketOpen(socket, timeoutMs);
    try {
      const connection = new CdpConnection(socket);
      await connection.send("Runtime.enable");

      const evaluationResponse = await connection.send("Runtime.evaluate", {
        expression: options.script,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        replMode: true,
        includeCommandLineAPI: true
      });

      if (evaluationResponse.exceptionDetails?.text) {
        throw new Error(evaluationResponse.exceptionDetails.text);
      }

      return {
        targetId: target.id,
        targetTitle: target.title,
        targetUrl: target.url,
        evaluationResult: evaluationResponse.result?.value
      };
    } finally {
      socket.close();
    }
  }

  private async waitForScratchTarget(port: number, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    let lastError: string | null = null;

    while (Date.now() < deadline) {
      try {
        const response = await this.fetchImpl(`http://127.0.0.1:${port}/json/list`);
        if (response.ok) {
          const parsed = await response.json();
          const targets = Array.isArray(parsed) ? parsed : [];
          const target = pickScratchPageTarget(targets);
          if (target) {
            return target;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      await delay(SCRATCH_TARGET_WAIT_INTERVAL_MS);
    }

    throw new Error(
      lastError
        ? `Timed out while waiting for a Scratch debug target. Last error: ${lastError}`
        : "Timed out while waiting for a Scratch debug target."
    );
  }
}
