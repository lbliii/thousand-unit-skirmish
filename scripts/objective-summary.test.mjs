import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectiveSummary, rememberNotice } from '../src/objective-summary.mjs';
const map = { victoryMode: 'all', victoryHoldSeconds: 30, triggers: [
  { id: 'gate', name: 'North gate', requiredUnits: 2 },
  { id: 'keep', name: 'Keep', requiredUnits: 3, requiresAll: ['gate'], victory: true },
] };
test('next action follows missing prerequisites and advances after capture', () => {
  assert.match(objectiveSummary(map, [], { team: 0 }).action, /North gate/);
  assert.match(objectiveSummary(map, [{ id: 'gate', owner: 0 }], { team: 0 }).action, /Keep/);
  assert.match(objectiveSummary(map, [{ id: 'gate', owner: 0 }, { id: 'keep', owner: 0 }], { team: 0 }).action, /Defend/);
});
test('both teams hold countdowns and deadline stay visible with closed details', () => {
  const result = objectiveSummary({ ...map, timedVictory: { afterSeconds: 90, objectiveId: 'keep' } }, [], {
    team: 0, started: true, elapsed: 70, hold: { activeTeams: [true, true], progressSeconds: [10, 20] },
  });
  assert.equal(result.urgent, 'Azure wins in 20s · Ember wins in 10s · Deadline 20s · Keep');
  assert.equal(objectiveSummary(map, [], { started: false, hold: { activeTeams: [true] } }).urgent, '');
});
test('any-zone victory defends existing control and spectator receives no invented order', () => {
  const any = { ...map, victoryMode: 'any', triggers: [...map.triggers, { id: 'other', name: 'Other', victory: true }] };
  assert.match(objectiveSummary(any, [{ id: 'other', owner: 0 }], { team: 0 }).action, /Defend/);
  assert.match(objectiveSummary(map).action, /Spectating/);
  assert.equal(objectiveSummary(map, [], { winner: 2 }).action, 'Match drawn');
});
test('cyclic prerequisites cannot stall the UI', () => {
  const cyclic = { triggers: [{ id: 'a', name: 'A', requires: 'b', victory: true }, { id: 'b', name: 'B', requires: 'a' }] };
  assert.ok(objectiveSummary(cyclic, [], { team: 0 }).action);
});
test('recent repeated feedback is grouped without discarding different rejections', () => {
  let history = rememberNotice([], 'NEED WOOD', 0);
  history = rememberNotice(history, 'QUEUE FULL', 1);
  history = rememberNotice(history, 'NEED WOOD', 2);
  assert.deepEqual(history.map(({ text, count }) => [text, count]), [['NEED WOOD', 2], ['QUEUE FULL', 1]]);
  for (let i = 0; i < 20; i++) history = rememberNotice(history, `Notice ${i}`, 100 + i);
  assert.equal(history.length, 12);
});
