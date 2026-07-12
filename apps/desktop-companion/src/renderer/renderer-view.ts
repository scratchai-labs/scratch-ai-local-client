import type {
  DesktopCompanionState,
  RecommendedBlock,
  RecommendedBlockNode,
  RecommendedBlockStructure
} from "../common/types";
import { buildRecommendedStructureXml } from "../common/scratch-block-xml";
import {
  canRenderRecommendedNodeAtPosition,
  sanitizeRecommendedStructure
} from "../common/recommended-structure";
import { MAX_RECOMMENDED_BLOCKS } from "../common/recommended-blocks";

interface MinimalElement {
  textContent: string | null;
  hidden?: boolean;
  className?: string;
  dataset?: Record<string, string>;
  replaceChildren(...children: unknown[]): void;
  append(child: unknown): void;
}

interface MinimalDocument {
  createElement(tagName: string): MinimalElement;
}

export interface RendererElements {
  documentRef: MinimalDocument;
  statusElement?: MinimalElement | null;
  detailElement?: MinimalElement | null;
  currentTargetElement?: MinimalElement | null;
  updatedAtElement?: MinimalElement | null;
  statusSummaryElement?: MinimalElement | null;
  programAreaModulesElement?: MinimalElement | null;
  currentTargetProgramsElement?: MinimalElement | null;
  aiStatusElement?: MinimalElement | null;
  aiAnswerElement?: MinimalElement | null;
  aiNextStepElement?: MinimalElement | null;
  aiRecommendedBlocksElement?: MinimalElement | null;
  aiConfigSummaryElement?: MinimalElement | null;
  errorElement?: MinimalElement | null;
  scratchPathElement?: MinimalElement | null;
  retryButton?: HTMLButtonElement | null;
  launchButton?: HTMLButtonElement | null;
  chooseScratchButton?: HTMLButtonElement | null;
  generateAiButton?: HTMLButtonElement | null;
}

export function renderList(
  documentRef: MinimalDocument,
  container: MinimalElement | null | undefined,
  values: string[],
  emptyText: string,
  itemClassName?: string
) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  if (values.length === 0) {
    const empty = documentRef.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const value of values) {
    const item = documentRef.createElement("li");
    item.className = itemClassName ?? "";
    item.textContent = value;
    container.append(item);
  }
}

export function formatTimestamp(value?: string) {
  if (!value) {
    return "还没收到数据";
  }

  return new Date(value).toLocaleString();
}

export function formatCurrentTarget(state: DesktopCompanionState) {
  if (!state.currentTargetName) {
    return "未识别";
  }

  return state.currentTargetIsStage ? `${state.currentTargetName}（舞台）` : state.currentTargetName;
}

export function formatCurrentTargetPrograms(programs: string[] = []) {
  return programs.map((program, index) => `脚本 ${index + 1}: ${program}`);
}

export function formatProgramAreaModules(
  modules: Array<{ label: string; blockCount: number }> = []
) {
  return modules.map((module) => `${module.label} x ${module.blockCount}`);
}

function isManualHintTriggerMode(state: DesktopCompanionState) {
  return state.aiHintTriggerMode === "manual";
}

export function formatAiStatus(state: DesktopCompanionState) {
  if (state.aiStatus === "loading") {
    return "正在看你的作品，马上给积木提示。";
  }

  if (state.aiStatus === "error") {
    return "提示暂时没有刷新；先继续搭积木。";
  }

  const recommendedCount = countRecommendedReasonItems(state.aiCoachResponse);
  if (state.aiCoachResponse && recommendedCount > 0) {
    return `看这 ${recommendedCount} 个积木，按顺序试一试。`;
  }

  if (state.status === "connected") {
    return isManualHintTriggerMode(state)
      ? "先自己搭一会儿；需要提示时点一下按钮。"
      : "先自己搭一会儿；需要时看右边的积木提示。";
  }

  if (!state.aiConfigured) {
    return isManualHintTriggerMode(state)
      ? "需要提示时点一下按钮。"
      : "先自己搭一会儿；需要时看右边的积木提示。";
  }

  return "准备好了：先选择 Scratch 软件，打开已选 Scratch，再读取当前作品。";
}

export function formatCompactStatus(state: DesktopCompanionState) {
  if (state.status === "connected") {
    return "已连接";
  }

  if (state.status === "injecting") {
    return "连接中";
  }

  if (state.status === "error") {
    return "连接异常";
  }

  if (state.status === "unsupported") {
    return "不支持";
  }

  if (state.status === "waiting") {
    return state.scratchExecutablePath ? "等待打开" : "未选择";
  }

  return "启动中";
}

