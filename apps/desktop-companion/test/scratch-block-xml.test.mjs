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

test("buildRecommendedBlockXml maps DeepSeek secs params to Scratch duration inputs", () => {
  const sayXml = buildRecommendedBlockXml({
    opcode: "looks_sayforsecs",
    category: "外观",
    label: "说 3 秒",
    reason: "说出结果。",
    params: {
      message: "完成",
      secs: "3"
    }
  });
  const waitXml = buildRecommendedBlockXml({
    opcode: "control_wait",
    category: "控制",
    label: "等待 0.5 秒",
    reason: "稍微停一下。",
    params: {
      secs: "0.5"
    }
  });
  const glideXml = buildRecommendedBlockXml({
    opcode: "motion_glidesecstoxy",
    category: "运动",
    label: "在 4 秒内滑行到 x: y:",
    reason: "慢慢移动到中心。",
    params: {
      secs: "4"
    }
  });

  assert.match(sayXml, /<block[^>]+type="looks_sayforsecs"/);
  assert.match(sayXml, /<value name="SECS">[\s\S]*<field name="NUM">3<\/field>/);
  assert.match(waitXml, /<block[^>]+type="control_wait"/);
  assert.match(waitXml, /<value name="DURATION">[\s\S]*<field name="NUM">0.5<\/field>/);
  assert.match(glideXml, /<block[^>]+type="motion_glidesecstoxy"/);
  assert.match(glideXml, /<value name="SECS">[\s\S]*<field name="NUM">4<\/field>/);
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
  assert.match(setVariableXml, /<shadow type="text">/);
  assert.match(setVariableXml, /<field name="TEXT">0<\/field>/);
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
  assert.match(sumXml, /<shadow type="text">/);
  assert.match(sumXml, /<field name="TEXT">0<\/field>/);
  assert.match(counterXml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.match(counterXml, /<shadow type="text">/);
  assert.match(counterXml, /<field name="TEXT">1<\/field>/);
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

test("buildRecommendedBlockXml renders answer reporter and touching target params", () => {
  const setGuessXml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将变量设为",
    reason: "把玩家回答保存到 guess。",
    params: {
      variable: "guess",
      value: "sensing_answer"
    }
  });
  const touchingAppleXml = buildRecommendedBlockXml({
    opcode: "sensing_touchingobject",
    category: "侦测",
    label: "碰到 Apple？",
    reason: "检测 Cat 是否碰到 Apple。",
    params: {
      variable: "Apple"
    }
  });

  assert.match(setGuessXml, /<field name="VARIABLE"[^>]*>guess<\/field>/);
  assert.match(setGuessXml, /<value name="VALUE">\s*<block type="sensing_answer">/);
  assert.doesNotMatch(setGuessXml, /<field name="VARIABLE"[^>]*>sensing_answer<\/field>/);
  assert.match(touchingAppleXml, /<field name="TOUCHINGOBJECTMENU">Apple<\/field>/);
  assert.doesNotMatch(touchingAppleXml, /<field name="TOUCHINGOBJECTMENU">边缘<\/field>/);
});

test("buildRecommendedBlockXml preserves camelCase variable params in comparisons", () => {
  const comparisonXml = buildRecommendedBlockXml({
    opcode: "operator_equals",
    category: "运算",
    label: "guess = secretNumber",
    reason: "比较玩家猜测和秘密数字。",
    params: {
      left: "guess",
      right: "secretNumber"
    }
  });

  assert.match(comparisonXml, /<field name="VARIABLE"[^>]*>guess<\/field>/);
  assert.match(comparisonXml, /<field name="VARIABLE"[^>]*>secretNumber<\/field>/);
  assert.doesNotMatch(comparisonXml, /<field name="VARIABLE"[^>]*>secretnumber<\/field>/);
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

test("buildRecommendedBlockXml ignores operator opcode placeholders and infers the square formula", () => {
  const xml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将 result 设为",
    reason: "计算平方：用 number 乘以 number，把结果存入 result 变量。",
    params: {
      variable: "result",
      value: "operator_multiply"
    }
  });

  assert.match(xml, /<value name="VALUE">\s*<block type="operator_multiply">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>number<\/field>[\s\S]*<field name="VARIABLE"[^>]*>number<\/field>/);
  assert.doesNotMatch(xml, /<field name="VARIABLE"[^>]*>operator_multiply<\/field>/);
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

test("buildRecommendedStructureXml declares variables referenced only by reporter blocks", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复执行",
      reason: "重复执行 n 次。",
      params: { repeatTimes: "n" }
    }
  });

  assert.match(xml, /<variables>[\s\S]*<variable[^>]+id="variable-n"[^>]*>n<\/variable>[\s\S]*<\/variables>/);
  assert.match(xml, /<value name="TIMES">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>n<\/field>/);
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

test("buildRecommendedStructureXml uses protocol params for nested math formulas", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "将变量设为",
      reason: "用鸡兔同笼公式求兔子数量。",
      params: {
        variable: "rabbits",
        value: "(feet - 2 * heads) / 2"
      },
      next: {
        opcode: "looks_sayforsecs",
        category: "外观",
        label: "说 2 秒",
        reason: "说出兔子数量。",
        params: {
          messageVariable: "rabbits"
        }
      }
    }
  });

  assert.match(xml, /<field name="VARIABLE"[^>]*>rabbits<\/field>/);
  assert.match(xml, /<block type="operator_divide">/);
  assert.match(xml, /<block type="operator_subtract">/);
  assert.match(xml, /<block type="operator_multiply">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>feet<\/field>/);
  assert.match(xml, /<field name="NUM">2<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>heads<\/field>/);
  assert.match(xml, /<value name="MESSAGE">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>rabbits<\/field>[\s\S]*<field name="VARIABLE"[^>]*>rabbits<\/field>/);
});

