import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';

// Idle snapshots model a gather rejection: the authoritative state never confirms
// gathering, and each one-second policy turn advances by the server's 30 ticks.
function exercise(map, team, seed, withObjectives = true) {
  const policy = createDeterministicPolicy(seed);
  const workers = [0, 1, 2, 3].map((id) => [id, team, 0, 0, 100, 'worker', 0, '', 1, 'idle', 0]);
  const soldier = [4, team, 0, 0, 100, 'infantry', 0, '', 1, null, 0];
  let owners = {};
  const observe = (tick, units = [...workers, soldier]) => toOpponentObservation({
    type: 'state', tick, mapId: map.id, fogOfWar: false,
    food: [100, 100], wood: [100, 100], units, buildings: [],
    resourceNodes: map.resourceNodes.map(({ id, type, stock }) => ({ id, type, stock })),
    objectives: withObjectives ? map.triggers.filter((trigger) => trigger.zone).map((trigger) => ({
      id: trigger.id, owner: owners[trigger.id] ?? -1, victory: trigger.victory === true,
      requires: trigger.requires ?? null, requiredOwner: owners[trigger.requires] ?? -1,
      ...(trigger.requiresAll ? {
        requiresAll: trigger.requiresAll,
        requiredOwners: trigger.requiresAll.map((id) => owners[id] ?? -1),
      } : {}),
    })) : [],
  }, team, map);
  const trace = [];
  const next = (tick, units) => {
    const commands = policy.next(observe(tick, units));
    trace.push(commands);
    for (const command of commands) {
      assert.ok(command.ids.length > 0, 'never emit an empty army order');
      assert.ok(command.ids.every((id) => command.type === 'gather' ? id < 4 : id === 4),
        'economy and combat orders own disjoint units');
    }
    return commands;
  };
  assert.ok(next(0).every(({ type }) => type === 'gather'), 'preserve the gather-first opening');
  const advance = next(30);
  assert.ok(advance.some(({ type }) => type === 'gather'), 'still retry unconfirmed gathering');
  assert.equal(advance.filter(({ type }) => type === 'attackMove').length, 1,
    'persistent gather retries cannot starve the opening attack');
  assert.ok(next(60).every(({ type }) => type === 'gather'));
  assert.ok(next(90).every(({ type }) => type === 'gather'), 'do not duplicate an unchanged tactical order');

  if (withObjectives) {
    owners = Object.fromEntries(map.triggers.map(({ id }) => [id, team]));
    next(120);
    next(150);
    const lost = map.triggers.find((trigger) => trigger.zone && !trigger.requires && !trigger.requiresAll?.length);
    assert.ok(lost, 'authored map has an unlocked objective');
    owners[lost.id] = 1 - team;
    next(180);
    const retake = next(210).find(({ type }) => type === 'attackMove');
    assert.ok(retake, 'retake runs within two decisions despite repeated gather failures');
    assert.equal(retake.x, lost.zone.column + lost.zone.width / 2 - map.width / 2);
    assert.equal(retake.z, lost.zone.row + lost.zone.height / 2 - map.height / 2);
    assert.ok(next(240).every(({ type }) => type === 'gather'));
    assert.ok(next(270).every(({ type }) => type === 'gather'), 'retake remains deduplicated');
  }
  assert.ok(next(300, workers).every(({ type }) => type === 'gather'));
  assert.ok(next(330, workers).every(({ type }) => type === 'gather'), 'army loss still permits gather retries');
  return trace;
}

for (const mapId of ['forked-vale', 'woodland-expanse']) {
  const map = JSON.parse(readFileSync(new URL(`../maps/${mapId}.json`, import.meta.url), 'utf8'));
  for (const team of [0, 1]) {
    for (const seed of [0, 20260925, 0xffff_ffff]) {
      for (const withObjectives of [true, false]) {
        assert.deepEqual(exercise(map, team, seed, withObjectives), exercise(map, team, seed, withObjectives),
          'same map, seat, seed and snapshots produce the same commands');
      }
    }
  }
}
console.log('PvE decision fairness passed: both maps/seats, three seeds, opening, retake, fallback, deduplication and army loss.');
