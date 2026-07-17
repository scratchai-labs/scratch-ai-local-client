import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

import { transform } from "esbuild";

const source = await readFile(
  new URL("../src/main/bridge-script.ts", import.meta.url),
  "utf8"
);
const compiled = await transform(source, {
  loader: "ts",
  format: "esm",
  target: "node22"
});
const { buildDesktopInjectionScript } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`
);

test("desktop bridge retries a partial installation instead of keeping a stale installed flag", () => {
  let shouldFailObserver = true;
  let intervalCount = 0;
  const window = {
    addEventListener() {},
    clearTimeout() {},
    setTimeout() { return 1; },
    setInterval() {
      intervalCount += 1;
      return intervalCount;
    }
  };
  const context = {
    window,
    document: {
      documentElement: { lang: "zh-cn" },
      querySelectorAll() { return []; }
    },
    MutationObserver: class {
      observe() {
        if (shouldFailObserver) {
          throw new Error("observer not ready");
        }
      }
    },
    fetch: async () => ({ ok: true })
  };
  const script = buildDesktopInjectionScript("http://127.0.0.1:39000", "token");

  assert.throws(() => vm.runInNewContext(script, context), /observer not ready/);
  assert.equal(intervalCount, 0);

  shouldFailObserver = false;
  const result = vm.runInNewContext(script, context);

  assert.equal(result, "scratch-desktop-companion:installed");
  assert.equal(intervalCount, 1);
});
