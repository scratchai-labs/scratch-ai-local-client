import { desktopCompanionStateSchema } from "@scratch-ai/shared";

import type { DesktopCompanionApi } from "../common/desktop-companion-api";
import { renderState } from "./renderer-view";
import { renderScratchWorkspaces } from "./scratch-workspace-renderer";
import type { DesktopCompanionState } from "../common/types";

declare global {
  interface Window {
    desktopCompanionApi?: DesktopCompanionApi;
  }
}

const statusElement = document.getElementById("status");
const detailElement = document.getElementById("detail");
const currentTargetElement = document.getElementById("current-target");
const updatedAtElement = document.getElementById("updated-at");
const statusSummaryElement = document.getElementById("status-summary");
const programAreaModulesElement = document.getElementById("program-area-modules");
const currentTargetProgramsTitleElement = document.getElementById("current-target-programs-title");
const currentTargetProgramsElement = document.getElementById("current-target-programs");
const aiStatusElement = document.getElementById("ai-status");
const aiSourceElement = document.getElementById("ai-source");
const aiAnswerElement = document.getElementById("ai-answer");
const aiNextStepElement = document.getElementById("ai-next-step");
const aiRecommendedBlocksElement = document.getElementById("ai-recommended-blocks");
const aiConfigSummaryElement = document.getElementById("ai-config-summary");
const errorElement = document.getElementById("error");
const scratchPathElement = document.getElementById("scratch-path");
const launchButton = document.getElementById("launch-button") as HTMLButtonElement | null;
const chooseScratchButton = document.getElementById("choose-scratch-button") as HTMLButtonElement | null;
const retryButton = document.getElementById("retry-button") as HTMLButtonElement | null;
const settingsButton = document.getElementById("settings-button") as HTMLButtonElement | null;
const generateAiButton = document.getElementById("generate-ai-button") as HTMLButtonElement | null;
const lessonGoalSelect = document.getElementById("lesson-goal-select") as HTMLSelectElement | null;

function showActionError(message: string) {
  if (!errorElement) {
    return;
  }

  errorElement.textContent = message;
  errorElement.hidden = false;
}

function getDesktopCompanionApi() {
  if (!window.desktopCompanionApi) {
    throw new Error("预加载脚本没有就绪，请退出旧实例后重新打开伴随程序。");
  }
  return window.desktopCompanionApi;
}

function normalizeState(rawState: unknown): DesktopCompanionState {
  return desktopCompanionStateSchema.parse(rawState);
}

function syncLessonGoalSelect(state: DesktopCompanionState) {
  if (!lessonGoalSelect) {
    return;
  }
  const nextValue = state.lessonGoal ?? "";
  const hasOption = Array.from(lessonGoalSelect.options).some((option) => option.value === nextValue);
  if (nextValue && !hasOption) {
    const customOption = document.createElement("option");
    customOption.value = nextValue;
    customOption.textContent = nextValue;
    lessonGoalSelect.append(customOption);
  }
  if (lessonGoalSelect.value !== nextValue) {
    lessonGoalSelect.value = nextValue;
  }
  lessonGoalSelect.disabled = state.aiStatus === "loading";
}

function renderNormalizedState(rawState: unknown) {
  const state = normalizeState(rawState);
  renderState(state, {
    documentRef: document,
    statusElement,
    detailElement,
    currentTargetElement,
    updatedAtElement,
    statusSummaryElement,
    programAreaModulesElement,
    currentTargetProgramsTitleElement,
    currentTargetProgramsElement,
    aiStatusElement,
    aiSourceElement,
    aiAnswerElement,
    aiNextStepElement,
    aiRecommendedBlocksElement,
    aiConfigSummaryElement,
    errorElement,
    scratchPathElement,
    launchButton,
    chooseScratchButton,
    retryButton,
    generateAiButton
  });
  syncLessonGoalSelect(state);
  renderScratchWorkspaces(document);
}

retryButton?.addEventListener("click", () => {
  retryButton.disabled = true;
  void Promise.resolve()
    .then(() => getDesktopCompanionApi().retryNow())
    .catch((error) => {
      showActionError(error instanceof Error ? error.message : "重新连接失败，请查看日志。");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (retryButton) {
          retryButton.disabled = false;
        }
      }, 1200);
    });
});

launchButton?.addEventListener("click", () => {
  launchButton.disabled = true;
  void Promise.resolve()
    .then(() => getDesktopCompanionApi().launchScratch())
    .catch((error) => {
      showActionError(error instanceof Error ? error.message : "打开已选 Scratch 失败，请查看日志。");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (launchButton) {
          launchButton.disabled = false;
        }
      }, 1200);
    });
});

chooseScratchButton?.addEventListener("click", () => {
  chooseScratchButton.disabled = true;
  void Promise.resolve()
    .then(() => getDesktopCompanionApi().chooseScratchExecutable())
    .catch(() => {
      showActionError("选择 Scratch 失败，请改用托盘菜单或查看日志。");
    })
    .finally(() => {
      window.setTimeout(() => {
        if (chooseScratchButton) {
          chooseScratchButton.disabled = false;
        }
      }, 400);
    });
});

function handleOpenSettings() {
  void Promise.resolve()
    .then(() => getDesktopCompanionApi().openSettings())
    .catch((error) => {
      showActionError(error instanceof Error ? error.message : "打开 DeepSeek 设置失败，请查看日志。");
    });
}

settingsButton?.addEventListener("click", handleOpenSettings);

function getSelectedLessonGoal() {
  return lessonGoalSelect?.value?.trim() || undefined;
}

lessonGoalSelect?.addEventListener("change", () => {
  if (!lessonGoalSelect) {
    return;
  }
  const goal = lessonGoalSelect.value || "";
  lessonGoalSelect.disabled = true;
  void Promise.resolve()
    .then(() => getDesktopCompanionApi().saveLessonGoal(goal))
    .catch((error) => {
      showActionError(error instanceof Error ? error.message : "保存本课目标失败。");
    })
    .finally(() => {
      if (lessonGoalSelect) {
        lessonGoalSelect.disabled = false;
      }
    });
});

generateAiButton?.addEventListener("click", () => {
  void Promise.resolve()
    .then(() => getDesktopCompanionApi().requestAiHint(getSelectedLessonGoal()))
    .catch((error) => {
      showActionError(error instanceof Error ? error.message : "更新下一步提示失败，请查看日志。");
    });
});

void Promise.resolve()
  .then(() => getDesktopCompanionApi().getInitialState())
  .then(renderNormalizedState)
  .catch((error) => {
    showActionError(error instanceof Error ? error.message : "界面初始化失败，请重启伴随程序。");
  });

try {
  getDesktopCompanionApi().onStateChange(renderNormalizedState);
} catch (error) {
  showActionError(error instanceof Error ? error.message : "状态监听初始化失败，请重启伴随程序。");
}
