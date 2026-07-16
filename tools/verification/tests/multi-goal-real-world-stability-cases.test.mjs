import test from 'node:test';
import assert from 'node:assert/strict';

import {
    REAL_WORLD_STABILITY_GOAL_CASES,
    REAL_WORLD_STABILITY_SEED_SPECS
} from '../scripts/multi-goal-real-world-stability-cases.mjs';

test('real world stability suite defines ten distinct goals with matching seeds', () => {
    assert.equal(REAL_WORLD_STABILITY_GOAL_CASES.length, 10);
    assert.equal(new Set(REAL_WORLD_STABILITY_GOAL_CASES.map(item => item.id)).size, 10);
    assert.equal(new Set(REAL_WORLD_STABILITY_GOAL_CASES.map(item => item.goal)).size, 10);
    for (const item of REAL_WORLD_STABILITY_GOAL_CASES) {
        assert.ok(REAL_WORLD_STABILITY_SEED_SPECS[item.seed], `${item.id} 缺少 seed ${item.seed}`);
        assert.ok(item.expectedOpcodes.length > 0, `${item.id} 必须声明预期积木`);
    }
});
