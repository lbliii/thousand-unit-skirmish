// Portable metadata contract. Original recordings live beside this record as Blobs.
export const AUDIO_PACK_SCHEMA_VERSION = 1;
export const MAX_AUDIO_SOURCES = 128;
export const MAX_AUDIO_PROFILES = 32;
export const MAX_AUDIO_COMPOSITIONS = 64;
export const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const MAX_PACK_BYTES = 64 * 1024 * 1024;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
const text = (value, path, max = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(path, `must be non-empty text of at most ${max} characters`);
  return value.trim();
};
const id = (value, path) => {
  const result = text(value, path, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) fail(path, 'must contain only letters, numbers, dots, underscores, colons or dashes');
  return result;
};
const number = (value, path, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path, `must be a finite number from ${min} to ${max}`);
  return value;
};
const optionalNumber = (value, path, min, max) => value == null ? undefined : number(value, path, min, max);
const unique = (items, path) => {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) fail(path, `duplicate ID ${item.id}`);
    seen.add(item.id);
  }
  return seen;
};
const array = (value, path, max) => {
  if (!Array.isArray(value) || value.length > max) fail(path, `must be an array of at most ${max} items`);
  return value;
};

function validateSource(value, path) {
  if (!isObject(value)) fail(path, 'must be an object');
  if (!isObject(value.provenance)) fail(`${path}.provenance`, 'must be an object');
  const provenance = {};
  const allowed = ['provider', 'prompt', 'model', 'generationId', 'createdAt', 'license', 'attribution'];
  for (const [key, raw] of Object.entries(value.provenance)) {
    if (!allowed.includes(key)) fail(`${path}.provenance.${key}`, 'unsupported field; do not store credentials');
    provenance[key] = text(raw, `${path}.provenance.${key}`, key === 'prompt' ? 2000 : 400);
  }
  const tags = array(value.tags, `${path}.tags`, 24).map((tag, i) => text(tag, `${path}.tags[${i}]`, 40));
  if (new Set(tags).size !== tags.length) fail(`${path}.tags`, 'duplicate tag');
  return {
    id: id(value.id, `${path}.id`), name: text(value.name, `${path}.name`),
    fileName: text(value.fileName, `${path}.fileName`, 255),
    mimeType: text(value.mimeType, `${path}.mimeType`, 100), tags, provenance,
    ...(value.durationSeconds == null ? {} : { durationSeconds: number(value.durationSeconds, `${path}.durationSeconds`, 0, 3600) }),
    ...(value.sampleRate == null ? {} : { sampleRate: number(value.sampleRate, `${path}.sampleRate`, 1, 384000) }),
    ...(value.channels == null ? {} : { channels: number(value.channels, `${path}.channels`, 1, 32) }),
  };
}

