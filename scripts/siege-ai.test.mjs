import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductionPolicy } from '../src/pve-production.mjs';
import { createDeterministicPolicy } from '../src/pve-opponent.mjs';

function fixture(team) {
  return { schemaVersion: 1, team, tick: 0, fogOfWar: false, map: { width: 80, height: 64 },
    resources: { food: 700, wood: 700 }, population: { capacity: 23, available: 13 }, research: { militaryTier2: true, active: null },
    units: { friendly: Array.from({ length: 10 }, (_, id) => ({ id, team, generation: 1, hp: 100,
      x: team ? 20 : -20, z: 0, kind: id < 4 ? 'worker' : 'infantry', task: 'idle', cargo: 0 })), visibleEnemies: [] },
    buildings: { friendly: [{ id: 8, team, type: 'barracks', complete: true, hp: 1800, queue: 0, x: 0, z: 10 },
      { id: 9, team, type: 'stable', complete: true, hp: 1600, queue: 0, x: 0, z: -10 }],
      visibleEnemies: [{ id: 40, team: 1 - team, type: 'watchtower', complete: true, hp: 1200, x: 0, z: 0 }] },
    workerProduction: { queue: 0 }, objectives: [], resourceNodes: [] };
}
for (const team of [0, 1]) test(`AI acquires siege against observed defenses and resumes one Workshop for seat ${team}`, () => {
  const state = fixture(team); const policy = createProductionPolicy(42); policy.next(state);
  const build = policy.next({ ...state, tick: 300 }); assert.equal(build[0].buildingType, 'workshop');
  const workshop = { id: 10, team, type: 'workshop', hp: 1600, complete: false, queue: 0, x: build[0].x, z: build[0].z };
  state.buildings.friendly.push(workshop); state.buildings.visibleEnemies = [];
  assert.equal(policy.next({ ...state, tick: 450 })[0].buildingId, 10, 'finish a paid foundation when the enemy leaves view');
  workshop.complete = true; workshop.researchOptions = [{ upgrade: 'siege-engineering', available: true }];
  assert.equal(policy.next({ ...state, tick: 750 })[0].upgrade, 'siege-engineering');
  workshop.researchOptions[0].available = false; state.research.siegeEngineering = true;
  workshop.productionOptions = [{ kind: 'siege-engine', available: true }];
  state.buildings.visibleEnemies = fixture(team).buildings.visibleEnemies;
  assert.equal(policy.next({ ...state, tick: 1350 })[0].kind, 'siege-engine');
  state.units.friendly.push({ id: 20, team, hp: 90, kind: 'siege-engine' }, { id: 21, team, hp: 90, kind: 'siege-engine' });
  assert.ok(policy.next({ ...state, tick: 2250 }).every(command => command.kind !== 'siege-engine'), 'two engines are the bounded target');
});
for (const team of [0, 1]) test(`AI assigns siege to visible towers, retries a stall and releases lost targets for seat ${team}`, () => {
  const state = fixture(team); state.units.friendly.push({ id: 20, generation: 2, team, hp: 90,
    kind: 'siege-engine', x: team ? 20 : -20, z: 0, lastAttack: null });
  const policy = createDeterministicPolicy(42);
  const first = policy.next(state);
  const assault = first.find(command => command.type === 'attackBuilding');
  assert.deepEqual(assault, { type: 'attackBuilding', ids: [20], unitGenerations: [2], buildingId: 40 });
  assert.ok(first.find(command => command.type === 'attackMove').ids.every(id => id !== 20), 'army orders cannot overwrite the siege assault');
  assert.ok(policy.next({ ...state, tick: 30 }).every(command => command.type !== 'attackBuilding'), 'avoid routine repeated assault commands');
  assert.ok(policy.next({ ...state, tick: 300 }).some(command => command.type === 'attackBuilding'), 'retry an observed stalled engine after ten seconds');
  state.units.friendly.at(-1).lastAttack = { tick: 310 };
  assert.ok(policy.next({ ...state, tick: 600 }).every(command => command.type !== 'attackBuilding'), 'ongoing attacks keep their order');
  state.buildings.visibleEnemies = [];
  assert.ok(policy.next({ ...state, tick: 630 }).some(command => command.type === 'attackMove' && command.ids.includes(20)), 'lost defense releases the engine to the army');
});

for (const team of [0, 1]) test(`AI reserves its last two army slots for observed-defense counters for seat ${team}`, () => {
  const state = fixture(team);
  for (let id = 10; id < 14; id++) state.units.friendly.push({ id, team, generation: 1, hp: 100,
    kind: 'infantry', x: team ? 20 : -20, z: 0 });
  state.buildings.friendly.push({ id: 10, team, type: 'workshop', complete: true, hp: 1600, queue: 0,
    x: 0, z: 12, productionOptions: [{ kind: 'siege-engine', available: false }] });
  state.research.active = { upgrade: 'siege-engineering', remaining: 15 };
  const policy = createProductionPolicy(42);
  policy.next(state);
  assert.ok(policy.next({ ...state, tick: 300 }).every(command => command.type !== 'trainUnit'),
    'ordinary recruits must not fill the two engine slots while the unlock is pending');
  state.research.active = null;
  state.research.siegeEngineering = true;
  state.buildings.friendly.at(-1).productionOptions[0].available = true;
  assert.equal(policy.next({ ...state, tick: 750 })[0].kind, 'siege-engine');
});

for (const team of [0, 1]) test(`AI expands capacity for a three-population engine for seat ${team}`, () => {
  const state = fixture(team);
  state.population.available = 2;
  const policy = createProductionPolicy(42);
  policy.next(state);
  assert.equal(policy.next({ ...state, tick: 300 })[0].buildingType, 'house',
    'two free population is insufficient for the visible-defense counter');
});
