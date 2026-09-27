import assert from 'node:assert/strict';
import { createDeterministicPolicy } from '../src/pve-opponent.mjs';

function fixture(team, objectives = true) {
  return {
    schemaVersion: 1, team, tick: 0, map: { id: 'tactical-stall', width: 64, height: 64 },
    units: { friendly: [{ id: 4, generation: 1, kind: 'infantry', hp: 100,
      x: team === 0 ? -20 : 20, z: 0, focusedCount: 0, lastAttack: null }], visibleEnemies: [] },
    resourceNodes: [],
    objectives: objectives ? [{ id: 'center', owner: -1, victory: true,
      zone: { column: 30, row: 30, width: 4, height: 4 } }] : [],
  };
}
function advance(policy, state, tick) { return policy.next({ ...state, tick }); }

for (const team of [0, 1]) {
  for (const seed of [0, 20260925, 0xffff_ffff]) {
    for (const objectives of [true, false]) {
      const run = () => {
        const policy = createDeterministicPolicy(seed);
        const state = fixture(team, objectives);
        const orderTicks = [];
        for (let tick = 0; tick <= 6000; tick++) {
          const commands = advance(policy, state, tick);
          if (commands.length) {
            assert.deepEqual(commands, [{ type: 'attackMove', ids: [4], x: 0, z: 0 }]);
            orderTicks.push(tick);
          }
          assert.deepEqual(advance(policy, state, tick), [], 'repeated snapshots cannot trigger retries');
        }
        assert.deepEqual(orderTicks, [0, 300, 900, 2100, 3900, 5700],
          'stationary army retries with capped backoff, never at per-tick frequency');
        return orderTicks;
      };
      assert.deepEqual(run(), run(), 'identical snapshots and seeds yield identical retry timing');

      const state = fixture(team, objectives);
      const policy = createDeterministicPolicy(seed);
      advance(policy, state, 0);
      state.units.friendly[0].x += 0.6;
      assert.deepEqual(advance(policy, state, 299), [], 'movement restarts the stall clock');
      assert.deepEqual(advance(policy, state, 598), []);
      assert.equal(advance(policy, state, 599).length, 1);
      state.units.friendly[0].lastAttack = { tick: 899, x: 2, z: 0 };
      assert.deepEqual(advance(policy, state, 899), [], 'recent attacks prevent a retry');
      state.units.friendly[0].focusedCount = 1;
      assert.deepEqual(advance(policy, state, 1200), [], 'incoming focus prevents a retry');
      state.units.friendly[0].focusedCount = 0;
      assert.deepEqual(advance(policy, state, 1499), []);
      assert.equal(advance(policy, state, 1500).length, 1, 'stalled order recovers after combat ends');
      state.units.friendly[0].x = 0;
      for (const tick of [1800, 2400, 6000]) {
        assert.deepEqual(advance(policy, state, tick), [], 'objective occupancy or fallback arrival suppresses retries');
      }
    }
    for (const objectives of [true, false]) {
      const state = fixture(team, objectives);
      const policy = createDeterministicPolicy(seed);
      advance(policy, state, 0);
      state.units.friendly[0].hp = 0;
      assert.deepEqual(advance(policy, state, 300), [], 'no empty army orders');
      state.units.friendly[0] = { ...state.units.friendly[0], hp: 100, generation: 2 };
      assert.equal(advance(policy, state, 330).length, 1, 'replacement army gets a fresh tactical order');
    }
  }
}
console.log('PvE tactical retry passed: both seats, three seeds, capped backoff, repeated snapshots, movement, combat, arrival and army replacement.');
