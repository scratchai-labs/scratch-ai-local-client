import test from "node:test";
import assert from "node:assert/strict";

import { ScratchRemoteDebugger } from "../dist/scratch-remote-debugger.js";

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.OPEN;
    this.listeners = {
      message: [],
      open: [],
      error: []
    };
  }

  addEventListener(type, listener) {
    this.listeners[type]?.push(listener);
  }

  send(rawMessage) {
    const message = JSON.parse(rawMessage);
    const response = {
      id: message.id,
      result: message.method === "Runtime.evaluate" ? { value: "ok" } : {}
    };
    queueMicrotask(() => {
      for (const listener of this.listeners.message) {
        listener({ data: JSON.stringify(response) });
      }
    });
  }

  close() {}
}

test("ScratchRemoteDebugger retries target discovery after transient fetch failures", async () => {
  let fetchCalls = 0;
  const debuggerClient = new ScratchRemoteDebugger({
    fetch: async () => {
      fetchCalls += 1;
      if (fetchCalls < 3) {
        throw new TypeError("fetch failed");
      }

      return {
        ok: true,
        async json() {
          return [
            {
              id: "scratch-target",
              title: "Scratch 3",
              type: "page",
              url: "file:///Scratch/index.html",
              webSocketDebuggerUrl: "ws://127.0.0.1:9000/devtools/page/1"
            }
          ];
        }
      };
    }
  });

  const target = await debuggerClient.waitForScratchTarget(9000, 2000);

  assert.equal(target.id, "scratch-target");
  assert.equal(fetchCalls, 3);
});

test("ScratchRemoteDebugger prefers the main editor target over the usb route", async () => {
  const debuggerClient = new ScratchRemoteDebugger({
    fetch: async () => ({
      ok: true,
      async json() {
        return [
          {
            id: "scratch-usb",
            title: "",
            type: "page",
            url: "file:///Applications/Scratch%203.app/Contents/Resources/app.asar/dist/renderer/index.html?route=usb",
            webSocketDebuggerUrl: "ws://127.0.0.1:9000/devtools/page/usb"
          },
          {
            id: "scratch-editor",
            title: "index.html",
            type: "page",
            url: "file:///Applications/Scratch%203.app/Contents/Resources/app.asar/dist/renderer/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9000/devtools/page/editor"
          }
        ];
      }
    }),
    WebSocket: FakeWebSocket
  });

  const result = await debuggerClient.injectBridgeScript({
    port: 9000,
    script: "globalThis.__bridgeTest = true;"
  });

  assert.equal(result.targetId, "scratch-editor");
  assert.equal(
    result.targetUrl,
    "file:///Applications/Scratch%203.app/Contents/Resources/app.asar/dist/renderer/index.html"
  );
});
