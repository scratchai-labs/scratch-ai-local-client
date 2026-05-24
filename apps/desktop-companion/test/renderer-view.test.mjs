import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAiStatus,
  formatCompactStatus,
  formatDefaultDetail,
  formatDefaultNextStep,
  formatCurrentTarget,
  formatCurrentTargetPrograms,
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
    ["事件 / 当绿旗被点击：先给脚本一个开始时机。"]
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
      "事件 / 当绿旗被点击：1",
      "运动 / 移动 10 步：2",
      "控制 / 重复执行：3"
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
  assert.equal(
    formatDefaultNextStep({}),
    "先选择 Scratch 软件。"
  );
  assert.equal(
    formatDefaultNextStep({
      scratchExecutablePath: "C:\\Scratch 3.exe"
    }),
    "点击“打开已选 Scratch”。"
  );
  assert.equal(
    formatDefaultNextStep({
      status: "connected"
    }),
    "先看当前提示完成这一小步；你继续改积木时，我会自动刷新下一步提示。"
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
    "Scratch 已连接。继续修改积木后，我会基于当前作品自动刷新下一步建议。"
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
    formatDefaultNextStep({
      status: "connected",
      aiHintTriggerMode: "manual"
    }),
    "先看当前提示完成这一小步；学生补完后，再点击“生成下一步提示”。"
  );
  assert.equal(
    formatAiStatus({
      status: "connected",
      aiHintTriggerMode: "manual"
    }),
    "Scratch 已连接。点击“生成下一步提示”后，我会基于当前作品给出下一步建议。"
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
  assert.equal(aiRecommendedBlocksElement.children[0].className, "hint-item recommended-block-item");
  assert.equal(aiRecommendedBlocksElement.children[0].children[0].className, "scratch-workspace-inline");
  assert.equal(aiRecommendedBlocksElement.children[0].children[0].children[0].className, "scratch-workspace-host");
  assert.match(
    aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.xml,
    /type="motion_movesteps"/
  );
  assert.equal(
    aiRecommendedBlocksElement.children[0].children[0].children[0].dataset.fallbackText,
    "移动 10 步"
  );
  assert.equal(aiRecommendedBlocksElement.children[0].children[1].textContent, "先做一个最容易看见的动作。");
  assert.equal(aiRecommendedBlocksElement.children[0].children[2].textContent, "示例：比如让小猫往前走一步");
});
