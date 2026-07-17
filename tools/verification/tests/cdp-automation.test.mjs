import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  pickDesktopCompanionTarget,
  pickSettingsTarget,
  pickScratchTarget,
  waitForTarget
} from "../scripts/cdp-automation.mjs";

test("target pickers ignore non-inspectable pages and prefer the requested window", () => {
  const targets = [
    { type: "page", title: "DevTools", url: "devtools://devtools", webSocketDebuggerUrl: "ws://devtools" },
    { type: "page", title: "", url: "about:blank", webSocketDebuggerUrl: "ws://blank" },
    { type: "page", title: "DeepSeek 设置", url: "file:///app/settings.html", webSocketDebuggerUrl: "ws://settings" },
    { type: "page", title: "Scratch AI 教练", url: "file:///app/index.html", webSocketDebuggerUrl: "ws://main" }
  ];

  assert.equal(pickDesktopCompanionTarget(targets)?.webSocketDebuggerUrl, "ws://main");
  assert.equal(pickSettingsTarget(targets)?.webSocketDebuggerUrl, "ws://settings");
  assert.equal(pickScratchTarget(targets)?.webSocketDebuggerUrl, "ws://main");
});

test("waitForTarget retries target discovery and returns the selected target", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => calls === 1 ? [] : [
        { type: "page", title: "Scratch AI 教练", url: "file:///app/index.html", webSocketDebuggerUrl: "ws://main" }
      ]
    };
  };

  const result = await waitForTarget(9344, 1000, pickDesktopCompanionTarget, "missing", {
    fetchImpl,
    pollIntervalMs: 0,
    sleepImpl: async () => undefined
  });

  assert.equal(result.ok, true);
  assert.equal(result.preferredTarget?.webSocketDebuggerUrl, "ws://main");
  assert.equal(calls, 2);
});

class FakeWebSocket extends EventTarget {
  static OPEN = 1;

  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  send(payload) {
    const request = JSON.parse(payload);
    const result = request.method === "Runtime.evaluate"
      ? { result: { type: "number", value: 42 } }
      : request.method === "Page.captureScreenshot"
        ? { data: Buffer.from("png-bytes").toString("base64") }
        : {};
    queueMicrotask(() => {
      const event = new Event("message");
      Object.defineProperty(event, "data", {
        value: JSON.stringify({ id: request.id, result })
      });
      this.dispatchEvent(event);
    });
  }

  close() {
    this.readyState = 3;
  }
}

test("evaluateExpressionInTarget opens CDP, evaluates by value, and closes the socket", async () => {
  const { evaluateExpressionInTarget } = await import("../scripts/cdp-automation.mjs");
  const result = await evaluateExpressionInTarget(
    { webSocketDebuggerUrl: "ws://main" },
    "21 * 2",
    { timeoutMs: 100, WebSocketImpl: FakeWebSocket }
  );

  assert.deepEqual(result, { ok: true, value: 42, type: "number" });
});


test("captureScreenshot writes the CDP PNG response to the requested path", async () => {
  const { captureScreenshot } = await import("../scripts/cdp-automation.mjs");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdp-screenshot-test-"));
  const outputPath = path.join(tempDir, "nested", "shot.png");

  try {
    const savedPath = await captureScreenshot(
      { webSocketDebuggerUrl: "ws://main" },
      outputPath,
      { timeoutMs: 100, WebSocketImpl: FakeWebSocket }
    );

    assert.equal(savedPath, outputPath);
    assert.equal((await readFile(outputPath)).toString(), "png-bytes");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

class NeverOpeningWebSocket extends EventTarget {
  static OPEN = 1;
  static latest = null;

  constructor() {
    super();
    this.readyState = 0;
    this.closed = false;
    NeverOpeningWebSocket.latest = this;
  }

  close() {
    this.closed = true;
  }
}

test("evaluateExpressionInTarget closes a socket that times out before opening", async () => {
  const { evaluateExpressionInTarget } = await import("../scripts/cdp-automation.mjs");
  const result = await evaluateExpressionInTarget(
    { webSocketDebuggerUrl: "ws://missing" },
    "true",
    { timeoutMs: 1, WebSocketImpl: NeverOpeningWebSocket }
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /Timed out/);
  assert.equal(NeverOpeningWebSocket.latest?.closed, true);
});