function validateProfile(value, path, sourceIds, compositionIds) {
  if (!isObject(value)) fail(path, 'must be an object');
  if (!isObject(value.bindings)) fail(`${path}.bindings`, 'must be an object');
  if (!isObject(value.music)) fail(`${path}.music`, 'must be an object');
  const bindings = {};
  const entries = Object.entries(value.bindings);
  if (entries.length > 128) fail(`${path}.bindings`, 'too many events');
  for (const [key, binding] of entries) {
    if (!/^(?:unit\.[a-z0-9-]+\.[a-z0-9.-]+|building\.[a-z0-9-]+\.select|cue\.[a-z0-9-]+)$/.test(key)) fail(`${path}.bindings.${key}`, 'invalid event key');
    if (!isObject(binding)) fail(`${path}.bindings.${key}`, 'must be an object');
    const variants = array(binding.variants, `${path}.bindings.${key}.variants`, 16).map((variant, i) => {
      const p = `${path}.bindings.${key}.variants[${i}]`;
      if (!isObject(variant)) fail(p, 'must be an object');
      const sourceId = id(variant.sourceId, `${p}.sourceId`);
      if (!sourceIds.has(sourceId)) fail(`${p}.sourceId`, `unknown source ${sourceId}`);
      const trimStartSeconds = optionalNumber(variant.trimStartSeconds, `${p}.trimStartSeconds`, 0, 3600);
      const trimEndSeconds = optionalNumber(variant.trimEndSeconds, `${p}.trimEndSeconds`, 0, 3600);
      if (trimEndSeconds != null && trimStartSeconds != null && trimEndSeconds <= trimStartSeconds) fail(p, 'trim end must follow trim start');
      return { sourceId,
        ...(variant.gain == null ? {} : { gain: number(variant.gain, `${p}.gain`, 0, 4) }),
        ...(trimStartSeconds == null ? {} : { trimStartSeconds }),
        ...(trimEndSeconds == null ? {} : { trimEndSeconds }),
        ...(variant.caption == null ? {} : { caption: text(variant.caption, `${p}.caption`, 300) }),
      };
    });
    if (!variants.length) fail(`${path}.bindings.${key}.variants`, 'add at least one variant');
    if (!['voice', 'effects', 'ambience'].includes(binding.bus)) fail(`${path}.bindings.${key}.bus`, 'must be voice, effects or ambience');
    bindings[key] = { variants, bus: binding.bus,
      ...(binding.cooldownMs == null ? {} : { cooldownMs: number(binding.cooldownMs, `${path}.bindings.${key}.cooldownMs`, 0, 600000) }),
      ...(binding.priority == null ? {} : { priority: number(binding.priority, `${path}.bindings.${key}.priority`, -100, 100) }),
    };
  }
  const music = {};
  if (value.music.defaultCompositionId != null) {
    music.defaultCompositionId = id(value.music.defaultCompositionId, `${path}.music.defaultCompositionId`);
    if (!compositionIds.has(music.defaultCompositionId)) fail(`${path}.music.defaultCompositionId`, `unknown composition ${music.defaultCompositionId}`);
  }
  return { id: id(value.id, `${path}.id`), name: text(value.name, `${path}.name`), bindings, music };
}

function validateCompositionShape(composition, path) {
  composition.bpm ??= 96;
  composition.beatsPerBar ??= 4;
  composition.lengthBars ??= 8;
  number(composition.bpm, `${path}.bpm`, 20, 300);
  number(composition.beatsPerBar, `${path}.beatsPerBar`, 1, 16);
  number(composition.lengthBars, `${path}.lengthBars`, 1, 256);
  if (!Number.isInteger(composition.beatsPerBar) || !Number.isInteger(composition.lengthBars)) fail(path, 'beatsPerBar and lengthBars must be integers');
  const ids = new Set([composition.id]);
  let clipCount = 0;
  for (const [j, track] of composition.tracks.entries()) {
    const tp = `${path}.tracks[${j}]`;
    if (!isObject(track)) fail(tp, 'must be an object');
    const trackId = id(track.id, `${tp}.id`);
    if (ids.has(trackId)) fail(tp, `duplicate ID ${trackId}`);
    ids.add(trackId);
    text(track.name, `${tp}.name`);
    track.gain ??= 1;
    track.pan ??= 0;
    track.mute ??= false;
    track.solo ??= false;
    number(track.gain, `${tp}.gain`, 0, 4);
    number(track.pan, `${tp}.pan`, -1, 1);
    for (const field of ['mute', 'solo']) if (typeof track[field] !== 'boolean') fail(`${tp}.${field}`, 'must be a boolean');
    if (!Array.isArray(track.clips) || track.clips.length > 256) fail(`${tp}.clips`, 'must have at most 256 clips');
    clipCount += track.clips.length;
    if (clipCount > 1024) fail(path, 'composition exceeds 1024 clips');
    for (const [k, clip] of track.clips.entries()) {
      const cp = `${tp}.clips[${k}]`;
      if (!isObject(clip)) fail(cp, 'must be an object');
      const clipId = id(clip.id, `${cp}.id`);
      if (ids.has(clipId)) fail(cp, `duplicate ID ${clipId}`);
      ids.add(clipId);
      clip.startBeat ??= 0;
      clip.durationBeats ??= 4;
      clip.offsetSeconds ??= 0;
      clip.gain ??= 1;
      clip.loop ??= false;
      clip.fadeInSeconds ??= 0;
      clip.fadeOutSeconds ??= 0;
      number(clip.startBeat, `${cp}.startBeat`, 0, 65536);
      number(clip.durationBeats, `${cp}.durationBeats`, 0.001, 65536);
      number(clip.offsetSeconds, `${cp}.offsetSeconds`, 0, 86400);
      number(clip.gain, `${cp}.gain`, 0, 4);
      if (typeof clip.loop !== 'boolean') fail(`${cp}.loop`, 'must be a boolean');
      number(clip.fadeInSeconds, `${cp}.fadeInSeconds`, 0, 86400);
      number(clip.fadeOutSeconds, `${cp}.fadeOutSeconds`, 0, 86400);
      if (clip.startBeat + clip.durationBeats > composition.lengthBars * composition.beatsPerBar + 0.000001) fail(cp, 'clip extends past composition length');
    }
  }
}