export function formatAiConfigSourceLabel(source?: DesktopCompanionState["aiConfigSource"]) {
  if (source === "custom") {
    return "本机已保存 Key";
  }

  return "当前没有可用来源";
}

export function formatAiConfigSummary(state: DesktopCompanionState) {
  if (state.aiConfigSource === "custom") {
    return "当前使用本机保存的 DeepSeek Key。";
  }

  return "当前还没有保存本机 DeepSeek Key。";
}

export function formatDefaultDetail(state: DesktopCompanionState) {
  if (state.detail) {
    return state.detail;
  }

  if (state.status === "connected") {
    return isManualHintTriggerMode(state)
      ? "Scratch 已连接。现在可以直接读取当前作品，并生成下一步提示。"
      : "Scratch 已连接。现在可以直接读取当前作品；继续修改积木后，我会自动刷新下一步提示。";
  }

  if (state.scratchExecutablePath) {
    return "已经记住上次选择的 Scratch 软件了。现在点“打开已选 Scratch”即可继续使用。";
  }

  return "先选择本机的 Scratch 软件；选过一次后，之后会继续使用这个路径。";
}

export function formatDefaultNextStep(state: DesktopCompanionState) {
  if (state.aiCoachResponse?.nextStep) {
    return state.aiCoachResponse.nextStep;
  }

  if (state.status === "connected") {
    return isManualHintTriggerMode(state)
      ? "先看当前提示完成这一小步；学生补完后，再点击“生成下一步提示”。"
      : "先看当前提示完成这一小步；你继续改积木时，我会自动刷新下一步提示。";
  }

  if (state.scratchExecutablePath) {
    return "点击“打开已选 Scratch”。";
  }

  return "先选择 Scratch 软件。";
}

export function formatRecommendedBlocks(state: DesktopCompanionState) {
  const recommendationReasons = collectRecommendedStructureReasons(
    sanitizeRecommendedStructure(state.aiCoachResponse?.recommendation)
  );
  if (recommendationReasons.length > 0) {
    return recommendationReasons;
  }

  return (state.aiCoachResponse?.recommendedBlocks ?? [])
    .slice(0, MAX_RECOMMENDED_BLOCKS)
    .map((block) => block.reason);
}

export function formatDetectedIssues(state: DesktopCompanionState) {
  return (state.aiCoachResponse?.detectedIssues ?? []).map((issue) => {
    const spriteText = issue.spriteName ? ` [${issue.spriteName}]` : "";
    return `${issue.severity === "warning" ? "注意" : "提示"}${spriteText}：${issue.title}。${issue.description}`;
  });
}

function getCategoryIdFromOpcode(opcode?: string) {
  if (typeof opcode !== "string") {
    return null;
  }

  const separatorIndex = opcode.indexOf("_");
  if (separatorIndex <= 0) {
    return null;
  }

  const prefix = opcode.slice(0, separatorIndex);
  if (prefix === "argument") {
    return "procedures";
  }
  if (prefix === "math") {
    return "operator";
  }
  return CORE_CATEGORY_IDS.has(prefix) ? prefix : prefix.replace(/[^\w-]/g, "-") || null;
}

function resolveRecommendedBlockCategoryId(block: RecommendedBlock) {
  const opcodeCategoryId = getCategoryIdFromOpcode(block.opcode);
  if (opcodeCategoryId) {
    return opcodeCategoryId;
  }

  return CATEGORY_ID_BY_LABEL[block.category] ?? "other";
}

