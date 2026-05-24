import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCurrentTargetScriptXmlList,
  buildRecommendedBlockXml
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
