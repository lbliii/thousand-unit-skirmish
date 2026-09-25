import assert from 'node:assert/strict';
import { CombatAudioGate, cueForNotice, isLocalRejection } from '../src/audio-policy.mjs';
import { createGameAudio, readAudioSettings } from '../src/audio.mjs';

assert.equal(cueForNotice('MOVE ORDER · 400 UNITS', { localTeam: 0, tokenized: true }), null);
assert.equal(cueForNotice('MOVE REJECTED · TARGET UNREACHABLE', { localTeam: 0, tokenized: true }), 'reject');
assert.equal(cueForNotice('WORKER QUEUED · 1/5 · 50 FOOD', { localTeam: 0 }), 'queue');
assert.equal(cueForNotice('AZURE BARRACKS COMPLETE · TRAIN INFANTRY', { localTeam: 0 }), 'complete');
assert.equal(cueForNotice('EMBER BARRACKS COMPLETE · TRAIN INFANTRY', { localTeam: 0 }), null);
assert.equal(cueForNotice('ARCHERY RANGE PLACED · WORKERS BUILDING', { localTeam: 0, tokenized: true }), 'build');
assert.equal(cueForNotice('AZURE BARRACKS DESTROYED · PRODUCTION QUEUE LOST', { localTeam: 0 }), 'base-lost');
assert.equal(cueForNotice('EMBER BARRACKS DESTROYED · PRODUCTION QUEUE LOST', { localTeam: 0 }), null);
assert.equal(cueForNotice('RESOURCE NODE EMPTY · OAK-2', { localTeam: 0 }), 'resource-empty');
assert.equal(cueForNotice('AZURE WORKER READY', { localTeam: 0 }), 'complete');
assert.equal(cueForNotice('UNIT CAP REACHED · TRAINING BLOCKED', { localTeam: 0 }), 'reject');
assert.equal(cueForNotice('ORDER CANCELLED · TARGET LOST', { localTeam: 0 }), 'reject');
assert.equal(isLocalRejection('SELECT YOUR UNITS BEFORE ISSUING AN ORDER'), true);
assert.equal(isLocalRejection('BARRACKS SITE BLOCKED · CHOOSE AN OPEN 3 × 3 AREA'), true);
assert.equal(isLocalRejection('YOUR ARMY SELECTED · 500'), false);

const gate = new CombatAudioGate();
assert.equal(gate.observe({ friendlyDamage: 750 }, 1000), 'battle-alert');
for (let i = 0; i < 2000; i++) {
  assert.equal(gate.observe({ friendlyDamage: 1000 }, 1010 + i * 10), null);
}
assert.equal(gate.observe({ friendlyDamage: 50 }, 30000), 'battle-alert');
assert.equal(gate.observe({ selectedDamage: 30, friendlyDamage: 30 }, 30010), 'selected-alert');
assert.equal(gate.observe({ selectedDamage: 30, friendlyDamage: 30 }, 30020), null);
assert.equal(gate.observe({ buildingDamage: 2, selectedDamage: 30 }, 30030), 'base-alert');
assert.equal(gate.observe({ buildingDamage: 2 }, 30040), null);
gate.reset();
assert.equal(gate.observe({ friendlyDamage: 1 }, 30050), 'battle-alert');

const saved = { getItem: () => JSON.stringify({ enabled: false, volume: 4, ambience: false }) };
assert.deepEqual(readAudioSettings(saved), { enabled: false, volume: 1, ambience: false });
assert.deepEqual(readAudioSettings({ getItem: () => '{' }), { enabled: true, volume: 0.5, ambience: true });

