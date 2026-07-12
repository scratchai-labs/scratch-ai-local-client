import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAiStatus,
  formatAiSourceSummary,
  formatCompactStatus,
  formatDefaultDetail,
  formatCurrentTarget,
  formatCurrentTargetPrograms,
  formatCurrentTargetProgramsTitle,
  formatRecommendedBlocks,
  renderList,
  renderState
} from "../dist/renderer-view.js";

function createFakeDocument() {
  return {
    createElement(tagName = "div") {
      return createFakeListElement(tagName);
    }
  };
}

function createFakeListElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    textContent: "",
    className: "",
    hidden: false,
    dataset: {},
    children: [],
    replaceChildren(...children) {
      this.children = [...children];
    },
    append(child) {
      this.children.push(child);
    }
  };
}

test("formats current target with stage label", () => {
  assert.equal(
    formatCurrentTarget({
      currentTargetName: "Stage",
      currentTargetIsStage: true
    }),
    "Stage（舞台）"
  );
  assert.equal(formatCurrentTarget({}), "未识别");
});

test("formats current target program panel title with the live sprite name", () => {
  assert.equal(formatCurrentTargetProgramsTitle({ currentTargetName: "Cat 2" }), "Cat 2 的程序");
  assert.equal(
    formatCurrentTargetProgramsTitle({ currentTargetName: "Stage", currentTargetIsStage: true }),
    "Stage（舞台）的程序"
  );
  assert.equal(formatCurrentTargetProgramsTitle({}), "当前角色程序");
});

test("formats current target programs with script labels", () => {
  assert.deepEqual(
    formatCurrentTargetPrograms([
      "当绿旗被点击 -> 一直重复 -> 移动 10 步",
      "当按下空格键 -> 说 2 秒"
    ]),
    [
      "脚本 1: 当绿旗被点击 -> 一直重复 -> 移动 10 步",
      "脚本 2: 当按下空格键 -> 说 2 秒"
    ]
  );
});

test("formats recommended blocks without exposing English opcodes", () => {
  assert.deepEqual(
    formatRecommendedBlocks({
      aiCoachResponse: {
        recommendedBlocks: [
          {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "先给脚本一个开始时机。"
          }
        ]
      }
    }),
    ["先给脚本一个开始时机。"]
  );
});

test("formats recommended blocks with at most three items", () => {
  assert.deepEqual(
    formatRecommendedBlocks({
      aiCoachResponse: {
        recommendedBlocks: [
          {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "1"
          },
          {
            opcode: "motion_movesteps",
            category: "运动",
            label: "移动 10 步",
            reason: "2"
          },
          {
            opcode: "control_repeat",
            category: "控制",
            label: "重复执行",
            reason: "3"
          },
          {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说 2 秒",
            reason: "4"
          },
          {
            opcode: "sensing_touchingobject",
            category: "侦测",
            label: "碰到...？",
            reason: "5"
          }
        ]
      }
    }),
    [
      "1",
      "2",
      "3"
    ]
  );
});

test("formats default detail and next step for the new scratch-first flow", () => {
  assert.equal(
    formatDefaultDetail({}),
    "先选择本机的 Scratch 软件；选过一次后，之后会继续使用这个路径。"
  );
  assert.equal(
    formatDefaultDetail({
      scratchExecutablePath: "C:\\Scratch 3.exe"
    }),
    "已经记住上次选择的 Scratch 软件了。现在点“打开已选 Scratch”即可继续使用。"
  );
});

test("formats local-only AI guidance without teacher sb3 wording", () => {
  assert.equal(
    formatDefaultDetail({
      status: "connected"
    }),
    "Scratch 已连接。现在可以直接读取当前作品；继续修改积木后，我会自动刷新下一步提示。"
  );
  assert.equal(
    formatAiStatus({
      status: "connected"
    }),
    "先自己搭一会儿；需要时看右边的积木提示。"
  );
});

test("formats completed project guidance without implying more blocks are required", () => {
  assert.equal(
    formatAiStatus({
      status: "connected",
      aiStatus: "ready",
      aiCoachResponse: {
        answerText: "你的作品已经完整，点击绿旗后用方向键控制 Cat 2。",
        nextStep: "你的作品已经完整，点击绿旗后用方向键控制 Cat 2。",
        recommendedBlocks: [],
        detectedIssues: []
      }
    }),
    "作品已分析完成，请看下面的说明。"
  );
});

