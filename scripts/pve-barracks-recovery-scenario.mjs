import assert from 'node:assert/strict';
import { createProductionPolicy, PVE_PRODUCTION_LIMITS as limits } from '../src/pve-production.mjs';

function fixture(team) {
  return {
    schemaVersion: 1, team, tick: 0, map: { id: 'barracks-recovery', width: 80, height: 64 },
    fogOfWar: false, resources: { food: 0, wood: 200 },
    units: { friendly: Array.from({ length: 4 }, (_, id) => ({
      id, team, generation: 1, kind: 'worker', hp: 100, task: 'idle', cargo: 0,
      x: team === 0 ? -20 : 20, z: 0,
    })), visibleEnemies: [] },
    buildings: { friendly: [{ id: 10, team, type: 'barracks', hp: 1800, complete: true,
      x: team === 0 ? -14.5 : 14.5, z: 0.5, queue: 0, productionBlocked: false }], visibleEnemies: [] },
    workerProduction: { queue: 0 }, resourceNodes: [], objectives: [],
  };
}
for (const team of [0, 1]) for (const seed of [0, 20260925, 0xffff_ffff]) {
  const run = () => {
    const state = fixture(team);
    const policy = createProductionPolicy(seed);
    const next = (tick) => policy.next({ ...state, tick });
    assert.deepEqual(next(0), []);
    assert.deepEqual(next(300), [], 'an existing Barracks never causes a second building purchase');
    state.buildings.friendly = [];
    const replacement = next(330);
    assert.equal(replacement.length, 1, 'destroyed Barracks must permit an affordable replacement');
    assert.equal(replacement[0].type, 'build');
    assert.equal(replacement[0].buildingType, 'barracks');
    assert.equal(replacement[0].ids.length, 1);
    assert.deepEqual(replacement[0].unitGenerations, [1]);
    assert.deepEqual(next(330), [], 'same observation cannot buy twice');
    assert.deepEqual(next(479), [], 'unconfirmed replacement waits for the existing retry interval');
    const retries = [330];
    for (let tick = 480; tick <= 3200; tick++) if (next(tick).length) retries.push(tick);
    assert.deepEqual(retries, [330, 480, 780, 1380, 2280, 3180], 'replacement rejection keeps capped backoff');

    const replacementBuilding = { ...fixture(team).buildings.friendly[0], id: 11, complete: false };
    state.buildings.friendly = [replacementBuilding];
    state.resources.wood -= limits.barracksWoodCost;
    state.units.friendly[0].task = 'building';
    assert.deepEqual(next(3210), [], 'observed replacement must suppress further purchases');
    state.units.friendly[0].hp = 0;
    assert.deepEqual(next(3359), []);
    const resumed = next(3360);
    assert.equal(resumed.length, 1);
    assert.equal(resumed[0].buildingId, 11, 'replace a killed builder by resuming the same foundation');
    assert.deepEqual(resumed[0].ids, [1]);
    assert.ok(!Object.hasOwn(resumed[0], 'buildingType'));
    replacementBuilding.complete = true;
    state.resources.food = 100;
    assert.deepEqual(next(3510), [{ type: 'train', buildingId: 11 }], 'completed replacement resumes Infantry production');
    replacementBuilding.queue = 1;
    assert.deepEqual(next(3511), [], 'replacement still respects its one-unit queue');
    state.buildings.friendly = [];
    assert.deepEqual(next(4000), [], 'a second loss cannot spend below the wood reserve');
    state.resources.wood = 199;
    assert.deepEqual(next(4001), []);
    state.resources.wood = 200;
    state.units.friendly[2].hp = 0;
    state.units.friendly[3].hp = 0;
    assert.deepEqual(next(4002), [], 'retain a second worker for the economy before constructing');
    state.units.friendly[2].hp = 100;
    assert.equal(next(4003)[0]?.type, 'build', 'restored economy can recover after another loss');
    return { replacement, retries };
  };
  assert.deepEqual(run(), run(), 'seeded recovery is deterministic');
}
console.log('PvE Barracks recovery passed: both seats, three seeds, replacement, bounded retries, builder loss, production resumption, reserves, and repeated destruction.');
