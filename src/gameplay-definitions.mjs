// Shared gameplay data. Presentation IDs identify profiles, never collision or combat rules.
export function validateGameplayDefinitions(definitions) {
  if (!definitions || definitions.version !== 1) throw new Error('Unsupported gameplay definition version');
  for (const category of ['units', 'buildings', 'technologies']) {
    const entries = definitions[category];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Missing ${category}`);
    for (const [id, entry] of Object.entries(entries)) {
      if (!/^[a-z][a-z0-9-]*$/.test(id) || entry.id !== id) throw new Error(`Invalid ${category} ID: ${id}`);
      if (!entry.label || (category !== 'technologies' && !entry.presentation)) throw new Error(`Missing identity: ${id}`);
      for (const resource of ['food', 'wood']) {
        if (!Number.isFinite(entry.cost?.[resource]) || entry.cost[resource] < 0) throw new Error(`Invalid ${resource} cost: ${id}`);
      }
      for (const key of category === 'units' ? ['trainSeconds', 'population']
        : category === 'buildings' ? ['buildSeconds', 'footprint', 'maxHp'] : ['durationSeconds']) {
        if (!Number.isFinite(entry[key]) || entry[key] <= 0) throw new Error(`Invalid ${key}: ${id}`);
      }
      if (category === 'units') {
        for (const key of ['maxHp', 'moveSpeed', 'range', 'damage', 'period', 'structureDamage']) {
          if (!Number.isFinite(entry.combat?.[key]) || entry.combat[key] <= 0) throw new Error(`Invalid combat ${key}: ${id}`);
        }
      }
      if (category === 'buildings') {
        if (!Number.isInteger(entry.footprint)) throw new Error(`Invalid footprint: ${id}`);
        for (const product of entry.products || []) {
          if (!definitions.units[product]) throw new Error(`Unknown product ${product}: ${id}`);
        }
      }
      if (category === 'technologies' && !definitions.buildings[entry.building]) throw new Error(`Unknown research building: ${id}`);
    }
  }
  return definitions;
}
function freezeTree(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freezeTree(item);
    Object.freeze(value);
  }
  return value;
}
export const GAMEPLAY_DEFINITIONS = freezeTree(validateGameplayDefinitions({
  version: 1,
  units: {
    worker: { id: 'worker', label: 'Worker', cost: { food: 50, wood: 0 }, trainSeconds: 25, population: 1, combat: { maxHp: 100, moveSpeed: 2.6, range: 1.28, damage: 4, period: 0.85, structureDamage: 1 }, presentation: 'unit.worker' },
    infantry: { id: 'infantry', label: 'Infantry', cost: { food: 50, wood: 0 }, trainSeconds: 12, population: 1, combat: { maxHp: 100, moveSpeed: 2.6, range: 1.28, damage: 10, period: 0.85, structureDamage: 1.5 }, presentation: 'unit.infantry' },
    archer: { id: 'archer', label: 'Archer', cost: { food: 25, wood: 45 }, trainSeconds: 7, population: 1, combat: { maxHp: 70, moveSpeed: 2.6, range: 4.5, damage: 7, period: 1, structureDamage: 0.8 }, presentation: 'unit.archer' },
  },
  buildings: {
    barracks: { id: 'barracks', label: 'Barracks', cost: { food: 0, wood: 175 }, buildSeconds: 20, footprint: 3, maxHp: 1800, products: ['infantry'], presentation: 'building.barracks' },
    'archery-range': { id: 'archery-range', label: 'Archery Range', cost: { food: 0, wood: 150 }, buildSeconds: 20, footprint: 3, maxHp: 1800, products: ['archer'], presentation: 'building.archery-range' },
  },
  technologies: {
    'infantry-attack': { id: 'infantry-attack', label: 'INFANTRY FORGING', building: 'barracks', upgradeKey: 'infantryAttack', cost: { food: 100, wood: 75 }, durationSeconds: 25 },
    'archer-attack': { id: 'archer-attack', label: 'ARCHER FLETCHING', building: 'archery-range', upgradeKey: 'archerAttack', cost: { food: 125, wood: 125 }, durationSeconds: 25 },
  },
}));
export const UNIT_DEFINITIONS = GAMEPLAY_DEFINITIONS.units;
export const BUILDING_DEFINITIONS = GAMEPLAY_DEFINITIONS.buildings;
export const TECHNOLOGY_DEFINITIONS = GAMEPLAY_DEFINITIONS.technologies;
