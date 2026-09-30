import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from './gameplay-definitions.mjs';

// Renderer-owned profiles: changing one never changes authoritative stats or timing.
// These profiles bind the existing procedural instanced geometry. Asset-backed and
// skeletal animation backends must declare and implement their own capabilities.
export const UNIT_PRESENTATION_PROFILES = Object.freeze({
  'unit.siege-engine': Object.freeze({ backend: 'procedural', role: 'siege', headTint: 0x8b6947, bodyTint: 0x8b6947, bodyTintWeight: 0 }),
  'unit.scout': Object.freeze({ backend: 'procedural', role: 'mounted', headTint: 0x987953, bodyTint: 0xc8af78, bodyTintWeight: 0.35 }),
  'unit.rider': Object.freeze({ backend: 'procedural', role: 'mounted', headTint: 0xabb2ad, bodyTint: 0xabb2ad, bodyTintWeight: 0 }),
  'unit.worker': Object.freeze({ backend: 'procedural', role: 'worker', headTint: 0xd7be8f, bodyTint: 0xe1bc63, bodyTintWeight: 0.42 }),
  'unit.infantry': Object.freeze({ backend: 'procedural', role: 'infantry', headTint: 0xabb2ad, bodyTint: 0xabb2ad, bodyTintWeight: 0 }),
  'unit.spearman': Object.freeze({ backend: 'procedural', role: 'infantry', headTint: 0xc4b795, bodyTint: 0xd6c29a, bodyTintWeight: 0.2 }),
  'unit.archer': Object.freeze({ backend: 'procedural', role: 'archer', headTint: 0x839477, bodyTint: 0xc3c995, bodyTintWeight: 0.27 }),
});

export function validateUnitPresentationBindings(units = UNIT_DEFINITIONS, profiles = UNIT_PRESENTATION_PROFILES) {
  for (const [kind, definition] of Object.entries(units)) {
    const profile = profiles[definition.presentation];
    if (!profile || profile.backend !== 'procedural' || !['worker', 'infantry', 'archer', 'mounted', 'siege'].includes(profile.role)) {
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

export const BUILDING_PRESENTATION_PROFILES = Object.freeze({
  'building.workshop': Object.freeze({ backend: 'procedural', role: 'archery-range' }),
  'building.stable': Object.freeze({ backend: 'procedural', role: 'barracks' }),
  'building.watchtower': Object.freeze({ backend: 'procedural', role: 'watchtower' }),
  'building.town-center': Object.freeze({ backend: 'procedural', role: 'town-center' }),
  'building.storehouse': Object.freeze({ backend: 'procedural', role: 'house' }),
  'building.house': Object.freeze({ backend: 'procedural', role: 'house' }),
  'building.barracks': Object.freeze({ backend: 'procedural', role: 'barracks' }),
  'building.archery-range': Object.freeze({ backend: 'procedural', role: 'archery-range' }),
});
export function validateBuildingPresentationBindings(buildings = BUILDING_DEFINITIONS, profiles = BUILDING_PRESENTATION_PROFILES) {
  for (const [id, definition] of Object.entries(buildings)) {
    const profile = profiles[definition.presentation];
    if (!profile || profile.backend !== 'procedural' || !['house', 'barracks', 'archery-range', 'town-center', 'watchtower'].includes(profile.role)) {
      throw new Error(`Unsupported building presentation binding ${definition.presentation}: ${id}`);
    }
  }
  return profiles;
}
validateBuildingPresentationBindings();
export function buildingPresentation(type) {
  const definition = BUILDING_DEFINITIONS[type];
  if (!definition) throw new Error(`Unknown building presentation: ${type}`);
  return BUILDING_PRESENTATION_PROFILES[definition.presentation];
}
