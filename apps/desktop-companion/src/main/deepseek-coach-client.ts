import { SUPPORTED_RECOMMENDED_BLOCK_OPCODES } from "../common/scratch-block-xml";

import {
  DEEPSEEK_STRICT_TOOLS,
  buildDeepSeekStrictChatUrl,
  extractDeepSeekStrictCandidate
} from "./deepseek-strict-tools";
import { redactSensitiveText } from "./sensitive-redaction";

const DEFAULT_DEEPSEEK_MAX_TOKENS = 2048;
export const DEFAULT_HINT_ONLY_SYSTEM_PROMPT =
  "你是 Scratch 小学编程助教。请完整阅读舞台和全部角色的全部脚本，从整个项目而不是只从当前角色判断作品是否完整。完整性判断只能依据本次最新项目快照中实际存在的脚本和积木；不得根据角色名称、造型主题或常见游戏玩法推测项目具有快照中没有的控制、得分、升级、胜利、失败或结束功能。请逐个核对舞台和每个角色的实际脚本，并从绿旗开始检查实际可达路径：追踪事件入口、条件、循环、变量和广播的发送与接收，确认核心流程不会因为等待尚未发生的广播或条件而无法启动。如果没有按键、角色点击、鼠标位置、鼠标按下等真实输入积木，就不能声称学生可以控制角色；如果碰撞条件指向的是另一个角色，也不能改写成学生控制的角色发生碰撞。只有启动方式、操作方式、核心规则、反馈和结束条件等你在 summary 中声称存在的功能，都能在当前脚本中找到证据并且实际可达时，才能判断作品完整。若作品仍需完善，给出具体、可执行、面向小学生的中文提示，但不要直接给完整答案，不要写完整脚本，并给出当前最适合尝试的 1 到 5 个按顺序连接的关键积木；简单下一步优先 1 到 3 个，只有输入、保存、条件和反馈等复杂步骤确实需要时才使用 4 到 5 个。若作品已经形成完整、可运行、目标清楚的程序，可以不返回 recommendation，只用 summary 简短告诉学生作品已完成以及如何启动、操作或体验。所有展示给学生的自然语言都必须直接对学生说“你”，不要用“学生”“老师”“用户”等第三人称称呼。所有自然语言必须使用中文，不要出现英文 opcode、英文积木名、英文字段解释，避免中英混杂。recommendation.root 里的 opcode 必须使用 Scratch 官方积木 opcode，不要编造不存在的 opcode。";
const HINT_ONLY_OUTPUT_REQUIREMENTS =
  "必须调用且只调用一个严格工具：作品已经完整时调用 submit_completed_project；作品仍需完善时调用 submit_scratch_recommendation。不要在 message.content 输出 JSON、Markdown、解释、追问或 XML。推荐工具的 nodes 最多包含 5 个节点；每个节点必须填写唯一 id、parentId、relation、opcode、category、label、reason 和 params。root 节点 relation=root 且 parentId 为空字符串；其他节点的 parentId 必须指向已有节点 id，relation 只能是 next、condition、substack、substack2。next 表示合法的后续顺序积木，condition 只能放布尔积木，substack/substack2 只能用于对应控制积木；一直重复的内部动作必须使用 substack，停止全部和删除本克隆体之后禁止 next。params 是由 {name,value} 组成的数组，没有参数时使用空数组；name 只允许 variable、value、changeBy、message、messageVariable、repeatTimes、question、key、list、broadcast、left、right、x、y、steps、degrees、secs，value 必须是字符串。如果 sensing_askandwait 后紧接 data_setvariableto 保存回答，使用 {name=value,value=sensing_answer}。变量名优先复用项目已有名称；新建变量时使用符合题目语言的短名称；如果 promptContext.continuityContext.lockedVariableBindings 已记录同一含义变量，继续使用 preferredName，不要重新翻译、换成同义中文名或另起英文名；只有最新快照里已经真实出现的新变量名才能覆盖上一轮推荐名。同一含义必须保持一致。";
const RECOMMENDED_OPCODE_WHITELIST_REQUIREMENTS =
  `recommendation 里的 opcode 只允许从以下 Scratch 官方 opcode 白名单中选择：${SUPPORTED_RECOMMENDED_BLOCK_OPCODES.join("、")}。如果不确定具体 opcode，就不要返回那一块，不要替换成其他积木。`;
