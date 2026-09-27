const MAX_TRACKS = 64;
const MAX_CLIPS = 1024;
const MAX_CLIPS_PER_TRACK = 256;

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function string(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error(`${label} must be nonempty text of at most 160 characters`);
  return value.trim();
}
function identifier(value, label) {
  const result = string(value, label);
  if (result.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new Error(`${label} must use letters, numbers, dots, underscores, colons or dashes`);
  return result;
}
function number(value, label, min, max, fallback) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) {
    throw new Error(`${label} must be a finite number from ${min} to ${max}`);
  }
  return result;
}
function flag(value, label, fallback = false) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'boolean') throw new Error(`${label} must be a boolean`);
  return result;
}
function unique(id, seen, label) {
  if (seen.has(id)) throw new Error(`Duplicate ${label} ID: ${id}`);
  seen.add(id);
  return id;
}

export function validateComposition(value) {
  const composition = record(value, 'Composition');
  if (composition.schemaVersion !== 1) throw new Error(`Unsupported composition schema version: ${composition.schemaVersion}`);
  const bpm = number(composition.bpm, 'bpm', 20, 300, 96);
  const beatsPerBar = number(composition.beatsPerBar, 'beatsPerBar', 1, 16, 4);
  const lengthBars = number(composition.lengthBars, 'lengthBars', 1, 256, 8);
  if (!Number.isInteger(beatsPerBar) || !Number.isInteger(lengthBars)) throw new Error('beatsPerBar and lengthBars must be integers');
  const totalBeats = beatsPerBar * lengthBars;
  if (!Array.isArray(composition.tracks) || composition.tracks.length > MAX_TRACKS) throw new Error(`tracks must be an array of at most ${MAX_TRACKS}`);
  const seen = new Set();
  unique(identifier(composition.id, 'Composition ID'), seen, 'composition');
  let clipCount = 0;
  const tracks = composition.tracks.map((rawTrack, trackIndex) => {
    const track = record(rawTrack, `Track ${trackIndex + 1}`);
    const id = unique(identifier(track.id, 'Track ID'), seen, 'track or clip');
    if (!Array.isArray(track.clips) || track.clips.length > MAX_CLIPS_PER_TRACK) throw new Error(`Track ${id} clips must be an array of at most ${MAX_CLIPS_PER_TRACK}`);
    clipCount += track.clips.length;
    if (clipCount > MAX_CLIPS) throw new Error(`Composition exceeds ${MAX_CLIPS} clips`);
    return {
      id,
      name: string(track.name, `Track ${id} name`),
      gain: number(track.gain, `Track ${id} gain`, 0, 4, 1),
      pan: number(track.pan, `Track ${id} pan`, -1, 1, 0),
      mute: flag(track.mute, `Track ${id} mute`),
      solo: flag(track.solo, `Track ${id} solo`),
      clips: track.clips.map((rawClip, clipIndex) => {
        const clip = record(rawClip, `Clip ${clipIndex + 1}`);
        const clipId = unique(identifier(clip.id, 'Clip ID'), seen, 'track or clip');
        const startBeat = number(clip.startBeat, `Clip ${clipId} startBeat`, 0, totalBeats, 0);
        const durationBeats = number(clip.durationBeats, `Clip ${clipId} durationBeats`, 0.001, totalBeats, 4);
        if (startBeat + durationBeats > totalBeats + 1e-8) throw new Error(`Clip ${clipId} extends past the composition`);
        return {
          id: clipId,
          sourceId: identifier(clip.sourceId, `Clip ${clipId} sourceId`),
          startBeat,
          durationBeats,
          offsetSeconds: number(clip.offsetSeconds, `Clip ${clipId} offsetSeconds`, 0, 86400, 0),
          gain: number(clip.gain, `Clip ${clipId} gain`, 0, 4, 1),
          loop: flag(clip.loop, `Clip ${clipId} loop`),
          fadeInSeconds: number(clip.fadeInSeconds, `Clip ${clipId} fadeInSeconds`, 0, 86400, 0),
          fadeOutSeconds: number(clip.fadeOutSeconds, `Clip ${clipId} fadeOutSeconds`, 0, 86400, 0),
        };
      }),
    };
  });
  return {schemaVersion: 1, id: composition.id.trim(), name: string(composition.name, 'Composition name'), bpm, beatsPerBar, lengthBars, tracks};
}

export function compileComposition(value) {
  const composition = validateComposition(value);
  const secondsPerBeat = 60 / composition.bpm;
  const durationSeconds = composition.lengthBars * composition.beatsPerBar * secondsPerBeat;
  const anySolo = composition.tracks.some(track => track.solo);
  const events = [];
  for (const track of composition.tracks) {
    if (track.mute || (anySolo && !track.solo)) continue;
    for (const clip of track.clips) {
      events.push({
        sourceId: clip.sourceId,
        startSeconds: clip.startBeat * secondsPerBeat,
        durationSeconds: clip.durationBeats * secondsPerBeat,
        offsetSeconds: clip.offsetSeconds,
        gain: track.gain * clip.gain,
        pan: track.pan,
        loop: clip.loop,
        fadeInSeconds: Math.min(clip.fadeInSeconds, clip.durationBeats * secondsPerBeat / 2),
        fadeOutSeconds: Math.min(clip.fadeOutSeconds, clip.durationBeats * secondsPerBeat / 2),
      });
    }
  }
  events.sort((a, b) => a.startSeconds - b.startSeconds);
  return {durationSeconds, events};
}
