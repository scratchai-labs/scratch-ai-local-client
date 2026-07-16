export const REAL_WORLD_STABILITY_SEED_SPECS = Object.freeze({
    'shopping-total': {
        variables: {price: '12.5', quantity: '4', total: '0'}
    },
    'bmi-calculation': {
        variables: {weight: '60', height: '1.7', bmi: '0'}
    },
    'grade-level': {
        variables: {score: '85', grade: ''}
    },
    'quiz-score': {
        variables: {answerNumber: '0', score: '0'},
        ask: {question: '3 + 4 等于多少？', variable: 'answerNumber'}
    },
    'shopping-list': {
        variables: {item: ''},
        ask: {question: '请输入要加入清单的物品', variable: 'item'}
    },
    'broadcast-intro': {
        variables: {}
    },
    'costume-animation': {
        variables: {},
        tail: {opcode: 'control_repeat', count: '6'}
    },
    'volume-ramp': {
        variables: {},
        tail: {opcode: 'control_repeat', count: '5'}
    },
    'mouse-proximity': {
        variables: {},
        tail: {opcode: 'control_forever'}
    },
    'password-check': {
        variables: {password: ''},
        ask: {question: '请输入密码', variable: 'password'}
    }
});

export const REAL_WORLD_STABILITY_GOAL_CASES = Object.freeze([
    {
        id: 'R1-shopping-total', kind: '生活数学', seed: 'shopping-total',
        goal: '商品单价 price=12.5，数量 quantity=4，计算 total = price × quantity 并说出总价',
        expectedVariables: ['price', 'quantity', 'total'],
        expectedOpcodes: ['data_setvariableto', 'operator_multiply', 'looks_sayforsecs'],
        expectedKeywords: ['单价', '数量', 'total', 'price', 'quantity', '总价'],
        disallowedOpcodes: ['motion_ifonedgebounce', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'R2-bmi', kind: '健康计算', seed: 'bmi-calculation',
        goal: '用 weight=60、height=1.7 计算 bmi = weight ÷ (height × height)，并说出 bmi',
        expectedVariables: ['weight', 'height', 'bmi'],
        expectedOpcodes: ['data_setvariableto', 'operator_divide', 'operator_multiply', 'looks_sayforsecs'],
        expectedKeywords: ['weight', 'height', 'bmi', '除', '乘'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'R3-grade', kind: '成绩判断', seed: 'grade-level',
        goal: '根据 score 判断等级：score 大于 90 时 grade 设为 A，否则设为 B，并说出 grade',
        expectedVariables: ['score', 'grade'],
        expectedOpcodes: ['control_if_else', 'operator_gt', 'data_setvariableto', 'looks_sayforsecs'],
        expectedKeywords: ['score', 'grade', '90', 'A', 'B', '等级'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'R4-quiz', kind: '问答计分', seed: 'quiz-score',
        goal: '做一道 3+4 的问答题：回答等于 7 时 score 加 1 并说“回答正确”',
        expectedVariables: ['answerNumber', 'score'],
        expectedOpcodes: ['operator_equals', 'control_if', 'data_changevariableby', 'looks_sayforsecs'],
        expectedKeywords: ['3+4', '7', 'score', '回答正确'],
        disallowedOpcodes: ['motion_ifonedgebounce', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'R5-shopping-list', kind: '列表应用', seed: 'shopping-list',
        goal: '询问一个物品 item，把 item 加入购物清单，并说出购物清单的项目数',
        expectedVariables: ['item'],
        expectedOpcodes: ['data_addtolist', 'data_lengthoflist', 'looks_sayforsecs'],
        expectedKeywords: ['item', '购物清单', '加入', '项目数'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'R6-broadcast', kind: '消息广播', seed: 'broadcast-intro',
        goal: '点击绿旗后广播“开始游戏”，收到“开始游戏”消息时说“准备好了”',
        expectedVariables: [],
        expectedOpcodes: ['event_broadcast', 'event_whenbroadcastreceived', 'looks_sayforsecs'],
        expectedKeywords: ['广播', '开始游戏', '收到', '准备好了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    },
    {
        id: 'R7-costume', kind: '造型动画', seed: 'costume-animation',
        goal: '用重复执行 6 次制作造型动画：每次切换到下一个造型并等待 0.2 秒',
        expectedVariables: [],
        expectedOpcodes: ['control_repeat', 'looks_nextcostume', 'control_wait'],
        expectedKeywords: ['6', '下一个造型', '0.2', '动画'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'], driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'R8-volume', kind: '声音控制', seed: 'volume-ramp',
        goal: '用重复执行 5 次让音量逐渐变大：每次音量增加 10，再等待 0.5 秒',
        expectedVariables: [],
        expectedOpcodes: ['control_repeat', 'sound_changevolumeby', 'control_wait'],
        expectedKeywords: ['音量', '5', '10', '0.5'],
        disallowedOpcodes: ['motion_ifonedgebounce', 'pen_clear'], driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'R9-proximity', kind: '距离侦测', seed: 'mouse-proximity',
        goal: '持续检测角色到鼠标指针的距离，小于 50 时说“靠近了”',
        expectedVariables: [],
        expectedOpcodes: ['control_forever', 'control_if', 'sensing_distanceto', 'operator_lt', 'looks_sayforsecs'],
        expectedKeywords: ['鼠标指针', '距离', '50', '靠近了'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'], driftKeywords: ['鸡兔', '求和', '面积']
    },
    {
        id: 'R10-password', kind: '字符串判断', seed: 'password-check',
        goal: '询问密码并保存到 password；如果 password 包含 scratch 就说“通过”，否则说“密码错误”',
        expectedVariables: ['password'],
        expectedOpcodes: ['operator_contains', 'control_if_else', 'looks_sayforsecs'],
        expectedKeywords: ['password', 'scratch', '通过', '密码错误'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'], driftKeywords: ['鸡兔', '正方形', '苹果']
    }
]);