test("formats manual hint mode guidance for connected Scratch", () => {
  assert.equal(
    formatDefaultDetail({
      status: "connected",
      aiHintTriggerMode: "manual"
    }),
    "Scratch 已连接。现在可以直接读取当前作品，并生成下一步提示。"
  );
  assert.equal(
    formatAiStatus({
      status: "connected",
      aiHintTriggerMode: "manual"
    }),
    "先自己搭一会儿；需要提示时点一下按钮。"
  );
});

test("formats AI source summary for deepseek and fallback", () => {
  assert.equal(
    formatAiSourceSummary({
      aiProvider: "deepseek",
      aiModel: "deepseek-v4-flash"
    }),
    "当前提示来源：DeepSeek（deepseek-v4-flash）"
  );
  assert.equal(
    formatAiSourceSummary({
      aiProvider: "fallback"
    }),
    "当前提示来源：本地基础提示"
  );
});

test("formats compact connection status for the action area", () => {
  assert.equal(
    formatCompactStatus({
      status: "connected"
    }),
    "已连接"
  );
  assert.equal(
    formatCompactStatus({
      status: "waiting",
      scratchExecutablePath: "C:\\Scratch 3.exe"
    }),
    "等待打开"
  );
  assert.equal(
    formatCompactStatus({
      status: "error"
    }),
    "连接异常"
  );
});

test("renderList renders an empty item when no data is available", () => {
  const container = createFakeListElement();
  renderList(createFakeDocument(), container, [], "空列表");

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, "空列表");
  assert.equal(container.children[0].className, "empty");
});

test("renderState updates current role and program text", () => {
  const documentRef = createFakeDocument();
  const statusElement = createFakeListElement();
  const detailElement = createFakeListElement();
  const currentTargetElement = createFakeListElement();
  const updatedAtElement = createFakeListElement();
  const statusSummaryElement = createFakeListElement();
  const currentTargetProgramsElement = createFakeListElement();
  const errorElement = createFakeListElement();
  const scratchPathElement = createFakeListElement();

  renderState(
    {
      status: "connected",
      statusText: "已连接到 Scratch Desktop",
      detail: "来自测试",
      currentTargetName: "Cat",
      currentTargetPrograms: [
        "当绿旗被点击 -> 一直重复 -> 移动 10 步 -> 清空"
      ],
      toolboxCategories: [],
      usedExtensions: [],
      loadedExtensions: [],
      programAreaModules: [],
      scratchExecutablePath: "C:\\Scratch 3.exe"
    },
    {
      documentRef,
      statusElement,
      detailElement,
      currentTargetElement,
      updatedAtElement,
      statusSummaryElement,
      currentTargetProgramsElement,
      errorElement,
      scratchPathElement
    }
  );

  assert.equal(statusElement.textContent, "已连接到 Scratch Desktop");
  assert.equal(statusSummaryElement.textContent, "已连接");
  assert.equal(currentTargetElement.textContent, "Cat");
  assert.deepEqual(
    currentTargetProgramsElement.children.map((child) => child.textContent),
    ["脚本 1: 当绿旗被点击 -> 一直重复 -> 移动 10 步 -> 清空"]
  );
  assert.equal(scratchPathElement.textContent, "C:\\Scratch 3.exe");
});

