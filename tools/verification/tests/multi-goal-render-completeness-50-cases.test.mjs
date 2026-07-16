import test from 'node:test';
import assert from 'node:assert/strict';

import {
    RENDER_COMPLETENESS_50_GOAL_CASES,
    RENDER_COMPLETENESS_50_SEED_SPECS
} from '../scripts/multi-goal-render-completeness-50-cases.mjs';

test('render completeness suite defines fifty distinct goals with matching seeds', () => {
    assert.equal(RENDER_COMPLETENESS_50_GOAL_CASES.length, 50);
    assert.equal(new Set(RENDER_COMPLETENESS_50_GOAL_CASES.map(item => item.id)).size, 50);
    assert.equal(new Set(RENDER_COMPLETENESS_50_GOAL_CASES.map(item => item.goal)).size, 50);

    const kinds = new Set(RENDER_COMPLETENESS_50_GOAL_CASES.map(item => item.kind));
    assert.ok(kinds.size >= 20, `覆盖类型不足：${[...kinds].join(', ')}`);

    const expectedOpcodeUniverse = new Set(
        RENDER_COMPLETENESS_50_GOAL_CASES.flatMap(item => item.expectedOpcodes)
    );
    for (const opcode of [
        'control_repeat',
        'control_repeat_until',
        'control_if',
        'control_if_else',
        'event_broadcast',
        'event_broadcastandwait',
        'data_addtolist',
        'data_showlist',
        'data_hidelist',
        'sound_changevolumeby',
        'sound_setvolumeto',
        'sensing_distanceto',
        'sensing_mousedown',
        'operator_contains',
        'operator_join',
        'operator_mod',
        'operator_round',
        'pen_setPenColorToColor'
    ]) {
        assert.ok(expectedOpcodeUniverse.has(opcode), `50 目标套件缺少 ${opcode} 覆盖`);
    }

    for (const item of RENDER_COMPLETENESS_50_GOAL_CASES) {
        assert.ok(RENDER_COMPLETENESS_50_SEED_SPECS[item.seed], `${item.id} 缺少 seed ${item.seed}`);
        assert.ok(item.expectedOpcodes.length > 0, `${item.id} 必须声明预期积木`);
        assert.ok(item.expectedKeywords.length > 0, `${item.id} 必须声明目标关键词`);
        assert.notEqual(item.disallowedOpcodes.length + item.driftKeywords.length, 0, `${item.id} 必须声明漂移守门`);
    }
});
