import { MAX_PACK_BYTES, MAX_SOURCE_BYTES, validateAudioPack } from './audio-assets.mjs';

const DB_NAME = 'tus-audio-library-v1';
const ARCHIVE_FORMAT = 'tus-audio-pack-v1';
const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024; // Base64 adds about one third.

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Audio library transaction was aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('Audio library transaction failed'));
  });
}

function openDatabase(indexedDB) {
  if (!indexedDB) throw new Error('IndexedDB is unavailable. Open Audio Studio in a supported browser.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('packs', { keyPath: 'id' });
      db.createObjectStore('sources', { keyPath: ['packId', 'sourceId'] }).createIndex('packId', 'packId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Cannot open audio library: ${request.error?.message || 'unknown error'}`));
    request.onblocked = () => reject(new Error('Audio library upgrade is blocked by another open tab. Close it and retry.'));
  });
}

function describeStorageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('Browser storage is full. Export or remove packs, then retry.');
  return error instanceof Error ? error : new Error(String(error));
}

function validateBlobs(pack, sourceBlobs) {
  if (!sourceBlobs || typeof sourceBlobs !== 'object' || Array.isArray(sourceBlobs)) throw new Error('sourceBlobs must be an object keyed by source ID');
  const ids = new Set(pack.sources.map((source) => source.id));
  let total = 0;
  for (const [sourceId, blob] of Object.entries(sourceBlobs)) {
    if (!ids.has(sourceId)) throw new Error(`Blob references unknown source ${sourceId}`);
    if (!(blob instanceof Blob)) throw new Error(`Source ${sourceId} must be a Blob`);
    if (!blob.size) throw new Error(`Source ${sourceId} is empty`);
    if (blob.size > MAX_SOURCE_BYTES) throw new Error(`Source ${sourceId} exceeds the 16 MiB source limit`);
    total += blob.size;
  }
  if (total > MAX_PACK_BYTES) throw new Error('Supplied audio exceeds the 64 MiB pack limit');
}

function encodeBase64(bytes) {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(output);
}

