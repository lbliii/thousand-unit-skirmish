import assert from 'node:assert/strict';
import { validateAudioPack } from '../src/audio-assets.mjs';
import { exportAudioPack, parseAudioPackArchive } from '../src/audio-library-store.mjs';

const pack = {
  schemaVersion: 1, id: 'pack-test', name: 'Fixture',
  sources: [{ id: 'wood', name: 'Worker wood', fileName: 'wood.wav', mimeType: 'audio/wav',
    tags: ['worker', 'wood'], provenance: { provider: 'local synth', prompt: 'wood order', createdAt: '2026-09-27' } }],
  profiles: [{ id: 'profile-test', name: 'Default', bindings: {
    'unit.worker.gather.wood': { variants: [{ sourceId: 'wood', gain: 0.8, caption: 'Gathering wood' }], bus: 'voice', cooldownMs: 500 },
  }, music: {} }],
  compositions: [],
};

const original = new Blob([Uint8Array.from([0, 1, 2, 127, 128, 255, 0, 42])], { type: 'audio/wav' });
const normalized = validateAudioPack(pack);
assert.deepEqual(normalized, pack);
const archive = await exportAudioPack(pack, { wood: original });
const imported = await parseAudioPackArchive(archive);
assert.deepEqual(imported.pack, pack);
assert.deepEqual(new Uint8Array(await imported.sourceBlobs.wood.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
assert.equal(imported.pack.sources[0].provenance.prompt, 'wood order');

assert.throws(() => validateAudioPack({ ...pack, schemaVersion: 2 }), /unsupported version/);
assert.throws(() => validateAudioPack({ ...pack, sources: [...pack.sources, pack.sources[0]] }), /duplicate ID/);
assert.throws(() => validateAudioPack({ ...pack, profiles: [{ ...pack.profiles[0], bindings: {
  'unit.worker.gather.wood': { variants: [{ sourceId: 'missing' }], bus: 'voice' },
} }] }), /unknown source missing/);
assert.throws(() => validateAudioPack({ ...pack, sources: [{ ...pack.sources[0], provenance: { apiKey: 'secret' } }] }), /unsupported field/);
assert.throws(() => validateAudioPack({ ...pack, compositions: [{
  schemaVersion: 1, id: 'music', name: 'Music', bpm: Infinity, beatsPerBar: 4, lengthBars: 8, tracks: [],
}] }), /bpm/);
const withComposition = validateAudioPack({ ...pack, compositions: [{
  schemaVersion: 1, id: 'music', name: 'Music', tracks: [{ id: 'track', name: 'Track', clips: [
    { id: 'clip', sourceId: 'wood' },
  ] }],
}] });
assert.equal(withComposition.compositions[0].tracks[0].clips[0].durationBeats, 4);
assert.equal(withComposition.compositions[0].tracks[0].gain, 1);
assert.throws(() => validateAudioPack({ ...pack, compositions: [{ ...withComposition.compositions[0],
  tracks: [{ ...withComposition.compositions[0].tracks[0], clips: [{ id: 'track', sourceId: 'wood' }] }],
}] }), /duplicate ID/);
await assert.rejects(exportAudioPack(pack, {}), /no original bytes/);
await assert.rejects(exportAudioPack(pack, { wood: new Blob([new Uint8Array(16 * 1024 * 1024 + 1)]) }), /16 MiB source limit/);
await assert.rejects(parseAudioPackArchive(new Blob(['invalid'])), /not valid JSON/);
const broken = JSON.parse(await archive.text());
broken.sources.wood.byteLength++;
await assert.rejects(parseAudioPackArchive(new Blob([JSON.stringify(broken)])), /declared byte length/);
await assert.rejects(parseAudioPackArchive(new Blob([new Uint8Array(90 * 1024 * 1024 + 1)])), /90 MiB import limit/);
console.log('Audio library validation and byte-preserving archive checks passed');
