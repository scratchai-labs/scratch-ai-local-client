import test from "node:test";
import assert from "node:assert/strict";

import { CoachingSession } from "../dist/coaching-session.js";

const TARGET = {
  id: "sprite-a",
  name: "Cat"
};

const RECOMMEND_MOVE = {
  root: {
    opcode: "event_whenflagclicked",
    category: "事件",
    label: "当绿旗被点击",
    reason: "给脚本一个开始。",
    next: {
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      reason: "让角色动起来。"
    }
  }
};

function block(opcode, overrides = {}) {
  return {
    opcode,
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: false,
    ...overrides
  };
}

function createProjectData(blocks, target = TARGET) {
  return {
    targets: [
      {
        id: target.id,
        name: target.name,
        isStage: false,
        blocks
      }
    ]
  };
}

function createLinearProjectData(opcodes, target = TARGET) {
  const blocks = {};
  for (const [index, opcode] of opcodes.entries()) {
    const id = String.fromCharCode(97 + index);
    const next = index < opcodes.length - 1 ? String.fromCharCode(98 + index) : null;
    blocks[id] = block(opcode, {
      next,
      parent: index === 0 ? null : String.fromCharCode(96 + index),
      topLevel: index === 0
    });
  }
  return createProjectData(blocks, target);
}

function createSession(now = 0) {
  let currentTime = now;
  return {
    clock: {
      now: () => currentTime,
      advance: (ms) => {
        currentTime += ms;
      }
    },
    session: new CoachingSession({
      now: () => currentTime
    })
  };
}

function observe(session, projectData, overrides = {}) {
  return session.observeProject({
    mode: "auto",
    projectId: "project-1",
    target: TARGET,
    projectData,
    currentTargetPrograms: ["当绿旗被点击"],
    currentTargetScriptXmlList: ["<xml />"],
    ...overrides
  });
}

test("CoachingSession ignores blank projects until the first real block appears", () => {
  const { session, clock } = createSession();

  const blank = observe(session, createProjectData({}), {
    currentTargetPrograms: [],
    currentTargetScriptXmlList: []
  });
  assert.equal(blank.action, "clear-hint");

  const firstBlock = observe(session, createLinearProjectData(["event_whenflagclicked"]));
  assert.equal(firstBlock.action, "scheduled");
  assert.equal(firstBlock.runAt, 3000);

  clock.advance(2999);
  assert.equal(session.consumeDueRequest()?.action ?? "idle", "idle");

  clock.advance(1);
  const due = session.consumeDueRequest();
  assert.equal(due.action, "request");
  assert.equal(due.reason, "auto-change");
});

test("CoachingSession clears stale hints and refuses manual requests for blank projects", () => {
  const { session } = createSession();
  const baseline = createLinearProjectData(["event_whenflagclicked"]);

  observe(session, baseline);
  session.markRequestStarted();
  session.markRequestFinished({
    response: {
      recommendation: RECOMMEND_MOVE
    },
    baselineProjectData: baseline,
    baselineTarget: TARGET
  });

  const blank = observe(session, createProjectData({}), {
    currentTargetPrograms: [],
    currentTargetScriptXmlList: []
  });
  assert.equal(blank.action, "clear-hint");

  const manualBlank = session.requestManualHint();
  assert.equal(manualBlank.action, "clear-hint");

  const firstBlock = observe(session, createLinearProjectData(["event_whenflagclicked"]));
  assert.equal(firstBlock.action, "scheduled");
  assert.equal(firstBlock.keepExistingHint, true);
});

test("CoachingSession debounces auto changes and only requests the latest state", () => {
  const { session, clock } = createSession();

  observe(session, createLinearProjectData(["event_whenflagclicked"]));
  clock.advance(1000);
  observe(session, createLinearProjectData(["event_whenflagclicked", "motion_movesteps"]), {
    currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
    currentTargetScriptXmlList: ["<xml>move</xml>"]
  });

  clock.advance(2999);
  assert.equal(session.consumeDueRequest()?.action ?? "idle", "idle");

  clock.advance(1);
  const due = session.consumeDueRequest();
  assert.equal(due.action, "request");
  assert.deepEqual(due.snapshot.currentTargetPrograms, ["当绿旗被点击 -> 移动 10 步"]);
});

test("CoachingSession refreshes changed blocks after the 3 second quiet window", () => {
  const { session, clock } = createSession();

  observe(session, createLinearProjectData(["event_whenflagclicked"]));
  clock.advance(3000);
  assert.equal(session.consumeDueRequest().reason, "auto-change");
  session.markRequestStarted();
  session.markRequestFinished({ response: {} });

  clock.advance(1000);
  const scheduled = observe(session, createLinearProjectData(["event_whenflagclicked", "looks_sayforsecs"]), {
    currentTargetPrograms: ["当绿旗被点击 -> 说 2 秒"],
    currentTargetScriptXmlList: ["<xml>say</xml>"]
  });
  assert.equal(scheduled.action, "scheduled");
  assert.equal(scheduled.runAt, 7000);

  clock.advance(2999);
  assert.equal(session.consumeDueRequest()?.action ?? "idle", "idle");

  clock.advance(1);
  assert.equal(session.consumeDueRequest().reason, "auto-change");
});

