import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeRecommendedStructure } from "../dist/recommended-structure.js";

test("sanitizeRecommendedStructure drops invalid nested relations but keeps renderable parts", () => {
  const result = sanitizeRecommendedStructure({
    root: {
      opcode: "control_if",
      category: "控制",
      label: "如果...那么",
      reason: "保留根节点。",
      condition: {
        opcode: "looks_show",
        category: "外观",
        label: "显示",
        reason: "这个条件本来就不合法。"
      },
      substack: {
        opcode: "motion_ifonedgebounce",
        category: "运动",
        label: "碰到边缘就反弹",
        reason: "这个分支可以保留。"
      },
      next: {
        opcode: "event_whenkeypressed",
        category: "事件",
        label: "当按下空格键",
        reason: "帽子积木不能接在 next 后面。"
      }
    }
  });

  assert.deepEqual(result, {
    root: {
      opcode: "control_if",
      category: "控制",
      label: "如果...那么",
      reason: "保留根节点。",
      substack: {
        opcode: "motion_ifonedgebounce",
        category: "运动",
        label: "碰到边缘就反弹",
        reason: "这个分支可以保留。"
      }
    }
  });
});

test("sanitizeRecommendedStructure rejects reporter roots", () => {
  const result = sanitizeRecommendedStructure({
    root: {
      opcode: "sensing_touchingobject",
      category: "侦测",
      label: "碰到...？",
      reason: "reporter 不能直接作为顶层脚本。"
    }
  });

  assert.equal(result, undefined);
});

test("sanitizeRecommendedStructure removes next from terminal Scratch blocks", () => {
  for (const opcode of ["control_forever", "control_stop", "control_delete_this_clone"]) {
    const result = sanitizeRecommendedStructure({
      root: {
        opcode,
        category: "控制",
        label: opcode,
        reason: "这是不能继续向下连接的积木。",
        next: {
          opcode: "motion_movesteps",
          category: "运动",
          label: "移动 10 步",
          reason: "这个 next 必须被拒绝。"
        }
      }
    });

    assert.equal(result?.root.opcode, opcode);
    assert.equal(result?.root.next, undefined, `${opcode} must not keep a next relation`);
  }
});

test("sanitizeRecommendedStructure preserves sprite-click hat recommendations", () => {
  const result = sanitizeRecommendedStructure({
    root: {
      opcode: "event_whenthisspriteclicked",
      category: "事件",
      label: "当角色被点击",
      reason: "点击角色时开始加分。",
      next: {
        opcode: "data_changevariableby",
        category: "变量",
        label: "将 score 增加 1",
        reason: "记录点击得分。"
      }
    }
  });

  assert.equal(result?.root.opcode, "event_whenthisspriteclicked");
  assert.equal(result?.root.next?.opcode, "data_changevariableby");
});
