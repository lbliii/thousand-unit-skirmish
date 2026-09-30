import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrderAudioGate, workAudioEvents } from '../src/audio-policy.mjs';
const worker = (id, task, team = 0, x = 1) => [id, team, x, 0, 100, 'worker', 0, null, 1, null, 0, null, null, null, task];
test('execution is aggregated, local and nearby, with old snapshots, stopped and dead workers silent', () => {
  const rows = Array.from({ length: 1000 }, (_, id) => worker(id, 'wood'));
  rows.push(worker(1001, 'food'), worker(1002, 'repair'), worker(1003, 'food', 1), worker(1004, 'repair', 0, 100));
  assert.deepEqual(workAudioEvents(rows, { localTeam: 0 }), ['food', 'repair', 'wood'].map((resource) => ({ cue: 'work', kind: 'worker', resource })));
  assert.deepEqual(workAudioEvents(rows, { localTeam: null }), []);
  const dead = worker(0, 'wood'); dead[4] = 0;
  assert.deepEqual(workAudioEvents([dead, worker(1, null), worker(2, 'wood').slice(0, 14)], { localTeam: 0 }), []);
});
test('spoken success only follows applied token, ignores planning and rejects exactly once', () => {
  const gate = new OrderAudioGate();
  gate.sent('one', { cue: 'patrol' });
  assert.equal(gate.observe('one', 'PLANNING PATROL · 12 UNITS'), null);
  assert.equal(gate.observe('other', 'PATROL ORDER · 12 UNITS'), null);
  assert.deepEqual(gate.observe('one', 'PATROL ORDER · 12 UNITS'), { cue: 'patrol' });
  assert.equal(gate.observe('one', 'PATROL ORDER · 12 UNITS'), null);
  gate.sent('two', { cue: 'follow' });
  assert.equal(gate.observe('two', 'FOLLOW REJECTED · BAD TARGET'), null);
  assert.equal(gate.observe('two', 'FOLLOW ORDER · 3 UNITS'), null);
  gate.sent('three', { cue: 'repair' }); gate.reset();
  assert.equal(gate.observe('three', 'REPAIR ORDER · 3 WORKERS'), null);
  for (let i = 0; i < 100; i++) gate.sent(i, { cue: 'move' });
  assert.equal(gate.pending.size, 32);
});
