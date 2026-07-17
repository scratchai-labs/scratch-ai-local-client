import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { transform } from "esbuild";

const source = await readFile(
  new URL("../src/main/bridge-server.ts", import.meta.url),
  "utf8"
);
const compiled = await transform(source, {
  loader: "ts",
  format: "esm",
  target: "node22"
});
const { ScratchBridgeServer } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`
);

async function withBridge(run) {
  const payloads = [];
  const errors = [];
  const bridge = new ScratchBridgeServer({
    onPayload: (payload) => payloads.push(payload),
    onError: (message) => errors.push(message)
  });

  await bridge.start();
  try {
    await run({ bridge, payloads, errors });
  } finally {
    await bridge.stop();
  }
}

async function postState(bridge, { origin, token = bridge.getToken(), payload = { ok: true } } = {}) {
  const headers = {
    "content-type": "application/json",
    "x-monitor-token": token
  };
  if (origin !== undefined) {
    headers.origin = origin;
  }

  return fetch(`${bridge.getBaseUrl()}/api/scratch-state`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
}

test("ScratchBridgeServer rejects browser origins outside Scratch file pages", async () => {
  await withBridge(async ({ bridge, payloads }) => {
    const response = await postState(bridge, { origin: "https://example.com" });

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(payloads, []);
  });
});

test("ScratchBridgeServer allows Origin null preflight and authenticated payloads", async () => {
  await withBridge(async ({ bridge, payloads }) => {
    const preflight = await fetch(`${bridge.getBaseUrl()}/api/scratch-state`, {
      method: "OPTIONS",
      headers: {
        origin: "null",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-monitor-token"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "null");
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /x-monitor-token/);
    assert.equal(preflight.headers.get("vary"), "Origin");

    const response = await postState(bridge, {
      origin: "null",
      payload: { source: "scratch-file-page" }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "null");
    assert.deepEqual(payloads, [{ source: "scratch-file-page" }]);
  });
});

test("ScratchBridgeServer allows non-browser requests without Origin", async () => {
  await withBridge(async ({ bridge, payloads }) => {
    const response = await postState(bridge, {
      payload: { source: "injected-bridge" }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(payloads, [{ source: "injected-bridge" }]);
  });
});

test("ScratchBridgeServer still requires its token for allowed origins", async () => {
  await withBridge(async ({ bridge, payloads }) => {
    const response = await postState(bridge, {
      origin: "null",
      token: "wrong-token"
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), "null");
    assert.deepEqual(payloads, []);
  });
});