function decodeBase64(value, expectedLength, path) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`${path}: invalid or oversized base64 data`);
  }
  let binary;
  try { binary = atob(value); } catch { throw new Error(`${path}: invalid base64 data`); }
  if (binary.length !== expectedLength) throw new Error(`${path}: declared byte length does not match the audio data`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function exportAudioPack(value, sourceBlobs) {
  const pack = validateAudioPack(value);
  validateBlobs(pack, sourceBlobs);
  let total = 0;
  const sources = {};
  for (const source of pack.sources) {
    const blob = sourceBlobs[source.id];
    if (!(blob instanceof Blob)) throw new Error(`Source ${source.id} has no original bytes`);
    total += blob.size;
    if (total > MAX_PACK_BYTES) throw new Error('Pack exceeds the 64 MiB export limit');
    sources[source.id] = { byteLength: blob.size, base64: encodeBase64(new Uint8Array(await blob.arrayBuffer())) };
  }
  return new Blob([JSON.stringify({ format: ARCHIVE_FORMAT, pack, sources })], { type: 'application/json' });
}

export async function parseAudioPackArchive(file) {
  if (!(file instanceof Blob)) throw new Error('Choose an audio pack file');
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds the 90 MiB import limit');
  let archive;
  try { archive = JSON.parse(await file.text()); } catch { throw new Error('Audio pack is not valid JSON'); }
  if (archive?.format !== ARCHIVE_FORMAT) throw new Error('Unsupported audio archive format; expected tus-audio-pack-v1');
  const pack = validateAudioPack(archive.pack);
  if (!archive.sources || typeof archive.sources !== 'object' || Array.isArray(archive.sources)) throw new Error('Archive is missing source bytes');
  const expectedIds = new Set(pack.sources.map((source) => source.id));
  if (Object.keys(archive.sources).length !== expectedIds.size) throw new Error('Archive source bytes do not match pack metadata');
  const sourceBlobs = {};
  let total = 0;
  for (const source of pack.sources) {
    const data = archive.sources[source.id];
    if (!data || !Number.isInteger(data.byteLength) || data.byteLength < 1 || data.byteLength > MAX_SOURCE_BYTES) throw new Error(`Source ${source.id} has invalid byte length`);
    total += data.byteLength;
    if (total > MAX_PACK_BYTES) throw new Error('Pack exceeds the 64 MiB audio limit');
    sourceBlobs[source.id] = new Blob([decodeBase64(data.base64, data.byteLength, `Source ${source.id}`)], { type: source.mimeType });
  }
  for (const sourceId of Object.keys(archive.sources)) if (!expectedIds.has(sourceId)) throw new Error(`Archive has unexpected source ${sourceId}`);
  return { pack, sourceBlobs };
}

export function createAudioLibraryStore({ indexedDB = globalThis.indexedDB, IDBKeyRange = globalThis.IDBKeyRange } = {}) {
  let databasePromise;
  const database = () => databasePromise ||= openDatabase(indexedDB);

  async function listPacks() {
    const db = await database();
    const transaction = db.transaction('packs', 'readonly');
    const request = transaction.objectStore('packs').getAll();
    const [packs] = await Promise.all([requestResult(request), transactionDone(transaction)]);
    return packs.map((pack) => ({ id: pack.id, name: pack.name, sourceCount: pack.sources.length,
      profileCount: pack.profiles.length, compositionCount: pack.compositions.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadPack(packId) {
    const db = await database();
    const transaction = db.transaction(['packs', 'sources'], 'readonly');
    const packRequest = transaction.objectStore('packs').get(packId);
    const sourceRequest = transaction.objectStore('sources').index('packId').getAll(IDBKeyRange.only(packId));
    const [[pack, storedSources]] = await Promise.all([
      Promise.all([requestResult(packRequest), requestResult(sourceRequest)]), transactionDone(transaction),
    ]);
    if (!pack) return null;
    const sourceBlobs = Object.fromEntries(storedSources.filter((entry) => entry.packId === packId)
      .map((entry) => [entry.sourceId, entry.blob]));
    return { pack: validateAudioPack(pack), sourceBlobs };
  }

  async function savePack(value, sourceBlobs = {}) {
    const pack = validateAudioPack(value);
    validateBlobs(pack, sourceBlobs);
    const db = await database();
    const transaction = db.transaction(['packs', 'sources'], 'readwrite');
    const done = transactionDone(transaction);
    const sourceStore = transaction.objectStore('sources');
    const wantedIds = new Set(pack.sources.map((source) => source.id));
    const existingRequest = sourceStore.index('packId').getAll(IDBKeyRange.only(pack.id));
    let validationError;
    existingRequest.onsuccess = () => {
      try {
        const existing = existingRequest.result.filter((entry) => entry.packId === pack.id);
        const old = new Map(existing.map((entry) => [entry.sourceId, entry.blob]));
        let total = 0;
        for (const source of pack.sources) {
          const blob = Object.hasOwn(sourceBlobs, source.id) ? sourceBlobs[source.id] : old.get(source.id);
          if (!(blob instanceof Blob) || !blob.size) throw new Error(`Source ${source.id} has no original bytes; import its audio before saving`);
          if (blob.size > MAX_SOURCE_BYTES) throw new Error(`Source ${source.id} exceeds the 16 MiB source limit`);
          total += blob.size;
        }
        if (total > MAX_PACK_BYTES) throw new Error('Pack exceeds the 64 MiB audio limit');
        for (const entry of existing) if (!wantedIds.has(entry.sourceId)) sourceStore.delete([pack.id, entry.sourceId]);
        for (const [sourceId, blob] of Object.entries(sourceBlobs)) sourceStore.put({ packId: pack.id, sourceId, blob });
        transaction.objectStore('packs').put(pack);
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };
    try { await done; } catch (error) { throw describeStorageError(validationError || error); }
    return pack;
  }

  async function deletePack(packId) {
    const db = await database();
    const transaction = db.transaction(['packs', 'sources'], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('packs').delete(packId);
    const request = transaction.objectStore('sources').index('packId').getAllKeys(IDBKeyRange.only(packId));
    request.onsuccess = () => {
      for (const key of request.result) if (key[0] === packId) transaction.objectStore('sources').delete(key);
    };
    try { await done; } catch (error) { throw describeStorageError(error); }
  }

  async function exportPack(packId) {
    const loaded = await loadPack(packId);
    if (!loaded) throw new Error(`Pack ${packId} was not found`);
    return exportAudioPack(loaded.pack, loaded.sourceBlobs);
  }

  async function importPack(file) {
    const { pack, sourceBlobs } = await parseAudioPackArchive(file);
    if (await loadPack(pack.id)) throw new Error(`Pack ID ${pack.id} already exists. Delete it before importing this backup.`);
    await savePack(pack, sourceBlobs);
    return pack;
  }

  return { listPacks, loadPack, savePack, deletePack, exportPack, importPack };
}