test("buildRecommendedStructureXml renders variables from full-width math formulas", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "将变量设为",
      reason: "用鸡兔同笼公式求兔子数量。",
      params: {
        variable: "rabbits",
        value: "（feet - 2 × heads）÷ 2"
      }
    }
  });

  assert.match(xml, /<block type="operator_divide">/);
  assert.match(xml, /<block type="operator_subtract">/);
  assert.match(xml, /<block type="operator_multiply">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>feet<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>heads<\/field>/);
  assert.doesNotMatch(xml, /<shadow type="text">[\s\S]*feet - 2/);
});

test("buildRecommendedStructureXml renders Chinese formula variables with distinct ids", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "将变量设为",
      reason: "用鸡兔同笼公式求兔子数量。",
      params: {
        variable: "兔子数量",
        value: "（脚数 - 2 × 头数）÷ 2"
      }
    }
  });

  assert.match(xml, /<field name="VARIABLE"[^>]*>兔子数量<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>脚数<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>头数<\/field>/);

  const idsByVariable = Object.fromEntries(
    [...xml.matchAll(/<field name="VARIABLE" id="([^"]+)"[^>]*>([^<]+)<\/field>/g)].map((match) => [
      match[2],
      match[1]
    ])
  );
  assert.equal(new Set([idsByVariable.兔子数量, idsByVariable.脚数, idsByVariable.头数]).size, 3);
  assert.doesNotMatch(xml, /id="variable--"/);
});

test("buildRecommendedStructureXml stores ask answers instead of empty variable inputs", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "sensing_askandwait",
      category: "侦测",
      label: "询问",
      reason: "需要先获取头数。",
      params: { question: "请输入总头数" },
      next: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "存储头数",
        reason: "存储头数。",
        params: { variable: "头数" },
        next: {
          opcode: "sensing_askandwait",
          category: "侦测",
          label: "询问",
          reason: "获取脚数。",
          params: { question: "请输入总脚数" },
          next: {
            opcode: "data_setvariableto",
            category: "变量",
            label: "存储脚数",
            reason: "存储脚数。",
            params: { variable: "脚数" }
          }
        }
      }
    }
  });

  assert.match(xml, /<field name="TEXT">请输入总头数<\/field>/);
  assert.match(xml, /<field name="TEXT">请输入总脚数<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>头数<\/field>[\s\S]*<value name="VALUE">\s*<block type="sensing_answer">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>脚数<\/field>[\s\S]*<value name="VALUE">\s*<block type="sensing_answer">/);
  assert.doesNotMatch(xml, /<field name="VARIABLE"[^>]*>头数<\/field>[\s\S]*<shadow type="math_number">/);
  assert.doesNotMatch(xml, /<field name="VARIABLE"[^>]*>脚数<\/field>[\s\S]*<shadow type="math_number">/);
});

