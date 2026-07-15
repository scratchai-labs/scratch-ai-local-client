import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCurrentTargetScriptXmlList,
  buildRecommendedBlockXml,
  buildRecommendedStructureXml
} from "../dist/scratch-block-xml.js";

test("buildCurrentTargetScriptXmlList serializes nested control stacks into Blockly XML", () => {
  const xmlList = buildCurrentTargetScriptXmlList(
    {
      targets: [
        {
          id: "sprite-a",
          name: "Cat",
          isStage: false,
          blocks: {
            hat: {
              opcode: "event_whenflagclicked",
              next: "repeat",
              parent: null,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: true
            },
            repeat: {
              opcode: "control_repeat",
              next: null,
              parent: "hat",
              inputs: {
                TIMES: [1, [4, "10"]],
                SUBSTACK: [2, "move"]
              },
              fields: {},
              shadow: false,
              topLevel: false
            },
            move: {
              opcode: "motion_movesteps",
              next: null,
              parent: "repeat",
              inputs: {
                STEPS: [1, [4, "10"]]
              },
              fields: {},
              shadow: false,
              topLevel: false
            }
          }
        }
      ]
    },
    {
      id: "sprite-a",
      name: "Cat"
    }
  );

  assert.equal(xmlList.length, 1);
  assert.match(xmlList[0], /<block[^>]+type="event_whenflagclicked"/);
  assert.match(xmlList[0], /<next>\s*<block[^>]+type="control_repeat"/);
  assert.match(xmlList[0], /<statement name="SUBSTACK">/);
  assert.match(xmlList[0], /<block[^>]+type="motion_movesteps"/);
  assert.match(xmlList[0], /<shadow type="math_number">/);
  assert.match(xmlList[0], /<field name="NUM">10<\/field>/);
});

test("buildRecommendedBlockXml creates official block XML with default inputs", () => {
  const sayXml = buildRecommendedBlockXml({
    opcode: "looks_sayforsecs",
    category: "外观",
    label: "说 2 秒",
    reason: "给脚本一个更直观的反馈。",
    example: "开始跑啦"
  });
  const waitXml = buildRecommendedBlockXml({
    opcode: "control_wait",
    category: "控制",
    label: "等待",
    reason: "让动作节奏慢一点。"
  });

  assert.match(sayXml, /<block[^>]+type="looks_sayforsecs"/);
  assert.match(sayXml, /<value name="SECS">/);
  assert.match(sayXml, /<field name="NUM">2<\/field>/);
  assert.match(sayXml, /<field name="TEXT">开始跑啦<\/field>/);

  assert.match(waitXml, /<block[^>]+type="control_wait"/);
  assert.match(waitXml, /<value name="DURATION">/);
  assert.match(waitXml, /<field name="NUM">1<\/field>/);
});

test("buildRecommendedStructureXml serializes ordered blocks through next connections", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "event_whenflagclicked",
      category: "事件",
      label: "当绿旗被点击",
      reason: "给脚本一个开始时机。",
      next: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 10 步",
        reason: "先让角色动起来。"
      }
    }
  });

  assert.match(xml, /^<xml[^>]*>/);
  assert.match(xml, /<block[^>]+type="event_whenflagclicked"/);
  assert.match(xml, /<next>\s*<block[^>]+type="motion_movesteps"/);
  assert.equal((xml.match(/<xml/g) ?? []).length, 1);
});

test("buildRecommendedStructureXml serializes condition and substack relationships", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "control_if",
      category: "控制",
      label: "如果...那么",
      reason: "让角色会判断。",
      condition: {
        opcode: "sensing_touchingobject",
        category: "侦测",
        label: "碰到...？",
        reason: "检查角色是否碰到目标。"
      },
      substack: {
        opcode: "looks_sayforsecs",
        category: "外观",
        label: "说 2 秒",
        reason: "给出可见反馈。"
      }
    }
  });

  assert.match(xml, /<value name="CONDITION">\s*<block[^>]+type="sensing_touchingobject"/);
  assert.match(xml, /<statement name="SUBSTACK">\s*<block[^>]+type="looks_sayforsecs"/);
  assert.doesNotMatch(xml, /type="sensing_mousedown"/);
  assert.doesNotMatch(xml, /type="motion_movesteps"/);
});