test("renderState renders Scratch-style block stacks for current programs and recommendations", () => {
  const documentRef = createFakeDocument();
  const currentTargetProgramsElement = createFakeListElement("ul");
  const aiRecommendedBlocksElement = createFakeListElement("ul");

  renderState(
    {
      status: "connected",
      statusText: "已连接到 Scratch Desktop",
      currentTargetName: "Cat",
      currentTargetPrograms: [
        "当绿旗被点击 -> 一直重复 -> 移动 10 步"
      ],
      currentTargetScriptXmlList: [
        '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked"><next><block type="control_repeat"><statement name="SUBSTACK"><block type="motion_movesteps"></block></statement></block></next></block></xml>'
      ],
      toolboxCategories: [],
      usedExtensions: [],
      loadedExtensions: [],
      programAreaModules: [],
      aiCoachResponse: {
        answerText: "先让小猫动起来。",
        nextStep: "补一个移动积木。",
        detectedIssues: [],
        recommendedBlocks: [
          {
            opcode: "motion_movesteps",
            category: "运动",
            label: "移动 10 步",
            reason: "先做一个最容易看见的动作。",
            example: "比如让小猫往前走一步"
          }
        ]
      }
    },
    {
      documentRef,
      currentTargetProgramsElement,
      aiRecommendedBlocksElement
    }
  );

  assert.equal(currentTargetProgramsElement.children.length, 1);
  assert.equal(currentTargetProgramsElement.children[0].className, "program-item scratch-script-item");
  assert.equal(currentTargetProgramsElement.children[0].children[0].textContent, "脚本 1");
  assert.equal(currentTargetProgramsElement.children[0].children[1].className, "scratch-workspace-frame");
  assert.equal(currentTargetProgramsElement.children[0].children[1].children[0].className, "scratch-workspace-host");
  assert.match(
    currentTargetProgramsElement.children[0].children[1].children[0].dataset.xml,
    /type="control_repeat"/
  );
  assert.equal(
    currentTargetProgramsElement.children[0].children[1].children[0].dataset.fallbackText,
    "当绿旗被点击 -> 一直重复 -> 移动 10 步"
  );

  assert.equal(aiRecommendedBlocksElement.children.length, 1);
  assert.equal(aiRecommendedBlocksElement.children[0].className, "hint-item recommended-structure-item");
  assert.equal(aiRecommendedBlocksElement.children[0].children[0].className, "scratch-workspace-inline");
  assert.equal(aiRecommendedBlocksElement.children[0].children[0].children[0].className, "scratch-workspace-host");
  assert.match(
    aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.xml,
    /type="motion_movesteps"/
  );
  assert.equal(
    aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.fallbackText,
    "先让小猫动起来。"
  );
  assert.equal(aiRecommendedBlocksElement.children[0].children[1].className, "recommended-reason-list");
  assert.deepEqual(
    aiRecommendedBlocksElement.children[0].children[1].children.map((child) => child.textContent),
    ["先做一个最容易看见的动作。"]
  );
});

test("renderState renders all flat recommended blocks in one ordered stack", () => {
  const documentRef = createFakeDocument();
  const aiRecommendedBlocksElement = createFakeListElement("ul");
  const aiStatusElement = createFakeListElement("p");

  renderState(
    {
      status: "connected",
      statusText: "已连接到 Scratch Desktop",
      toolboxCategories: [],
      usedExtensions: [],
      loadedExtensions: [],
      programAreaModules: [],
      aiCoachResponse: {
        answerText: "按顺序试试这三块。",
        nextStep: "按顺序试试这三块。",
        detectedIssues: [],
        recommendedBlocks: [
          {
            opcode: "data_setvariableto",
            category: "变量",
            label: "将变量设为",
            reason: "先初始化一个核心变量。"
          },
          {
            opcode: "data_changevariableby",
            category: "变量",
            label: "将变量增加",
            reason: "完成动作或满足条件时更新结果。"
          },
          {
            opcode: "looks_sayforsecs",
            category: "外观",
            label: "说 2 秒",
            reason: "变量变化后给一个可见反馈。"
          }
        ]
      }
    },
    {
      documentRef,
      aiStatusElement,
      aiRecommendedBlocksElement
    }
  );

  assert.equal(aiStatusElement.textContent, "看这 3 个积木，按顺序试一试。");
  assert.equal(aiRecommendedBlocksElement.children.length, 1);
  assert.match(
    aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.xml,
    /type="data_setvariableto"[\s\S]*type="data_changevariableby"[\s\S]*type="looks_sayforsecs"/
  );
  assert.deepEqual(
    aiRecommendedBlocksElement.children[0].children[1].children.map((child) => child.textContent),
    [
      "先初始化一个核心变量。",
      "完成动作或满足条件时更新结果。",
      "变量变化后给一个可见反馈。"
    ]
  );
});

