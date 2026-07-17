import test from "node:test";
import assert from "node:assert/strict";

import { StateStore } from "../dist/state-store.js";

test("StateStore snapshots cannot mutate internal state through returned references", () => {
  const store = new StateStore();
  store.update({
    status: "connected",
    statusText: "已连接",
    programAreaModules: [{ id: "motion", label: "运动", blockCount: 3 }]
  });

  const exposed = store.getState();
  assert.equal(Object.isFrozen(exposed), true);
  assert.equal(Object.isFrozen(exposed.programAreaModules), true);
  assert.equal(Object.isFrozen(exposed.programAreaModules[0]), true);
  assert.throws(() => {
    exposed.status = "error";
  }, TypeError);
  assert.throws(() => {
    exposed.programAreaModules[0].label = "已污染";
  }, TypeError);
  assert.throws(() => {
    exposed.programAreaModules.push({ id: "looks", label: "外观", blockCount: 1 });
  }, TypeError);

  const current = store.getState();
  assert.equal(current.status, "connected");
  assert.deepEqual(current.programAreaModules, [
    { id: "motion", label: "运动", blockCount: 3 }
  ]);
});

test("StateStore change events stay synchronous without exposing internal state", () => {
  const store = new StateStore();
  const nextState = {
    ...store.getState(),
    status: "waiting",
    statusText: "等待连接",
    toolboxCategories: ["motion"]
  };
  const observed = [];

  store.onChange((state) => {
    observed.push(state.statusText);
    assert.throws(() => {
      state.statusText = "监听器污染";
    }, TypeError);
    assert.throws(() => {
      state.toolboxCategories.push("looks");
    }, TypeError);
  });

  store.setState(nextState);
  nextState.statusText = "调用方污染";
  nextState.toolboxCategories.push("sound");

  assert.deepEqual(observed, ["等待连接"]);
  assert.equal(store.getState().statusText, "等待连接");
  assert.deepEqual(store.getState().toolboxCategories, ["motion"]);
});
