export const VARIABLE_VISIBILITY_SEED_SPECS = Object.freeze({
    'even-sum-50': {
        variables: {total: '0', even: '2'},
        tail: {opcode: 'control_repeat', count: '25'}
    },
    'temperature-convert': {
        variables: {celsius: '0', fahrenheit: '0'},
        ask: {question: '请输入摄氏温度', variable: 'celsius'}
    },
    'rectangle-area': {
        variables: {length: '8', width: '5', area: '0'}
    },
    'countdown-10': {
        variables: {remaining: '10'},
        tail: {opcode: 'control_repeat', count: '10'}
    },
    'odd-even': {
        variables: {number: '0', remainder: '0'},
        ask: {question: '请输入一个整数', variable: 'number'}
    },
    'product-1-8': {
        variables: {product: '1', factor: '1'},
        tail: {opcode: 'control_repeat', count: '8'}
    },
    'click-score-10': {
        variables: {score: '0', targetScore: '10'}
    },
    'health-system': {
        variables: {health: '3', damage: '1'},
        tail: {opcode: 'control_forever'}
    },
    'keyboard-speed': {
        variables: {speed: '10'},
        tail: {opcode: 'control_forever'}
    },
    'hexagon-variables': {
        variables: {sides: '6', angle: '60'},
        extensions: ['pen'],
        beforeTailOpcodes: ['pen_clear', 'pen_penDown'],
        tail: {opcode: 'control_repeat', countVariable: 'sides'}
    }
});

export const VARIABLE_VISIBILITY_GOAL_CASES = Object.freeze([
    {
        id: 'V1-even-sum-50',
        kind: '算法求和',
        seed: 'even-sum-50',
        goal: '用重复执行计算 2+4+6+...+50 的和，并说出 total',
        expectedVariables: ['total', 'even'],
        expectedOpcodes: ['control_repeat', 'data_changevariableby', 'data_setvariableto', 'operator_add', 'looks_sayforsecs'],
        expectedKeywords: ['50', '偶数', '求和', 'total', 'even', '重复'],
        disallowedOpcodes: ['motion_ifonedgebounce', 'pen_clear'],
        driftKeywords: ['鸡兔', '平方', '苹果']
    },
    {
        id: 'V2-temperature',
        kind: '单位换算',
        seed: 'temperature-convert',
        goal: '输入摄氏温度 celsius，用 fahrenheit = celsius × 9 ÷ 5 + 32 换算华氏温度并说出来',
        expectedVariables: ['celsius', 'fahrenheit'],
        expectedOpcodes: ['sensing_askandwait', 'sensing_answer', 'data_setvariableto', 'operator_multiply', 'operator_divide', 'operator_add', 'looks_sayforsecs'],
        expectedKeywords: ['摄氏', '华氏', 'celsius', 'fahrenheit', '32'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '正方形']
    },
    {
        id: 'V3-rectangle-area',
        kind: '几何计算',
        seed: 'rectangle-area',
        goal: '已知 length=8、width=5，计算长方形面积 area = length × width 并说出来',
        expectedVariables: ['length', 'width', 'area'],
        expectedOpcodes: ['data_setvariableto', 'operator_multiply', 'looks_sayforsecs'],
        expectedKeywords: ['长方形', '面积', 'length', 'width', 'area', '乘'],
        disallowedOpcodes: ['motion_ifonedgebounce', 'sensing_askandwait'],
        driftKeywords: ['鸡兔', '苹果', '平方']
    },
    {
        id: 'V4-countdown',
        kind: '倒计时',
        seed: 'countdown-10',
        goal: '做一个 10 秒倒计时：每秒让 remaining 减少 1，倒计时结束说“开始”',
        expectedVariables: ['remaining'],
        expectedOpcodes: ['control_repeat', 'control_wait', 'data_changevariableby', 'looks_sayforsecs'],
        expectedKeywords: ['倒计时', 'remaining', '减少', '每秒', '开始'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '正方形']
    },
    {
        id: 'V5-odd-even',
        kind: '条件判断',
        seed: 'odd-even',
        goal: '输入整数 number，用除以 2 的余数判断奇数或偶数，并说出结果',
        expectedVariables: ['number', 'remainder'],
        expectedOpcodes: ['sensing_askandwait', 'sensing_answer', 'operator_mod', 'operator_equals', 'control_if_else', 'looks_sayforsecs'],
        expectedKeywords: ['奇数', '偶数', 'number', '余数', '2'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '正方形']
    },
    {
        id: 'V6-product-1-8',
        kind: '累乘算法',
        seed: 'product-1-8',
        goal: '用重复执行计算 1×2×3×4×5×6×7×8，把结果保存在 product 并说出来',
        expectedVariables: ['product', 'factor'],
        expectedOpcodes: ['control_repeat', 'data_setvariableto', 'data_changevariableby', 'operator_multiply', 'looks_sayforsecs'],
        expectedKeywords: ['8', '乘积', 'product', 'factor', '重复'],
        disallowedOpcodes: ['motion_movesteps', 'pen_clear'],
        driftKeywords: ['鸡兔', '苹果', '正方形']
    },
    {
        id: 'V7-click-score',
        kind: '点击计分游戏',
        seed: 'click-score-10',
        goal: '做点击角色加分小游戏：每点一次 score 加 1，score 等于 targetScore 时说“胜利”',
        expectedVariables: ['score', 'targetScore'],
        expectedOpcodes: ['event_whenthisspriteclicked', 'data_changevariableby', 'operator_equals', 'control_if', 'looks_sayforsecs'],
        expectedKeywords: ['点击', 'score', 'targetScore', '加分', '胜利'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '平方', '正方形']
    },
    {
        id: 'V8-health-system',
        kind: '生命值系统',
        seed: 'health-system',
        goal: '做生命值系统：碰到敌人时 health 减少 damage，health 等于 0 时停止全部',
        expectedVariables: ['health', 'damage'],
        expectedOpcodes: ['control_forever', 'control_if', 'sensing_touchingobject', 'data_changevariableby', 'operator_equals', 'control_stop'],
        expectedKeywords: ['生命值', 'health', 'damage', '敌人', '停止'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '平方', '正方形']
    },
    {
        id: 'V9-keyboard-speed',
        kind: '变量控制运动',
        seed: 'keyboard-speed',
        goal: '用左右方向键控制角色移动，移动步数使用变量 speed，持续检测按键',
        expectedVariables: ['speed'],
        expectedOpcodes: ['control_forever', 'control_if', 'sensing_keypressed', 'motion_changexby', 'motion_movesteps'],
        expectedKeywords: ['左右', '方向键', 'speed', '移动', '持续'],
        disallowedOpcodes: ['operator_divide', 'pen_clear'],
        driftKeywords: ['鸡兔', '平方', '五边形']
    },
    {
        id: 'V10-hexagon',
        kind: '变量绘图',
        seed: 'hexagon-variables',
        goal: '用画笔画正六边形：重复次数使用变量 sides，每次右转变量 angle 度',
        expectedVariables: ['sides', 'angle'],
        expectedOpcodes: ['control_repeat', 'motion_movesteps', 'motion_turnright', 'pen_penUp'],
        expectedKeywords: ['六边形', 'sides', 'angle', '重复', '右转'],
        disallowedOpcodes: ['operator_multiply', 'sensing_askandwait'],
        driftKeywords: ['鸡兔', '平方', '苹果']
    }
]);