function createTextChild(documentRef: MinimalDocument, tagName: string, className: string, text: string) {
  const element = documentRef.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createScratchWorkspaceHost(
  documentRef: MinimalDocument,
  xml: string,
  layout: "frame" | "inline",
  fallbackText?: string
) {
  const host = documentRef.createElement("div");
  host.className = "scratch-workspace-host";
  if (host.dataset) {
    host.dataset.xml = xml;
    host.dataset.layout = layout;
    if (fallbackText) {
      host.dataset.fallbackText = fallbackText;
    }
  }
  return host;
}

function createScratchWorkspaceFrame(
  documentRef: MinimalDocument,
  xml: string,
  fallbackText?: string
) {
  const frame = documentRef.createElement("div");
  frame.className = "scratch-workspace-frame";
  frame.append(createScratchWorkspaceHost(documentRef, xml, "frame", fallbackText));
  return frame;
}

function createScratchWorkspaceInline(
  documentRef: MinimalDocument,
  xml: string,
  fallbackText?: string
) {
  const inline = documentRef.createElement("div");
  inline.className = "scratch-workspace-inline";
  inline.append(createScratchWorkspaceHost(documentRef, xml, "inline", fallbackText));
  return inline;
}

function collectRecommendedNodeReasons(
  node: RecommendedBlockNode | undefined,
  reasons: string[] = []
) {
  if (!node || reasons.length >= MAX_RECOMMENDED_BLOCKS) {
    return reasons;
  }

  if (node.reason) {
    reasons.push(node.reason);
  }

  collectRecommendedNodeReasons(node.condition, reasons);
  collectRecommendedNodeReasons(node.substack, reasons);
  collectRecommendedNodeReasons(node.substack2, reasons);
  collectRecommendedNodeReasons(node.next, reasons);
  return reasons.slice(0, MAX_RECOMMENDED_BLOCKS);
}

function collectRecommendedStructureReasons(structure: RecommendedBlockStructure | undefined) {
  return collectRecommendedNodeReasons(structure?.root).slice(0, MAX_RECOMMENDED_BLOCKS);
}

function getRecommendedReasonItems(response: DesktopCompanionState["aiCoachResponse"]) {
  const structureReasons = collectRecommendedStructureReasons(
    sanitizeRecommendedStructure(response?.recommendation)
  );
  if (structureReasons.length > 0) {
    return structureReasons;
  }

  const blockStructureReasons = collectRecommendedStructureReasons(
    sanitizeRecommendedStructure(
      buildRecommendedStructureFromBlocks((response?.recommendedBlocks ?? []).slice(0, MAX_RECOMMENDED_BLOCKS)) ??
        undefined
    )
  );
  if (blockStructureReasons.length > 0) {
    return blockStructureReasons;
  }

  return (response?.recommendedBlocks ?? [])
    .slice(0, MAX_RECOMMENDED_BLOCKS)
    .map((block) => block.reason)
    .filter(Boolean);
}

function countRecommendedReasonItems(response: DesktopCompanionState["aiCoachResponse"]) {
  return getRecommendedReasonItems(response).length;
}

function createRecommendedReasonList(documentRef: MinimalDocument, reasons: string[]) {
  const list = documentRef.createElement("ul");
  list.className = "recommended-reason-list";
  for (const reason of reasons.slice(0, MAX_RECOMMENDED_BLOCKS)) {
    const item = documentRef.createElement("li");
    item.textContent = reason;
    list.append(item);
  }
  return list;
}

function buildRecommendedStructureFromBlocks(blocks: RecommendedBlock[]): RecommendedBlockStructure | null {
  const nodes = blocks.slice(0, MAX_RECOMMENDED_BLOCKS).map((block): RecommendedBlockNode => ({
    opcode: block.opcode,
    category: block.category,
    label: block.label,
    reason: block.reason
  }));

  if (nodes.length === 0) {
    return null;
  }

  const root = nodes.find((node) => canRenderRecommendedNodeAtPosition(node.opcode, "root"));
  if (!root) {
    return null;
  }

  const nextNodes = nodes.filter(
    (node) => node !== root && canRenderRecommendedNodeAtPosition(node.opcode, "next")
  );

  let currentNode = root;
  for (const nextNode of nextNodes) {
    currentNode.next = nextNode;
    currentNode = nextNode;
  }

  return {
    root
  };
}

function renderCurrentTargetScriptXmlList(
  documentRef: MinimalDocument,
  container: MinimalElement | null | undefined,
  xmlList: string[],
  fallbackPrograms: string[],
  emptyText: string
) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  if (xmlList.length === 0) {
    const empty = documentRef.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const [index, xml] of xmlList.entries()) {
    const item = documentRef.createElement("li");
    item.className = "program-item scratch-script-item";
    item.append(createTextChild(documentRef, "span", "script-pill", `脚本 ${index + 1}`));
    item.append(createScratchWorkspaceFrame(documentRef, xml, fallbackPrograms[index]));
    container.append(item);
  }
}