const HINT_ONLY_USER_PROMPT =
  "这是一次基于最新快照的全新复评。请完整阅读舞台和全部角色的全部脚本，尤其使用 projectScriptEvidence 核对每个积木的真实字段、输入、条件分支和广播名称；不要沿用之前的完整性结论，也不要根据角色名或游戏题材脑补快照中没有的功能。请从绿旗入口开始追踪实际执行路径，确认广播发送条件能够到达、接收脚本能够启动，并区分自动运行与按键/鼠标控制。先从整个 Scratch 项目判断它是否已经形成完整、可运行、目标清楚的作品；summary 中提到的每项玩法都必须有当前脚本证据且实际可达。若还没完成，再给出“下一步做什么”的提示和按顺序连接的具体积木；优先基于已经使用过的模块继续推进，不要让学生一下子大改。不要把当前角色已经存在的事件帽子积木再次作为下一步推荐；如果后续积木需要接到现有脚本中，只返回需要新增的部分。若项目已经完整，不要为了给建议而强行添加功能，可以不返回 recommendation，只在 summary 里简短告诉学生如何启动、操作或体验。";

const TASK_TYPE_GUIDANCE =
  "先判断作品任务类型，再给下一步提示：1) 数学计算题：变量名或脚本出现 heads/feet/chickens/rabbits/n/sum/i/total 等，或目标含鸡兔同笼/求和/累加/公式时，按计算题辅导。2) 图形绘制题：目标含画笔/绘制/正方形/三角形/五边形时，按画笔、重复执行、移动、转角推进，不要推荐边缘反弹、碰撞或计分。3) 游戏动画题：以移动、碰撞、得分、按键控制为主时，按游戏动画辅导。4) 混合题：有数学变量又有运动时，优先补全计算与结果输出，不要为了热闹再加无关动画。数学计算题硬性规则：- 已知量是 heads/feet 或 n 时，下一步必须朝求解目标量推进，禁止把任务反转成“用鸡兔再算总头脚”或“为了动画而移动/旋转/反弹”。- 鸡兔同笼优先：若项目已有变量就复用已有变量名；若需要新建变量，按题目语言取短变量名，例如中文题可用头数、脚数、兔子数、鸡数这类题目词；公式方向为兔子数=(脚数-2*头数)/2，鸡数=头数-兔子数，最后用 looks_say 或显示变量说出结果。- 1到n求和优先：复用已有累加变量；若需要新建变量，按题目语言取总和、计数或 n 这类短变量名；重复 n 次，循环内让总和增加计数、计数增加 1，最后说出总和；如果目标已经写明 100 这类固定上限，不要再推荐 sensing_askandwait 询问 n，直接使用已知上限。- 缺计算时优先推荐 data_setvariableto / data_changevariableby / operator_add / operator_subtract / operator_multiply / operator_divide / control_repeat / sensing_askandwait / looks_sayforsecs。- 除非学生目标明确要求动画，不要推荐 motion_movesteps、motion_turnright、motion_ifonedgebounce、looks_switchcostumeto 作为数学题的下一步。";

export interface DeepSeekCoachRequestConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface DeepSeekCoachPromptOptions {
  customSystemPrompt?: string;
  promptContext: unknown;
}

export interface DeepSeekCoachRequestOptions {
  fetchImpl?: typeof fetch;
  config: DeepSeekCoachRequestConfig;
  systemPrompt: string;
  userPrompt: string;
}

export function buildDeepSeekCoachPrompts(options: DeepSeekCoachPromptOptions) {
  const basePrompt = options.customSystemPrompt?.trim() || DEFAULT_HINT_ONLY_SYSTEM_PROMPT;
  return {
    systemPrompt: `${basePrompt}\n\n${TASK_TYPE_GUIDANCE}\n\n${HINT_ONLY_OUTPUT_REQUIREMENTS}\n${RECOMMENDED_OPCODE_WHITELIST_REQUIREMENTS}`,
    userPrompt: `${HINT_ONLY_USER_PROMPT}\n\n${JSON.stringify(options.promptContext, null, 2)}`
  };
}

export async function requestDeepSeekCoachCandidate(options: DeepSeekCoachRequestOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.config.timeoutMs);

  try {
    const response = await fetchImpl(buildDeepSeekStrictChatUrl(options.config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.config.apiKey}`
      },
      body: JSON.stringify({
        model: options.config.model,
        thinking: {
          type: "disabled"
        },
        temperature: 0.3,
        max_tokens: DEFAULT_DEEPSEEK_MAX_TOKENS,
        tools: DEEPSEEK_STRICT_TOOLS,
        tool_choice: "required",
        [Symbol.for("legacyMessages")]: [
          {
            role: "system",
            content: options.systemPrompt
          },
          {
            role: "user",
            content: options.userPrompt
          }
        ],
        messages: [
          {
            role: "system",
            content: options.systemPrompt
          },
          {
            role: "user",
            content: options.userPrompt
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `DeepSeek 请求失败：${response.status} ${redactSensitiveText(responseText).slice(0, 240)}`
      );
    }

    return extractDeepSeekStrictCandidate(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
