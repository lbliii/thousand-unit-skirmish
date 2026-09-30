import { GAMEPLAY_DEFINITIONS } from './gameplay-definitions.mjs';

/** Shared research availability; caller supplies only its own economy and progress. */
export function researchAction(building, technologyId, state, definitions = GAMEPLAY_DEFINITIONS) {
  const technology = Object.hasOwn(definitions.technologies, technologyId)
    ? definitions.technologies[technologyId] : null;
  const missingPrerequisites = (technology?.requires || [])
    .filter(id => !state.upgrades?.[definitions.technologies[id].upgradeKey]);
  const reason = !technology ? 'UNKNOWN TECHNOLOGY'
    : !building || building.team !== state.team || building.type !== technology.building
      ? 'SELECT A FRIENDLY RESEARCH BUILDING'
    : state.matchOver ? 'MATCH FINISHED'
    : !building.complete ? 'COMPLETE BUILDING TO RESEARCH'
    : state.upgrades?.[technology.upgradeKey] ? 'ALREADY COMPLETED'
    : state.active ? 'RESEARCH IN PROGRESS'
    : missingPrerequisites.length
      ? `REQUIRES ${missingPrerequisites.map(id => definitions.technologies[id].label).join(' + ')}`
    : state.food + 1e-9 < technology.cost.food || state.wood + 1e-9 < technology.cost.wood
      ? `NEED ${technology.cost.food} FOOD + ${technology.cost.wood} WOOD` : '';
  return {
    type: 'researchUpgrade', buildingId: building?.id ?? null, upgrade: technologyId,
    cost: technology ? { ...technology.cost } : null,
    durationSeconds: technology?.durationSeconds ?? 0,
    missingPrerequisites, available: !reason, reason,
  };
}

export function emptyTechnologyCompletions(definitions = GAMEPLAY_DEFINITIONS) {
  return Object.fromEntries(Object.values(definitions.technologies).map(technology => [technology.upgradeKey, false]));
}

export function researchOptions(building, state, definitions = GAMEPLAY_DEFINITIONS) {
  return Object.values(definitions.technologies)
    .filter(technology => technology.building === building?.type)
    .map(technology => researchAction(building, technology.id, state, definitions));
}
