import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductionPolicy } from '../src/pve-production.mjs';
for (const team of [0, 1]) test(`AI builds and resumes capacity using its own observation for seat ${team}`, () => {
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    population: { used: 12, reserved: 3, capacity: 15, available: 0 }, resources: { food: 500, wood: 500 },
    units: { friendly: Array.from({ length: 12 }, (_, id) => ({ id, generation: 1, team, hp: 100,
      x: team === 0 ? -20 : 20, z: 0, kind: id < 4 ? 'worker' : 'infantry', task: 'idle', cargo: 0 })), visibleEnemies: [] },
    buildings: { friendly: [{ id: 9, team, type: 'barracks', complete: true, hp: 1800, queue: 0, x: 0, z: 0 }], visibleEnemies: [] },
    objectives: [], resourceNodes: [], workerProduction: { queue: 3 } };
  const policy = createProductionPolicy(42);
  const next = (tick) => policy.next({ ...state, tick });
  assert.deepEqual(next(0), []);
  const build = next(300);
  assert.equal(build[0].buildingType, 'house');
  assert.deepEqual(next(301), [], 'unconfirmed capacity purchase backs off');
  state.buildings.friendly.push({ id: 10, team, type: 'house', complete: false, hp: 800, queue: 0, x: build[0].x, z: build[0].z });
  assert.deepEqual(next(450), [{ type: 'build', ids: [0], unitGenerations: [1], buildingId: 10 }], 'resume a foundation instead of buying again');
  state.units.friendly[0].task = 'building';
  assert.deepEqual(next(451), []);
  state.units.friendly[0].task = 'idle'; state.buildings.friendly[1].complete = true;
  state.population = { used: 12, reserved: 3, capacity: 23, available: 8 };
  state.resources.wood = 200; // Keep this capacity case below the Stable investment reserve.
  assert.equal(next(601)[0].type, 'trainUnit', 'production resumes after observed capacity arrives');
  state.buildings.friendly.pop(); state.population = { used: 15, reserved: 4, capacity: 15, available: 0 };
  assert.equal(next(901)[0].buildingType, 'house', 'capacity loss is rebuilt');
  state.population = { used: 1000, reserved: 0, capacity: 1000, available: 0 };
  assert.deepEqual(next(1501), [], 'Houses cannot bypass the safety ceiling');
});

for (const team of [0, 1]) test(`AI shortens remote resource trips and resumes its Storehouse for seat ${team}`, () => {
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    resources: { food: 500, wood: 500 }, units: { friendly: [
      { id: 0, generation: 1, team, hp: 100, x: team ? 20 : -20, z: 0, kind: 'worker', task: 'gathering', cargo: 0 },
      { id: 1, team, hp: 100, x: 0, z: 0, kind: 'infantry' },
      { id: 2, team, hp: 100, x: 0, z: 0, kind: 'infantry' }], visibleEnemies: [] },
    buildings: { friendly: [{ id: 9, team, type: 'barracks', complete: true, hp: 1800, queue: 0, x: 0, z: 10 }], visibleEnemies: [] },
    objectives: [], resourceNodes: [{ id: 'remote', type: 'food', stock: 1000, x: team ? 3 : -3, z: 0 }] };
  const policy = createProductionPolicy(42); policy.next(state);
  const build = policy.next({ ...state, tick: 300 });
  assert.equal(build[0].buildingType, 'storehouse');
  assert.deepEqual(policy.next({ ...state, tick: 301 }), []);
  state.buildings.friendly.push({ id: 10, team, type: 'storehouse', complete: false, hp: 1200, queue: 0, x: build[0].x, z: build[0].z });
  assert.equal(policy.next({ ...state, tick: 450 })[0].buildingId, 10);
  state.buildings.friendly.pop();
  assert.equal(policy.next({ ...state, tick: 750 })[0].buildingType, 'storehouse', 'a lost remote drop-off can be rebuilt');
});