let oscillators = 0;
let createdContext;
const parameter = () => ({
  value: 0, lastTarget: null,
  setValueAtTime() {}, exponentialRampToValueAtTime() {},
  setTargetAtTime(value) { this.lastTarget = value; },
});
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {} });
class FakeAudioContext {
  constructor() { createdContext = this; }
  state = 'running';
  suspendCalls = 0;
  resumeCalls = 0;
  currentTime = 0;
  sampleRate = 100;
  destination = node();
  gains = [];
  createGain() { const gain = { ...node(), gain: parameter() }; this.gains.push(gain); return gain; }
  createOscillator() { oscillators++; return { ...node(), frequency: parameter(), onended: null }; }
  createBuffer() { return { getChannelData: () => new Float32Array(300) }; }
  createBufferSource() { return node(); }
  createBiquadFilter() { return { ...node(), frequency: parameter() }; }
  resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
const oldAudioContext = globalThis.AudioContext;
globalThis.AudioContext = FakeAudioContext;
try {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const statuses = [];
  const cues = [];
  const audio = createGameAudio({ storage, doc, onStatusChange: (status) => statuses.push(status), onCue: (cue) => cues.push(cue) });
  assert.equal(audio.getStatus(), 'waiting');
  assert.equal(audio.play('objective'), false, 'network events before a gesture cannot queue sounds');
  assert.equal(createdContext, undefined, 'pre-gesture events must not create an audio context');
  audio.unlock();
  assert.equal(audio.play('select'), true);
  assert.deepEqual(cues, ['select']);
  assert.equal(audio.getStatus(), 'running');
  assert.equal(oscillators, 1);
  assert.equal(audio.play('building-complete'), true, 'finished construction schedules its own short cue');
  assert.equal(oscillators, 3, 'building completion is a restrained two-part cue');
  assert.equal(cues.at(-1), 'building-complete');
  assert.equal(audio.play('building-complete'), false, 'repeated construction completions are rate limited');
  for (let i = 0; i < 2000; i++) audio.play('move');
  assert.equal(oscillators, 4, 'two thousand same-frame move orders make one move tone');
  assert.deepEqual(cues, ['select', 'building-complete', 'move']);
  audio.setSettings({ enabled: false });
  assert.equal(audio.getStatus(), 'muted');
  assert.equal(createdContext.suspendCalls, 1);
  assert.equal(audio.play('objective'), false);
  assert.equal(oscillators, 4);
  audio.setSettings({ enabled: true, volume: 0 });
  assert.equal(createdContext.suspendCalls, 2);
  assert.equal(audio.play('victory'), false);
  assert.equal(oscillators, 4);
  audio.setSettings({ enabled: true, volume: 0.3, ambience: false });
  assert.equal(audio.getStatus(), 'running');
  assert.equal(createdContext.resumeCalls, 1);
  assert.deepEqual(readAudioSettings(storage), { enabled: true, volume: 0.3, ambience: false });
  assert.equal(createdContext.gains[0].gain.lastTarget, 0.3 * 0.78);
  assert.equal(createdContext.gains[2].gain.lastTarget, 0);
  audio.setSettings({ ambience: true });
  assert.equal(audio.play('base-lost'), true);
  assert.equal(createdContext.gains[2].gain.lastTarget, 0.045, 'tactical alert ducks ambience');
  assert.equal(audio.play('base-lost'), false, 'repeated building losses are rate limited');
  assert.equal(audio.play('resource-empty'), true);
  for (const cue of ['attack', 'gather', 'build', 'queue']) audio.play(cue);
  const saturatedCount = oscillators;
  assert.equal(saturatedCount, 12, 'routine cues stop at twelve active voices');
  assert.equal(audio.play('objective'), true);
  assert.equal(oscillators, 14, 'priority cue retains room above routine limit');
  assert.equal(cues.at(-1), 'objective');
  doc.hidden = true;
  assert.equal(audio.play('defeat'), false, 'hidden tab does not schedule sounds');
  assert.equal(oscillators, 14);
  assert.ok(statuses.includes('muted') && statuses.includes('running'));
  audio.dispose();
} finally {
  if (oldAudioContext === undefined) delete globalThis.AudioContext;
  else globalThis.AudioContext = oldAudioContext;
}

console.log('Audio policy scenario passed.');
