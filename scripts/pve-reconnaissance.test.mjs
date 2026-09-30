import assert from 'node:assert/strict';
import test from 'node:test';
import { createReconnaissancePolicy } from '../src/pve-reconnaissance.mjs';
import { createDeterministicPolicy } from '../src/pve-opponent.mjs';

function fixture(team = 0) {
  const x = team ? 20 : -20;
  return { schemaVersion: 1, team, tick: 0, map: { width: 80, height: 64 }, fogOfWar: true,
    visibility: { columns: 80, rows: 64, data: Buffer.alloc(1280).toString('base64') },
    resources: { food: 0, wood: 0 }, resourceNodes: [], workerProduction: { queue: 0 },
    objectives: [{ id: 'goal', owner: -1, victory: true, zone: { column: 38, row: 30, width: 4, height: 4 } }],
    units: { friendly: [{ id: 4, generation: 7, kind: 'scout', hp: 60, team, x, z: .5 },
      { id: 5, generation: 7, kind: 'infantry', hp: 100, team, x, z: 2.5 }], visibleEnemies: [] },
    buildings: { friendly: [{ id: 100, team, type: 'town-center', complete: true, hp: 2400, x, z: .5 }], visibleEnemies: [] } };
}

test('both seats explore deterministically without army orders overwriting the Scout', () => {
  for (const team of [0, 1]) {
    const state = fixture(team), twins = [createReconnaissancePolicy(42), createReconnaissancePolicy(42)];
    const orders = twins.map(policy => policy.next(state));
    assert.deepEqual(orders[0], orders[1]);
    assert.deepEqual(orders[0].ids, [4]);
    assert.equal(orders[0].commands[0].type, 'move');
    assert.deepEqual(orders[0].commands[0].unitGenerations, [7]);
    const commands = createDeterministicPolicy(42).next(state);
    assert.equal(commands.filter(command => command.ids?.includes(4)).length, 1);
    assert.ok(commands.some(command => command.ids?.includes(5)), 'frontline Infantry retains its army order');
  }
});

test('observed threats trigger retreat; repeated snapshots retain the same order', () => {
  const state = fixture(), policy = createReconnaissancePolicy(42);
  policy.next(state);
  state.units.friendly[0].x = -10;
  state.units.visibleEnemies.push({ id: 20, kind: 'infantry', hp: 100, x: -5, z: .5 });
  state.tick = 30;
  const retreat = policy.next(state).commands[0];
  assert.equal(retreat.x, -19.5);
  assert.deepEqual(policy.next(state).commands, []);
  state.units.friendly[0].generation++;
  assert.deepEqual(policy.next(state).commands[0].unitGenerations, [8], 'a new entity generation gets a fresh order');
});

test('stalled exploration tries another bounded frontier after ten seconds', () => {
  const state = fixture(), policy = createReconnaissancePolicy(42);
  const first = policy.next(state).commands[0];
  state.tick = 299;
  assert.deepEqual(policy.next(state).commands, []);
  state.tick = 300;
  const retry = policy.next(state).commands[0];
  assert.notDeepEqual([retry.x, retry.z], [first.x, first.z]);
  assert.ok(Math.abs(retry.x) < 40 && Math.abs(retry.z) < 32);
});

test('fully explored fog avoids pointless new reconnaissance orders', () => {
  const state = fixture();
  state.visibility.data = Buffer.alloc(1280, 255).toString('base64');
  assert.deepEqual(createReconnaissancePolicy(42).next(state), { ids: [4], commands: [] });
});
