import { UNIT_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function prepareAttackMovePaths()');
assert.ok(start >= 0, 'authoritative attack-move planning has a separate scheduler');
const scheduler = source.slice(start, source.indexOf('\nfunction getMoveVector(', start));

function fixture({ reverseIds = false, swapTeams = false, cached = false } = {}) {
  const grants = [];
  const units = Array.from({ length: 16 }, (_, index) => ({
    id: reverseIds ? 15 - index : index, team: (index % 2) ^ Number(swapTeams),
    x: index - 8, z: 0, hp: 100, kind: 'infantry', attackMove: true,
    attackTargetId: -1, attackBuildingTargetId: -1, attackMoveRouteReady: true,
    movePlanningPending: false, attackMoveScanTick: 0,
  })).sort((a, b) => a.id - b.id);
  const context = vm.createContext({
    units, attackFlowLastGrant: new WeakMap(), tickNumber: 1,
    findAttackMoveTarget: () => ({ id: 100 }),
    getUnitAttackPath(unit, target, budget) {
      if (cached && unit.x === -8) return { reachable: true, path: [1] };
      if (budget.built >= 1) return null;
      budget.built++;
      grants.push({ tick: context.tickNumber, x: unit.x, team: unit.team });
      return { reachable: true, path: [1] };
    },
  });
  vm.runInContext(scheduler, context);
  return { grants, units, tick() { vm.runInContext('prepareAttackMovePaths()', context); context.tickNumber++; } };
}

test('sustained opponents receive bounded service without extra flow builds', () => {
  const run = fixture();
  for (let tick = 0; tick < 32; tick++) run.tick();
  assert.equal(run.grants.length, 32);
  assert.equal(new Set(run.grants.map(g => g.tick)).size, 32, 'at most one build each tick');
  for (const unit of run.units) {
    const turns = run.grants.filter(g => g.x === unit.x).map(g => g.tick);
    assert.equal(turns.length, 2);
    assert.equal(turns[1] - turns[0], 16, 'every requester is served once per bounded round');
  }
});

test('physical service order is unchanged by seat and ID permutations', () => {
  const sequences = [];
  for (const reverseIds of [false, true]) for (const swapTeams of [false, true]) {
    const run = fixture({ reverseIds, swapTeams });
    for (let tick = 0; tick < 32; tick++) run.tick();
    sequences.push(run.grants.map(g => g.x));
  }
  for (const sequence of sequences) assert.deepEqual(sequence, sequences[0]);
});

test('cached requests do not consume the grant or starve uncached requests', () => {
  const run = fixture({ cached: true });
  for (let tick = 0; tick < 30; tick++) run.tick();
  assert.equal(run.grants.length, 30);
  assert.ok(run.grants.every(g => g.x !== -8));
  assert.equal(new Set(run.grants.slice(0, 15).map(g => g.x)).size, 15);
});

test('authoritative path helper keeps the one-build cap and allows cache hits', () => {
  const fields = new Map();
  let builds = 0;
  const context = vm.createContext({
    UNIT_DEFINITIONS, ATTACK_MOVE_MAX_FLOW_BUILDS_PER_TICK: 1, ATTACK_RANGE: 1, ARCHER_ATTACK_RANGE: 5,
    nearestOpenCell: cell => cell, worldToCell: x => x,
    walkableComponents: Array(100).fill(0), attackFlowFields: fields,
    getAttackFlowField(goal) {
      if (!fields.has(goal)) { builds++; fields.set(goal, { goal }); }
      return fields.get(goal);
    },
    pathFromAttackFlow: (_start, field) => [field.goal],
  });
  const from = source.indexOf('function getUnitAttackPath(');
  vm.runInContext(source.slice(from, start), context);
  const budget = { built: 0 };
  context.unit = { x: 0, z: 0, kind: 'infantry' };
  context.budget = budget;
  assert.ok(vm.runInContext('getUnitAttackPath(unit, {x:10,z:0}, budget)', context).reachable);
  assert.equal(vm.runInContext('getUnitAttackPath(unit, {x:20,z:0}, budget)', context), null);
  assert.ok(vm.runInContext('getUnitAttackPath(unit, {x:10,z:0}, budget)', context).reachable);
  assert.equal(builds, 1);
});
