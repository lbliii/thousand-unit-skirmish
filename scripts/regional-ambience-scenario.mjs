import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameAudio } from '../src/audio.mjs';
const previous = globalThis.AudioContext;
const sources = [];
const parameter = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {} });
class Context {
  state = 'running'; currentTime = 0; sampleRate = 100; destination = node();
  createGain() { return { ...node(), gain: parameter() }; }
  createBiquadFilter() { return { ...node(), frequency: parameter(), Q: parameter() }; }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() {
    const source = { ...node(), active: false, buffer: null, start() { this.active = true; }, stop(at) { if (at === undefined) this.active = false; } };
    sources.push(source); return source;
  }
  createOscillator() { return { ...node(), frequency: parameter() }; }
  async decodeAudioData(bytes) { return { tag: new Uint8Array(bytes)[0], duration: 60, length: 6000, numberOfChannels: 1 }; }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
  async close() {}
}
let visibility;
const doc = { hidden: false, addEventListener(_event, callback) { visibility = callback; }, removeEventListener() {} };
const { pack } = JSON.parse(await readFile(new URL('../assets/audio/runtime/vaelora-bellweather/v2/manifest.json', import.meta.url)));
const sourceBlobs = Object.fromEntries(pack.sources.map((source, i) => [source.id, new Blob([Uint8Array.of(i + 1)])]));
const library = { async loadPack() { return { pack, sourceBlobs }; } };
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const active = tag => sources.filter(source => source.active && source.buffer?.tag === tag).length;
globalThis.AudioContext = Context;
let audio;
try {
  audio = createGameAudio({ doc }); audio.unlock();
  await audio.setMapAudio({ packId: pack.id, profileId: 'landscape' }, library); await settle();
  assert.equal(active(1), 1); assert.equal(active(2), 1);
  audio.setSettings({ ambience: false }); await settle();
  assert.equal(active(2), 0); assert.equal(active(1), 1, 'ambience mute preserves music');
  audio.setSettings({ ambience: true, musicLevel: 0 }); await settle();
  assert.equal(active(1), 0); assert.equal(active(2), 1, 'music mute preserves ambience');
  audio.setSettings({ musicLevel: 1 }); await settle();
  doc.hidden = true; visibility(); await settle();
  assert.equal(active(1) + active(2), 0, 'hidden tab stops both regional layers');
  doc.hidden = false; visibility(); await settle();
  assert.equal(active(1), 1); assert.equal(active(2), 1, 'visible tab restarts one ambience player');
  await audio.setMapAudio(null); await settle();
  assert.equal(active(1) + active(2), 0, 'map switch stops old layers');
  await audio.setMapAudio({ packId: pack.id, profileId: 'landscape' }, library); await settle();
  audio.dispose(); audio = null;
  assert.equal(active(1) + active(2), 0, 'dispose cancels repeating layers');
} finally { audio?.dispose(); globalThis.AudioContext = previous; }
console.log('Regional ambience: independent music/ambience mute, visibility, map switch and disposal passed.');
