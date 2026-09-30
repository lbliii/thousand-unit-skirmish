import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { loadShippedAudio, shippedAudioCacheState } from '../src/audio-shipped-loader.mjs';
import { SHIPPED_AUDIO_REFERENCES } from '../src/audio-shipped-catalog.mjs';
import { validateMapAudioReference } from '../src/audio-event-profile.mjs';
const root = new URL('../', import.meta.url);
const ref = SHIPPED_AUDIO_REFERENCES[0];
const manifestBytes = await readFile(new URL(`assets/audio/runtime/${ref.packId}/${ref.version}/manifest.json`, root));
const manifest = JSON.parse(manifestBytes);
const hash = (data) => createHash('sha256').update(data).digest('hex');
let sequence = 0;
function fixture(mutator = () => {}, responseMutator = (value) => value) {
  const record = structuredClone(manifest); record.pack.id = `test-pack-${++sequence}`;
  mutator(record);
  const bytes = Buffer.from(JSON.stringify(record));
  const reference = { ...ref, packId: record.pack.id, sha256: hash(bytes) };
  let calls = 0;
  const fetch = async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    const body = url.endsWith('manifest.json') ? bytes : await readFile(new URL(url.slice(1), root));
    const mime = url.endsWith('manifest.json') ? 'application/json' : 'audio/mpeg';
    return responseMutator(new Response(body, { headers: { 'content-type': mime } }), url);
  };
  return { reference, fetch, calls: () => calls };
}
test('canonical shipped manifest and originals match hashes and load without local import', async () => {
  assert.equal(hash(manifestBytes), ref.sha256);
  const f = fixture();
  const loaded = await loadShippedAudio(f.reference, { fetch: f.fetch, crypto: webcrypto });
  assert.equal(loaded.pack.profiles[0].id, ref.profileId);
  assert.equal(Object.keys(loaded.sourceBlobs).length, 4);
  assert.equal(f.calls(), 5);
  assert.equal(await loadShippedAudio(f.reference, { fetch: f.fetch, crypto: webcrypto }), loaded);
  assert.equal(f.calls(), 5, 'verified cache avoids repeated transfers');
});
test('rejects manifest hash, profile, source size/hash/MIME, redirects and unsafe source paths', async () => {
  const badHash = fixture();
  await assert.rejects(loadShippedAudio({ ...badHash.reference, sha256: '0'.repeat(64) }, { fetch: badHash.fetch, crypto: webcrypto }), /SHA-256/);
  const badProfile = fixture();
  await assert.rejects(loadShippedAudio({ ...badProfile.reference, profileId: 'absent' }, { fetch: badProfile.fetch, crypto: webcrypto }), /profile mismatch/);
  for (const mutate of [
    (m) => m.downloads['horn-note'].bytes++,
    (m) => m.downloads['horn-note'].sha256 = '0'.repeat(64),
    (m) => m.downloads['horn-note'].path = 'https://example.com/audio.mp3',
    (m) => m.downloads['horn-note'].bytes = 17 * 1024 * 1024,
    (m) => m.downloads['horn-note'].mimeType = 'text/html',
  ]) {
    const f = fixture(mutate);
    await assert.rejects(loadShippedAudio(f.reference, { fetch: f.fetch, crypto: webcrypto }), /size|SHA-256|reference/i);
  }
  const mime = fixture(() => {}, () => new Response('oops', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(loadShippedAudio(mime.reference, { fetch: mime.fetch, crypto: webcrypto }), /MIME/);
});
test('cache remains capped and legacy references stay compatible', async () => {
  for (let i = 0; i < 4; i++) { const f = fixture(); await loadShippedAudio(f.reference, { fetch: f.fetch, crypto: webcrypto }); }
  assert.equal(shippedAudioCacheState().packs, 2);
  assert.ok(shippedAudioCacheState().bytes < 64 * 1024 * 1024);
  assert.deepEqual(validateMapAudioReference({ packId: 'local', profileId: 'field' }), { packId: 'local', profileId: 'field' });
  assert.throws(() => validateMapAudioReference({ ...ref, sha256: undefined }), /version.*hash/);
});
