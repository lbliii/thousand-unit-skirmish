import { validateAudioPack, MAX_PACK_BYTES, MAX_SOURCE_BYTES } from './audio-assets.mjs';
import { validateMapAudioReference } from './audio-event-profile.mjs';
const cache = new Map();
let cacheBytes = 0;
async function readBounded(response, limit, mime) {
  if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== mime) throw new Error('Audio response status/MIME mismatch');
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Audio response exceeds size limit');
  const chunks = []; let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Audio response exceeds size limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const result = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function verify(bytes, expected, crypto) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expected) throw new Error('Audio SHA-256 mismatch');
}
export async function loadShippedAudio(reference, { fetch = globalThis.fetch, crypto = globalThis.crypto, signal } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  const ref = validateMapAudioReference(reference);
  if (!ref?.version) throw new Error('Missing shipped audio version');
  const key = `${ref.packId}/${ref.version}/${ref.sha256}`;
  if (cache.has(key)) {
    const entry = cache.get(key); cache.delete(key); cache.set(key, entry);
    if (!entry.loaded.pack.profiles.some((profile) => profile.id === ref.profileId)) throw new Error('Missing shipped profile');
    return entry.loaded;
  }
  const bytes = await readBounded(await fetch(`/assets/audio/runtime/${ref.packId}/${ref.version}/manifest.json`, { signal, redirect: 'error', cache: 'no-store' }), 2 * 1024 * 1024, 'application/json');
  await verify(bytes, ref.sha256, crypto);
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  const pack = validateAudioPack(manifest.pack);
  if (manifest.version !== ref.version || pack.id !== ref.packId || !pack.profiles.some((profile) => profile.id === ref.profileId)) throw new Error('Audio pack/version/profile mismatch');
  const blobs = {}; let total = bytes.length;
  for (const source of pack.sources) {
    const item = manifest.downloads?.[source.id];
    if (!item || !/^\/assets\/audio\/[A-Za-z0-9/_-]+\.(mp3|wav|ogg)$/.test(item.path)
      || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > MAX_SOURCE_BYTES
      || !/^[a-f0-9]{64}$/.test(item.sha256) || !['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(item.mimeType)
      || item.mimeType !== source.mimeType || total + item.bytes > MAX_PACK_BYTES) throw new Error('Invalid shipped audio source reference');
    const data = await readBounded(await fetch(item.path, { signal, redirect: 'error', cache: 'no-store' }), item.bytes, item.mimeType);
    if (data.length !== item.bytes) throw new Error('Audio source size mismatch');
    await verify(data, item.sha256, crypto);
    blobs[source.id] = new Blob([data], { type: item.mimeType }); total += data.length;
  }
  const loaded = { pack, sourceBlobs: blobs };
  while ((cacheBytes + total > MAX_PACK_BYTES || cache.size >= 2) && cache.size) {
    const [oldKey, entry] = cache.entries().next().value; cache.delete(oldKey); cacheBytes -= entry.bytes;
  }
  cache.set(key, { loaded, bytes: total }); cacheBytes += total;
  return loaded;
}
export function shippedAudioCacheState() { return { packs: cache.size, bytes: cacheBytes }; }
