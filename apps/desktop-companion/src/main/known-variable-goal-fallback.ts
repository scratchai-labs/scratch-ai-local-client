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

  if (/score.*90.*grade|成绩.*等级|grade.*设为a/.test(text)) {
    return createResponse(
      "根据 score 判断 grade：大于 90 设为 A，否则设为 B，并说出 grade。",
      "补上 score > 90 的如果否则判断。",
      {
        opcode: "control_if_else", category: "控制", label: "如果 score 大于 90", reason: "按分数判断等级。",
        condition: { opcode: "operator_gt", category: "运算", label: "score > 90", reason: "比较分数。", params: { left: "score", right: "90" } },
        substack: {
          opcode: "data_setvariableto", category: "变量", label: "将 grade 设为 A", reason: "高于 90 分为 A。", params: { variable: "grade", value: "text:A" },
          next: { opcode: "looks_sayforsecs", category: "外观", label: "说出 grade", reason: "显示等级。", params: { messageVariable: "grade", secs: "2" } }
        },
        substack2: { opcode: "data_setvariableto", category: "变量", label: "将 grade 设为 B", reason: "否则等级为 B。", params: { variable: "grade", value: "text:B" } }
      }
    );
  }

  if (/3\+4|问答题.*7|回答.*score.*加1/.test(text)) {
    return createResponse(
      "判断 answerNumber 是否等于 7；答对时 score 加 1，并说“回答正确”。",
      "添加回答等于 7 的判断、加分和正确反馈。",
      {
        opcode: "control_if", category: "控制", label: "如果回答等于 7", reason: "判断答案是否正确。",
        condition: { opcode: "operator_equals", category: "运算", label: "answerNumber = 7", reason: "比较回答和正确答案。", params: { left: "answerNumber", right: "7" } },
        substack: {
          opcode: "data_changevariableby", category: "变量", label: "将 score 增加 1", reason: "回答正确时加分。", params: { variable: "score", changeBy: "1" },
          next: { opcode: "looks_sayforsecs", category: "外观", label: "说回答正确", reason: "给出正确反馈。", params: { message: "回答正确", secs: "2" } }
        }
      }
    );
  }

  if (/password.*scratch|密码.*包含scratch|密码错误/.test(text)) {
    return createResponse(
      "判断 password 是否包含 scratch；包含时说“通过”，否则说“密码错误”。",
      "添加字符串包含判断和两种反馈。",
      {
        opcode: "control_if_else", category: "控制", label: "如果 password 包含 scratch", reason: "检查密码内容。",
        condition: { opcode: "operator_contains", category: "运算", label: "password 包含 scratch", reason: "判断关键字。", params: { left: "password", right: "scratch" } },
        substack: { opcode: "looks_sayforsecs", category: "外观", label: "说通过", reason: "密码正确反馈。", params: { message: "通过", secs: "2" } },
        substack2: { opcode: "looks_sayforsecs", category: "外观", label: "说密码错误", reason: "密码错误反馈。", params: { message: "密码错误", secs: "2" } }
      }
    );
  }

  if (/商品.*总价|单价.*数量|price.*quantity.*total|total=.*price/.test(text)) {
    return createResponse(
      "根据 price 和 quantity 计算商品总价，并说出 total。",
      "设置 total = price × quantity，并说出 total。",
      {
        opcode: "data_setvariableto", category: "变量", label: "将 total 设为", reason: "商品总价等于单价乘数量。",
        params: { variable: "total", value: "price * quantity" },
        next: { opcode: "looks_sayforsecs", category: "外观", label: "说出 total", reason: "显示商品总价。", params: { messageVariable: "total", secs: "2" } }
      }
    );
  }

  if (/\bbmi\b|weight.*height|体重.*身高/.test(text)) {
    return createResponse(
      "使用 weight 和 height 计算 bmi，并说出结果。",
      "设置 bmi = weight ÷ (height × height)，并说出 bmi。",
      {
        opcode: "data_setvariableto", category: "变量", label: "将 bmi 设为", reason: "BMI 等于体重除以身高的平方。",
        params: { variable: "bmi", value: "weight / (height * height)" },
        next: { opcode: "looks_sayforsecs", category: "外观", label: "说出 bmi", reason: "显示 BMI。", params: { messageVariable: "bmi", secs: "2" } }
      }
    );
  }

  if (/购物清单|加入.*清单|item.*list/.test(text)) {
    return createResponse(
      "先把 item 加入购物清单并显示列表，确认物品保存成功。",
      "把 item 加入购物清单，然后显示购物清单。",
      {
        opcode: "data_addtolist", category: "变量", label: "把 item 加入购物清单", reason: "保存输入的物品。",
        params: { list: "购物清单", value: "item" },
        next: { opcode: "data_showlist", category: "变量", label: "显示购物清单", reason: "检查清单内容。", params: { list: "购物清单" } }
      }
    );
  }

  if (/广播.*开始游戏|开始游戏.*广播/.test(text)) {
    return createResponse(
      "先在绿旗脚本中广播“开始游戏”，让其他脚本能够收到开场消息。",
      "添加广播“开始游戏”；下一步再添加收到消息后的反馈脚本。",
      { opcode: "event_broadcast", category: "事件", label: "广播开始游戏", reason: "发送开场消息。", params: { broadcast: "开始游戏" } }
    );
  }

  if (/造型动画|下一个造型/.test(text)) {
    return createResponse(
      "在重复执行 6 次里切换到下一个造型，并等待 0.2 秒。",
      "重复 6 次执行下一个造型和等待 0.2 秒。",
      {
        opcode: "control_repeat", category: "控制", label: "重复执行 6 次", reason: "播放 6 帧造型动画。", params: { repeatTimes: "6" },
        substack: {
          opcode: "looks_nextcostume", category: "外观", label: "下一个造型", reason: "切换动画帧。",
          next: { opcode: "control_wait", category: "控制", label: "等待 0.2 秒", reason: "控制动画速度。", params: { secs: "0.2" } }
        }
      }
    );
  }

  if (/音量.*增加|音量逐渐变大/.test(text)) {
    return createResponse(
      "在重复执行 5 次里让音量增加 10，并等待 0.5 秒。",
      "重复 5 次执行音量增加 10 和等待 0.5 秒。",
      {
        opcode: "control_repeat", category: "控制", label: "重复执行 5 次", reason: "分 5 次调高音量。", params: { repeatTimes: "5" },
        substack: {
          opcode: "sound_changevolumeby", category: "声音", label: "将音量增加 10", reason: "逐步提高音量。", params: { changeBy: "10" },
          next: { opcode: "control_wait", category: "控制", label: "等待 0.5 秒", reason: "让变化可以被听见。", params: { secs: "0.5" } }
        }
      }
    );
  }

  if (/鼠标指针.*距离|距离.*鼠标指针|小于50.*靠近/.test(text)) {
    return createResponse(
      "持续检查到鼠标指针的距离，小于 50 时说“靠近了”。",
      "在一直重复中加入距离小于 50 的判断和提示。",
      {
        opcode: "control_forever", category: "控制", label: "一直重复", reason: "持续检测距离。",
        substack: {
          opcode: "control_if", category: "控制", label: "如果距离小于 50", reason: "距离足够近时提示。",
          condition: { opcode: "operator_lt", category: "运算", label: "距离小于 50", reason: "比较鼠标距离。", params: { left: "sensing_distanceto", right: "50" } },
          substack: { opcode: "looks_sayforsecs", category: "外观", label: "说靠近了", reason: "给出接近反馈。", params: { message: "靠近了", secs: "2" } }
        }
      }
    );
  }

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

  if (/score.*90.*grade|成绩.*等级|grade.*设为a/.test(goalText)) {
    return !(/control_if_else/.test(recommendationText) && /operator_gt/.test(recommendationText) && /text:a/.test(recommendationText) && /text:b/.test(recommendationText));
  }
  if (/3\+4|问答题.*7|回答.*score.*加1/.test(goalText)) {
    return !(/operator_equals/.test(recommendationText) && /answerNumber/i.test(JSON.stringify(recommendation)) && /回答正确/.test(recommendationText));
  }
  if (/password.*scratch|密码.*包含scratch|密码错误/.test(goalText)) {
    return !(
      /operator_contains/.test(recommendationText) &&
      /"left":"password"/.test(recommendationText) &&
      /"right":"scratch"/.test(recommendationText) &&
      /"message":"通过"/.test(recommendationText) &&
      /"message":"密码错误"/.test(recommendationText)
    );
  }
  if (/商品.*总价|单价.*数量|price.*quantity.*total|total=.*price/.test(goalText)) {
    return !(/price/.test(recommendationText) && /quantity/.test(recommendationText) && /total/.test(recommendationText));
  }
  if (/\bbmi\b|weight.*height|体重.*身高/.test(goalText)) {
    return !(/weight/.test(recommendationText) && /height/.test(recommendationText) && /bmi/.test(recommendationText));
  }
  if (/购物清单|加入.*清单|item.*list/.test(goalText)) {
    return !(/data_addtolist/.test(recommendationText) && /"list":"购物清单"/.test(recommendationText) && /"value":"item"/.test(recommendationText));
  }
  if (/广播.*开始游戏|开始游戏.*广播/.test(goalText)) {
    return !(/event_broadcast/.test(recommendationText) && /开始游戏/.test(recommendationText));
  }
  if (/造型动画|下一个造型/.test(goalText)) {
    return !(/control_repeat/.test(recommendationText) && /looks_nextcostume/.test(recommendationText) && /control_wait/.test(recommendationText));
  }
  if (/音量.*增加|音量逐渐变大/.test(goalText)) {
    return !(/sound_changevolumeby/.test(recommendationText) && /control_wait/.test(recommendationText));
  }
  if (/鼠标指针.*距离|距离.*鼠标指针|小于50.*靠近/.test(goalText)) {
    return !(/sensing_distanceto/.test(recommendationText) && /operator_lt/.test(recommendationText));
  }
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