test("buildRecommendedStructureXml serializes both branches of if-else blocks", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "control_if_else",
      category: "控制",
      label: "如果...那么...否则",
      reason: "让角色根据情况选择行为。",
      substack: {
        opcode: "looks_show",
        category: "外观",
        label: "显示",
        reason: "条件成立时显示角色。"
      },
      substack2: {
        opcode: "looks_hide",
        category: "外观",
        label: "隐藏",
        reason: "条件不成立时隐藏角色。"
      }
    }
  });

  assert.match(xml, /<statement name="SUBSTACK">\s*<block[^>]+type="looks_show"/);
  assert.match(xml, /<statement name="SUBSTACK2">\s*<block[^>]+type="looks_hide"/);
});

test("buildRecommendedBlockXml fills fields and values for effect, menu and variable blocks", () => {
  const effectXml = buildRecommendedBlockXml({
    opcode: "looks_changeeffectby",
    category: "外观",
    label: "将颜色特效增加 25",
    reason: "先调一下颜色。"
  });
  const pointTowardsXml = buildRecommendedBlockXml({
    opcode: "motion_pointtowards",
    category: "运动",
    label: "面向...",
    reason: "先让方向正确。"
  });
  const setVariableXml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将变量设为",
    reason: "先初始化变量。"
  });

  assert.match(effectXml, /<block[^>]+type="looks_changeeffectby"/);
  assert.match(effectXml, /<field name="EFFECT">COLOR<\/field>/);
  assert.match(effectXml, /<value name="CHANGE">/);
  assert.match(effectXml, /<field name="NUM">25<\/field>/);

  assert.match(pointTowardsXml, /<block[^>]+type="motion_pointtowards"/);
  assert.match(pointTowardsXml, /<value name="TOWARDS">/);
  assert.match(pointTowardsXml, /<shadow type="motion_pointtowards_menu">/);
  assert.match(pointTowardsXml, /<field name="TOWARDS">鼠标指针<\/field>/);

  assert.match(setVariableXml, /<block[^>]+type="data_setvariableto"/);
  assert.match(setVariableXml, /<field name="VARIABLE"[^>]*>分数<\/field>/);
  assert.match(setVariableXml, /<value name="VALUE">/);
  assert.match(setVariableXml, /<field name="NUM">0<\/field>/);
});

test("buildRecommendedBlockXml infers sum variable defaults from recommendation text", () => {
  const sumXml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将变量设为",
    reason: "初始化累加和为 0。"
  });
  const counterXml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将变量设为",
    reason: "计数器 i 从 1 开始。"
  });
  const changeSumXml = buildRecommendedBlockXml({
    opcode: "data_changevariableby",
    category: "变量",
    label: "将变量增加",
    reason: "每次让 sum 增加 i。"
  });
  const changeCounterXml = buildRecommendedBlockXml({
    opcode: "data_changevariableby",
    category: "变量",
    label: "将变量增加",
    reason: "每次让 i 增加 1。"
  });

  assert.match(sumXml, /<field name="VARIABLE"[^>]*>sum<\/field>/);
  assert.match(sumXml, /<field name="NUM">0<\/field>/);
  assert.match(counterXml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.match(counterXml, /<field name="NUM">1<\/field>/);
  assert.match(changeSumXml, /<field name="VARIABLE"[^>]*>sum<\/field>/);
  assert.match(changeSumXml, /<value name="VALUE">\s*<block type="data_variable">/);
  assert.match(changeSumXml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.match(changeCounterXml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.match(changeCounterXml, /<field name="NUM">1<\/field>/);
});

test("buildRecommendedBlockXml uses variable reporters for math output bubbles", () => {
  const saySumXml = buildRecommendedBlockXml({
    opcode: "looks_sayforsecs",
    category: "外观",
    label: "说 2 秒",
    reason: "循环结束后说出 sum 的值。"
  });
  const sayResultXml = buildRecommendedBlockXml({
    opcode: "looks_sayforsecs",
    category: "外观",
    label: "说 2 秒",
    reason: "输出 result 计算结果。"
  });

  assert.match(saySumXml, /<value name="MESSAGE">\s*<block type="data_variable">/);
  assert.match(saySumXml, /<field name="VARIABLE"[^>]*>sum<\/field>/);
  assert.doesNotMatch(saySumXml, /<field name="TEXT">结果<\/field>/);
  assert.match(sayResultXml, /<value name="MESSAGE">\s*<block type="data_variable">/);
  assert.match(sayResultXml, /<field name="VARIABLE"[^>]*>result<\/field>/);
});

test("buildRecommendedBlockXml renders generic accumulator variable reporters from natural text", () => {
  const changeXml = buildRecommendedBlockXml({
    opcode: "data_changevariableby",
    category: "变量",
    label: "将变量增加",
    reason: "每次循环将当前 i 的值累加到 s 中。"
  });
  const sayXml = buildRecommendedBlockXml({
    opcode: "looks_sayforsecs",
    category: "外观",
    label: "说 2 秒",
    reason: "循环结束后说出累加结果 s。"
  });

  assert.match(changeXml, /<field name="VARIABLE"[^>]*>s<\/field>/);
  assert.match(changeXml, /<value name="VALUE">\s*<block type="data_variable">/);
  assert.match(changeXml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.doesNotMatch(changeXml, /<field name="NUM">1<\/field>/);
  assert.match(sayXml, /<value name="MESSAGE">\s*<block type="data_variable">/);
  assert.match(sayXml, /<field name="VARIABLE"[^>]*>s<\/field>/);
  assert.doesNotMatch(sayXml, /<field name="TEXT">开始吧<\/field>/);
});

test("buildRecommendedBlockXml renders square calculation into result variable", () => {
  const xml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将变量设为",
    reason: "计算 number 的平方并存入 result，也就是 result = number * number。"
  });

  assert.match(xml, /<field name="VARIABLE"[^>]*>result<\/field>/);
  assert.match(xml, /<value name="VALUE">\s*<block type="operator_multiply">/);
  assert.match(xml, /<value name="NUM1">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>number<\/field>[\s\S]*<field name="VARIABLE"[^>]*>number<\/field>/);
});