for (const team of [0, 1]) test(`AI repairs observed friendly damage without repeating active work for seat ${team}`, () => {
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    resources: { food: 500, wood: 500 }, units: { friendly: [
      { id: 0, generation: 1, team, hp: 100, x: team ? 20 : -20, z: 0, kind: 'worker', task: 'idle', cargo: 0 }], visibleEnemies: [] },
    buildings: { friendly: [{ id: 9, team, type: 'barracks', complete: true, hp: 900, maxHp: 1800, queue: 0, x: 0, z: 10 }], visibleEnemies: [] },
    objectives: [], resourceNodes: [] };
  const policy = createProductionPolicy(42); policy.next(state);
  assert.deepEqual(policy.next({ ...state, tick: 300 }), [{ type: 'repairBuilding', buildingId: 9, ids: [0], unitGenerations: [1] }]);
  state.units.friendly[0].task = 'repairing';
  assert.deepEqual(policy.next({ ...state, tick: 600 }), []);
  state.units.friendly[0].task = 'idle'; state.resources.wood = 0;
  assert.equal(policy.next({ ...state, tick: 900 })[0]?.type, 'train', 'repair cannot drain a missing wood reserve');
});

for (const team of [0, 1]) test(`AI expands and recovers Worker production using visible centers for seat ${team}`, () => {
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    resources: { food: 500, wood: 600 }, units: { friendly: Array.from({ length: 8 }, (_, id) => ({
      id, generation: 1, team, hp: 100, x: team ? 20 : -20, z: 0, kind: id < 4 ? 'worker' : 'infantry', task: 'idle', cargo: 0 })), visibleEnemies: [] },
    buildings: { friendly: [
      { id: 9, team, type: 'barracks', complete: true, hp: 1800, queue: 0, x: 0, z: 10 },
      { id: 10, team, type: 'storehouse', complete: true, hp: 1200, queue: 0, x: 0, z: -10 },
      { id: 1_000_000_000 + team, team, type: 'town-center', home: true, complete: true, hp: 2400, queue: 0, x: team ? 23 : -23, z: 0 }], visibleEnemies: [] },
    objectives: [], resourceNodes: [{ id: 'remote', type: 'food', stock: 1000, x: team ? 3 : -3, z: 0 }] };
  const policy = createProductionPolicy(42); policy.next(state);
  const build = policy.next({ ...state, tick: 300 });
  assert.equal(build[0].buildingType, 'town-center');
  state.buildings.friendly.push({ id: 11, team, type: 'town-center', home: false, complete: false, hp: 2400, queue: 0, x: build[0].x, z: build[0].z });
  assert.equal(policy.next({ ...state, tick: 450 })[0].buildingId, 11, 'resume the same expansion');
  state.buildings.friendly[3].complete = true;
  state.buildings.friendly[3].productionOptions = [{ kind: 'worker', available: true }];
  state.units.friendly = state.units.friendly.filter((unit) => unit.kind !== 'worker');
  state.buildings.friendly = state.buildings.friendly.filter((building) => !building.home);
  assert.deepEqual(policy.next({ ...state, tick: 750 }), [{ type: 'trainUnit', kind: 'worker', buildingId: 11 }], 'a surviving expansion replaces lost Workers');
});

for (const team of [0, 1]) test(`AI defends a visible home threat and resumes one tower for seat ${team}`, () => {
  const x = team ? 20 : -20;
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 }, resources: { food: 300, wood: 200 },
    units: { friendly: Array.from({ length: 12 }, (_, id) => ({ id, generation: 1, team, hp: 100, x, z: 0,
      kind: id < 4 ? 'worker' : 'infantry', task: 'idle', cargo: 0 })), visibleEnemies: [{ id: 20, team: 1 - team, hp: 100, x: x + 10, z: 0 }] },
    buildings: { friendly: [{ id: 9, team, type: 'barracks', complete: true, hp: 1800, queue: 0, x: 0, z: 10 }], visibleEnemies: [] },
    objectives: [], resourceNodes: [] };
  const policy = createProductionPolicy(42); policy.next(state);
  const build = policy.next({ ...state, tick: 300 }); assert.equal(build[0].buildingType, 'watchtower');
  state.units.visibleEnemies = [];
  state.buildings.friendly.push({ id: 10, team, type: 'watchtower', complete: false, hp: 1200, queue: 0, x: build[0].x, z: build[0].z });
  assert.equal(policy.next({ ...state, tick: 450 })[0].buildingId, 10, 'finish a paid defense after the threat leaves view');
  state.buildings.friendly[1].complete = true;
  assert.equal(policy.next({ ...state, tick: 750 })[0].type, 'trainUnit', 'one tower is enough and army production continues');
});