test("buildRecommendedBlockXml prefers the goal-specific turn angle in the reason over a generic label", () => {
  const xml = buildRecommendedBlockXml({
    opcode: "motion_turnright",
    category: "运动",
    label: "右转 15 度",
    reason: "每条边后右转 72 度，才能画出五边形。"
  });

  assert.match(xml, /<value name="DEGREES">[\s\S]*<field name="NUM">72<\/field>/);
  assert.doesNotMatch(xml, /<field name="NUM">15<\/field>/);
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

test("buildRecommendedStructureXml renders key selection and speed variable movement params", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "event_whenkeypressed",
      category: "事件",
      label: "按下右方向键",
      reason: "按下右方向键时移动。",
      params: { key: "right arrow" },
      next: {
        opcode: "motion_changexby",
        category: "运动",
        label: "将 x 坐标增加 speed",
        reason: "移动距离使用 speed。",
        params: { steps: "speed" }
      }
    }
  });

  assert.match(xml, /<field name="KEY_OPTION">right arrow<\/field>/);
  assert.match(xml, /<value name="DX">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>speed<\/field>/);
  assert.match(xml, /<variable[^>]+id="variable-speed"[^>]*>speed<\/variable>/);
});

test("buildRecommendedStructureXml renders variable angles and coordinate params", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复 sides 次",
      reason: "六边形边数来自 sides。",
      params: { repeatTimes: "sides" },
      substack: {
        opcode: "motion_turnright",
        category: "运动",
        label: "右转 angle",
        reason: "每条边使用 angle 变量。",
        params: { degrees: "angle" }
      },
      next: {
        opcode: "motion_setx",
        category: "运动",
        label: "设 x",
        reason: "设置 x。",
        params: { x: "-100" },
        next: {
          opcode: "motion_sety",
          category: "运动",
          label: "设 y",
          reason: "设置 y。",
          params: { y: "80" },
          next: {
            opcode: "motion_gotoxy",
            category: "运动",
            label: "到坐标",
            reason: "回到中心。",
            params: { x: "0", y: "0" }
          }
        }
      }
    }
  });

  assert.match(xml, /<value name="TIMES">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>sides<\/field>/);
  assert.match(xml, /<value name="DEGREES">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>angle<\/field>/);
  assert.match(xml, /<block type="motion_setx">[\s\S]*<field name="NUM">-100<\/field>/);
  assert.match(xml, /<block type="motion_sety">[\s\S]*<field name="NUM">80<\/field>/);
  assert.match(xml, /<block type="motion_gotoxy">[\s\S]*<field name="NUM">0<\/field>[\s\S]*<field name="NUM">0<\/field>/);
});

test("recommended expression XML keeps exact full-width formula serialization", () => {
  const xml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "把 结果 设为公式",
    reason: "测试全角公式与优先级。",
    params: { variable: "结果", value: "（number＋2）×3" }
  });

  assert.equal(
    xml,
    '<xml xmlns="https://developers.google.com/blockly/xml"><variables><variable type="" id="variable-p1v-kgs" islocal="false" iscloud="false">结果</variable><variable type="" id="variable-number" islocal="false" iscloud="false">number</variable></variables><block type="data_setvariableto"><field name="VARIABLE" id="variable-p1v-kgs" variabletype="">结果</field><value name="VALUE"><block type="operator_multiply"><value name="NUM1"><block type="operator_add"><value name="NUM1"><block type="data_variable"><field name="VARIABLE" id="variable-number" variabletype="">number</field></block></value><value name="NUM2"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block></value><value name="NUM2"><shadow type="math_number"><field name="NUM">3</field></shadow></value></block></value></block></xml>'
  );
});

test("recommended expression XML keeps exact special-function serialization", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "把 first 设为字符",
      reason: "测试函数表达式。",
      params: { variable: "first", value: "letter(join(text:你,name),round(1＋2))" },
      next: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "保存列表长度",
        reason: "测试列表表达式。",
        params: { variable: "count", value: "listlength(购物清单)" }
      }
    }
  });

  assert.equal(
    xml,
    '<xml xmlns="https://developers.google.com/blockly/xml"><variables><variable type="" id="variable-first" islocal="false" iscloud="false">first</variable><variable type="" id="variable-count" islocal="false" iscloud="false">count</variable><variable type="list" id="list-rvx-mll-lqd-ggl" islocal="false" iscloud="false">购物清单</variable></variables><block type="data_setvariableto"><field name="VARIABLE" id="variable-first" variabletype="">first</field><value name="VALUE"><block type="operator_letter_of"><value name="LETTER"><block type="operator_round"><value name="NUM"><block type="operator_add"><value name="NUM1"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="NUM2"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block></value></block></value><value name="STRING"><shadow type="text"><field name="TEXT">join(text:你,name)</field></shadow></value></block></value><next><block type="data_setvariableto"><field name="VARIABLE" id="variable-count" variabletype="">count</field><value name="VALUE"><block type="data_lengthoflist"><field name="LIST" id="list-rvx-mll-lqd-ggl" variabletype="list">购物清单</field></block></value></block></next></block></xml>'
  );
});

