import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRenderProgress,
  parseRenderContractOptions,
  selectCasesForRun
} from "../scripts/recommendation-render-contract-options.mjs";

test("parseRenderContractOptions keeps the exhaustive full contract as the default", () => {
  assert.deepEqual(parseRenderContractOptions([]), {
    mode: "full",
    batchSize: 40,
    progressEvery: 5,
    recycleEvery: 10,
    smokeLimit: 32,
    shardIndex: 0,
    shardCount: 1,
    help: false
  });
});

test("parseRenderContractOptions accepts smoke, batching, progress and zero-based shard options", () => {
  assert.deepEqual(
    parseRenderContractOptions([
      "--mode=smoke",
      "--batch-size=20",
      "--progress-every=2",
      "--recycle-every=4",
      "--smoke-limit=12",
      "--shard-index=1",
      "--shard-count=3"
    ]),
    {
      mode: "smoke",
      batchSize: 20,
      progressEvery: 2,
      recycleEvery: 4,
      smokeLimit: 12,
      shardIndex: 1,
      shardCount: 3,
      help: false
    }
  );
});

test("selectCasesForRun samples smoke cases evenly before applying the shard", () => {
  const cases = Array.from({ length: 10 }, (_, index) => index);

  assert.deepEqual(
    selectCasesForRun(cases, {
      mode: "smoke",
      smokeLimit: 4,
      shardIndex: 1,
      shardCount: 2
    }),
    [3, 9]
  );
});

test("formatRenderProgress reports suite completion, elapsed time and renderer memory", () => {
  assert.equal(
    formatRenderProgress({
      suite: "relation",
      completed: 40,
      total: 100,
      elapsedMs: 12_345,
      rendererMemoryKb: 262_144
    }),
    "[render-contract] relation 40/100 (40.0%) elapsed=12.3s renderer-memory=256.0MB"
  );
});