// A composer module may be supplied by the caller after it loads. The local checks
// keep imported projects safe before that optional editor has been fetched.
export function validateAudioPack(value, { validateComposition } = {}) {
  if (!isObject(value)) fail('pack', 'must be an object');
  if (value.schemaVersion !== AUDIO_PACK_SCHEMA_VERSION) fail('pack.schemaVersion', `unsupported version ${value.schemaVersion}; expected 1`);
  let metadataSize;
  try { metadataSize = JSON.stringify(value).length; } catch { fail('pack', 'must be JSON-serializable'); }
  if (metadataSize > 2 * 1024 * 1024) fail('pack', 'metadata exceeds the 2 MiB limit');
  const sources = array(value.sources, 'pack.sources', MAX_AUDIO_SOURCES).map((source, i) => validateSource(source, `pack.sources[${i}]`));
  const sourceIds = unique(sources, 'pack.sources');
  const compositions = array(value.compositions, 'pack.compositions', MAX_AUDIO_COMPOSITIONS).map((composition, i) => {
    const path = `pack.compositions[${i}]`;
    if (!isObject(composition) || composition.schemaVersion !== 1) fail(path, 'must be a version 1 composition');
    const checked = validateComposition ? validateComposition(composition) : structuredClone(composition);
    id(checked.id, `${path}.id`);
    text(checked.name, `${path}.name`);
    if (!Array.isArray(checked.tracks) || checked.tracks.length > 64) fail(`${path}.tracks`, 'must have at most 64 tracks');
    validateCompositionShape(checked, path);
    for (const [j, track] of checked.tracks.entries()) {
      if (!isObject(track) || !Array.isArray(track.clips) || track.clips.length > 256) fail(`${path}.tracks[${j}]`, 'invalid track or too many clips');
      for (const [k, clip] of track.clips.entries()) {
        const sourceId = id(clip?.sourceId, `${path}.tracks[${j}].clips[${k}].sourceId`);
        if (!sourceIds.has(sourceId)) fail(`${path}.tracks[${j}].clips[${k}].sourceId`, `unknown source ${sourceId}`);
      }
    }
    return checked;
  });
  const compositionIds = unique(compositions, 'pack.compositions');
  const profiles = array(value.profiles, 'pack.profiles', MAX_AUDIO_PROFILES).map((profile, i) => validateProfile(profile, `pack.profiles[${i}]`, sourceIds, compositionIds));
  unique(profiles, 'pack.profiles');
  return { schemaVersion: 1, id: id(value.id, 'pack.id'), name: text(value.name, 'pack.name'), sources, profiles, compositions };
}