test("buildRecommendedBlockXml renders generic variable multiplication assignments", () => {
  const xml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将变量设为",
    reason: "将 product 设为 product * i，用来计算阶乘。"
  });

  assert.match(xml, /<field name="VARIABLE"[^>]*>product<\/field>/);
  assert.match(xml, /<value name="VALUE">\s*<block type="operator_multiply">/);
  assert.match(xml, /<value name="NUM1">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>product<\/field>[\s\S]*<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.doesNotMatch(xml, /<field name="VARIABLE"[^>]*>i<\/field>[\s\S]*<value name="VALUE">\s*<shadow type="math_number">\s*<field name="NUM">1<\/field>/);
});

test("buildRecommendedStructureXml keeps distinct inferred sum variables in connected recommendations", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "将变量设为",
      reason: "初始化累加和为 0。",
      next: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "将变量设为",
        reason: "计数器 i 从 1 开始。"
      }
    }
  });

  assert.match(xml, /<field name="VARIABLE"[^>]*>sum<\/field>[\s\S]*<field name="VARIABLE"[^>]*>i<\/field>/);
});

test("buildRecommendedStructureXml infers math loop counts and accumulator inputs from recommendation text", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复执行",
      reason: "重复执行 100 次，把 1 到 100 的数字都累加起来。",
      substack: {
        opcode: "data_changevariableby",
        category: "变量",
        label: "将变量增加",
        reason: "把 i 加到 sum 中。"
      }
    }
  });

  assert.match(xml, /<block[^>]+type="control_repeat"/);
  assert.match(xml, /<value name="TIMES">[\s\S]*<field name="NUM">100<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>sum<\/field>/);
  assert.match(xml, /<value name="VALUE">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.doesNotMatch(xml, /<field name="NUM">10<\/field>[\s\S]*<statement name="SUBSTACK">/);
});

test("buildRecommendedStructureXml infers polygon repeat counts and turn degrees from drawing text", () => {
  const triangleXml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复执行",
      reason: "用重复执行画一个等边三角形。",
      substack: {
        opcode: "motion_turnright",
        category: "运动",
        label: "右转",
        reason: "每条边后右转，三角形外角是 120 度。"
      }
    }
  });
  const pentagonXml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复执行",
      reason: "用重复执行画一个五边形。",
      substack: {
        opcode: "motion_turnright",
        category: "运动",
        label: "右转",
        reason: "五边形每次右转 72 度。"
      }
    }
  });

  assert.match(triangleXml, /<value name="TIMES">[\s\S]*<field name="NUM">3<\/field>/);
  assert.match(triangleXml, /<value name="DEGREES">[\s\S]*<field name="NUM">120<\/field>/);
  assert.match(pentagonXml, /<value name="TIMES">[\s\S]*<field name="NUM">5<\/field>/);
  assert.match(pentagonXml, /<value name="DEGREES">[\s\S]*<field name="NUM">72<\/field>/);
  assert.doesNotMatch(`${triangleXml}\n${pentagonXml}`, /<field name="NUM">15<\/field>/);
});

