import assert from 'node:assert/strict';
import { createProductionPolicy, PVE_PRODUCTION_LIMITS as limits } from '../src/pve-production.mjs';
import { createDeterministicPolicy } from '../src/pve-opponent.mjs';

function fixture(team) {
  const x = team === 0 ? -20 : 20;
  return {
    schemaVersion: 1, team, tick: 0, map: { id: 'production-budget', width: 80, height: 64 },
    fogOfWar: false, resources: { food: 150, wood: 250 },
    units: { friendly: Array.from({ length: 12 }, (_, id) => ({
      id, generation: 1, team, x, z: id < 4 ? 0 : 3, hp: 100,
      kind: id < 4 ? 'worker' : 'infantry', task: id < 4 ? 'idle' : null, cargo: 0,
    })), visibleEnemies: [] },
    buildings: { friendly: [], visibleEnemies: [] }, workerProduction: { queue: 0 },
    resourceNodes: [], objectives: [{ id: 'goal', owner: -1, victory: true,
      zone: { column: 38, row: 30, width: 4, height: 4 } }],
  };
}
const building = (team, extras = {}) => ({ id: 10, team, type: 'barracks', hp: 800,
  x: team === 0 ? -14 : 14, z: 0, complete: true, queue: 0, productionBlocked: false, ...extras });
function next(policy, state, tick) { return policy.next({ ...state, tick }); }