test("renderState renders one connected structured recommendation and hides examples", () => {
  const documentRef = createFakeDocument();
  const aiRecommendedBlocksElement = createFakeListElement("ul");
  const aiStatusElement = createFakeListElement("p");
  const aiSourceElement = createFakeListElement("p");
  const aiAnswerElement = createFakeListElement("p");
  const aiNextStepElement = createFakeListElement("span");

  renderState(
    {
      status: "connected",
      statusText: "已连接到 Scratch Desktop",
      toolboxCategories: [],
      usedExtensions: [],
      loadedExtensions: [],
      programAreaModules: [],
      aiProvider: "deepseek",
      aiModel: "deepseek-v4-flash",
      aiLastUpdatedAt: "2026-07-11T00:00:00.000Z",
      aiCoachResponse: {
        answerText: "让小猫先开始动起来。",
        nextStep: "这里不应该再单独显示。",
        detectedIssues: [
          {
            severity: "warning",
            title: "这里不应该显示",
            description: "诊断不面向低年级学生"
          }
        ],
        recommendedBlocks: [
          {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "先给脚本一个开始。",
            example: "不要显示示例"
          },
          {
            opcode: "motion_movesteps",
            category: "运动",
            label: "移动 10 步",
            reason: "让角色动起来。"
          }
        ],
        recommendation: {
          root: {
            opcode: "event_whenflagclicked",
            category: "事件",
            label: "当绿旗被点击",
            reason: "先给脚本一个开始。",
            next: {
              opcode: "motion_movesteps",
              category: "运动",
              label: "移动 10 步",
              reason: "让角色动起来。"
            }
          }
        }
      }
    },
    {
      documentRef,
      aiStatusElement,
      aiSourceElement,
      aiAnswerElement,
      aiNextStepElement,
      aiRecommendedBlocksElement
    }
  );

  assert.equal(aiStatusElement.textContent, "看这 2 个积木，按顺序试一试。");
  assert.equal(aiSourceElement.textContent, "当前提示来源：DeepSeek（deepseek-v4-flash）");
  assert.equal(aiAnswerElement.textContent, "让小猫先开始动起来。");
  assert.equal(aiNextStepElement.textContent, "");
  assert.equal(aiRecommendedBlocksElement.children.length, 1);
  assert.match(
    aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.xml,
    /type="event_whenflagclicked"[\s\S]*type="motion_movesteps"/
  );
  assert.deepEqual(
    aiRecommendedBlocksElement.children[0].children[1].children.map((child) => child.textContent),
    ["先给脚本一个开始。", "让角色动起来。"]
  );
  assert.equal(JSON.stringify(aiRecommendedBlocksElement).includes("不要显示示例"), false);
  assert.equal(JSON.stringify(aiRecommendedBlocksElement).includes("这里不应该显示"), false);
  assert.equal(aiStatusElement.textContent.includes("DeepSeek"), false);
  assert.equal(aiStatusElement.textContent.includes("生成时间"), false);
});

test("renderState sanitizes invalid structured recommendations before building scratch XML", () => {
  const documentRef = createFakeDocument();
  const aiRecommendedBlocksElement = createFakeListElement("ul");
  const aiStatusElement = createFakeListElement("p");

  renderState(
    {
      status: "connected",
      statusText: "已连接到 Scratch Desktop",
      toolboxCategories: [],
      usedExtensions: [],
      loadedExtensions: [],
      programAreaModules: [],
      aiCoachResponse: {
        answerText: "先把能渲染的部分保住。",
        nextStep: "不需要额外显示。",
        detectedIssues: [],
        recommendedBlocks: [
          {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "保留根节点。"
          },
          {
            opcode: "looks_show",
            category: "外观",
            label: "显示",
            reason: "这个条件不合法。"
          },
          {
            opcode: "motion_ifonedgebounce",
            category: "运动",
            label: "碰到边缘就反弹",
            reason: "这个分支可以保留。"
          }
        ],
        recommendation: {
          root: {
            opcode: "control_if",
            category: "控制",
            label: "如果...那么",
            reason: "保留根节点。",
            condition: {
              opcode: "looks_show",
              category: "外观",
              label: "显示",
              reason: "这个条件不合法。"
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
        }
      }
    },
    {
      documentRef,
      aiStatusElement,
      aiRecommendedBlocksElement
    }
  );

  assert.equal(aiStatusElement.textContent, "看这 2 个积木，按顺序试一试。");
  assert.equal(aiRecommendedBlocksElement.children.length, 1);
  const xml = aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.xml;
  assert.match(xml, /type="control_if"/);
  assert.match(xml, /type="motion_ifonedgebounce"/);
  assert.doesNotMatch(xml, /name="CONDITION"/);
  assert.doesNotMatch(xml, /type="event_whenkeypressed"/);
  assert.deepEqual(
    aiRecommendedBlocksElement.children[0].children[1].children.map((child) => child.textContent),
    ["保留根节点。", "这个分支可以保留。"]
  );
});

test("renderer stylesheet lets Scratch workspace fallback text expand", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

  assert.match(html, /\.scratch-workspace-host-fallback\s*{[\s\S]*height:\s*auto !important;/);
  assert.match(html, /\.scratch-workspace-host-fallback\s*{[\s\S]*overflow:\s*visible;/);
  assert.match(html, /\.scratch-workspace-host-fallback\s*{[\s\S]*white-space:\s*normal;/);
});
