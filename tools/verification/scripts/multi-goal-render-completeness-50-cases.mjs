import {
    VARIABLE_VISIBILITY_GOAL_CASES,
    VARIABLE_VISIBILITY_SEED_SPECS
} from './multi-goal-variable-visibility-cases.mjs';
import {
    REAL_WORLD_STABILITY_GOAL_CASES,
    REAL_WORLD_STABILITY_SEED_SPECS
} from './multi-goal-real-world-stability-cases.mjs';

export const RENDER_COMPLETENESS_EXTRA_SEED_SPECS = Object.freeze({
    'distance-speed-time': {
        variables: {distance: '120', speed: '30', time: '0'}
    },
    'circle-area': {
        variables: {radius: '5', area: '0'}
    },
    'savings-goal': {
        variables: {money: '0', target: '100', daily: '10'},
        tail: {opcode: 'control_repeat', count: '10'}
    },
    'multiplication-table': {
        variables: {n: '7', i: '1', result: '0'},
        tail: {opcode: 'control_repeat', count: '9'}
    },
    'stopwatch': {
        variables: {seconds: '0'},
        tail: {opcode: 'control_forever'}
    },
    'energy-boost': {
        variables: {energy: '0', boost: '5'},
        tail: {opcode: 'control_forever'}
    },
    'repeat-until-score': {
        variables: {score: '0', target: '20'}
    },
    'clone-cleanup': {
        variables: {}
    },
    'backdrop-broadcast': {
        variables: {}
    },
    'sound-effects': {
        variables: {}
    },
    'graphic-effect': {
        variables: {},
        tail: {opcode: 'control_repeat', count: '5'}
    },
    'size-pulse': {
        variables: {},
        tail: {opcode: 'control_repeat', count: '6'}
    },
    'list-reset-add': {
        variables: {item: '苹果'}
    },
    'list-insert-replace': {
        variables: {item: '香蕉'}
    },
    'string-tools': {
        variables: {word: 'scratch', first: '', length: '0'}
    },
    'mouse-click-detect': {
        variables: {},
        tail: {opcode: 'control_forever'}
    },
    'key-up-down': {
        variables: {step: '10'},
        tail: {opcode: 'control_forever'}
    },
    'glide-mouse': {
        variables: {}
    },
    'point-to-mouse': {
        variables: {},
        tail: {opcode: 'control_forever'}
    },
    'set-position': {
        variables: {}
    },
    'show-hide': {
        variables: {}
    },
    'costume-loop': {
        variables: {},
        tail: {opcode: 'control_repeat', count: '4'}
    },
    'broadcast-wait': {
        variables: {}
    },
    'sprite-click-reaction': {
        variables: {clicks: '0'}
    },
    'pen-color-size': {
        variables: {},
        extensions: ['pen'],
        beforeTailOpcodes: ['pen_clear', 'pen_penDown']
    },
    'stop-when-health-zero': {
        variables: {health: '1'}
    },
    'variable-show-hide': {
        variables: {secret: '42'}
    },
    'list-show-hide': {
        variables: {}
    },
    'math-round-mod': {
        variables: {number: '17.6', rounded: '0', remainder: '0'}
    },
    'join-message': {
        variables: {name: '小猫', message: ''}
    }
});