test("CoachingSession allows only one running request and chases the latest state", () => {
  const { session, clock } = createSession();

  observe(session, createLinearProjectData(["event_whenflagclicked"]));
  clock.advance(3000);
  assert.equal(session.consumeDueRequest().reason, "auto-change");
  session.markRequestStarted();

  const queued = observe(session, createLinearProjectData(["event_whenflagclicked", "motion_movesteps"]), {
    currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
    currentTargetScriptXmlList: ["<xml>move</xml>"]
  });
  assert.equal(queued.action, "queued");
  assert.equal(session.consumeDueRequest()?.action ?? "idle", "idle");

  const finished = session.markRequestFinished({
    response: {
      recommendation: RECOMMEND_MOVE
    }
  });
  assert.equal(finished.action, "scheduled");
  assert.equal(finished.runAt, 6000);

  clock.advance(3000);
  const due = session.consumeDueRequest();
  assert.equal(due.action, "request");
  assert.deepEqual(due.snapshot.currentTargetPrograms, ["当绿旗被点击 -> 移动 10 步"]);
});

test("CoachingSession keeps recommendations stable while following and refreshes after completion", () => {
  const { session, clock } = createSession();
  const baseline = createProjectData({});

  observe(session, baseline, {
    currentTargetPrograms: [],
    currentTargetScriptXmlList: []
  });
  session.markRequestStarted();
  session.markRequestFinished({
    response: {
      recommendation: RECOMMEND_MOVE
    },
    baselineProjectData: baseline,
    baselineTarget: TARGET
  });

  const following = observe(session, createLinearProjectData(["event_whenflagclicked"]));
  assert.equal(following.action, "keep-current");

  const completed = observe(session, createLinearProjectData(["event_whenflagclicked", "motion_movesteps"]), {
    currentTargetPrograms: ["当绿旗被点击 -> 移动 10 步"],
    currentTargetScriptXmlList: ["<xml>move</xml>"]
  });
  assert.equal(completed.action, "scheduled");
  assert.equal(completed.reason, "recommendation-completed");
  assert.equal(completed.keepExistingHint, true);

  clock.advance(3000);
  assert.equal(session.consumeDueRequest().reason, "recommendation-completed");
});

test("CoachingSession hides stale hints when the student diverges or switches target", () => {
  const { session } = createSession();
  const baseline = createProjectData({});

  session.markRequestStarted();
  session.markRequestFinished({
    response: {
      recommendation: RECOMMEND_MOVE
    },
    baselineProjectData: baseline,
    baselineTarget: TARGET
  });

  const diverged = observe(session, createLinearProjectData(["looks_sayforsecs"]));
  assert.equal(diverged.action, "scheduled");
  assert.equal(diverged.reason, "student-diverged");
  assert.equal(diverged.keepExistingHint, false);

  const switched = observe(session, createLinearProjectData(["event_whenflagclicked"], {
    id: "sprite-b",
    name: "Dog"
  }), {
    target: {
      id: "sprite-b",
      name: "Dog"
    }
  });
  assert.equal(switched.action, "scheduled");
  assert.equal(switched.reason, "identity-changed");
  assert.equal(switched.keepExistingHint, false);
});

test("CoachingSession lets manual requests bypass auto interval but skips duplicate manual signatures", () => {
  const { session, clock } = createSession();

  observe(session, createLinearProjectData(["event_whenflagclicked"]));
  clock.advance(3000);
  assert.equal(session.consumeDueRequest().reason, "auto-change");
  session.markRequestStarted();
  session.markRequestFinished({ response: {} });

  const firstManual = session.requestManualHint();
  assert.equal(firstManual.action, "request");
  assert.equal(firstManual.reason, "manual");

  session.markRequestStarted();
  session.markRequestFinished({ response: {} });

  const duplicateManual = session.requestManualHint();
  assert.equal(duplicateManual.action, "idle");
});

test("CoachingSession does not auto request when identity changes in manual mode", () => {
  const { session } = createSession();

  observe(session, createProjectData({}), {
    mode: "manual",
    projectId: "project-a",
    currentTargetPrograms: [],
    currentTargetScriptXmlList: []
  });

  const projectChanged = observe(session, createLinearProjectData(["event_whenflagclicked"]), {
    mode: "manual",
    projectId: "project-b"
  });

  assert.equal(projectChanged.action, "idle");
  assert.equal(session.consumeDueRequest(), undefined);

  const firstManual = session.requestManualHint();
  assert.equal(firstManual.action, "request");
  assert.equal(firstManual.reason, "manual");
});

test("CoachingSession resets memory when the project identity changes or exits", () => {
  const { session } = createSession();
  const baseline = createProjectData({});

  observe(session, baseline, {
    projectId: "project-a",
    currentTargetPrograms: [],
    currentTargetScriptXmlList: []
  });
  session.markRequestStarted();
  session.markRequestFinished({
    response: {
      recommendation: RECOMMEND_MOVE
    },
    baselineProjectData: baseline,
    baselineTarget: TARGET
  });

  const projectChanged = observe(session, createLinearProjectData(["event_whenflagclicked"]), {
    projectId: "project-b"
  });
  assert.equal(projectChanged.action, "scheduled");
  assert.equal(projectChanged.reason, "identity-changed");
  assert.equal(projectChanged.keepExistingHint, false);

  session.reset();
  assert.equal(session.requestManualHint().action, "idle");
});
