// Keep game event routing independent of Web Audio and browser storage.
const ROLE_BY_KIND = Object.freeze({ worker: 'worker', infantry: 'infantry', archer: 'archer' });
const BUILDING_BY_TYPE = Object.freeze({ townCenter: 'town-center', 'town-center': 'town-center', barracks: 'barracks', archeryRange: 'archery-range', 'archery-range': 'archery-range' });
const URGENT_CUES = new Set(['battle-alert', 'selected-alert', 'base-alert', 'base-lost', 'objective', 'objective-lost', 'victory', 'defeat', 'draw']);

export function validateMapAudioReference(audio) {
  if (audio === undefined) return null;
  if (!audio || typeof audio !== 'object' || Array.isArray(audio)
    || Object.keys(audio).some((key) => !['packId', 'profileId'].includes(key))
    || !['packId', 'profileId'].every((key) => typeof audio[key] === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(audio[key]))) {
    throw new Error('Map audio must reference a packId and profileId using stable IDs.');
  }
  return { packId: audio.packId, profileId: audio.profileId };
}

export function bindingKeysForEvent({ cue, kind, buildingType, resource } = {}) {
  const keys = [];
  const building = BUILDING_BY_TYPE[buildingType] || (typeof buildingType === 'string' ? buildingType : null);
  const role = ROLE_BY_KIND[kind] || (typeof kind === 'string' ? kind : null);
  if (building && cue === 'select') keys.push(`building.${building}.select`);
  if (role && cue) {
    if (resource && cue === 'gather') keys.push(`unit.${role}.gather.${resource}`);
    keys.push(`unit.${role}.${cue}`);
  }
  if (cue) keys.push(`cue.${cue}`);
  return keys;
}

export function resolveEventBinding(profile, event) {
  for (const key of bindingKeysForEvent(event)) {
    const binding = profile?.bindings?.[key];
    if (binding?.variants?.length) return { key, binding };
  }
  return null;
}

export function createProfileDecisionGate({ now = () => performance.now() } = {}) {
  const lastAt = new Map();
  const lastVariant = new Map();
  let lastSpeechAt = -Infinity;
  let lastSpeechPriority = -Infinity;
  return {
    choose(profile, event) {
      const resolved = resolveEventBinding(profile, event);
      if (!resolved) return null;
      const { key, binding } = resolved;
      const at = now();
      const urgent = URGENT_CUES.has(event.cue);
      const priority = Number.isFinite(binding.priority) ? binding.priority : urgent ? 10 : 0;
      const cooldown = Number.isFinite(binding.cooldownMs) ? binding.cooldownMs : 450;
      if (at - (lastAt.get(key) ?? -Infinity) < cooldown) return null;
      if (binding.bus === 'voice' && !urgent && at - lastSpeechAt < 1250 && priority <= lastSpeechPriority) return null;
      const variants = binding.variants;
      const previous = lastVariant.get(key);
      const eligible = variants.length > 1 ? variants.filter((variant) => variant.sourceId !== previous) : variants;
      const choices = eligible.length ? eligible : variants;
      const variant = choices[Math.floor(Math.random() * choices.length)];
      lastAt.set(key, at);
      lastVariant.set(key, variant.sourceId);
      if (binding.bus === 'voice') {
        lastSpeechAt = at;
        lastSpeechPriority = priority;
      }
      return { key, binding, variant };
    },
    reset() { lastAt.clear(); lastVariant.clear(); lastSpeechAt = -Infinity; lastSpeechPriority = -Infinity; },
  };
}
