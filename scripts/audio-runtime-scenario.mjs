import assert from 'node:assert/strict';
import { bindingKeysForEvent, createProfileDecisionGate, resolveEventBinding, validateMapAudioReference } from '../src/audio-event-profile.mjs';
import { createGameAudio, readAudioSettings } from '../src/audio.mjs';

assert.deepEqual(bindingKeysForEvent({ cue: 'gather', kind: 'worker', resource: 'wood' }), [
  'unit.worker.gather.wood', 'unit.worker.gather', 'cue.gather',
]);
assert.equal(bindingKeysForEvent({ cue: 'select', buildingType: 'archery-range' })[0], 'building.archery-range.select');
const profile = { bindings: {
  'unit.worker.select': { bus: 'voice', variants: [{ sourceId: 'one', caption: 'Ready' }, { sourceId: 'two', caption: 'Here' }] },
  'unit.worker.gather.wood': { bus: 'voice', variants: [{ sourceId: 'wood' }] },
  'unit.worker.gather.food': { bus: 'voice', variants: [{ sourceId: 'food' }] },
  'building.barracks.select': { bus: 'voice', variants: [{ sourceId: 'barracks' }] },
  'cue.select': { bus: 'effects', variants: [{ sourceId: 'generic' }] },
  'cue.base-alert': { bus: 'voice', variants: [{ sourceId: 'danger' }] },
} };
assert.equal(resolveEventBinding(profile, { cue: 'select', kind: 'worker' }).key, 'unit.worker.select');
assert.equal(resolveEventBinding(profile, { cue: 'gather', kind: 'worker', resource: 'wood' }).binding.variants[0].sourceId, 'wood');
assert.equal(resolveEventBinding(profile, { cue: 'gather', kind: 'worker', resource: 'food' }).binding.variants[0].sourceId, 'food');
assert.equal(resolveEventBinding(profile, { cue: 'select', buildingType: 'barracks' }).binding.variants[0].sourceId, 'barracks');
assert.equal(resolveEventBinding(profile, { cue: 'select', kind: 'archer' }).binding.variants[0].sourceId, 'generic');
let now = 1000;
const gate = createProfileDecisionGate({ now: () => now });
const first = gate.choose(profile, { cue: 'select', kind: 'worker' });
now += 1300;
const second = gate.choose(profile, { cue: 'select', kind: 'worker' });
assert.notEqual(first.variant.sourceId, second.variant.sourceId);
assert.equal(gate.choose(profile, { cue: 'select', kind: 'worker' }), null);
assert.equal(gate.choose(profile, { cue: 'base-alert' }).variant.sourceId, 'danger',
  'urgent alert can interrupt the speech cooldown');
assert.deepEqual(validateMapAudioReference({ packId: 'battle-pack', profileId: 'worker-v1' }), { packId: 'battle-pack', profileId: 'worker-v1' });
assert.equal(validateMapAudioReference(undefined), null);
assert.throws(() => validateMapAudioReference({ packId: 'abc', profileId: '../invalid' }), /stable IDs/);
assert.throws(() => validateMapAudioReference({ packId: 'abc', profileId: 'ok', remoteUrl: 'https://example.com' }), /stable IDs/);
const saved = new Map([['tus-audio-v1', JSON.stringify({ enabled: true, volume: 0.4, effectsLevel: 0.7, ambienceLevel: 0.8 })]]);
const storage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
const migrated = readAudioSettings(storage);
assert.equal(migrated.voiceLevel, 1);
assert.equal(migrated.musicLevel, 0.8);
assert.equal(readAudioSettings({ getItem: () => JSON.stringify({ ambience: false }) }).musicLevel, 0);
const audio = createGameAudio({ storage, doc: { hidden: true, addEventListener() {}, removeEventListener() {} } });
audio.setSettings({ voiceLevel: 0.3, musicLevel: 0.6 });
assert.equal(readAudioSettings(storage).voiceLevel, 0.3);
assert.equal(readAudioSettings(storage).effectsLevel, 0.7);
audio.dispose();
console.log('audio runtime policy and migration passed');
