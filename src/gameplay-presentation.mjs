import { UNIT_DEFINITIONS } from './gameplay-definitions.mjs';

// Renderer-owned profiles: changing one never changes authoritative stats or timing.
// These profiles bind the existing procedural instanced geometry. Asset-backed and
// skeletal animation backends must declare and implement their own capabilities.
export const UNIT_PRESENTATION_PROFILES = Object.freeze({
  'unit.worker': Object.freeze({ backend: 'procedural', role: 'worker', headTint: 0xd7be8f, bodyTint: 0xe1bc63, bodyTintWeight: 0.42 }),
  'unit.infantry': Object.freeze({ backend: 'procedural', role: 'infantry', headTint: 0xabb2ad, bodyTint: 0xabb2ad, bodyTintWeight: 0 }),
  'unit.archer': Object.freeze({ backend: 'procedural', role: 'archer', headTint: 0x839477, bodyTint: 0xc3c995, bodyTintWeight: 0.27 }),
});

export function validateUnitPresentationBindings(units = UNIT_DEFINITIONS, profiles = UNIT_PRESENTATION_PROFILES) {
  for (const [kind, definition] of Object.entries(units)) {
    const profile = profiles[definition.presentation];
    if (!profile || profile.backend !== 'procedural' || !['worker', 'infantry', 'archer'].includes(profile.role)) {
      throw new Error(`Unsupported presentation binding ${definition.presentation}: ${kind}`);
    }
    if (![profile.headTint, profile.bodyTint].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffff)
      || !Number.isFinite(profile.bodyTintWeight) || profile.bodyTintWeight < 0 || profile.bodyTintWeight > 1) {
      throw new Error(`Invalid presentation colors: ${kind}`);
    }
  }
  return profiles;
}
validateUnitPresentationBindings();

export function unitPresentation(kind) {
  const definition = UNIT_DEFINITIONS[kind];
  if (!definition) throw new Error(`Unknown unit presentation: ${kind}`);
  return UNIT_PRESENTATION_PROFILES[definition.presentation];
}
