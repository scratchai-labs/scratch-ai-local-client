import type {
  DesktopCompanionState,
  RecommendedBlock
} from "../common/types";
import { buildRecommendedBlockXml } from "../common/scratch-block-xml";
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

export function formatCurrentTargetPrograms(programs: string[]) {
  return programs.map((program, index) => `脚本 ${index + 1}: ${program}`);
}

export function formatProgramAreaModules(
  modules: Array<{ label: string; blockCount: number }>
) {
  return modules.map((module) => `${module.label} x ${module.blockCount}`);
}

function isManualHintTriggerMode(state: DesktopCompanionState) {
  return state.aiHintTriggerMode === "manual";
}

export function formatAiStatus(state: DesktopCompanionState) {
  if (state.aiStatus === "loading") {
    return "AI 正在整理作品并生成下一步提示…";
  }

  if (state.aiStatus === "error") {
    return state.aiError ?? "AI 提示暂时不可用。";
  }

  if (state.aiCoachResponse && state.aiProvider === "deepseek") {
    const modelText = state.aiModel ? `（${state.aiModel}）` : "";
    return `当前提示来源：DeepSeek${modelText}，生成时间：${formatTimestamp(state.aiLastUpdatedAt)}`;
  }

  if (state.aiCoachResponse && state.aiProvider === "fallback") {
    return state.aiError
      ? "DeepSeek 暂时不可用，已自动切到基础提示。"
      : "当前提示来源：基础提示。需要更完整结果时，可到“DeepSeek 设置”里保存本机 API Key。";
  }

  if (state.status === "connected") {
    return isManualHintTriggerMode(state)
      ? "Scratch 已连接。点击“生成下一步提示”后，我会基于当前作品给出下一步建议。"
      : "Scratch 已连接。继续修改积木后，我会基于当前作品自动刷新下一步建议。";
  }

  if (!state.aiConfigured) {
    return isManualHintTriggerMode(state)
      ? "还没配置本机 DeepSeek Key 也可以先用。点击“生成下一步提示”后，程序会先给基础提示；需要更完整结果时，再到“DeepSeek 设置”里保存 API Key。"
      : "还没配置本机 DeepSeek Key 也可以先用。自动模式下，程序会先给基础提示；需要更完整结果时，再到“DeepSeek 设置”里保存 API Key。";
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
  return (state.aiCoachResponse?.recommendedBlocks ?? [])
    .slice(0, MAX_RECOMMENDED_BLOCKS)
    .map((block) => {
      const exampleText = block.example ? `；示例：${block.example}` : "";
      return `${block.category} / ${block.label}：${block.reason}${exampleText}`;
    });
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
  blocks: RecommendedBlock[],
  emptyText: string
) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  if (blocks.length === 0) {
    const empty = documentRef.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const block of blocks.slice(0, MAX_RECOMMENDED_BLOCKS)) {
    const item = documentRef.createElement("li");
    item.className = "hint-item recommended-block-item";

    item.append(createScratchWorkspaceInline(documentRef, buildRecommendedBlockXml(block), block.label));
    item.append(createTextChild(documentRef, "p", "recommended-block-reason", block.reason));

    if (block.example) {
      item.append(createTextChild(documentRef, "p", "recommended-block-example", `示例：${block.example}`));
    }

    container.append(item);
  }
}

export function renderState(state: DesktopCompanionState, elements: RendererElements) {
  const currentTargetScriptXmlList = state.currentTargetScriptXmlList ?? [];

  if (elements.statusElement) {
    elements.statusElement.textContent = state.statusText;
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
      state.currentTargetPrograms,
      "当前角色还没有可读取的脚本。"
    );
  } else {
    renderList(
      elements.documentRef,
      elements.currentTargetProgramsElement,
      formatCurrentTargetPrograms(state.currentTargetPrograms),
      "当前角色还没有可读取的脚本。",
      "program-item"
    );
  }

  renderList(
    elements.documentRef,
    elements.programAreaModulesElement,
    formatProgramAreaModules(state.programAreaModules),
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
      state.aiCoachResponse?.answerText ?? "读取到当前 Scratch 作品后，我会基于你现在的进度给出下一步提示。";
  }

  if (elements.aiNextStepElement) {
    elements.aiNextStepElement.textContent = formatDefaultNextStep(state);
  }

  renderRecommendedBlockCards(
    elements.documentRef,
    elements.aiRecommendedBlocksElement,
    state.aiCoachResponse?.recommendedBlocks ?? [],
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
