// Shared gameplay data. Presentation IDs identify profiles, never collision or combat rules.
export function validateGameplayDefinitions(definitions) {
  if (!definitions || definitions.version !== 1) throw new Error('Unsupported gameplay definition version');
  for (const key of ['repairHpPerSecond', 'fullRepairWoodFraction', 'minimumRepairWood']) {
    if (!Number.isFinite(definitions.baseLifecycle?.[key]) || definitions.baseLifecycle[key] <= 0) throw new Error(`Invalid base lifecycle ${key}`);
  }
  const { attackClasses, tags, capabilities, minimumDamage } = definitions.combatRules || {};
  for (const [name, values] of Object.entries({ attackClasses, tags, capabilities })) if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length || values.some((value) => typeof value !== 'string' || !/^[a-z][a-z0-9-]*$/.test(value))) throw new Error(`Invalid combat rules ${name}`);
  if (!Number.isFinite(minimumDamage) || minimumDamage <= 0) throw new Error('Invalid minimum damage');
  const wireIds = new Set();
  const upgradeKeys = new Set();
  for (const category of ['units', 'buildings', 'technologies']) {
    const entries = definitions[category];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Missing ${category}`);
    for (const [id, entry] of Object.entries(entries)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !/^[a-z][a-z0-9-]*$/.test(id) || entry.id !== id) throw new Error(`Invalid ${category} ID: ${id}`);
      if (!entry.label || (category !== 'technologies' && !entry.presentation)) throw new Error(`Missing identity: ${id}`);
      for (const resource of ['food', 'wood']) {
        if (!Number.isFinite(entry.cost?.[resource]) || entry.cost[resource] < 0) throw new Error(`Invalid ${resource} cost: ${id}`);
      }
      for (const key of category === 'units' ? ['trainSeconds', 'population']
        : category === 'buildings' ? ['buildSeconds', 'footprint', 'maxHp'] : ['durationSeconds']) {
        if (!Number.isFinite(entry[key]) || entry[key] <= 0) throw new Error(`Invalid ${key}: ${id}`);
      }
      if (category !== 'technologies') {
        if (!Array.isArray(entry.tags) || !entry.tags.length || new Set(entry.tags).size !== entry.tags.length || entry.tags.some((tag) => !tags.includes(tag))) throw new Error(`Invalid combat tags: ${id}`);
        if (!entry.armor || typeof entry.armor !== 'object' || Array.isArray(entry.armor) || Object.entries(entry.armor).some(([key, value]) => !attackClasses.includes(key) || !Number.isFinite(value) || value < 0)) throw new Error(`Invalid armor: ${id}`);
        if (category === 'units' && (!Array.isArray(entry.capabilities) || new Set(entry.capabilities).size !== entry.capabilities.length || entry.capabilities.some((value) => !capabilities.includes(value)))) throw new Error(`Invalid capabilities: ${id}`);
        if (entry.combat) {
          if (!attackClasses.includes(entry.combat.attackClass) || !['melee', 'ranged'].includes(entry.combat.mode)) throw new Error(`Invalid attack class or mode: ${id}`);
          if (!Array.isArray(entry.combat.targetTags) || !entry.combat.targetTags.length || new Set(entry.combat.targetTags).size !== entry.combat.targetTags.length || entry.combat.targetTags.some((tag) => !tags.includes(tag))) throw new Error(`Invalid target tags: ${id}`);
          if (!entry.combat.tagMultipliers || typeof entry.combat.tagMultipliers !== 'object' || Array.isArray(entry.combat.tagMultipliers) || Object.entries(entry.combat.tagMultipliers).some(([tag, value]) => !tags.includes(tag) || !Number.isFinite(value) || value <= 0)) throw new Error(`Invalid tag multiplier: ${id}`);
        }
      }
      if (category === 'units') {
        if (!Number.isInteger(entry.wireId) || entry.wireId < 0 || entry.wireId > 255 || wireIds.has(entry.wireId)) throw new Error(`Invalid or duplicate unit wire ID: ${id}`);
        wireIds.add(entry.wireId);
        if (entry.sight !== undefined && (!Number.isInteger(entry.sight) || entry.sight < 1 || entry.sight > 16)) throw new Error(`Invalid unit sight: ${id}`);
        if (!Number.isInteger(entry.population)) throw new Error(`Invalid population: ${id}`);
        if (entry.combat?.range > 16) throw new Error(`Invalid combat range: ${id}`);
        for (const key of ['maxHp', 'moveSpeed', 'range', 'damage', 'period', 'structureDamage']) {
          if (!Number.isFinite(entry.combat?.[key]) || entry.combat[key] <= 0) throw new Error(`Invalid combat ${key}: ${id}`);
        }
      }
      if (category === 'buildings') {
        if (entry.combat !== undefined) {
          if (!entry.combat || typeof entry.combat !== 'object' || Array.isArray(entry.combat)) throw new Error(`Invalid building combat: ${id}`);
          if (entry.combat.range > 16) throw new Error(`Invalid building combat range: ${id}`);
          for (const key of ['range', 'damage', 'period']) if (!Number.isFinite(entry.combat[key]) || entry.combat[key] <= 0) throw new Error(`Invalid building combat ${key}: ${id}`);
        }
        if (entry.sight !== undefined && (!Number.isInteger(entry.sight) || entry.sight < 1 || entry.sight > 16)) throw new Error(`Invalid building sight: ${id}`);
        if (entry.populationCapacity !== undefined && (!Number.isInteger(entry.populationCapacity) || entry.populationCapacity < 0)) throw new Error(`Invalid population capacity: ${id}`);
        if (entry.dropoff !== undefined && (!Array.isArray(entry.dropoff) || !entry.dropoff.length || new Set(entry.dropoff).size !== entry.dropoff.length || entry.dropoff.some((resource) => !['food', 'wood'].includes(resource)))) throw new Error(`Invalid dropoff resources: ${id}`);
        if (!Number.isInteger(entry.footprint) || entry.footprint % 2 !== 1 || entry.footprint > 9) throw new Error(`Invalid footprint: ${id}`);
        if (!Array.isArray(entry.products) || new Set(entry.products).size !== entry.products.length) throw new Error(`Invalid or duplicate products: ${id}`);
        for (const product of entry.products) {
          if (!Object.hasOwn(definitions.units, product)) throw new Error(`Unknown product ${product}: ${id}`);
        }
      }
      if (category === 'technologies') {
        if (!Array.isArray(entry.effects)) throw new Error(`Invalid technology effects: ${id}`);
        for (const effect of entry.effects) {
          if (!effect || !['damage-multiplier', 'armor'].includes(effect.stat) || !Number.isFinite(effect.value) || effect.value < 0 || (effect.stat === 'armor' && !attackClasses.includes(effect.attackClass)) || (effect.stat === 'damage-multiplier' && effect.value === 0) || !Array.isArray(effect.targetTags) || !effect.targetTags.length || new Set(effect.targetTags).size !== effect.targetTags.length || effect.targetTags.some((tag) => !tags.includes(tag))) throw new Error(`Invalid technology effect: ${id}`);
        }
        if (!Object.hasOwn(definitions.buildings, entry.building)) throw new Error(`Unknown research building: ${id}`);
        if (typeof entry.upgradeKey !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(entry.upgradeKey) || upgradeKeys.has(entry.upgradeKey)) throw new Error(`Invalid or duplicate upgrade key: ${id}`);
        upgradeKeys.add(entry.upgradeKey);
      }
      if (entry.requires !== undefined && (!Array.isArray(entry.requires) || new Set(entry.requires).size !== entry.requires.length)) throw new Error(`Invalid or duplicate prerequisites: ${id}`);
      for (const required of entry.requires || []) {
        if (!Object.hasOwn(definitions.technologies, required)) throw new Error(`Unknown prerequisite ${required}: ${id}`);
      }
    }
  }
  const graph = new Map();
  for (const [id, entry] of Object.entries(definitions.buildings)) graph.set(`building:${id}`, (entry.requires || []).map((required) => `technology:${required}`));
  for (const [id, entry] of Object.entries(definitions.technologies)) graph.set(`technology:${id}`, [`building:${entry.building}`, ...(entry.requires || []).map((required) => `technology:${required}`)]);
  const visited = new Set(); const visiting = new Set();
  function visit(id, path) {
    if (visiting.has(id)) throw new Error(`Cyclic prerequisites: ${[...path, id].join(' -> ')}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) || []) visit(next, [...path, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const id of graph.keys()) visit(id, []);
  if (!definitions.factions || typeof definitions.factions !== 'object' || Array.isArray(definitions.factions)) throw new Error('Missing factions');
  for (const [id, faction] of Object.entries(definitions.factions)) {
    if (!faction || faction.id !== id || !/^[a-z][a-z0-9-]*$/.test(id) || typeof faction.label !== 'string' || !faction.label.trim()) throw new Error(`Invalid faction: ${id}`);
    for (const category of ['units', 'buildings', 'technologies']) {
      const roster = faction[category];
      if (!Array.isArray(roster) || new Set(roster).size !== roster.length) throw new Error(`Invalid or duplicate faction ${category}: ${id}`);
      for (const contentId of roster) if (!Object.hasOwn(definitions[category], contentId)) throw new Error(`Unknown faction ${category} ${contentId}: ${id}`);
    }
    for (const buildingId of faction.buildings) {
      const building = definitions.buildings[buildingId];
      for (const kind of building.products) if (!faction.units.includes(kind)) throw new Error(`Faction ${id} producer ${buildingId} requires unit ${kind}`);
    }
    for (const technologyId of faction.technologies) if (!faction.buildings.includes(definitions.technologies[technologyId].building)) throw new Error(`Faction ${id} technology ${technologyId} requires its research building`);
    for (const category of ['units', 'buildings', 'technologies']) {
      for (const contentId of faction[category]) for (const required of definitions[category][contentId].requires || []) {
        if (!faction.technologies.includes(required)) throw new Error(`Faction ${id} content ${contentId} requires technology ${required}`);
      }
    }
  }
  if (!Object.hasOwn(definitions.factions, definitions.defaultFaction)) throw new Error('Unknown default faction');
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
  defaultFaction: 'frontier',
  combatRules: { attackClasses: ['melee', 'pierce', 'siege'], tags: ['ground', 'worker', 'infantry', 'spearman', 'archer', 'mounted', 'scout', 'siege', 'structure', 'defense'], capabilities: ['move', 'attack', 'attack-structures', 'gather', 'build', 'repair'], minimumDamage: 0.5 },
  baseLifecycle: { repairHpPerSecond: 40, fullRepairWoodFraction: 0.3, minimumRepairWood: 10 },
  units: {
    worker: { id: 'worker', wireId: 0, label: 'Worker', tags: ['ground', 'worker'], armor: { melee: 0, pierce: 0, siege: 0 }, capabilities: ['move', 'attack', 'gather', 'build', 'repair'], cost: { food: 50, wood: 0 }, trainSeconds: 25, population: 1, combat: { mode: 'melee', attackClass: 'melee', targetTags: ['ground'], tagMultipliers: {}, maxHp: 100, moveSpeed: 2.6, range: 1.28, damage: 4, period: 0.85, structureDamage: 1 }, presentation: 'unit.worker' },
    infantry: { id: 'infantry', wireId: 1, label: 'Infantry', tags: ['ground', 'infantry'], armor: { melee: 0, pierce: 0, siege: 0 }, capabilities: ['move', 'attack', 'attack-structures'], cost: { food: 50, wood: 0 }, trainSeconds: 12, population: 1, combat: { mode: 'melee', attackClass: 'melee', targetTags: ['ground', 'structure'], tagMultipliers: {}, maxHp: 100, moveSpeed: 2.6, range: 1.28, damage: 10, period: 0.85, structureDamage: 1.5 }, presentation: 'unit.infantry' },
    spearman: { id: 'spearman', wireId: 3, label: 'Spearman', tags: ['ground', 'spearman'], armor: { melee: 0, pierce: 0, siege: 0 }, capabilities: ['move', 'attack', 'attack-structures'], cost: { food: 60, wood: 20 }, trainSeconds: 12, population: 1, combat: { mode: 'melee', attackClass: 'melee', targetTags: ['ground', 'structure'], tagMultipliers: { mounted: 3 }, maxHp: 110, moveSpeed: 2.6, range: 1.4, damage: 8, period: 0.85, structureDamage: 1.2 }, presentation: 'unit.spearman' },
    archer: { id: 'archer', wireId: 2, label: 'Archer', tags: ['ground', 'archer'], armor: { melee: 0, pierce: 0, siege: 0 }, capabilities: ['move', 'attack', 'attack-structures'], cost: { food: 25, wood: 45 }, trainSeconds: 7, population: 1, combat: { mode: 'ranged', attackClass: 'pierce', targetTags: ['ground', 'structure'], tagMultipliers: {}, maxHp: 70, moveSpeed: 2.6, range: 4.5, damage: 7, period: 1, structureDamage: 0.8 }, presentation: 'unit.archer' },
    scout: { id: 'scout', wireId: 4, label: 'Scout', tags: ['ground', 'mounted', 'scout'], armor: { melee: 0, pierce: 0, siege: 0 }, capabilities: ['move', 'attack', 'attack-structures'], sight: 11, cost: { food: 40, wood: 30 }, trainSeconds: 16, population: 1, combat: { mode: 'melee', attackClass: 'melee', targetTags: ['ground', 'structure'], tagMultipliers: {}, maxHp: 60, moveSpeed: 4.5, range: 1.3, damage: 4, period: 1, structureDamage: 1 }, presentation: 'unit.scout' },
    rider: { id: 'rider', wireId: 5, label: 'Rider', tags: ['ground', 'mounted'], armor: { melee: 1, pierce: 2, siege: 0 }, capabilities: ['move', 'attack', 'attack-structures'], cost: { food: 85, wood: 25 }, trainSeconds: 20, population: 2, combat: { mode: 'melee', attackClass: 'melee', targetTags: ['ground', 'structure'], tagMultipliers: {}, maxHp: 130, moveSpeed: 3.8, range: 1.3, damage: 11, period: 0.9, structureDamage: 2.4 }, presentation: 'unit.rider' },
    'siege-engine': { id: 'siege-engine', wireId: 6, label: 'Siege Engine', tags: ['ground', 'siege'], armor: { melee: 0, pierce: 0, siege: 0 }, capabilities: ['move', 'attack', 'attack-structures'], requires: ['siege-engineering'], cost: { food: 80, wood: 160 }, trainSeconds: 30, population: 3, combat: { mode: 'ranged', attackClass: 'siege', targetTags: ['ground', 'structure'], tagMultipliers: { defense: 2 }, maxHp: 90, moveSpeed: 1.8, range: 8, damage: 6, period: 2.5, structureDamage: 24 }, presentation: 'unit.siege-engine' },
  },
  buildings: {
    workshop: { id: 'workshop', label: 'Workshop', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, requires: ['military-tier-2'], cost: { food: 0, wood: 250 }, buildSeconds: 30, footprint: 3, maxHp: 1600, products: ['siege-engine'], presentation: 'building.workshop' },
    stable: { id: 'stable', label: 'Stable', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 0, wood: 200 }, buildSeconds: 25, footprint: 3, maxHp: 1600, products: ['scout', 'rider'], presentation: 'building.stable' },
    watchtower: { id: 'watchtower', label: 'Watchtower', tags: ['structure', 'defense'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 50, wood: 150 }, buildSeconds: 35, footprint: 3, maxHp: 1200, products: [], sight: 10, combat: { mode: 'ranged', attackClass: 'pierce', targetTags: ['ground'], tagMultipliers: {}, range: 7, damage: 8, period: 1.25 }, presentation: 'building.watchtower' },
    'town-center': { id: 'town-center', label: 'Town Center', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 100, wood: 400 }, buildSeconds: 60, footprint: 5, maxHp: 2400, products: ['worker'], populationCapacity: 5, dropoff: ['food', 'wood'], presentation: 'building.town-center' },
    storehouse: { id: 'storehouse', label: 'Storehouse', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 0, wood: 100 }, buildSeconds: 20, footprint: 3, maxHp: 1200, products: [], dropoff: ['food', 'wood'], presentation: 'building.storehouse' },
    house: { id: 'house', label: 'House', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 0, wood: 75 }, buildSeconds: 15, footprint: 3, maxHp: 800, products: [], populationCapacity: 8, presentation: 'building.house' },
    barracks: { id: 'barracks', label: 'Barracks', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 0, wood: 175 }, buildSeconds: 20, footprint: 3, maxHp: 1800, products: ['infantry', 'spearman'], presentation: 'building.barracks' },
    'archery-range': { id: 'archery-range', label: 'Archery Range', tags: ['structure'], armor: { melee: 0, pierce: 0, siege: 0 }, cost: { food: 0, wood: 150 }, buildSeconds: 20, footprint: 3, maxHp: 1800, products: ['archer'], presentation: 'building.archery-range' },
  },
  factions: { frontier: { id: 'frontier', label: 'Frontier', units: ['worker', 'infantry', 'archer', 'spearman', 'scout', 'rider', 'siege-engine'], buildings: ['house', 'barracks', 'archery-range', 'storehouse', 'town-center', 'watchtower', 'stable', 'workshop'], technologies: ['infantry-attack', 'archer-attack', 'military-tier-2', 'military-armor', 'mounted-attack', 'siege-engineering'] } },
  technologies: {
    'siege-engineering': { id: 'siege-engineering', label: 'SIEGE ENGINEERING', building: 'workshop', upgradeKey: 'siegeEngineering', requires: ['military-tier-2'], effects: [], cost: { food: 150, wood: 150 }, durationSeconds: 30 },
    'military-tier-2': { id: 'military-tier-2', label: 'MILITARY TIER II', building: 'town-center', upgradeKey: 'militaryTier2', effects: [], cost: { food: 200, wood: 150 }, durationSeconds: 35 },
    'military-armor': { id: 'military-armor', label: 'MILITARY ARMOR', building: 'barracks', upgradeKey: 'militaryArmor', requires: ['military-tier-2'], effects: [{ stat: 'armor', attackClass: 'melee', value: 1, targetTags: ['infantry', 'spearman', 'archer', 'mounted', 'siege'] }, { stat: 'armor', attackClass: 'pierce', value: 1, targetTags: ['infantry', 'spearman', 'archer', 'mounted', 'siege'] }], cost: { food: 100, wood: 100 }, durationSeconds: 25 },
    'mounted-attack': { id: 'mounted-attack', label: 'MOUNTED FORGING', building: 'stable', upgradeKey: 'mountedAttack', requires: ['military-tier-2'], effects: [{ stat: 'damage-multiplier', value: 1.2, targetTags: ['mounted'] }], cost: { food: 120, wood: 100 }, durationSeconds: 25 },
    'infantry-attack': { id: 'infantry-attack', label: 'INFANTRY FORGING', building: 'barracks', upgradeKey: 'infantryAttack', effects: [{ stat: 'damage-multiplier', value: 1.2, targetTags: ['infantry'] }], cost: { food: 100, wood: 75 }, durationSeconds: 25 },
    'archer-attack': { id: 'archer-attack', label: 'ARCHER FLETCHING', building: 'archery-range', upgradeKey: 'archerAttack', effects: [{ stat: 'damage-multiplier', value: 1.2, targetTags: ['archer'] }], cost: { food: 125, wood: 125 }, durationSeconds: 25 },
  },
}));
export const UNIT_DEFINITIONS = GAMEPLAY_DEFINITIONS.units;
export const BUILDING_DEFINITIONS = GAMEPLAY_DEFINITIONS.buildings;
export const TECHNOLOGY_DEFINITIONS = GAMEPLAY_DEFINITIONS.technologies;

export const FACTION_DEFINITIONS = GAMEPLAY_DEFINITIONS.factions;
export const DEFAULT_FACTION_ID = GAMEPLAY_DEFINITIONS.defaultFaction;
export const UNIT_WIRE_IDS = Object.freeze(Object.fromEntries(Object.values(UNIT_DEFINITIONS).map((unit) => [unit.id, unit.wireId])));

export function canonicalGameplayDefinitions(definitions) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter((key) => !['label', 'presentation'].includes(key)).sort().map((key) => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(definitions));
}
export async function gameplayRulesetRevision(definitions) {
  const bytes = new TextEncoder().encode(canonicalGameplayDefinitions(definitions));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `v${definitions.version}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
export const GAMEPLAY_RULESET_REVISION = await gameplayRulesetRevision(GAMEPLAY_DEFINITIONS);

export function missingGameplayPrerequisites(definition, upgrades) {
  return (definition.requires || []).filter((id) => !upgrades?.[TECHNOLOGY_DEFINITIONS[id].upgradeKey]);
}