for (const team of [0, 1]) test(`AI acquires one Stable, trains a bounded mounted mix and counters observed riders for seat ${team}`, () => {
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    population: { used: 8, reserved: 0, capacity: 23, available: 15 }, resources: { food: 600, wood: 600 },
    units: { friendly: Array.from({ length: 8 }, (_, id) => ({ id, generation: 1, team, hp: 100,
      x: team ? 20 : -20, z: 0, kind: id < 4 ? 'worker' : 'infantry', task: 'idle', cargo: 0 })), visibleEnemies: [] },
    buildings: { friendly: [{ id: 9, team, type: 'barracks', complete: true, hp: 1800, queue: 0, x: 0, z: 10,
      productionOptions: [{ kind: 'infantry', available: true }, { kind: 'spearman', available: true }] }], visibleEnemies: [] },
    objectives: [], resourceNodes: [] };
  const policy = createProductionPolicy(42); policy.next(state);
  const build = policy.next({ ...state, tick: 300 }); assert.equal(build[0].buildingType, 'stable');
  assert.deepEqual(policy.next({ ...state, tick: 301 }), []);
  const stable = { id: 10, team, type: 'stable', hp: 1600, complete: false, queue: 0, x: build[0].x, z: build[0].z,
    productionOptions: [{ kind: 'scout', available: true }, { kind: 'rider', available: true }] };
  state.buildings.friendly.push(stable);
  assert.equal(policy.next({ ...state, tick: 450 })[0].buildingId, 10);
  stable.complete = true;
  assert.equal(policy.next({ ...state, tick: 750 })[0].kind, 'scout');
  state.units.friendly.push({ id: 30, team, hp: 60, kind: 'scout' });
  assert.equal(policy.next({ ...state, tick: 1500 })[0].kind, 'rider');
  state.units.friendly.push({ id: 31, team, hp: 130, kind: 'rider' }, { id: 32, team, hp: 130, kind: 'rider' });
  assert.equal(policy.next({ ...state, tick: 2400 })[0].kind, 'spearman', 'mounted production stops at one Scout and two Riders');
  state.units.friendly.pop();
  state.units.visibleEnemies = [{ id: 99, team: 1 - team, hp: 130, kind: 'rider', x: 0, z: 0 }];
  assert.equal(policy.next({ ...state, tick: 3300 })[0].kind, 'spearman', 'visible mounted threat takes priority over another rider');
  state.units.visibleEnemies = [];
  assert.equal(policy.next({ ...state, tick: 4200 })[0].kind, 'rider', 'out-of-sight threats are not read from hidden state');
});

for (const team of [0, 1]) test(`AI buys available progression with reserves and respects one active project for seat ${team}`, () => {
  const state = { team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    resources: { food: 600, wood: 600 }, population: { available: 12, capacity: 23 }, research: { active: null },
    units: { friendly: Array.from({ length: 10 }, (_, id) => ({ id, team, hp: 100, generation: 1, x: team ? 20 : -20,
      z: 0, kind: id < 4 ? 'worker' : 'infantry', cargo: 0, task: 'idle' })), visibleEnemies: [] },
    buildings: { friendly: [{ id: 7, team, type: 'barracks', complete: true, hp: 1800, queue: 0,
      researchOptions: [{ upgrade: 'military-armor', available: false }] },
      { id: 1_000_000_000 + team, team, type: 'town-center', home: true, complete: true, hp: 2400, queue: 0,
        researchOptions: [{ upgrade: 'military-tier-2', available: true }] }], visibleEnemies: [] }, objectives: [], resourceNodes: [] };
  const policy = createProductionPolicy(42); policy.next(state);
  assert.deepEqual(policy.next({ ...state, tick: 300 }), [{ type: 'researchUpgrade', buildingId: 1_000_000_000 + team, upgrade: 'military-tier-2' }]);
  state.research.active = { type: 'military-tier-2' };
  assert.ok(policy.next({ ...state, tick: 450 }).every(command => command.type !== 'researchUpgrade'));
  state.research.active = null; state.research.militaryTier2 = true;
  state.buildings.friendly[1].researchOptions[0].available = false;
  state.buildings.friendly[0].researchOptions[0].available = true;
  assert.deepEqual(policy.next({ ...state, tick: 750 }), [{ type: 'researchUpgrade', buildingId: 7, upgrade: 'military-armor' }]);
  state.resources.food = 100;
  assert.ok(policy.next({ ...state, tick: 1350 }).every(command => command.type !== 'researchUpgrade'), 'research preserves food for ongoing production');
});