test("buildRecommendedBlockXml does not leave common input blocks as empty shells", () => {
  const opcodes = [
    "event_whenkeypressed",
    "event_whenbroadcastreceived",
    "event_broadcast",
    "event_broadcastandwait",
    "motion_glideto",
    "motion_pointtowards",
    "motion_changexby",
    "motion_setx",
    "motion_changeyby",
    "motion_sety",
    "looks_switchcostumeto",
    "looks_switchbackdropto",
    "looks_changeeffectby",
    "looks_seteffectto",
    "looks_changesizeby",
    "looks_setsizeto",
    "sound_play",
    "sound_playuntildone",
    "control_if",
    "control_if_else",
    "control_repeat_until",
    "control_stop",
    "sensing_touchingobject",
    "sensing_keypressed",
    "sensing_askandwait",
    "operator_equals",
    "operator_add",
    "data_setvariableto",
    "data_changevariableby",
    "data_showvariable",
    "data_hidevariable",
    "data_addtolist",
    "pen_setPenColorToColor",
    "pen_changePenSizeBy"
  ];

  for (const opcode of opcodes) {
    const xml = buildRecommendedBlockXml({
      opcode,
      category: "测试",
      label: opcode,
      reason: "测试"
    });

    assert.doesNotMatch(
      xml,
      new RegExp(`<block type="${opcode}"><\\/block>`),
      `${opcode} should not be rendered as an empty shell`
    );
  }
});

test("buildRecommendedBlockXml covers more common official recommendation opcodes with concrete fields and inputs", () => {
  const expectations = [
    {
      opcode: "motion_goto",
      patterns: [
        /<block[^>]+type="motion_goto"/,
        /<value name="TO">/,
        /<shadow type="motion_goto_menu">/,
        /<field name="TO">鼠标指针<\/field>/
      ]
    },
    {
      opcode: "motion_glidesecstoxy",
      patterns: [
        /<block[^>]+type="motion_glidesecstoxy"/,
        /<value name="SECS">/,
        /<value name="X">/,
        /<value name="Y">/
      ]
    },
    {
      opcode: "looks_goforwardbackwardlayers",
      patterns: [
        /<block[^>]+type="looks_goforwardbackwardlayers"/,
        /<field name="FORWARD_BACKWARD">forward<\/field>/,
        /<value name="NUM">/
      ]
    },
    {
      opcode: "sound_changeeffectby",
      patterns: [
        /<block[^>]+type="sound_changeeffectby"/,
        /<field name="EFFECT">PITCH<\/field>/,
        /<value name="VALUE">/
      ]
    },
    {
      opcode: "sensing_distanceto",
      patterns: [
        /<block[^>]+type="sensing_distanceto"/,
        /<value name="DISTANCETOMENU">/,
        /<shadow type="sensing_distancetomenu">/
      ]
    },
    {
      opcode: "operator_mathop",
      patterns: [
        /<block[^>]+type="operator_mathop"/,
        /<field name="OPERATOR">abs<\/field>/,
        /<value name="NUM">/
      ]
    },
    {
      opcode: "data_insertatlist",
      patterns: [
        /<block[^>]+type="data_insertatlist"/,
        /<value name="ITEM">/,
        /<value name="INDEX">/,
        /<field name="LIST"[^>]*>清单<\/field>/
      ]
    },
    {
      opcode: "data_listcontainsitem",
      patterns: [
        /<block[^>]+type="data_listcontainsitem"/,
        /<field name="LIST"[^>]*>清单<\/field>/,
        /<value name="ITEM">/
      ]
    }
  ];

  for (const expectation of expectations) {
    const xml = buildRecommendedBlockXml({
      opcode: expectation.opcode,
      category: "测试",
      label: expectation.opcode,
      reason: "测试"
    });

    for (const pattern of expectation.patterns) {
      assert.match(xml, pattern, `${expectation.opcode} should include ${String(pattern)}`);
    }
  }
});