const EXTRA_RENDER_COMPLETENESS_GOAL_CASES = Object.freeze([
    {
        id: 'C21-distance-speed-time',
        kind: '公式计算',
        seed: 'distance-speed-time',
        goal: '已知 distance=120、speed=30，计算 time = distance ÷ speed 并说出来',
        expectedVariables: ['distance', 'speed', 'time'],
        expectedOpcodes: ['data_setvariableto', 'operator_divide', 'looks_sayforsecs'],
        expectedKeywords: ['distance', 'speed', 'time', '除', '速度'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形'],
        displayChecks: [{type: 'say-variable', variable: 'time', label: '说出 time 变量'}]
    },
    {
        id: 'C22-circle-area',
        kind: '几何计算',
        seed: 'circle-area',
        goal: '用 radius=5 计算圆面积 area = 3.14 × radius × radius，并说出 area',
        expectedVariables: ['radius', 'area'],
        expectedOpcodes: ['data_setvariableto', 'operator_multiply', 'looks_sayforsecs'],
        expectedKeywords: ['圆', '面积', '3.14', 'radius', 'area'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形'],
        displayChecks: [{type: 'say-variable', variable: 'area', label: '说出 area 变量'}]
    },
    {
        id: 'C23-savings-goal',
        kind: '循环累加',
        seed: 'savings-goal',
        goal: '每天存 daily=10 元，重复执行 10 次把 money 增加 daily，达到 target=100 后说“达成目标”',
        expectedVariables: ['money', 'target', 'daily'],
        expectedOpcodes: ['control_repeat', 'data_changevariableby', 'operator_equals', 'looks_sayforsecs'],
        expectedKeywords: ['money', 'daily', 'target', '100', '达成目标'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形'],
        displayChecks: [
            {type: 'repeat-count', value: '10', label: '重复执行 10 次'},
            {type: 'change-variable-by-variable', target: 'money', source: 'daily', label: 'money 增加 daily'}
        ]
    },
    {
        id: 'C24-multiplication-table',
        kind: '循环乘法',
        seed: 'multiplication-table',
        goal: '制作 7 的乘法口诀：重复 9 次，计算 result = n × i，说出 n、i 和 result，再让 i 增加 1',
        expectedVariables: ['n', 'i', 'result'],
        expectedOpcodes: ['control_repeat', 'operator_multiply', 'operator_join', 'data_changevariableby', 'looks_sayforsecs'],
        expectedKeywords: ['乘法口诀', 'result', 'n', 'i', '9'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形'],
        displayChecks: [{type: 'repeat-count', value: '9', label: '重复执行 9 次'}]
    },
    {
        id: 'C25-stopwatch',
        kind: '计时器',
        seed: 'stopwatch',
        goal: '做秒表：一直重复等待 1 秒，然后让 seconds 增加 1',
        expectedVariables: ['seconds'],
        expectedOpcodes: ['control_forever', 'control_wait', 'data_changevariableby'],
        expectedKeywords: ['秒表', 'seconds', '等待', '1 秒'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形']
    },
    {
        id: 'C26-energy-boost',
        kind: '能量系统',
        seed: 'energy-boost',
        goal: '做能量系统：按空格键时 energy 增加 boost，energy 大于 100 时说“能量满了”',
        expectedVariables: ['energy', 'boost'],
        expectedOpcodes: ['control_forever', 'sensing_keypressed', 'data_changevariableby', 'operator_gt', 'looks_sayforsecs'],
        expectedKeywords: ['空格', 'energy', 'boost', '100', '能量满了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形']
    },
    {
        id: 'C27-repeat-until-score',
        kind: '重复直到',
        seed: 'repeat-until-score',
        goal: '使用重复执行直到 score 等于 target，循环里让 score 增加 1，结束后说“完成”',
        expectedVariables: ['score', 'target'],
        expectedOpcodes: ['control_repeat_until', 'operator_equals', 'data_changevariableby', 'looks_sayforsecs'],
        expectedKeywords: ['重复执行直到', 'score', 'target', '完成'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形']
    },
    {
        id: 'C28-clone-cleanup',
        kind: '克隆控制',
        seed: 'clone-cleanup',
        goal: '点击绿旗创建自己的克隆体，克隆体出现后等待 1 秒再删除此克隆体',
        expectedVariables: [],
        expectedOpcodes: ['control_create_clone_of', 'control_wait', 'control_delete_this_clone'],
        expectedKeywords: ['克隆', '等待', '删除'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C29-backdrop-broadcast',
        kind: '背景消息',
        seed: 'backdrop-broadcast',
        goal: '当背景切换到 bedroom 时广播“到卧室”，收到“到卧室”后说“到了”',
        expectedVariables: [],
        expectedOpcodes: ['event_whenbackdropswitchesto', 'event_broadcast', 'event_whenbroadcastreceived', 'looks_sayforsecs'],
        expectedKeywords: ['背景', 'bedroom', '广播', '到卧室', '到了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C30-sound-effects',
        kind: '声音效果',
        seed: 'sound-effects',
        goal: '点击绿旗后播放 Meow 声音，把音量设为 80，再把音调效果增加 10',
        expectedVariables: [],
        expectedOpcodes: ['sound_play', 'sound_setvolumeto', 'sound_changeeffectby'],
        expectedKeywords: ['Meow', '音量', '80', '音调', '10'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C31-graphic-effect',
        kind: '图像特效',
        seed: 'graphic-effect',
        goal: '重复执行 5 次，每次将颜色特效增加 25，最后清除图形特效',
        expectedVariables: [],
        expectedOpcodes: ['control_repeat', 'looks_changeeffectby', 'looks_cleargraphiceffects'],
        expectedKeywords: ['颜色特效', '25', '清除', '5'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '苹果'],
        displayChecks: [{type: 'repeat-count', value: '5', label: '重复执行 5 次'}]
    },
    {
        id: 'C32-size-pulse',
        kind: '大小动画',
        seed: 'size-pulse',
        goal: '制作呼吸动画：重复执行 6 次，让大小增加 10，等待 0.2 秒，再让大小减少 10',
        expectedVariables: [],
        expectedOpcodes: ['control_repeat', 'looks_changesizeby', 'control_wait'],
        expectedKeywords: ['大小', '10', '0.2', '呼吸', '6'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积'],
        displayChecks: [{type: 'repeat-count', value: '6', label: '重复执行 6 次'}]
    },
    {
        id: 'C33-list-reset-add',
        kind: '列表清单',
        seed: 'list-reset-add',
        goal: '先清空购物清单，再把 item 加入购物清单，然后说出购物清单长度',
        expectedVariables: ['item'],
        expectedOpcodes: ['data_deletealloflist', 'data_addtolist', 'data_lengthoflist', 'looks_sayforsecs'],
        expectedKeywords: ['购物清单', '清空', 'item', '长度'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '正方形', '五边形']
    },
    {
        id: 'C34-list-insert-replace',
        kind: '列表编辑',
        seed: 'list-insert-replace',
        goal: '把 item 插入购物清单第 1 项，再把第 1 项替换为“牛奶”，最后删除第 1 项',
        expectedVariables: ['item'],
        expectedOpcodes: ['data_insertatlist', 'data_replaceitemoflist', 'data_deleteoflist'],
        expectedKeywords: ['购物清单', '插入', '替换', '牛奶', '删除'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'C35-string-tools',
        kind: '字符串处理',
        seed: 'string-tools',
        goal: '把 word 的第 1 个字母保存到 first，把 word 的长度保存到 length，并说出 first 和 length',
        expectedVariables: ['word', 'first', 'length'],
        expectedOpcodes: ['operator_letter_of', 'operator_length', 'data_setvariableto', 'operator_join', 'looks_sayforsecs'],
        expectedKeywords: ['word', 'first', 'length', '字母', '长度'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'C36-mouse-click-detect',
        kind: '鼠标侦测',
        seed: 'mouse-click-detect',
        goal: '一直重复检测鼠标是否按下，如果按下就说“点到了”',
        expectedVariables: [],
        expectedOpcodes: ['control_forever', 'control_if', 'sensing_mousedown', 'looks_sayforsecs'],
        expectedKeywords: ['鼠标', '按下', '点到了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C37-key-up-down',
        kind: '键盘控制',
        seed: 'key-up-down',
        goal: '一直检测上箭头和下箭头：按上箭头 y 增加 step，按下箭头 y 减少 step',
        expectedVariables: ['step'],
        expectedOpcodes: ['control_forever', 'sensing_keypressed', 'motion_changeyby'],
        expectedKeywords: ['上箭头', '下箭头', 'step', 'y'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C38-glide-mouse',
        kind: '滑行动作',
        seed: 'glide-mouse',
        goal: '点击绿旗后用 1 秒滑行到鼠标指针，再说“我到了”',
        expectedVariables: [],
        expectedOpcodes: ['motion_glideto', 'looks_sayforsecs'],
        expectedKeywords: ['滑行', '1 秒', '鼠标指针', '我到了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C39-point-to-mouse',
        kind: '朝向动作',
        seed: 'point-to-mouse',
        goal: '一直面向鼠标指针，并移动 5 步',
        expectedVariables: [],
        expectedOpcodes: ['control_forever', 'motion_pointtowards', 'motion_movesteps'],
        expectedKeywords: ['面向', '鼠标指针', '移动', '5'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C40-set-position',
        kind: '坐标定位',
        seed: 'set-position',
        goal: '点击绿旗后把 x 坐标设为 -100，把 y 坐标设为 80，然后移到 x=0 y=0',
        expectedVariables: [],
        expectedOpcodes: ['motion_setx', 'motion_sety', 'motion_gotoxy'],
        expectedKeywords: ['x', '-100', 'y', '80', '0'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C41-show-hide',
        kind: '显示隐藏',
        seed: 'show-hide',
        goal: '点击绿旗后隐藏角色，等待 1 秒，再显示角色并说“出现了”',
        expectedVariables: [],
        expectedOpcodes: ['looks_hide', 'control_wait', 'looks_show', 'looks_sayforsecs'],
        expectedKeywords: ['隐藏', '等待', '显示', '出现了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C42-costume-loop',
        kind: '造型循环',
        seed: 'costume-loop',
        goal: '重复执行 4 次：切换到下一个造型，等待 0.3 秒',
        expectedVariables: [],
        expectedOpcodes: ['control_repeat', 'looks_nextcostume', 'control_wait'],
        expectedKeywords: ['4', '下一个造型', '0.3'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积'],
        displayChecks: [{type: 'repeat-count', value: '4', label: '重复执行 4 次'}]
    },
    {
        id: 'C43-broadcast-wait',
        kind: '广播等待',
        seed: 'broadcast-wait',
        goal: '点击绿旗后广播“准备”并等待，收到“准备”后说“开始”',
        expectedVariables: [],
        expectedOpcodes: ['event_broadcastandwait', 'event_whenbroadcastreceived', 'looks_sayforsecs'],
        expectedKeywords: ['广播', '准备', '等待', '开始'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C44-sprite-click-reaction',
        kind: '角色点击',
        seed: 'sprite-click-reaction',
        goal: '当角色被点击时 clicks 增加 1，并说出 clicks',
        expectedVariables: ['clicks'],
        expectedOpcodes: ['event_whenthisspriteclicked', 'data_changevariableby', 'looks_sayforsecs'],
        expectedKeywords: ['点击', 'clicks', '增加', '说出'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积'],
        displayChecks: [{type: 'say-variable', variable: 'clicks', label: '说出 clicks 变量'}]
    },
    {
        id: 'C45-pen-color-size',
        kind: '画笔样式',
        seed: 'pen-color-size',
        goal: '设置画笔颜色为红色，把画笔粗细增加 2，然后移动 80 步画线',
        expectedVariables: [],
        expectedOpcodes: ['pen_setPenColorToColor', 'pen_changePenSizeBy', 'motion_movesteps'],
        expectedKeywords: ['画笔', '红色', '粗细', '2', '80'],
        disallowedOpcodes: ['operator_divide', 'sensing_askandwait'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C46-stop-when-health-zero',
        kind: '停止控制',
        seed: 'stop-when-health-zero',
        goal: '如果 health 等于 0，就说“游戏结束”并停止全部脚本',
        expectedVariables: ['health'],
        expectedOpcodes: ['control_if', 'operator_equals', 'looks_sayforsecs', 'control_stop'],
        expectedKeywords: ['health', '0', '游戏结束', '停止全部'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '五边形']
    },
    {
        id: 'C47-variable-show-hide',
        kind: '变量显示',
        seed: 'variable-show-hide',
        goal: '点击绿旗后显示变量 secret，等待 2 秒，再隐藏变量 secret',
        expectedVariables: ['secret'],
        expectedOpcodes: ['data_showvariable', 'control_wait', 'data_hidevariable'],
        expectedKeywords: ['显示变量', 'secret', '隐藏变量', '2'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C48-list-show-hide',
        kind: '列表显示',
        seed: 'list-show-hide',
        goal: '显示购物清单列表，等待 2 秒，再隐藏购物清单列表',
        expectedVariables: [],
        expectedOpcodes: ['data_showlist', 'control_wait', 'data_hidelist'],
        expectedKeywords: ['购物清单', '显示', '隐藏', '2'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'C49-math-round-mod',
        kind: '数学运算',
        seed: 'math-round-mod',
        goal: '把 number 四舍五入保存到 rounded，再计算 number 除以 5 的余数保存到 remainder',
        expectedVariables: ['number', 'rounded', 'remainder'],
        expectedOpcodes: ['operator_round', 'operator_mod', 'data_setvariableto'],
        expectedKeywords: ['四舍五入', 'rounded', '余数', 'remainder', '5'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形']
    },
    {
        id: 'C50-join-message',
        kind: '文本拼接',
        seed: 'join-message',
        goal: '把“你好 ”和 name 拼接成 message，并说出 message',
        expectedVariables: ['name', 'message'],
        expectedOpcodes: ['operator_join', 'data_setvariableto', 'looks_sayforsecs'],
        expectedKeywords: ['你好', 'name', 'message', '拼接'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '五边形'],
        displayChecks: [{type: 'say-variable', variable: 'message', label: '说出 message 变量'}]
    }
]);

export const RENDER_COMPLETENESS_50_SEED_SPECS = Object.freeze({
    ...VARIABLE_VISIBILITY_SEED_SPECS,
    ...REAL_WORLD_STABILITY_SEED_SPECS,
    ...RENDER_COMPLETENESS_EXTRA_SEED_SPECS
});

export const RENDER_COMPLETENESS_50_GOAL_CASES = Object.freeze([
    ...VARIABLE_VISIBILITY_GOAL_CASES,
    ...REAL_WORLD_STABILITY_GOAL_CASES,
    ...EXTRA_RENDER_COMPLETENESS_GOAL_CASES
]);
