import assert from 'node:assert/strict';
import { createDeterministicPolicy } from '../src/pve-opponent.mjs';

function soldier(id, team, x, extra = {}) {
  return { id, team, generation: 1, kind: 'infantry', hp: 100,
    x, z: 0, focusedCount: 0, lastAttack: null, ...extra };
}

for (const team of [0, 1]) for (const seed of [0, 20260925, 0xffff_ffff]) {
  for (const withObjective of [true, false]) {
    const run = () => {
      const outside = team === 0 ? -20 : 20;
      const state = {
        schemaVersion: 1, team, tick: 0, map: { id: 'reinforcement-recovery', width: 64, height: 64 },
        fogOfWar: false, resources: { food: 0, wood: 0 },
        units: { friendly: [soldier(4, team, 0), soldier(6, team, outside, { focusedCount: 1 })], visibleEnemies: [] },
        buildings: { friendly: [], visibleEnemies: [] }, workerProduction: { queue: 0 }, resourceNodes: [],
        objectives: withObjective ? [{ id: 'goal', owner: -1, victory: true,
          zone: { column: 30, row: 30, width: 4, height: 4 } }] : [],
      };
      const policy = createDeterministicPolicy(seed);
      const next = (tick) => policy.next({ ...state, tick });
      assert.deepEqual(next(0), [{ type: 'attackMove', ids: [4, 6], x: 0, z: 0 }]);
      const reinforcement = soldier(5, team, outside);
      state.units.friendly.push(reinforcement);
      assert.deepEqual(next(30), [{ type: 'attackMove', ids: [5], x: 0, z: 0 }]);
      const retries = [];
      for (let tick = 60; tick <= 9000; tick += 30) {
        const orders = next(tick);
        if (orders.length) {
          assert.deepEqual(orders, [{ type: 'attackMove', ids: [5], x: 0, z: 0 }],
            'retry only the stranded reinforcement, not arrived or fighting soldiers');
          retries.push(tick);
        }
        assert.deepEqual(next(tick), [], 'duplicate observations never cause another retry');
      }
      assert.deepEqual(retries, [330, 930, 2130, 3930, 5730, 7530],
        'an arrived soldier must not suppress independent capped reinforcement retries');
      reinforcement.x += 0.6;
      assert.deepEqual(next(9030), [], 'reinforcement progress resets its own backoff');
      assert.deepEqual(next(9300), []);
      assert.deepEqual(next(9330), [{ type: 'attackMove', ids: [5], x: 0, z: 0 }]);
      reinforcement.x = 0;
      for (const tick of [9360, 9660, 12000]) assert.deepEqual(next(tick), [], 'arrival stops reinforcement retries');
      reinforcement.hp = 0;
      assert.deepEqual(next(12030), []);
      reinforcement.hp = 100;
      reinforcement.generation = 2;
      reinforcement.x = outside;
      assert.deepEqual(next(12060), [{ type: 'attackMove', ids: [5], x: 0, z: 0 }],
        'reused slots begin a fresh reinforcement watch');
      assert.deepEqual(next(12330), []);
      assert.deepEqual(next(12360), [{ type: 'attackMove', ids: [5], x: 0, z: 0 }]);
      return retries;
    };
    assert.deepEqual(run(), run(), 'same observations and seed reproduce the same retry schedule');
  }
}
console.log('PvE reinforcement recovery passed: both seats, three seeds, objective/fallback advances, isolated capped retries, combat/arrival protection, progress reset, and slot replacement.');
