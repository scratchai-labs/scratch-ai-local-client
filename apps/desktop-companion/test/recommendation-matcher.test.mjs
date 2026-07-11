import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeRecommendationProgress,
  isRecommendationCompleted
} from "../dist/recommendation-matcher.js";

const TARGET_META = {
  id: "sprite-cat",
  name: "Cat"
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

function projectWithBlocks(blocks) {
  return {
    targets: [
      {
        id: TARGET_META.id,
        name: TARGET_META.name,
        isStage: false,
        blocks
      }
    ]
  };
}

const EMPTY_PROJECT = projectWithBlocks({});

test("isRecommendationCompleted returns true for correctly ordered next connections", () => {
  const recommendation = {
    root: {
      opcode: "event_whenflagclicked",
      category: "事件",
      label: "当绿旗被点击",
      reason: "给脚本一个开始时机。",
      next: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "让角色动起来。"
      }
    }
  };

  const projectData = projectWithBlocks({
    hat: block("event_whenflagclicked", {
      next: "move",
      topLevel: true
    }),
    move: block("motion_movesteps", {
      parent: "hat"
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), true);
});

test("isRecommendationCompleted returns false when recommended order is wrong", () => {
  const recommendation = {
    root: {
      opcode: "event_whenflagclicked",
      category: "事件",
      label: "当绿旗被点击",
      reason: "给脚本一个开始时机。",
      next: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "让角色动起来。"
      }
    }
  };

  const projectData = projectWithBlocks({
    move: block("motion_movesteps", {
      next: "hat",
      topLevel: true
    }),
    hat: block("event_whenflagclicked", {
      parent: "move"
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), false);
});

test("isRecommendationCompleted matches condition inputs in the correct slot", () => {
  const recommendation = {
    root: {
      opcode: "control_if",
      category: "控制",
      label: "如果...那么",
      reason: "让角色会判断。",
      condition: {
        opcode: "sensing_touchingobject",
        category: "侦测",
        label: "碰到...？",
        reason: "检查是否碰到目标。"
      }
    }
  };

  const projectData = projectWithBlocks({
    ifBlock: block("control_if", {
      topLevel: true,
      inputs: {
        CONDITION: [2, "touching"]
      }
    }),
    touching: block("sensing_touchingobject", {
      parent: "ifBlock"
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), true);
});

test("isRecommendationCompleted rejects condition blocks scattered outside the condition slot", () => {
  const recommendation = {
    root: {
      opcode: "control_if",
      category: "控制",
      label: "如果...那么",
      reason: "让角色会判断。",
      condition: {
        opcode: "sensing_touchingobject",
        category: "侦测",
        label: "碰到...？",
        reason: "检查是否碰到目标。"
      }
    }
  };

  const projectData = projectWithBlocks({
    ifBlock: block("control_if", {
      topLevel: true
    }),
    touching: block("sensing_touchingobject", {
      topLevel: true
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), false);
});

test("isRecommendationCompleted matches substack inputs in the correct slot", () => {
  const recommendation = {
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复执行",
      reason: "让动作重复。",
      substack: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "重复移动。"
      }
    }
  };

  const projectData = projectWithBlocks({
    repeat: block("control_repeat", {
      topLevel: true,
      inputs: {
        SUBSTACK: [2, "move"]
      }
    }),
    move: block("motion_movesteps", {
      parent: "repeat"
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), true);
});

test("isRecommendationCompleted rejects substacks nested in unrelated controls", () => {
  const recommendation = {
    root: {
      opcode: "event_whenflagclicked",
      category: "事件",
      label: "当绿旗被点击",
      reason: "给脚本一个开始时机。",
      next: {
        opcode: "control_repeat",
        category: "控制",
        label: "重复执行",
        reason: "让动作重复。",
        substack: {
          opcode: "motion_movesteps",
          category: "运动",
          label: "移动 10 步",
          reason: "重复移动。"
        }
      }
    }
  };

  const projectData = projectWithBlocks({
    hat: block("event_whenflagclicked", {
      next: "repeat",
      topLevel: true
    }),
    repeat: block("control_repeat", {
      parent: "hat"
    }),
    otherRepeat: block("control_repeat", {
      topLevel: true,
      inputs: {
        SUBSTACK: [2, "move"]
      }
    }),
    move: block("motion_movesteps", {
      parent: "otherRepeat"
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), false);
});

test("isRecommendationCompleted ignores parameter values when opcodes and relationships match", () => {
  const recommendation = {
    root: {
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      reason: "让角色动起来。"
    }
  };

  const projectData = projectWithBlocks({
    move: block("motion_movesteps", {
      topLevel: true,
      inputs: {
        STEPS: [1, [4, "100"]]
      }
    })
  });

  assert.equal(isRecommendationCompleted(projectData, TARGET_META, recommendation), true);
});

test("analyzeRecommendationProgress returns following when the recommendation prefix is added", () => {
  const recommendation = {
    root: {
      opcode: "event_whenflagclicked",
      category: "事件",
      label: "当绿旗被点击",
      reason: "给脚本一个开始时机。",
      next: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "让角色动起来。"
      }
    }
  };

  const currentProjectData = projectWithBlocks({
    hat: block("event_whenflagclicked", {
      topLevel: true
    })
  });

  const result = analyzeRecommendationProgress({
    baselineProjectData: EMPTY_PROJECT,
    currentProjectData,
    currentTarget: TARGET_META,
    recommendation
  });

  assert.equal(result.status, "following");
  assert.equal(result.baselineMatchedNodeCount, 0);
  assert.equal(result.currentMatchedNodeCount, 1);
});

test("analyzeRecommendationProgress returns diverged when unrelated structure is added", () => {
  const recommendation = {
    root: {
      opcode: "event_whenflagclicked",
      category: "事件",
      label: "当绿旗被点击",
      reason: "给脚本一个开始时机。"
    }
  };

  const currentProjectData = projectWithBlocks({
    say: block("looks_sayforsecs", {
      topLevel: true
    })
  });

  const result = analyzeRecommendationProgress({
    baselineProjectData: EMPTY_PROJECT,
    currentProjectData,
    currentTarget: TARGET_META,
    recommendation
  });

  assert.equal(result.status, "diverged");
  assert.equal(result.currentMatchedNodeCount, 0);
});

test("analyzeRecommendationProgress returns unchanged for parameter or coordinate changes only", () => {
  const recommendation = {
    root: {
      opcode: "motion_movesteps",
      category: "运动",
      label: "移动 10 步",
      reason: "让角色动起来。",
      next: {
        opcode: "looks_sayforsecs",
        category: "外观",
        label: "说 2 秒",
        reason: "给出反馈。"
      }
    }
  };

  const baselineProjectData = projectWithBlocks({
    move: block("motion_movesteps", {
      topLevel: true,
      x: 10,
      y: 20,
      inputs: {
        STEPS: [1, [4, "10"]]
      }
    })
  });
  const currentProjectData = projectWithBlocks({
    move: block("motion_movesteps", {
      topLevel: true,
      x: 200,
      y: 300,
      inputs: {
        STEPS: [1, [4, "100"]]
      }
    })
  });

  const result = analyzeRecommendationProgress({
    baselineProjectData,
    currentProjectData,
    currentTarget: TARGET_META,
    recommendation
  });

  assert.equal(result.status, "unchanged");
  assert.equal(result.baselineMatchedNodeCount, 1);
  assert.equal(result.currentMatchedNodeCount, 1);
});
