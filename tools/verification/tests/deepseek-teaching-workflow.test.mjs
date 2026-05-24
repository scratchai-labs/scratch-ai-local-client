import test from "node:test";
import assert from "node:assert/strict";

import {
  renderTemplate,
  validateBrief,
  validatePlan,
  validateRolePack,
  validateHintsPack,
  validateDebugPack
} from "../workflows/deepseek-teaching/core.mjs";

function createBrief() {
  return {
    title: "小猫接苹果",
    pitch: "控制小猫左右移动，接苹果得分，碰幽灵掉生命，先到 10 分获胜。",
    studentLevel: "小学 Scratch 初学者",
    winCondition: "分数达到 10",
    loseCondition: "生命归零",
    variables: ["分数", "生命"],
    broadcasts: ["开始", "胜利", "失败"],
    learningGoals: ["事件驱动", "变量", "循环判断"],
    constraints: ["不用扩展"],
    teacherNotes: ["先做最小版本"],
    roles: [
      {
        name: "舞台",
        responsibility: "初始化变量和判断胜负",
        requiredScripts: ["初始化", "结束"],
        mustTeach: ["广播", "停止全部"]
      },
      {
        name: "猫",
        responsibility: "左右移动",
        requiredScripts: ["初始化", "移动"],
        mustTeach: ["左右键", "x 坐标"]
      }
    ]
  };
}

function createPlan(brief) {
  return {
    title: brief.title,
    pitch: brief.pitch,
    variables: brief.variables,
    broadcasts: brief.broadcasts,
    roles: brief.roles.map((role) => ({ name: role.name })),
    winCondition: brief.winCondition,
    loseCondition: brief.loseCondition,
    milestones: [
      {
        id: "m1",
        title: "先跑起来",
        studentOutcome: "能开始游戏",
        teacherCheck: "变量初始化正确"
      }
    ],
    roleBuildOrder: brief.roles.map((role) => role.name),
    roleContracts: brief.roles.map((role) => ({
      name: role.name,
      mustHaveScripts: role.requiredScripts,
      mustAvoid: ["不要改广播名"]
    })),
    commonPitfalls: [
      {
        role: "猫",
        symptom: "按键没反应",
        teacherQuestion: "你把判断放在循环里了吗？"
      }
    ],
    assemblyChecklist: ["先测舞台", "再测猫"]
  };
}

test("renderTemplate replaces placeholders", () => {
  assert.equal(renderTemplate("你好，{{name}}", { name: "学生" }), "你好，学生");
});

test("validateBrief accepts a complete brief", () => {
  assert.equal(validateBrief(createBrief()).ok, true);
});

test("validatePlan accepts a matching plan", () => {
  const brief = createBrief();
  assert.equal(validatePlan(createPlan(brief), brief).ok, true);
});

test("validateRolePack accepts a complete role pack", () => {
  const brief = createBrief();
  const role = brief.roles[1];
  const pack = {
    name: "猫",
    studentGoal: "让猫能左右移动",
    scripts: [
      {
        id: "cat-init",
        goal: "初始化位置",
        trigger: "当绿旗被点击",
        steps: ["显示", "移到 x:0 y:-150"]
      },
      {
        id: "cat-move",
        goal: "处理左右按键",
        trigger: "当接收到 开始",
        steps: ["重复执行", "如果 按下左箭头 那么", "将x坐标增加 -10"]
      }
    ],
    teacherChecks: ["左右键有反应"]
  };

  assert.equal(validateRolePack(pack, role).ok, true);
});

test("validateHintsPack accepts a complete hint pack", () => {
  const brief = createBrief();
  const plan = createPlan(brief);
  const pack = {
    title: brief.title,
    studentLevel: brief.studentLevel,
    hintPolicy: ["先问再提示"],
    milestoneHints: [
      {
        milestoneId: "m1",
        light: "先看看变量有没有归零",
        guided: "绿旗后第一件事是什么？",
        exampleReady: "先把分数设为 0"
      }
    ],
    roleHints: brief.roles.map((role) => ({
      name: role.name,
      questions: ["这一步由谁负责？"],
      commonMistakes: ["把广播名写错"]
    })),
    teacherPrompts: ["你先说说这段脚本在做什么"]
  };

  assert.equal(validateHintsPack(pack, brief, plan).ok, true);
});

test("validateDebugPack accepts a complete debug pack", () => {
  const brief = createBrief();
  const pack = {
    title: brief.title,
    debugChecklist: [
      {
        symptom: "按键没反应",
        askStudent: "你把按键判断放在哪了？",
        quickCheck: "先看有没有循环",
        minimalFix: "把按键判断放进重复执行",
        verify: "再次按左右键测试"
      }
    ],
    roleSpecificFixes: brief.roles.map((role) => ({
      name: role.name,
      watchFor: ["广播名是否一致"],
      microFixes: ["先只改一个积木再测试"]
    })),
    whenToIntervene: ["学生连续两轮都找不到触发器时"]
  };

  assert.equal(validateDebugPack(pack, brief).ok, true);
});