function renderRecommendedBlockCards(
  documentRef: MinimalDocument,
  container: MinimalElement | null | undefined,
  response: DesktopCompanionState["aiCoachResponse"],
  emptyText: string
) {
  if (!container) {
    return;
  }

  const structure = sanitizeRecommendedStructure(response?.recommendation);
  const blocks = (response?.recommendedBlocks ?? []).slice(0, MAX_RECOMMENDED_BLOCKS);
  const blockStructure = sanitizeRecommendedStructure(buildRecommendedStructureFromBlocks(blocks) ?? undefined);

  container.replaceChildren();
  if (blocks.length === 0) {
    if (structure) {
      const item = documentRef.createElement("li");
      item.className = "hint-item recommended-structure-item";
      item.append(
        createScratchWorkspaceInline(
          documentRef,
          buildRecommendedStructureXml(structure),
          response?.answerText ?? structure.root.label
        )
      );
      item.append(createRecommendedReasonList(documentRef, collectRecommendedStructureReasons(structure)));
      container.append(item);
      return;
    }

    const empty = documentRef.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  const item = documentRef.createElement("li");
  item.className = "hint-item recommended-structure-item";

  if (structure) {
    item.append(
      createScratchWorkspaceInline(
        documentRef,
        buildRecommendedStructureXml(structure),
        response?.answerText ?? structure.root.label
      )
    );
    item.append(createRecommendedReasonList(documentRef, collectRecommendedStructureReasons(structure)));
    container.append(item);
    return;
  }

  if (!blockStructure) {
    const empty = documentRef.createElement("li");
    empty.className = "empty";
    empty.textContent = response?.answerText ?? emptyText;
    container.append(empty);
    return;
  }

  item.append(
    createScratchWorkspaceInline(
      documentRef,
      buildRecommendedStructureXml(blockStructure),
      response?.answerText ?? blockStructure.root.label
    )
  );
  item.append(createRecommendedReasonList(documentRef, getRecommendedReasonItems(response)));

  container.append(item);
}

export function renderState(state: DesktopCompanionState, elements: RendererElements) {
  const currentTargetScriptXmlList = state.currentTargetScriptXmlList ?? [];
  const currentTargetPrograms = state.currentTargetPrograms ?? [];
  const programAreaModules = state.programAreaModules ?? [];

  if (elements.statusElement) {
    elements.statusElement.textContent = state.statusText ?? "";
    if (elements.statusElement.dataset) {
      elements.statusElement.dataset.status = state.status;
    }
  }

  if (elements.detailElement) {
    elements.detailElement.textContent = formatDefaultDetail(state);
  }

  if (elements.currentTargetElement) {
    elements.currentTargetElement.textContent = formatCurrentTarget(state);
  }

  if (elements.updatedAtElement) {
    elements.updatedAtElement.textContent = formatTimestamp(state.lastUpdatedAt);
  }

  if (elements.statusSummaryElement) {
    elements.statusSummaryElement.textContent = formatCompactStatus(state);
    if (elements.statusSummaryElement.dataset) {
      elements.statusSummaryElement.dataset.status = state.status;
    }
  }

  if (elements.scratchPathElement) {
    elements.scratchPathElement.textContent = state.scratchExecutablePath ?? "还没有选择";
  }

  if (elements.errorElement) {
    elements.errorElement.textContent = state.error ?? "";
    elements.errorElement.hidden = !state.error;
  }

  if (currentTargetScriptXmlList.length > 0) {
    renderCurrentTargetScriptXmlList(
      elements.documentRef,
      elements.currentTargetProgramsElement,
      currentTargetScriptXmlList,
      currentTargetPrograms,
      "当前角色还没有可读取的脚本。"
    );
  } else {
    renderList(
      elements.documentRef,
      elements.currentTargetProgramsElement,
      formatCurrentTargetPrograms(currentTargetPrograms),
      "当前角色还没有可读取的脚本。",
      "program-item"
    );
  }

  renderList(
    elements.documentRef,
    elements.programAreaModulesElement,
    formatProgramAreaModules(programAreaModules),
    "当前角色还没有识别到模块使用情况。",
    "module-item"
  );

  if (elements.aiStatusElement) {
    elements.aiStatusElement.textContent = formatAiStatus(state);
  }

  if (elements.aiConfigSummaryElement) {
    elements.aiConfigSummaryElement.textContent = formatAiConfigSummary(state);
  }

  if (elements.aiAnswerElement) {
    elements.aiAnswerElement.textContent =
      state.aiCoachResponse?.answerText ?? "先自己搭一会儿；需要时看右边的积木提示。";
  }

  if (elements.aiNextStepElement) {
    elements.aiNextStepElement.textContent = "";
  }

  renderRecommendedBlockCards(
    elements.documentRef,
    elements.aiRecommendedBlocksElement,
    state.aiCoachResponse,
    "这里会显示适合当前这一步的积木和原因。"
  );

  const isBusy = state.status === "injecting";
  if (elements.retryButton) {
    elements.retryButton.disabled = isBusy || state.status === "unsupported";
  }
  if (elements.launchButton) {
    elements.launchButton.disabled =
      isBusy || state.status === "unsupported" || !state.scratchExecutablePath;
  }
  if (elements.chooseScratchButton) {
    elements.chooseScratchButton.disabled = isBusy || state.status === "unsupported";
  }
  if (elements.generateAiButton) {
    elements.generateAiButton.disabled =
      state.status !== "connected" || state.aiStatus === "loading";
  }
}
