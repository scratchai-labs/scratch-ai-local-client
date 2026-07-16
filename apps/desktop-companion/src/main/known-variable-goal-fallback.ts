import type {
  CoachResponse,
  RecommendedBlock,
  RecommendedBlockNode,
  RecommendedBlockStructure
} from "../common/types";

export interface KnownVariableGoalContext {
  goal?: string;
  snapshotGoal?: string;
  variableNames: string[];
}

function normalizeText(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
}

function flattenRecommendation(structure: RecommendedBlockStructure) {
  const blocks: RecommendedBlock[] = [];
  const visit = (node: RecommendedBlockNode | undefined) => {
    if (!node) return;
    blocks.push({
      opcode: node.opcode,
      category: node.category,
      label: node.label,
      reason: node.reason,
      ...(node.params ? { params: node.params } : {})
    });
    visit(node.condition);
    visit(node.substack);
    visit(node.substack2);
    visit(node.next);
  };
  visit(structure.root);
  return blocks;
}

function createResponse(
  answerText: string,
  nextStep: string,
  root: RecommendedBlockNode
): CoachResponse {
  const recommendation = { root };
  return {
    answerText,
    recommendation,
    recommendedBlocks: flattenRecommendation(recommendation),
    nextStep,
    detectedIssues: []
  };
}

function getContextText(context: KnownVariableGoalContext) {
  return normalizeText([
    context.goal,
    context.snapshotGoal,
    context.variableNames.join("|")
  ].join("|"));
}

export function buildKnownVariableGoalFallbackResponse(
  context: KnownVariableGoalContext
): CoachResponse | null {
  const text = getContextText(context);

  if (/摄氏|华氏|celsius|fahrenheit/.test(text)) {
    return createResponse(
      "继续完成温度换算：把 celsius 代入公式计算 fahrenheit，然后说出结果。",
      "设置 fahrenheit = celsius × 9 ÷ 5 + 32，并说出 fahrenheit。",
      {
        opcode: "data_setvariableto",
        category: "变量",
        label: "将 fahrenheit 设为",
        reason: "使用摄氏转华氏公式。",
        params: { variable: "fahrenheit", value: "celsius * 9 / 5 + 32" },
        next: {
          opcode: "looks_sayforsecs",
          category: "外观",
          label: "说出 fahrenheit",
          reason: "显示换算结果。",
          params: { messageVariable: "fahrenheit", secs: "2" }
        }
      }
    );
  }

  if (/长方形.*面积|面积.*长方形|length.*width.*area|area=.*length/.test(text)) {
    return createResponse(
      "已知 length 和 width，下一步直接计算 area，不要退回通用求和。",
      "设置 area = length × width，并说出 area。",
      {
        opcode: "data_setvariableto",
        category: "变量",
        label: "将 area 设为",
        reason: "长方形面积等于 length × width。",
        params: { variable: "area", value: "length * width" },
        next: {
          opcode: "looks_sayforsecs",
          category: "外观",
          label: "说出 area",
          reason: "显示面积结果。",
          params: { messageVariable: "area", secs: "2" }
        }
      }
    );
  }

  if (/点击.*加分|每点一次|targetscore|score.*胜利/.test(text)) {
    return createResponse(
      "先完成一次点击加分和胜利判断：点击角色时 score 加 1，达到 targetScore 就说“胜利”。",
      "添加角色点击事件、score 加 1 和达到目标分数的判断。",
      {
        opcode: "event_whenthisspriteclicked",
        category: "事件",
        label: "当角色被点击",
        reason: "每次点击触发一次加分。",
        next: {
          opcode: "data_changevariableby",
          category: "变量",
          label: "将 score 增加 1",
          reason: "记录点击得分。",
          params: { variable: "score", changeBy: "1" },
          next: {
            opcode: "control_if",
            category: "控制",
            label: "如果达到目标分数",
            reason: "判断是否已经获胜。",
            condition: {
              opcode: "operator_equals",
              category: "运算",
              label: "score = targetScore",
              reason: "比较当前分数和目标分数。",
              params: { left: "score", right: "targetScore" }
            },
            substack: {
              opcode: "looks_sayforsecs",
              category: "外观",
              label: "说胜利",
              reason: "达到目标分数时给出反馈。",
              params: { message: "胜利", secs: "2" }
            }
          }
        }
      }
    );
  }

  if (/方向键.*speed|speed.*方向键|移动步数.*speed/.test(text)) {
    return createResponse(
      "先完成右方向键控制：按下右方向键时，让 x 坐标增加 speed。",
      "添加右方向键事件，并使用 speed 作为移动距离；下一步再补左方向键。",
      {
        opcode: "event_whenkeypressed",
        category: "事件",
        label: "当按下右方向键",
        reason: "右方向键触发向右移动。",
        params: { key: "right arrow" },
        next: {
          opcode: "motion_changexby",
          category: "运动",
          label: "将 x 坐标增加 speed",
          reason: "移动距离使用 speed 变量。",
          params: { steps: "speed" }
        }
      }
    );
  }

  return null;
}

export function shouldReplaceKnownVariableGoalRecommendation(
  context: KnownVariableGoalContext,
  recommendation: RecommendedBlockStructure
) {
  const goalText = normalizeText(context.goal || context.snapshotGoal || "");
  const recommendationText = normalizeText(JSON.stringify(recommendation));

  if (/摄氏|华氏|celsius|fahrenheit/.test(goalText)) {
    return !(/celsius/.test(recommendationText) && /fahrenheit/.test(recommendationText));
  }
  if (/长方形.*面积|面积.*长方形|length.*width.*area|area=.*length/.test(goalText)) {
    return !(/length/.test(recommendationText) && /width/.test(recommendationText) && /area/.test(recommendationText));
  }
  if (/点击.*加分|每点一次|targetscore|score.*胜利/.test(goalText)) {
    return !(
      /event_whenthisspriteclicked/.test(recommendationText) &&
      /score/.test(recommendationText) &&
      /targetscore/.test(recommendationText)
    );
  }
  if (/方向键.*speed|speed.*方向键|移动步数.*speed/.test(goalText)) {
    return !(
      /speed/.test(recommendationText) &&
      /event_whenkeypressed|sensing_keypressed/.test(recommendationText)
    );
  }
  return false;
}
