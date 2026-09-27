import assert from 'node:assert/strict';
import { createCompositionPlayer } from '../src/audio-composition-player.mjs';

const starts = [];
const stops = [];
const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
const audioNode = () => ({ connect() {}, disconnect() {} });
const context = {
  currentTime: 10,
  createBufferSource() { return { ...audioNode(), onended: null,
    start(time, offset) { starts.push({ time, offset }); }, stop(time) { stops.push(time); } }; },
  createGain() { return { ...audioNode(), gain: parameter() }; },
  createStereoPanner() { return { ...audioNode(), pan: parameter() }; },
};
const composition = { schemaVersion: 1, id: 'march', name: 'March', bpm: 120, beatsPerBar: 4, lengthBars: 2,
  tracks: [{ id: 'drum', name: 'Drum', gain: 1, pan: -0.3, mute: false, solo: false,
    clips: [{ id: 'beat', sourceId: 'beat', startBeat: 0, durationBeats: 2, offsetSeconds: 0,
      gain: 1, loop: true, fadeInSeconds: 0.1, fadeOutSeconds: 0.1 }] },
  { id: 'horn', name: 'Horn', gain: 0.8, pan: 0.3, mute: false, solo: false,
    clips: [{ id: 'phrase', sourceId: 'phrase', startBeat: 2, durationBeats: 2, offsetSeconds: 0.25,
      gain: 0.9, loop: false, fadeInSeconds: 0, fadeOutSeconds: 0.1 }] }] };
const buffer = { duration: 2, length: 200, numberOfChannels: 1 };
const player = createCompositionPlayer({ context, destination: audioNode(), resolveBuffer: async () => buffer });
assert.equal(await player.play(composition), true);
assert.deepEqual(starts, [{ time: 10.08, offset: 0 }, { time: 11.08, offset: 0.25 }],
  'clips share one audio clock');
assert.deepEqual(stops, [11.08, 12.08]);
player.stop();
await assert.rejects(player.play({ ...composition, tracks: composition.tracks.map((track) => ({ ...track, clips: [] })) }),
  /no audible clips/);
let completeLoad;
const pending = new Promise((resolve) => { completeLoad = resolve; });
const stalePlayer = createCompositionPlayer({ context, destination: audioNode(), resolveBuffer: () => pending });
const before = starts.length;
const result = stalePlayer.play(composition);
stalePlayer.stop();
completeLoad(buffer);
assert.equal(await result, false);
assert.equal(starts.length, before, 'stale async loads never schedule sound');
stalePlayer.dispose();
player.dispose();

const priorSetTimeout = globalThis.setTimeout;
const priorClearTimeout = globalThis.clearTimeout;
const timers = [];
globalThis.setTimeout = (callback, ms) => { timers.push({ callback, ms }); return timers.length; };
globalThis.clearTimeout = () => {};
try {
  const loopPlayer = createCompositionPlayer({ context, destination: audioNode(), resolveBuffer: async () => buffer });
  const beforeLoop = starts.length;
  await loopPlayer.play(composition, { loop: true });
  assert.equal(starts.length, beforeLoop + 2);
  assert.equal(timers.length, 1);
  timers[0].callback();
  assert.deepEqual(starts.slice(-2), [{ time: 14.08, offset: 0 }, { time: 15.08, offset: 0.25 }],
    'the next loop starts on the exact shared-clock boundary');
  loopPlayer.stop();
} finally {
  globalThis.setTimeout = priorSetTimeout;
  globalThis.clearTimeout = priorClearTimeout;
}

console.log('composition player shared clock and cancellation passed');