test("buildRecommendedStructureXml renders composite repeat count expressions", () => {
  const formulaXml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复 n + 2 次",
      reason: "次数由变量和算式决定。",
      params: { repeatTimes: "n + 2" },
      substack: {
        opcode: "data_changevariableby",
        category: "变量",
        label: "sum 增加 i * 2",
        reason: "每轮累加两倍的 i。",
        params: { variable: "sum", changeBy: "i * 2" }
      }
    }
  });
  const nestedFormulaXml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复 (rounds + bonus) * 2 次",
      reason: "次数使用嵌套算式。",
      params: { repeatTimes: "(rounds + bonus) * 2" },
      substack: {
        opcode: "motion_movesteps",
        category: "运动",
        label: "移动 speed + 1",
        reason: "移动步数也使用算式。",
        params: { steps: "speed + 1" }
      }
    }
  });
  const reporterXml = buildRecommendedStructureXml({
    root: {
      opcode: "control_repeat",
      category: "控制",
      label: "重复四舍五入后的次数",
      reason: "次数来自 reporter。",
      params: { repeatTimes: "round(number)" },
      substack: {
        opcode: "looks_say",
        category: "外观",
        label: "说 hi",
        reason: "验证子堆栈可见。",
        params: { message: "hi" }
      },
      next: {
        opcode: "control_repeat",
        category: "控制",
        label: "按列表长度重复",
        reason: "列表长度也能放在次数槽。",
        params: { repeatTimes: "listlength(购物清单)" }
      }
    }
  });

  assert.match(formulaXml, /<value name="TIMES">\s*<block type="operator_add">/);
  assert.match(formulaXml, /<field name="VARIABLE"[^>]*>n<\/field>/);
  assert.match(formulaXml, /<field name="NUM">2<\/field>/);
  assert.match(formulaXml, /<value name="VALUE">\s*<block type="operator_multiply">/);
  assert.match(formulaXml, /<field name="VARIABLE"[^>]*>i<\/field>/);
  assert.match(nestedFormulaXml, /<value name="TIMES">\s*<block type="operator_multiply">/);
  assert.match(nestedFormulaXml, /<block type="operator_add">[\s\S]*<field name="VARIABLE"[^>]*>rounds<\/field>/);
  assert.match(nestedFormulaXml, /<field name="VARIABLE"[^>]*>bonus<\/field>/);
  assert.match(nestedFormulaXml, /<value name="STEPS">\s*<block type="operator_add">/);
  assert.match(nestedFormulaXml, /<field name="VARIABLE"[^>]*>speed<\/field>/);
  assert.match(reporterXml, /<value name="TIMES">\s*<block type="operator_round">/);
  assert.match(reporterXml, /<field name="VARIABLE"[^>]*>number<\/field>/);
  assert.match(reporterXml, /<value name="TIMES">\s*<block type="data_lengthoflist">/);
  assert.match(reporterXml, /<field name="LIST"[^>]*>购物清单<\/field>/);
});

test("buildRecommendedStructureXml renders mod, string helper and list length params", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "remainder",
      reason: "保存余数。",
      params: { variable: "remainder", value: "number % 2" },
      next: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "first",
        reason: "保存第一个字母。",
        params: { variable: "first", value: "letter(word,1)" },
        next: {
          opcode: "data_setvariableto",
          category: "变量",
          label: "length",
          reason: "保存长度。",
          params: { variable: "length", value: "length(word)" },
          next: {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说长度",
            reason: "说出购物清单长度。",
            params: { messageVariable: "listlength(购物清单)" }
          }
        }
      }
    }
  });

  assert.match(xml, /<block type="operator_mod">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>number<\/field>/);
  assert.match(xml, /<block type="operator_letter_of">/);
  assert.match(xml, /<block type="operator_length">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>word<\/field>/);
  assert.match(xml, /<block type="data_lengthoflist">/);
  assert.match(xml, /<field name="LIST"[^>]*>购物清单<\/field>/);
});

