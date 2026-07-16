import test from 'node:test';
import assert from 'node:assert/strict';

import {
    VARIABLE_VISIBILITY_GOAL_CASES,
    VARIABLE_VISIBILITY_SEED_SPECS
} from '../scripts/multi-goal-variable-visibility-cases.mjs';

test('variable visibility suite defines ten distinct real goals with matching seeds', () => {
    assert.equal(VARIABLE_VISIBILITY_GOAL_CASES.length, 10);
    assert.equal(new Set(VARIABLE_VISIBILITY_GOAL_CASES.map(item => item.id)).size, 10);
    assert.equal(new Set(VARIABLE_VISIBILITY_GOAL_CASES.map(item => item.goal)).size, 10);

    for (const item of VARIABLE_VISIBILITY_GOAL_CASES) {
        assert.ok(VARIABLE_VISIBILITY_SEED_SPECS[item.seed], `${item.id} 缺少 seed ${item.seed}`);
        assert.ok(item.expectedVariables.length > 0, `${item.id} 必须声明要检查的变量名`);
        assert.ok(item.expectedOpcodes.length > 0, `${item.id} 必须声明预期积木`);
    }
});
