import assert from 'node:assert/strict';
import { createGameAudio } from '../src/audio.mjs';

const previousContext = globalThis.AudioContext;
const scheduled = [];
let stopped = 0;
const parameter = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect() {}, disconnect() {}, start(...args) { scheduled.push(args); }, stop() { stopped++; } });
class FakeContext {
  state = 'running';
  currentTime = 10;
  sampleRate = 100;
  destination = node();
  createGain() { return { ...node(), gain: parameter() }; }
  createBiquadFilter() { return { ...node(), frequency: parameter(), Q: parameter() }; }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return { ...node(), onended: null, buffer: null }; }
  createOscillator() { return { ...node(), frequency: parameter() }; }
  async decodeAudioData(bytes) {
    if (new Uint8Array(bytes)[0] === 255) throw new Error('Unsupported codec');
    return { duration: 1, length: 100, numberOfChannels: 1 };
  }
  close() { return Promise.resolve(); }
}
const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
const captions = [];
const cues = [];
const statuses = [];
const pack = { id: 'fixture', name: 'Fixture', compositions: [], profiles: [{ id: 'field', bindings: {
  'unit.worker.select': { bus: 'voice', variants: [{ sourceId: 'ready', caption: 'Ready worker' }] },
  'unit.worker.gather.wood': { bus: 'voice', variants: [{ sourceId: 'wood' }] },
  'unit.worker.gather.food': { bus: 'voice', variants: [{ sourceId: 'food' }] },
  'cue.base-alert': { bus: 'voice', variants: [{ sourceId: 'danger' }] },
}, music: {} }] };
const blobs = { ready: new Blob([Uint8Array.of(1)]), wood: new Blob([Uint8Array.of(2)]), food: new Blob([Uint8Array.of(3)]), danger: new Blob([Uint8Array.of(4)]) };
const library = { async loadPack() { return { pack, sourceBlobs: blobs }; } };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
globalThis.AudioContext = FakeContext;
try {
  const audio = createGameAudio({ doc, onProfileCaption: (value) => captions.push(value),
    onCue: (value) => cues.push(value), onPackStatus: (value) => statuses.push(value) });
  audio.unlock();
  await audio.setMapAudio({ packId: 'fixture', profileId: 'field' }, library);
  const before = scheduled.length;
  assert.equal(audio.playEvent({ cue: 'select', kind: 'worker' }), true);
  await tick();
  assert.equal(scheduled.length, before + 1);
  assert.deepEqual(captions, ['Ready worker']);
  assert.deepEqual(cues, ['select']);
  const beforeUrgent = stopped;
  assert.equal(audio.playEvent({ cue: 'base-alert' }), true);
  await tick();
  assert.ok(stopped > beforeUrgent, 'urgent speech interrupts the prior voice');
  assert.equal(cues.at(-1), 'base-alert');
  await audio.setMapAudio({ packId: 'missing', profileId: 'field' }, { async loadPack() { return null; } });
  assert.match(audio.getPackStatus(), /missing/i);
  assert.equal(audio.playEvent({ cue: 'select', kind: 'worker' }), true, 'missing pack uses synthesis');
  assert.equal(cues.at(-1), 'select');
  blobs.ready = new Blob([Uint8Array.of(255)]);
  await audio.setMapAudio({ packId: 'fixture', profileId: 'field' }, library);
  audio.playEvent({ cue: 'select', kind: 'worker' });
  await tick();
  assert.match(statuses.at(-1), /could not decode/);
  assert.equal(cues.at(-1), 'select', 'decode failure uses synthesis');
  audio.dispose();
} finally { globalThis.AudioContext = previousContext; }
console.log('sampled runtime playback and fallback passed');