test("buildRecommendedStructureXml renders join and round helper params", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "message",
      reason: "拼接问候语。",
      params: { variable: "message", value: "join(text:你好,name)" },
      next: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "rounded",
        reason: "四舍五入 number。",
        params: { variable: "rounded", value: "round(number)" }
      }
    }
  });

  assert.match(xml, /<block type="operator_join">/);
  assert.match(xml, /<field name="TEXT">你好<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>name<\/field>/);
  assert.match(xml, /<block type="operator_round">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>number<\/field>/);
});

test("buildRecommendedStructureXml infers round and mod formulas from natural language", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "data_setvariableto",
      category: "变量",
      label: "rounded",
      reason: "把 number 四舍五入的结果存入 rounded 将 result 设为 number * number。",
      params: { variable: "rounded", value: "operator_round number" },
      next: {
        opcode: "data_setvariableto",
        category: "变量",
        label: "remainder",
        reason: "把 number 除以 5 的余数存入 remainder 将 result 设为 number * number。",
        params: { variable: "remainder", value: "operator_mod number 5" }
      }
    }
  });

  assert.match(xml, /<field name="VARIABLE"[^>]*>rounded<\/field>/);
  assert.match(xml, /<block type="operator_round">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>number<\/field>/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>remainder<\/field>/);
  assert.match(xml, /<block type="operator_mod">/);
  assert.match(xml, /<field name="NUM">5<\/field>/);
});

test("buildRecommendedStructureXml renders named broadcast and list params", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "event_broadcast",
      category: "事件",
      label: "广播开始游戏",
      reason: "发送开场消息。",
      params: { broadcast: "开始游戏" },
      next: {
        opcode: "data_addtolist",
        category: "变量",
        label: "把 item 加入购物清单",
        reason: "保存输入物品。",
        params: { list: "购物清单", value: "item" }
      }
    }
  });

  assert.match(xml, /<field name="BROADCAST_OPTION"[^>]*>开始游戏<\/field>/);
  assert.match(xml, /<field name="LIST"[^>]*>购物清单<\/field>/);
  assert.match(xml, /<value name="ITEM">\s*<block type="data_variable">/);
  assert.match(xml, /<field name="VARIABLE"[^>]*>item<\/field>/);
  assert.match(xml, /<variable type="broadcast_msg"[^>]*>开始游戏<\/variable>/);
  assert.match(xml, /<variable type="list"[^>]*>购物清单<\/variable>/);
});

test("buildRecommendedStructureXml renders distance-to-mouse expressions in comparisons", () => {
  const xml = buildRecommendedStructureXml({
    root: {
      opcode: "control_if",
      category: "控制",
      label: "如果距离小于 50",
      reason: "检测鼠标距离。",
      condition: {
        opcode: "operator_lt",
        category: "运算",
        label: "距离小于 50",
        reason: "比较鼠标距离。",
        params: { left: "sensing_distanceto", right: "50" }
      },
      substack: {
        opcode: "looks_sayforsecs",
        category: "外观",
        label: "说靠近了",
        reason: "距离足够近时提示。",
        params: { message: "靠近了", secs: "2" }
      }
    }
  });

  assert.match(xml, /<block type="sensing_distanceto">/);
  assert.match(xml, /<field name="DISTANCETOMENU">鼠标指针<\/field>/);
  assert.doesNotMatch(xml, /<field name="VARIABLE"[^>]*>sensing_distanceto<\/field>/);
});

test("buildRecommendedStructureXml distinguishes text literals from variable expressions", () => {
  const gradeXml = buildRecommendedBlockXml({
    opcode: "data_setvariableto",
    category: "变量",
    label: "将 grade 设为 A",
    reason: "设置等级文字。",
    params: { variable: "grade", value: "text:A" }
  });
  assert.match(gradeXml, /<field name="VARIABLE"[^>]*>grade<\/field>/);
  assert.match(gradeXml, /<field name="TEXT">A<\/field>/);
  assert.doesNotMatch(gradeXml, /<field name="VARIABLE"[^>]*>A<\/field>/);

  const passwordXml = buildRecommendedBlockXml({
    opcode: "operator_contains",
    category: "运算",
    label: "password 包含 scratch",
    reason: "检查密码内容。",
    params: { left: "password", right: "scratch" }
  });
  assert.match(passwordXml, /<value name="STRING1">\s*<block type="data_variable">/);
  assert.match(passwordXml, /<field name="VARIABLE"[^>]*>password<\/field>/);
  assert.match(passwordXml, /<value name="STRING2">\s*<shadow type="text">/);
  assert.match(passwordXml, /<field name="TEXT">scratch<\/field>/);
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
