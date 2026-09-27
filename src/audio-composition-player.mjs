import { compileComposition } from './audio-composition.mjs';

// One Web Audio clock drives every clip. A generation token invalidates loads after stop/switch.
export function createCompositionPlayer({ context, destination, resolveBuffer }) {
  let generation = 0;
  let active = [];
  let restartTimer = null;
  let disposed = false;
  function stop() {
    generation++;
    if (restartTimer !== null) clearTimeout(restartTimer);
    restartTimer = null;
    for (const { source, envelope, pan } of active) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect(); envelope.disconnect(); pan?.disconnect();
    }
    active = [];
  }
  async function play(composition, { loop = false } = {}) {
    stop();
    if (disposed) throw new Error('Composition player is disposed.');
    const ticket = generation;
    const compiled = compileComposition(composition);
    if (!compiled.events.length) throw new Error('Composition has no audible clips.');
    const buffers = new Map();
    let decodedBytes = 0;
    for (const id of new Set(compiled.events.map((event) => event.sourceId))) {
      const buffer = await resolveBuffer(id);
      if (ticket !== generation || disposed) return false;
      decodedBytes += buffer.length * buffer.numberOfChannels * 4;
      if (decodedBytes > 24 * 1024 * 1024) throw new Error('Composition exceeds the 24 MiB playback memory limit.');
      buffers.set(id, buffer);
    }
    if (ticket !== generation || disposed) return false;
    const start = context.currentTime + 0.08;
    const scheduleCycle = (cycleStart) => {
    if (ticket !== generation || disposed) return;
    for (const event of compiled.events) {
      const buffer = buffers.get(event.sourceId);
      if (!buffer || event.offsetSeconds >= buffer.duration) throw new Error(`Audio source ${event.sourceId} cannot play from this offset.`);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = event.loop === true;
      if (source.loop) { source.loopStart = event.offsetSeconds; source.loopEnd = buffer.duration; }
      const envelope = context.createGain();
      const pan = context.createStereoPanner?.();
      if (pan) pan.pan.value = event.pan;
      source.connect(envelope);
      envelope.connect(pan || destination);
      if (pan) pan.connect(destination);
      const at = cycleStart + event.startSeconds;
      const duration = Math.min(event.durationSeconds, compiled.durationSeconds - event.startSeconds);
      const fadeIn = Math.min(event.fadeInSeconds || 0, duration);
      const fadeOut = Math.min(event.fadeOutSeconds || 0, duration);
      const peak = event.gain;
      envelope.gain.setValueAtTime(fadeIn ? 0 : peak, at);
      if (fadeIn) envelope.gain.linearRampToValueAtTime(peak, at + fadeIn);
      if (fadeOut) { envelope.gain.setValueAtTime(peak, at + duration - fadeOut); envelope.gain.linearRampToValueAtTime(0, at + duration); }
      const record = { source, envelope, pan };
      source.onended = () => { source.disconnect(); envelope.disconnect(); pan?.disconnect(); active = active.filter((item) => item !== record); };
      source.start(at, event.offsetSeconds);
      source.stop(at + duration);
      active.push(record);
    }
    };
    scheduleCycle(start);
    if (loop && compiled.durationSeconds > 0) {
      let nextStart = start + compiled.durationSeconds;
      const scheduleNext = () => {
        if (ticket !== generation || disposed) return;
        scheduleCycle(nextStart);
        nextStart += compiled.durationSeconds;
        restartTimer = setTimeout(scheduleNext, Math.max(1, (nextStart - context.currentTime - 0.25) * 1000));
      };
      restartTimer = setTimeout(scheduleNext, Math.max(1, (nextStart - context.currentTime - 0.25) * 1000));
    }
    return true;
  }
  return { play, stop, dispose() { stop(); disposed = true; } };
}
