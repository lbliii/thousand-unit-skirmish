// All sounds are synthesized here with Web Audio. No sampled or licensed media is used.
const STORAGE_KEY = 'tus-audio-v1';
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, volume: 0.5, ambience: true });
const COOLDOWN_MS = Object.freeze({
  select: 90, move: 90, attack: 120, gather: 140, build: 170,
  queue: 170, complete: 2200, reject: 250, objective: 1200, 'objective-lost': 1200,
  'resource-empty': 8000, 'base-lost': 2000, 'building-complete': 2600,
  victory: 5000, defeat: 5000, draw: 5000,
  'battle-alert': 9000, 'selected-alert': 11000, 'base-alert': 11000,
});

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function readAudioSettings(storage = browserStorage()) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_SETTINGS.enabled,
      volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : DEFAULT_SETTINGS.volume,
      ambience: typeof saved.ambience === 'boolean' ? saved.ambience : DEFAULT_SETTINGS.ambience,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function createGameAudio({ storage = browserStorage(), doc = globalThis.document, onStatusChange, onCue } = {}) {
  let settings = readAudioSettings(storage);
  let context = null;
  let master = null;
  let effects = null;
  let atmosphere = null;
  let ambienceSource = null;
  let musicTimer = null;
  let voiceCount = 0;
  let voiceLimit = 12;
  let scheduledVoiceSerial = 0;
  let phraseNumber = 0;
  let lastAlertAt = -Infinity;
  let duckUntil = -Infinity;
  let duckTimer = null;
  const lastCueAt = new Map();

  function status() {
    if (!(globalThis.AudioContext || globalThis.webkitAudioContext)) return 'unavailable';
    if (!settings.enabled || settings.volume <= 0) return 'muted';
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
    const ducked = performance.now() < duckUntil;
    atmosphere.gain.setTargetAtTime(settings.enabled && settings.ambience ? (ducked ? 0.045 : 0.18) : 0, at, ducked ? 0.04 : 0.25);
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
      effects.gain.value = 0.52;
      atmosphere.gain.value = 0;
      effects.connect(master);
      atmosphere.connect(master);
      master.connect(context.destination);
      applyLevels();
      createAmbience();
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
    const length = Math.max(1, Math.floor(context.sampleRate * 3));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let random = 0x845ac17;
    let drift = 0;
    for (let i = 0; i < length; i++) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      drift = drift * 0.995 + ((random >>> 0) / 0xffffffff * 2 - 1) * 0.005;
      data[i] = drift * 0.65;
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

  function tone(frequency, start, duration, { wave = 'sine', gain = 0.2, endFrequency = frequency, destination = effects } = {}) {
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
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.018, duration * 0.25));
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

  function scheduleMusic() {
    if (!context || context.state !== 'running' || !settings.enabled || settings.volume <= 0 || !settings.ambience
      || doc?.hidden || performance.now() - lastAlertAt < 10000) return;
    const start = context.currentTime + 0.08;
    const chords = [[146.83, 220, 293.66], [130.81, 196, 261.63], [164.81, 246.94, 329.63]];
    const notes = chords[phraseNumber++ % chords.length];
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], start + i * 0.58, 1.85, { wave: 'sine', gain: 0.06, destination: atmosphere });
    }
  }

  function unlock() {
    if (!settings.enabled || settings.volume <= 0 || doc?.hidden) return;
    if (!context && !makeContext()) return;
    if (context.state === 'suspended') context.resume().then(emitStatus).catch(() => {});
  }

  function play(cue) {
    if (!settings.enabled || settings.volume <= 0 || doc?.hidden) return false;
    if (!context || context.state === 'closed' || !(cue in COOLDOWN_MS)) return false;
    const now = performance.now();
    if (now - (lastCueAt.get(cue) ?? -Infinity) < COOLDOWN_MS[cue]) return false;
    const at = context.currentTime + 0.005;
    const scheduledBefore = scheduledVoiceSerial;
    voiceLimit = cue.includes('alert') || ['base-lost', 'objective', 'objective-lost', 'victory', 'defeat', 'draw'].includes(cue)
      ? 20 : 12;
    switch (cue) {
      case 'select': tone(620, at, 0.055, { endFrequency: 780, gain: 0.13 }); break;
      case 'move': tone(310, at, 0.09, { wave: 'triangle', endFrequency: 390, gain: 0.19 }); break;
      case 'attack': tone(260, at, 0.11, { wave: 'triangle', endFrequency: 205, gain: 0.23 }); tone(490, at + 0.025, 0.07, { endFrequency: 370, gain: 0.1 }); break;
      case 'gather': tone(420, at, 0.07, { wave: 'triangle', endFrequency: 550, gain: 0.14 }); break;
      case 'build': tone(175, at, 0.16, { wave: 'triangle', endFrequency: 147, gain: 0.19 }); tone(350, at + 0.055, 0.09, { gain: 0.09 }); break;
      case 'queue': tone(470, at, 0.06, { wave: 'triangle', gain: 0.12 }); tone(590, at + 0.095, 0.07, { wave: 'triangle', gain: 0.1 }); break;
      case 'complete': tone(392, at, 0.13, { gain: 0.17 }); tone(587, at + 0.13, 0.23, { gain: 0.15 }); break;
      case 'building-complete':
        tone(185, at, 0.1, { wave: 'triangle', gain: 0.11 });
        tone(277.18, at + 0.15, 0.2, { wave: 'sine', gain: 0.09 });
        break;
      case 'reject': tone(250, at, 0.13, { wave: 'sawtooth', endFrequency: 185, gain: 0.11 }); break;
      case 'battle-alert': tone(196, at, 0.17, { wave: 'triangle', gain: 0.14 }); tone(246.94, at + 0.17, 0.21, { wave: 'triangle', gain: 0.12 }); break;
      case 'selected-alert': tone(329.63, at, 0.11, { gain: 0.16 }); tone(220, at + 0.12, 0.22, { gain: 0.15 }); break;
      case 'base-alert': tone(174.61, at, 0.17, { wave: 'triangle', gain: 0.18 }); tone(174.61, at + 0.24, 0.22, { wave: 'triangle', gain: 0.15 }); break;
      case 'objective': tone(392, at, 0.18, { gain: 0.16 }); tone(493.88, at + 0.17, 0.26, { gain: 0.13 }); break;
      case 'objective-lost': tone(349.23, at, 0.18, { gain: 0.15 }); tone(261.63, at + 0.17, 0.27, { gain: 0.13 }); break;
      case 'resource-empty': tone(415.3, at, 0.11, { wave: 'triangle', endFrequency: 311.13, gain: 0.11 }); break;
      case 'base-lost': for (const [i, hz] of [261.63, 196, 146.83].entries()) tone(hz, at + i * 0.15, 0.3, { wave: 'triangle', gain: 0.17 }); break;
      case 'victory': for (const [i, hz] of [293.66, 392, 493.88, 587.33].entries()) tone(hz, at + i * 0.17, 0.48, { gain: 0.18 }); break;
      case 'defeat': for (const [i, hz] of [329.63, 261.63, 196].entries()) tone(hz, at + i * 0.2, 0.4, { gain: 0.14 }); break;
      case 'draw': tone(293.66, at, 0.34, { gain: 0.13 }); tone(293.66, at + 0.34, 0.35, { gain: 0.11 }); break;
    }
    voiceLimit = 12;
    const scheduled = scheduledVoiceSerial > scheduledBefore;
    if (scheduled) {
      lastCueAt.set(cue, now);
      if (cue.includes('alert') || ['victory', 'defeat', 'draw', 'objective', 'objective-lost', 'base-lost'].includes(cue)) {
        lastAlertAt = now;
        duckUntil = now + 2400;
        applyLevels();
        if (duckTimer !== null) globalThis.clearTimeout(duckTimer);
        duckTimer = globalThis.setTimeout(() => { duckTimer = null; applyLevels(); }, 2450);
      }
      try { onCue?.(cue); } catch {}
    }
    return scheduled;
  }

  function setSettings(next) {
    settings = {
      enabled: typeof next.enabled === 'boolean' ? next.enabled : settings.enabled,
      volume: Number.isFinite(next.volume) ? Math.max(0, Math.min(1, next.volume)) : settings.volume,
      ambience: typeof next.ambience === 'boolean' ? next.ambience : settings.ambience,
    };
    save();
    applyLevels();
    if (settings.enabled && settings.volume > 0) unlock();
    else context?.suspend().catch(() => {});
    emitStatus();
    return { ...settings };
  }

  function onVisibilityChange() {
    if (!context) return;
    if (doc?.hidden) context.suspend().then(emitStatus).catch(() => {});
    else if (settings.enabled && settings.volume > 0) context.resume().then(emitStatus).catch(() => {});
  }
  doc?.addEventListener?.('visibilitychange', onVisibilityChange);

  return {
    play, unlock, setSettings,
    getSettings: () => ({ ...settings }), getStatus: status,
    dispose() {
      doc?.removeEventListener?.('visibilitychange', onVisibilityChange);
      if (musicTimer !== null) globalThis.clearInterval(musicTimer);
      if (duckTimer !== null) globalThis.clearTimeout(duckTimer);
      ambienceSource?.stop();
      context?.close().catch(() => {});
    },
  };
}
