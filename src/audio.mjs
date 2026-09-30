import { loadShippedAudio } from './audio-shipped-loader.mjs';
import { createProfileDecisionGate, resolveEventBinding } from './audio-event-profile.mjs';
// Web Audio synthesis remains the fallback when an authored local pack is unavailable.
const STORAGE_KEY = 'tus-audio-v1';
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, captions: false, volume: 0.5, effectsLevel: 1, voiceLevel: 1, musicLevel: 1, ambience: true, ambienceLevel: 1,
});
const COOLDOWN_MS = Object.freeze({
  send: 90, work: 1200, patrol: 170, follow: 170, stop: 170, hold: 170, ready: 2200, death: 2200, repair: 170, select: 90, move: 90, attack: 120, gather: 140, rally: 550, build: 170,
  queue: 170, complete: 2200, 'research-complete': 2600, 'scenario-reward': 2400,
  reject: 250, objective: 1200, 'objective-lost': 1200,
  'resource-empty': 8000, 'base-lost': 2000, 'building-complete': 2600,
  victory: 5000, defeat: 5000, draw: 5000,
  'battle-alert': 9000, 'selected-alert': 11000, 'base-alert': 11000,
});
const AMBIENCE_CHORDS = Object.freeze([
  Object.freeze([146.83, 220, 293.66]),
  Object.freeze([130.81, 196, 261.63]),
  Object.freeze([164.81, 246.94, 329.63]),
]);
const MUSIC_NOTE_SPACING_SECONDS = 0.58;
const MUSIC_NOTE_DURATION_SECONDS = 1.85;
const MUSIC_SCHEDULE_AHEAD_SECONDS = 0.08;
export const AMBIENCE_PREVIEW_DURATION_MS = Math.ceil((MUSIC_SCHEDULE_AHEAD_SECONDS
  + MUSIC_NOTE_SPACING_SECONDS * (AMBIENCE_CHORDS[0].length - 1)
  + MUSIC_NOTE_DURATION_SECONDS + 0.01) * 1000);

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function readAudioSettings(storage = browserStorage()) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_SETTINGS.enabled,
      captions: typeof saved.captions === 'boolean' ? saved.captions : DEFAULT_SETTINGS.captions,
      volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : DEFAULT_SETTINGS.volume,
      effectsLevel: Number.isFinite(saved.effectsLevel)
        ? Math.max(0, Math.min(2, saved.effectsLevel)) : DEFAULT_SETTINGS.effectsLevel,
      voiceLevel: Number.isFinite(saved.voiceLevel) ? Math.max(0, Math.min(2, saved.voiceLevel)) : DEFAULT_SETTINGS.voiceLevel,
      musicLevel: Number.isFinite(saved.musicLevel) ? Math.max(0, Math.min(2, saved.musicLevel))
        : saved.ambience === false ? 0
          : Number.isFinite(saved.ambienceLevel) ? Math.max(0, Math.min(2, saved.ambienceLevel)) : DEFAULT_SETTINGS.musicLevel,
      ambience: typeof saved.ambience === 'boolean' ? saved.ambience : DEFAULT_SETTINGS.ambience,
      ambienceLevel: Number.isFinite(saved.ambienceLevel)
        ? Math.max(0, Math.min(2, saved.ambienceLevel)) : DEFAULT_SETTINGS.ambienceLevel,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function createGameAudio({
  storage = browserStorage(), doc = globalThis.document, onStatusChange, onCue, onCueDecision, onProfileCaption, onPackStatus, workNow = () => performance.now(),
} = {}) {
  let settings = readAudioSettings(storage);
  let context = null;
  let master = null;
  let effects = null;
  let atmosphere = null;
  let atmospherePreview = null;
  let voice = null;
  let music = null;
  let compositionPlayer = null;
  let activePack = null;
  let activeProfile = null;
  let activeSourceBlobs = null;
  let packGeneration = 0;
  let packAbort = null;
  let workGeneration = 0;
  let workSignature = '';
  let lastWorkAt = -Infinity;
  const activeWorkSamples = new Set();
  const decisions = [];
  const record = (event, outcome, key = null) => {
    decisions.push({ cue: event?.cue, resource: event?.resource, key, outcome });
    if (decisions.length > 24) decisions.shift();
  };
  function stopWork() {
    workGeneration++; workSignature = '';
    for (const source of activeWorkSamples) { try { source.stop(); } catch {} }
    activeWorkSamples.clear();
  }
  function updateWork(events = []) {
    const signature = events.map((event) => event.resource).sort().join(',');
    if (signature !== workSignature) { stopWork(); workSignature = signature; }
    if (!signature || doc?.hidden || !settings.enabled || settings.volume <= 0 || settings.effectsLevel <= 0) { stopWork(); return; }
    const now = workNow();
    if (now - lastWorkAt < 1500) return;
    lastWorkAt = now;
    for (const event of events.slice(0, 3)) playEvent(event);
  }
  let packStatus = 'No audio pack assigned';
  let profileMusicReady = false;
  const activeSamples = new Set();
  const activeVoiceSamples = new Set();
  const MAX_ACTIVE_SAMPLES = 8;
  const profileGate = createProfileDecisionGate();
  const decoded = new Map();
  let decodedBytes = 0;
  const MAX_DECODED_BYTES = 24 * 1024 * 1024;
  let ambienceSource = null;
  let impactNoise = null;
  let musicTimer = null;
  let voiceCount = 0;
  let transientVoiceCount = 0;
  let voiceLimit = 12;
  let scheduledVoiceSerial = 0;
  let phraseNumber = 0;
  let lastAlertAt = -Infinity;
  let duckUntil = -Infinity;
  let duckTimer = null;
  const lastCueAt = new Map();

  function hasAudibleOutput() {
    return settings.enabled && settings.volume > 0
      && (settings.effectsLevel > 0 || settings.voiceLevel > 0 || settings.musicLevel > 0
        || (settings.ambience && settings.ambienceLevel > 0));
  }

  function status() {
    if (!(globalThis.AudioContext || globalThis.webkitAudioContext)) return 'unavailable';
    if (!settings.enabled || settings.volume <= 0) return 'muted';
    if (settings.effectsLevel <= 0 && settings.voiceLevel <= 0 && settings.musicLevel <= 0
      && (!settings.ambience || settings.ambienceLevel <= 0)) return 'silent';
    return context?.state || 'waiting';
  }

  function emitStatus() { onStatusChange?.(status()); }

  function save() {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }

  function applyLevels() {
    if (!context) return;
    const at = context.currentTime;
    master.gain.setTargetAtTime(settings.enabled ? settings.volume * 0.78 : 0, at, 0.045);
    effects.gain.setTargetAtTime(0.52 * settings.effectsLevel, at, 0.045);
    voice.gain.setTargetAtTime(0.68 * settings.voiceLevel, at, 0.045);
    const ducked = performance.now() < duckUntil;
    music.gain.setTargetAtTime((ducked ? 0.18 : 0.55) * settings.musicLevel, at, 0.15);
    const ambienceEnabled = settings.enabled && settings.ambience;
    atmosphere.gain.setTargetAtTime(ambienceEnabled
      ? (ducked ? 0.045 : 0.18) * settings.ambienceLevel : 0, at, ducked ? 0.04 : 0.25);
    atmospherePreview.gain.setTargetAtTime(settings.enabled ? 0.18 * settings.musicLevel : 0, at, 0.045);
  }

  function makeContext() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      context = new AudioContextClass({ latencyHint: 'interactive' });
      context.onstatechange = emitStatus;
      master = context.createGain();
      effects = context.createGain();
      atmosphere = context.createGain();
      atmospherePreview = context.createGain();
      voice = context.createGain();
      music = context.createGain();
      effects.gain.value = 0.52;
      atmosphere.gain.value = 0;
      atmospherePreview.gain.value = 0;
      effects.connect(master);
      voice.connect(master);
      music.connect(master);
      atmosphere.connect(master);
      atmospherePreview.connect(master);
      master.connect(context.destination);
      applyLevels();
      createAmbience();
      if (activeProfile) void startProfileMusic();
      musicTimer = globalThis.setInterval(scheduleMusic, 34000);
      emitStatus();
      return true;
    } catch {
      context = null;
      emitStatus();
      return false;
    }
  }

  function createAmbience() {
    const sampleRate = context.sampleRate;
    const sourceLength = Math.max(1, Math.floor(sampleRate * 12));
    const candidateFadeLength = Math.min(Math.floor(sampleRate * 0.12), Math.floor(sourceLength / 8));
    const fadeLength = candidateFadeLength >= 2 ? candidateFadeLength : 0;
    const loopLength = sourceLength - fadeLength;
    const buffer = context.createBuffer(1, loopLength, sampleRate);
    const data = buffer.getChannelData(0);
    const head = fadeLength > 0 ? new Float32Array(fadeLength) : null;
    const tail = fadeLength > 0 ? new Float32Array(fadeLength) : null;
    let random = 0x845ac17;
    let drift = 0;
    for (let i = 0; i < sourceLength; i++) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      drift = drift * 0.995 + ((random >>> 0) / 0xffffffff * 2 - 1) * 0.005;
      const sample = drift * 0.65;
      if (fadeLength > 0 && i < fadeLength) head[i] = sample;
      if (i < loopLength) data[i] = sample;
      if (fadeLength > 0 && i >= sourceLength - fadeLength) tail[i - (sourceLength - fadeLength)] = sample;
    }

    // Join the tail to the head over 120 ms so the longer wind loop does not click at its seam.
    if (fadeLength > 0) {
      const bodyLength = sourceLength - fadeLength * 2;
      data.copyWithin(0, fadeLength, loopLength);
      for (let i = 0; i < fadeLength; i++) {
        const progress = i / (fadeLength - 1);
        const outgoing = Math.cos(progress * Math.PI / 2);
        const incoming = Math.sin(progress * Math.PI / 2);
        data[bodyLength + i] = tail[i] * outgoing + head[i] * incoming;
      }
    }
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    ambienceSource = context.createBufferSource();
    ambienceSource.buffer = buffer;
    ambienceSource.loop = true;
    ambienceSource.connect(filter);
    filter.connect(atmosphere);
    ambienceSource.start();
  }

  function tone(frequency, start, duration, {
    wave = 'sine', gain = 0.2, endFrequency = frequency, destination = effects, percussive = false,
  } = {}) {
    if (!context || voiceCount >= voiceLimit) return;
    voiceCount++;
    let oscillator;
    let envelope;
    try {
      oscillator = context.createOscillator();
      envelope = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      envelope.gain.setValueAtTime(0.0001, start);
      const attackTime = percussive ? Math.min(0.003, duration * 0.12) : Math.min(0.018, duration * 0.25);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attackTime);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(destination);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); voiceCount--; };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
      scheduledVoiceSerial++;
    } catch {
      if (oscillator) oscillator.onended = null;
      try { oscillator?.stop(); } catch {}
      oscillator?.disconnect();
      envelope?.disconnect();
      voiceCount--;
    }
  }

  function noiseBurst(start, duration, { centerFrequency = 1400, gain = 0.04, destination = effects } = {}) {
    if (!context || transientVoiceCount >= 2) return;
    transientVoiceCount++;
    let source;
    let filter;
    let envelope;
    try {
      if (!impactNoise) {
        const length = Math.max(1, Math.floor(context.sampleRate * 0.09));
        impactNoise = context.createBuffer(1, length, context.sampleRate);
        const samples = impactNoise.getChannelData(0);
        let random = 0x6d2b79f5;
        for (let i = 0; i < samples.length; i++) {
          random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
          const fade = 1 - i / samples.length;
          samples[i] = ((random >>> 0) / 0x7fffffff - 1) * fade;
        }
      }
      source = context.createBufferSource();
      source.buffer = impactNoise;
      filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = centerFrequency;
      if (filter.Q) filter.Q.value = 0.65;
      envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.004, duration * 0.2));
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(destination);
      source.onended = () => {
        source.disconnect(); filter.disconnect(); envelope.disconnect(); transientVoiceCount--;
      };
      source.start(start);
      source.stop(start + duration + 0.01);
      scheduledVoiceSerial++;
    } catch {
      if (source) source.onended = null;
      try { source?.stop(); } catch {}
      source?.disconnect(); filter?.disconnect(); envelope?.disconnect();
      transientVoiceCount--;
    }
  }

  function playMusicPhrase(notes, destination, gain = 0.06) {
    const start = context.currentTime + MUSIC_SCHEDULE_AHEAD_SECONDS;
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], start + i * MUSIC_NOTE_SPACING_SECONDS, MUSIC_NOTE_DURATION_SECONDS, { wave: 'sine', gain, destination });
    }
  }

  function scheduleMusic() {
    if (!context || context.state !== 'running' || !settings.enabled || settings.volume <= 0 || settings.musicLevel <= 0
      || doc?.hidden || profileMusicReady || performance.now() - lastAlertAt < 10000) return;
    playMusicPhrase(AMBIENCE_CHORDS[phraseNumber++ % AMBIENCE_CHORDS.length], music, 0.02);
  }

  function previewAmbience() {
    if (!context || context.state === 'closed' || !settings.enabled || settings.volume <= 0
      || settings.musicLevel <= 0 || doc?.hidden) return false;
    const scheduledBefore = scheduledVoiceSerial;
    playMusicPhrase(AMBIENCE_CHORDS[phraseNumber % AMBIENCE_CHORDS.length], atmospherePreview);
    return scheduledVoiceSerial > scheduledBefore;
  }

  function unlock() {
    if (!hasAudibleOutput() || doc?.hidden) return;
    if (!context && !makeContext()) return;
    if (context.state === 'suspended') context.resume().then(() => {
      if (activeProfile && !profileMusicReady) void startProfileMusic();
      emitStatus();
    }).catch(() => {});
  }


  function isUrgentCue(cue) {
    return cue.includes('alert') || ['victory', 'defeat', 'draw', 'objective', 'objective-lost', 'base-lost'].includes(cue);
  }

  function duckForAlert(now = performance.now()) {
    lastAlertAt = now;
    duckUntil = now + 2400;
    applyLevels();
    if (duckTimer !== null) globalThis.clearTimeout(duckTimer);
    duckTimer = globalThis.setTimeout(() => { duckTimer = null; applyLevels(); }, 2450);
  }

  function play(cue, { preview = false, suppressDecision = false } = {}) {
    if (!(cue in COOLDOWN_MS)) { record({ cue }, 'unsupported cue'); return false; }
    if (!suppressDecision && !doc?.hidden && (!preview || settings.captions)) {
      try { onCueDecision?.(cue); } catch {}
    }
    if (!settings.enabled || settings.volume <= 0 || settings.effectsLevel <= 0 || doc?.hidden) return false;
    if (!context || context.state === 'closed') return false;
    const now = performance.now();
    if (!preview && now - (lastCueAt.get(cue) ?? -Infinity) < COOLDOWN_MS[cue]) return false;
    const at = context.currentTime + 0.005;
    const scheduledBefore = scheduledVoiceSerial;
    voiceLimit = cue.includes('alert') || ['base-lost', 'objective', 'objective-lost', 'victory', 'defeat', 'draw'].includes(cue)
      ? 20 : 12;
    switch (cue) {
      case 'select': tone(620, at, 0.055, { endFrequency: 780, gain: 0.13 }); break;
      case 'move': tone(310, at, 0.09, { wave: 'triangle', endFrequency: 390, gain: 0.19 }); break;
      case 'attack':
        noiseBurst(at, 0.028, { centerFrequency: 420, gain: 0.025 });
        tone(260, at, 0.11, { wave: 'triangle', endFrequency: 205, gain: 0.18, percussive: true });
        tone(490, at + 0.008, 0.085, { endFrequency: 370, gain: 0.07, percussive: true });
        noiseBurst(at + 0.018, 0.045, { centerFrequency: 1550, gain: 0.018 });
        break;
      case 'send':
      case 'work':
      case 'gather': tone(420, at, 0.07, { wave: 'triangle', endFrequency: 550, gain: 0.14 }); break;
      case 'patrol':
      case 'follow':
      case 'stop':
      case 'hold':
      case 'rally':
        tone(466.16, at, 0.09, { wave: 'triangle', gain: 0.12 });
        tone(698.46, at + 0.1, 0.14, { wave: 'sine', gain: 0.1 });
        break;
      case 'repair':
      case 'build':
        noiseBurst(at, 0.035, { centerFrequency: 900, gain: 0.032 });
        tone(175, at, 0.16, { wave: 'triangle', endFrequency: 147, gain: 0.19 });
        tone(350, at + 0.055, 0.09, { gain: 0.09 });
        break;
      case 'queue': tone(470, at, 0.06, { wave: 'triangle', gain: 0.12 }); tone(590, at + 0.095, 0.07, { wave: 'triangle', gain: 0.1 }); break;
      case 'death': tone(220, at, 0.2, { wave: 'triangle', endFrequency: 110, gain: 0.12 }); break;
      case 'ready':
      case 'complete': tone(392, at, 0.13, { gain: 0.17 }); tone(587, at + 0.13, 0.23, { gain: 0.15 }); break;
      case 'research-complete':
        tone(523.25, at, 0.13, { wave: 'triangle', gain: 0.14 });
        tone(622.25, at + 0.14, 0.17, { wave: 'triangle', gain: 0.12 });
        tone(783.99, at + 0.29, 0.25, { wave: 'triangle', gain: 0.11 });
        break;
      case 'scenario-reward':
        tone(493.88, at, 0.15, { wave: 'triangle', gain: 0.12 });
        tone(739.99, at + 0.12, 0.22, { wave: 'sine', gain: 0.1 });
        break;
      case 'building-complete':
        tone(185, at, 0.1, { wave: 'triangle', gain: 0.11 });
        tone(277.18, at + 0.15, 0.2, { wave: 'sine', gain: 0.09 });
        break;
      case 'reject': tone(250, at, 0.13, { wave: 'sawtooth', endFrequency: 185, gain: 0.11 }); break;
      case 'battle-alert': tone(196, at, 0.17, { wave: 'triangle', gain: 0.14 }); tone(246.94, at + 0.17, 0.21, { wave: 'triangle', gain: 0.12 }); break;
      case 'selected-alert': tone(329.63, at, 0.11, { gain: 0.16 }); tone(220, at + 0.12, 0.22, { gain: 0.15 }); break;
      case 'base-alert': tone(174.61, at, 0.17, { wave: 'triangle', gain: 0.18 }); tone(174.61, at + 0.24, 0.22, { wave: 'triangle', gain: 0.15 }); break;
      case 'objective':
        tone(440, at, 0.16, { wave: 'sine', gain: 0.15 });
        tone(554.37, at + 0.13, 0.2, { wave: 'sine', gain: 0.13 });
        tone(659.25, at + 0.26, 0.28, { wave: 'sine', gain: 0.12 });
        break;
      case 'objective-lost': tone(349.23, at, 0.18, { gain: 0.15 }); tone(261.63, at + 0.17, 0.27, { gain: 0.13 }); break;
      case 'resource-empty': tone(415.3, at, 0.11, { wave: 'triangle', endFrequency: 311.13, gain: 0.11 }); break;
      case 'base-lost':
        tone(233.08, at, 0.16, { wave: 'sawtooth', endFrequency: 155.56, gain: 0.13 });
        tone(138.59, at + 0.11, 0.26, { wave: 'triangle', endFrequency: 103.83, gain: 0.16 });
        tone(116.54, at + 0.31, 0.3, { wave: 'triangle', endFrequency: 87.31, gain: 0.13 });
        break;
      case 'victory': for (const [i, hz] of [880, 1108.73, 1318.51, 1760].entries()) tone(hz, at + i * 0.17, 0.48, { gain: 0.18 }); break;
      case 'defeat': for (const [i, hz] of [329.63, 261.63, 196].entries()) tone(hz, at + i * 0.2, 0.4, { gain: 0.14 }); break;
      case 'draw': tone(293.66, at, 0.34, { gain: 0.13 }); tone(293.66, at + 0.34, 0.35, { gain: 0.11 }); break;
    }
    voiceLimit = 12;
    const scheduled = scheduledVoiceSerial > scheduledBefore;
    if (scheduled) {
      if (!preview) lastCueAt.set(cue, now);
      if (!preview && isUrgentCue(cue)) duckForAlert(now);
      if (!preview) {
        try { onCue?.(cue); } catch {}
      }
    }
    return scheduled;
  }


  function setPackStatus(message) { packStatus = message; onPackStatus?.(message); }

  async function decodeSource(sourceId) {
    if (decoded.has(sourceId)) {
      const buffer = decoded.get(sourceId);
      decoded.delete(sourceId); decoded.set(sourceId, buffer);
      return buffer;
    }
    const ticket = packGeneration;
    const blob = activeSourceBlobs?.[sourceId];
    if (!(blob instanceof Blob)) throw new Error(`Missing audio source ${sourceId}`);
    if (blob.size > 16 * 1024 * 1024) throw new Error(`Audio source ${sourceId} exceeds the decode limit`);
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (ticket !== packGeneration) throw new Error('Audio pack changed during decoding');
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    if (bytes > MAX_DECODED_BYTES) throw new Error(`Decoded source ${sourceId} exceeds memory limit`);
    if (decoded.has(sourceId)) {
      const previous = decoded.get(sourceId);
      decodedBytes -= previous.length * previous.numberOfChannels * 4; decoded.delete(sourceId);
    }
    while (decodedBytes + bytes > MAX_DECODED_BYTES && decoded.size) {
      const [oldId, oldBuffer] = decoded.entries().next().value;
      decodedBytes -= oldBuffer.length * oldBuffer.numberOfChannels * 4;
      decoded.delete(oldId);
    }
    decoded.set(sourceId, buffer); decodedBytes += bytes;
    return buffer;
  }

  async function startProfileMusic() {
    compositionPlayer?.stop();
    profileMusicReady = false;
    const ticket = packGeneration;
    if (!activeProfile?.music?.defaultCompositionId || !context || context.state === 'closed'
      || doc?.hidden || settings.musicLevel <= 0) return;
    const composition = activePack?.compositions?.find((item) => item.id === activeProfile.music.defaultCompositionId);
    if (!composition) { setPackStatus(`Composition ${activeProfile.music.defaultCompositionId} is missing; synthesized music is available.`); return; }
    if (!compositionPlayer) {
      const { createCompositionPlayer } = await import('./audio-composition-player.mjs');
      if (ticket !== packGeneration) return;
      compositionPlayer = createCompositionPlayer({ context, destination: music, resolveBuffer: decodeSource });
    }
    try {
      const started = await compositionPlayer.play(composition, { loop: true });
      if (ticket === packGeneration) profileMusicReady = started === true;
    } catch (error) {
      if (ticket === packGeneration) setPackStatus(`Music could not play: ${error.message}. Synthesized feedback remains available.`);
    }
  }

  async function setMapAudio(reference, libraryStore) {
    packAbort?.abort(); packAbort = new AbortController();
    stopWork();
    const ticket = ++packGeneration;
    compositionPlayer?.stop();
    profileMusicReady = false;
    for (const source of activeSamples) { try { source.stop(); } catch {} }
    activeSamples.clear(); activeVoiceSamples.clear();
    profileGate.reset();
    decoded.clear(); decodedBytes = 0;
    activePack = null; activeProfile = null; activeSourceBlobs = null;
    if (!reference) { setPackStatus('No audio pack assigned'); return; }
    setPackStatus(`Loading audio pack ${reference.packId}…`);
    try {
      const loaded = reference.version ? await loadShippedAudio(reference, { signal: packAbort.signal }) : await libraryStore.loadPack(reference.packId);
      if (ticket !== packGeneration) return;
      if (!loaded) { setPackStatus(`Audio pack ${reference.packId} is missing. Install it in Audio Studio; other players need their own copy.`); return; }
      const profile = loaded.pack.profiles.find((item) => item.id === reference.profileId);
      if (!profile) { setPackStatus(`Audio profile ${reference.profileId} is missing from ${reference.packId}.`); return; }
      activePack = loaded.pack; activeProfile = profile; activeSourceBlobs = loaded.sourceBlobs;
      setPackStatus(`Audio pack ${loaded.pack.name} ready. ${reference.version ? 'Shipped content loads automatically for both players.' : 'Other players need their own installed copy.'}`);
      if (context) await startProfileMusic();
    } catch (error) {
      if (ticket === packGeneration) setPackStatus(`Audio pack unavailable: ${error.message}. Synthesized feedback remains available.`);
    }
  }

  function playEvent(event) {
    const cue = event?.cue;
    if (!(cue in COOLDOWN_MS)) { record(event, 'unsupported cue'); return false; }
    if (!resolveEventBinding(activeProfile, event)) { record(event, 'synthesized fallback'); return play(cue); }
    const choice = profileGate.choose(activeProfile, event);
    if (!choice) { record(event, profileGate.getReason()); return false; }
    record(event, 'resolved', choice.key);
    if (!doc?.hidden && (!settings.enabled || settings.captions)) onCueDecision?.(cue);
    if (!settings.enabled || settings.volume <= 0 || doc?.hidden) { record(event, 'muted/hidden', choice.key); return false; }
    if (!context || context.state !== 'running') { record(event, 'audio locked/suspended', choice.key); return false; }
    const { binding, variant } = choice;
    const destination = binding.bus === 'voice' ? voice : binding.bus === 'ambience' ? atmosphere : effects;
    const enabled = binding.bus === 'voice' ? settings.voiceLevel > 0
      : binding.bus === 'ambience' ? settings.ambience && settings.ambienceLevel > 0 : settings.effectsLevel > 0;
    if (!enabled) { record(event, 'bus muted', choice.key); return false; }
    const ticket = packGeneration;
    const workTicket = workGeneration;
    void decodeSource(variant.sourceId).then((buffer) => {
      if (ticket !== packGeneration || context.state !== 'running' || doc?.hidden || !settings.enabled || settings.volume <= 0 || (cue === 'work' && workTicket !== workGeneration)) return;
      const start = Math.max(0, variant.trimStartSeconds || 0);
      const end = Math.min(buffer.duration, variant.trimEndSeconds ?? buffer.duration);
      if (end <= start) throw new Error('Invalid cue trim');
      if (isUrgentCue(cue) && binding.bus === 'voice') {
        for (const speaking of activeVoiceSamples) {
          activeSamples.delete(speaking);
          try { speaking.stop(); } catch {}
        }
        activeVoiceSamples.clear();
      }
      if (binding.bus === 'voice' && activeVoiceSamples.size >= 2) { record(event, 'voice limit', choice.key); return; }
      if (activeSamples.size >= MAX_ACTIVE_SAMPLES) {
        if (!['battle-alert', 'selected-alert', 'base-alert', 'base-lost', 'victory', 'defeat'].includes(cue)) { record(event, 'sample limit', choice.key); return; }
        const interrupted = activeSamples.values().next().value;
        activeSamples.delete(interrupted); activeVoiceSamples.delete(interrupted);
        try { interrupted.stop(); } catch {}
      }
      const node = context.createBufferSource();
      const gain = context.createGain();
      node.buffer = buffer; gain.gain.value = variant.gain ?? 1;
      node.connect(gain); gain.connect(destination);
      node.onended = () => { activeSamples.delete(node); activeVoiceSamples.delete(node); activeWorkSamples.delete(node); node.disconnect(); gain.disconnect(); };
      activeSamples.add(node);
      if (cue === 'work') activeWorkSamples.add(node);
      record(event, 'sample scheduled', choice.key);
      if (binding.bus === 'voice') activeVoiceSamples.add(node);
      try { node.start(context.currentTime, start, end - start); }
      catch (error) {
        activeSamples.delete(node); activeVoiceSamples.delete(node);
        node.disconnect(); gain.disconnect();
        throw error;
      }
      if (variant.caption) { try { onProfileCaption?.(variant.caption); } catch {} }
      if (isUrgentCue(cue)) duckForAlert();
      try { onCue?.(cue); } catch {}
    }).catch((error) => { if (ticket === packGeneration && (cue !== 'work' || workTicket === workGeneration)) { record(event, `decode failed: ${error.message}`, choice.key); setPackStatus(`Cue ${variant.sourceId} could not decode: ${error.message}. Synthesized feedback remains available.`); play(cue, { suppressDecision: true }); } });
    return true;
  }

  function preview(cue) { return play(cue, { preview: true }); }

  function setSettings(next) {
    const previousMusicLevel = settings.musicLevel;
    settings = {
      enabled: typeof next.enabled === 'boolean' ? next.enabled : settings.enabled,
      captions: typeof next.captions === 'boolean' ? next.captions : settings.captions,
      volume: Number.isFinite(next.volume) ? Math.max(0, Math.min(1, next.volume)) : settings.volume,
      voiceLevel: Number.isFinite(next.voiceLevel) ? Math.max(0, Math.min(2, next.voiceLevel)) : settings.voiceLevel,
      musicLevel: Number.isFinite(next.musicLevel) ? Math.max(0, Math.min(2, next.musicLevel)) : settings.musicLevel,
      effectsLevel: Number.isFinite(next.effectsLevel)
        ? Math.max(0, Math.min(2, next.effectsLevel)) : settings.effectsLevel,
      ambience: typeof next.ambience === 'boolean' ? next.ambience : settings.ambience,
      ambienceLevel: Number.isFinite(next.ambienceLevel)
        ? Math.max(0, Math.min(2, next.ambienceLevel)) : settings.ambienceLevel,
    };
    stopWork();
    save();
    applyLevels();
    if (previousMusicLevel <= 0 && settings.musicLevel > 0 && activeProfile) void startProfileMusic();
    else if (previousMusicLevel > 0 && settings.musicLevel <= 0) { compositionPlayer?.stop(); profileMusicReady = false; }
    if (hasAudibleOutput()) unlock();
    else context?.suspend().catch(() => {});
    emitStatus();
    return { ...settings };
  }

  function onVisibilityChange() {
    if (!context) return;
    if (doc?.hidden) {
      stopWork();
      compositionPlayer?.stop(); profileMusicReady = false;
      context.suspend().then(emitStatus).catch(() => {});
    } else if (hasAudibleOutput()) {
      context.resume().then(() => {
        if (activeProfile) void startProfileMusic();
        emitStatus();
      }).catch(() => {});
    }
  }
  doc?.addEventListener?.('visibilitychange', onVisibilityChange);

  return {
    play, playEvent, stopWork, updateWork, getInspector: () => ({ status: packStatus, profileId: activeProfile?.id || null, bindings: Object.entries(activeProfile?.bindings || {}).map(([key, binding]) => ({ key, bus: binding.bus, sources: binding.variants.map(({ sourceId }) => ({ sourceId, available: activeSourceBlobs?.[sourceId] instanceof Blob })) })), activeSamples: activeSamples.size, activeVoices: activeVoiceSamples.size, activeWork: activeWorkSamples.size, decodedBytes, decisions: [...decisions] }), setMapAudio, getPackStatus: () => packStatus, preview, previewAmbience, unlock, setSettings,
    getSettings: () => ({ ...settings }), getStatus: status,
    dispose() {
      packAbort?.abort(); stopWork();
      doc?.removeEventListener?.('visibilitychange', onVisibilityChange);
      if (musicTimer !== null) globalThis.clearInterval(musicTimer);
      if (duckTimer !== null) globalThis.clearTimeout(duckTimer);
      compositionPlayer?.dispose();
      for (const source of activeSamples) { try { source.stop(); } catch {} }
      activeSamples.clear(); activeVoiceSamples.clear();
      ambienceSource?.stop();
      context?.close().catch(() => {});
    },
  };
}