for (const team of [0, 1]) for (const seed of [0, 20260925, 0xffff_ffff]) {
  const twinState = fixture(team);
  const twins = [createProductionPolicy(seed), createProductionPolicy(seed)];
  for (const tick of [0, 300, 450, 750, 1350]) {
    assert.deepEqual(next(twins[0], twinState, tick), next(twins[1], twinState, tick), 'seeded placement replay is deterministic');
  }
  const state = fixture(team);
  const policy = createProductionPolicy(seed);
  assert.deepEqual(next(policy, state, 0), []);
  assert.deepEqual(next(policy, state, 299), [], 'ordinary opening precedes production');
  state.resources.wood = limits.barracksWoodCost + limits.woodReserve - 1;
  assert.deepEqual(next(policy, state, 300), [], 'preserve the wood reserve');
  state.resources.wood++;
  const attempt = next(policy, state, 301);
  assert.equal(attempt.length, 1);
  assert.equal(attempt[0].type, 'build');
  assert.equal(attempt[0].buildingType, 'barracks');
  assert.equal(attempt[0].ids.length, 1, 'leave other workers gathering');
  assert.deepEqual(attempt[0].unitGenerations, [1]);
  assert.deepEqual(next(policy, state, 301), [], 'same snapshot never spends twice');
  assert.deepEqual(next(policy, state, 450), [], 'wait before unconfirmed build retry');
  const retry = next(policy, state, 451);
  assert.equal(retry[0].type, 'build');
  assert.notDeepEqual([retry[0].x, retry[0].z], [attempt[0].x, attempt[0].z], 'rejected placement tries another candidate');
  state.buildings.friendly = [building(team, { complete: false })];
  state.units.friendly[0].task = 'building';
  assert.deepEqual(next(policy, state, 500), [], 'do not interrupt the builder');
  state.units.friendly[0].task = 'idle';
  const resume = next(policy, state, 650);
  assert.equal(resume[0].buildingId, 10, 'resume an unfinished Barracks without buying a second one');
  state.buildings.friendly[0].complete = true;
  assert.deepEqual(next(policy, state, 799), []);
  assert.deepEqual(next(policy, state, 800), [{ type: 'trainUnit', kind: 'spearman', buildingId: 10 }]);
  state.buildings.friendly[0].queue = 1;
  assert.deepEqual(next(policy, state, 801), [], 'one observed queued Infantry is enough');
  state.buildings.friendly = [];
  assert.equal(next(policy, state, 2000)[0]?.type, 'build', 'replace a destroyed Barracks within the existing budget');

  const rejected = createProductionPolicy(seed);
  const idle = fixture(team);
  next(rejected, idle, 0);
  const retryTicks = [];
  for (let tick = 1; tick <= 3200; tick++) if (next(rejected, idle, tick).length) retryTicks.push(tick);
  assert.deepEqual(retryTicks, [300, 450, 750, 1350, 2250, 3150], 'unconfirmed placement backs off to 30 seconds');

  for (const [label, mutate] of [
    ['food reserve', (s) => { s.resources.food = 99; }],
    ['busy queue', (s) => { s.buildings.friendly[0].queue = 1; }],
    ['blocked exit', (s) => { s.buildings.friendly[0].productionBlocked = true; }],
    ['military cap', (s) => { for (let id = 12; id < 16; id++) s.units.friendly.push({ ...s.units.friendly[4], id }); }],
    ['pending worker roster', (s) => { s.workerProduction.queue = 12; }],
    ['other military queue', (s) => { s.buildings.friendly.push(building(team, { id: 11, type: 'archery-range', queue: 4 })); }],
  ]) {
    const constrained = fixture(team);
    // Exercise recruitment guards with mounted infrastructure already present;
    // an independent Stable construction order is allowed before recruitment.
    constrained.buildings.friendly = [building(team), building(team, { id: 12, type: 'stable' })];
    mutate(constrained);
    const guarded = createProductionPolicy(seed);
    next(guarded, constrained, 0);
    assert.deepEqual(next(guarded, constrained, 300), [], label);
    if (label === 'military cap') {
      constrained.units.friendly.at(-1).hp = 0;
      assert.deepEqual(next(guarded, constrained, 301), [{ type: 'trainUnit', kind: 'spearman', buildingId: 10 }],
        'replace a casualty once alive plus queued military falls below the cap');
    }
  }
  const lowFood = fixture(team);
  lowFood.buildings.friendly = [building(team)];
  lowFood.resources.food = 100;
  const affordable = createProductionPolicy(seed);
  next(affordable, lowFood, 0);
  assert.deepEqual(next(affordable, lowFood, 300), [{ type: 'train', buildingId: 10 }]);
  assert.deepEqual(next(affordable, lowFood, 301), [], 'pending training cannot spend the same food again immediately');

  const hidden = fixture(team);
  hidden.fogOfWar = true;
  hidden.visibility = { columns: 80, rows: 64, data: Buffer.alloc(80 * 64 / 4).toString('base64') };
  const fogPolicy = createProductionPolicy(seed);
  next(fogPolicy, hidden, 0);
  assert.deepEqual(next(fogPolicy, hidden, 300), [], 'never place in unseen terrain');

  const combined = fixture(team);
  combined.resourceNodes = [{ id: 'food', type: 'food', stock: 100, x: -20, z: 8 },
    { id: 'wood', type: 'wood', stock: 100, x: -20, z: -8 }];
  const integrated = createDeterministicPolicy(seed);
  integrated.next(combined);
  const commands = next(integrated, combined, 300);
  const build = commands.find(({ type }) => type === 'build');
  assert.ok(build, 'the ordinary deterministic policy constructs a Barracks');
  assert.ok(commands.some(({ type }) => type === 'attackMove'), 'production cannot starve tactics');
  assert.ok(commands.filter(({ type }) => type === 'gather').every(({ ids }) => !ids.includes(build.ids[0])),
    'same-decision gather and construction never compete for a worker');

  const army = fixture(team);
  army.resources.wood = 0;
  const recruitment = createDeterministicPolicy(seed);
  recruitment.next(army);
  army.units.friendly.push({ ...army.units.friendly[4], id: 99 });
  assert.deepEqual(next(recruitment, army, 30), [{ type: 'attackMove', ids: [99], x: 0, z: 0 }],
    'reinforcement joins the existing objective without interrupting the original army');
  assert.deepEqual(next(recruitment, army, 30), []);
  army.units.friendly.at(-1).generation = 2;
  assert.deepEqual(next(recruitment, army, 60), [{ type: 'attackMove', ids: [99], x: 0, z: 0 }],
    'reused unit slots receive fresh orders');
}
console.log('PvE production passed: both seats/three seeds, placement and training budgets, bounded retries, one Barracks, builder recovery, visibility and reinforcement orders.');
