import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECHNOLOGY_DEFINITIONS } from './gameplay-definitions.mjs';
/** Bounded production using only the existing team-visible opponent DTO. */
export const PVE_PRODUCTION_LIMITS = Object.freeze({
  openingDelayTicks: 300,
  barracksWoodCost: BUILDING_DEFINITIONS.barracks.cost.wood,
  woodReserve: 25,
  infantryFoodCost: UNIT_DEFINITIONS.infantry.cost.food,
  foodReserve: 50,
  military: 12,
  roster: 24,
  queue: 1,
  retryTicks: 150,
  maxRetryTicks: 900,
});

function visibleFootprint(observation, column, row, half = 1) {
  if (!observation.fogOfWar) return true;
  const mask = observation.visibility;
  if (!mask || mask.columns !== observation.map.width || mask.rows !== observation.map.height) return false;
  const bytes = atob(mask.data);
  for (let z = row - half; z <= row + half; z++) {
    for (let x = column - half; x <= column + half; x++) {
      const cell = z * mask.columns + x;
      if (((bytes.charCodeAt(cell >> 2) >> ((cell & 3) * 2)) & 3) !== 2) return false;
    }
  }
  return true;
}

function candidateSites(observation, home, seed, type = 'barracks') {
  const half = Math.floor(BUILDING_DEFINITIONS[type].footprint / 2);
  const { width, height } = observation.map;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return [];
  const direction = observation.team === 0 ? 1 : -1;
  const offsets = [[6, 0], [0, 6], [0, -6], [-6, 0], [6, 6], [6, -6], [-6, 6], [-6, -6]];
  const rotation = (seed >>> 0) % offsets.length;
  const objects = [...observation.units.friendly, ...observation.units.visibleEnemies]
    .filter((unit) => unit.hp > 0);
  const buildings = [...observation.buildings.friendly, ...observation.buildings.visibleEnemies];
  return offsets.map((_, index) => offsets[(index + rotation) % offsets.length]).flatMap(([dx, dz]) => {
    const column = Math.floor(home.x + direction * dx + width / 2);
    const row = Math.floor(home.z + dz + height / 2);
    if (column < half || row < half || column >= width - half || row >= height - half
      || !visibleFootprint(observation, column, row, half)) return [];
    const point = { x: column + 0.5 - width / 2, z: row + 0.5 - height / 2 };
    const inFootprint = (entity) => {
      const x = Math.floor(entity.x + width / 2);
      const z = Math.floor(entity.z + height / 2);
      return Math.abs(x - column) <= half && Math.abs(z - row) <= half;
    };
    if (objects.some(inFootprint) || observation.resourceNodes.some(inFootprint)
      || buildings.some((building) => { const clearance = (BUILDING_DEFINITIONS[type].footprint + (BUILDING_DEFINITIONS[building.type]?.footprint || 3)) / 2; return Math.abs(building.x - point.x) < clearance && Math.abs(building.z - point.z) < clearance; })
      || observation.objectives.some(({ zone }) => zone && column + half >= zone.column
        && column - half < zone.column + zone.width && row + half >= zone.row && row - half < zone.row + zone.height)) return [];
    return [point];
  });
}

export function createProductionPolicy(seed) {
  const limits = PVE_PRODUCTION_LIMITS;
  let firstTick = null;
  let home = null;
  let nextAttemptTick = 0;
  let retryTicks = limits.retryTicks;
  let siteAttempt = 0;
  const postpone = (tick) => {
    nextAttemptTick = tick + retryTicks;
    retryTicks = Math.min(retryTicks * 2, limits.maxRetryTicks);
  };
  return {
    next(observation) {
      firstTick ??= observation.tick;
      // Partial synthetic observations and maps without an economy cannot spend.
      if (!observation.resources || !observation.buildings) return [];
      const friendly = observation.units.friendly.filter((unit) => unit.hp > 0);
      const workers = friendly.filter((unit) => unit.kind === 'worker').sort((a, b) => a.id - b.id);
      if (!home && workers.length) home = workers.reduce((point, unit) => ({
        x: point.x + unit.x / workers.length, z: point.z + unit.z / workers.length,
      }), { x: 0, z: 0 });
      const barracks = observation.buildings.friendly
        .filter((building) => building.type === 'barracks' && building.hp > 0)
        .sort((a, b) => a.id - b.id)[0];
      if (observation.tick - firstTick < limits.openingDelayTicks) return [];
      if (barracks?.queue > 0 || workers.some((worker) => ['building', 'repairing'].includes(worker.task))) {
        retryTicks = limits.retryTicks;
        nextAttemptTick = observation.tick + limits.retryTicks;
        return [];
      }
      if (observation.tick < nextAttemptTick) return [];
      if (observation.population?.available === 0 && observation.population.capacity >= 1000) return [];
      if (observation.population && observation.population.available <= 1 && observation.population.capacity < 1000
        && friendly.filter((unit) => unit.kind !== 'worker').length < limits.military) {
        const house = observation.buildings.friendly.find((building) => building.type === 'house' && !building.complete);
        const builder = workers.find((worker) => ['idle', 'gathering'].includes(worker.task) && worker.cargo === 0);
        if (!builder || !home) return [];
        if (house) {
          postpone(observation.tick);
          return [{ type: 'build', ids: [builder.id], unitGenerations: [builder.generation], buildingId: house.id }];
        }
        if (observation.resources.wood < BUILDING_DEFINITIONS.house.cost.wood + limits.woodReserve) return [];
        const sites = candidateSites(observation, home, seed);
        if (!sites.length) { postpone(observation.tick); return []; }
        const point = sites[siteAttempt++ % sites.length];
        postpone(observation.tick);
        return [{ type: 'build', ids: [builder.id], unitGenerations: [builder.generation], buildingType: 'house', ...point }];
      }
      const workerProducer = observation.buildings.friendly.find((building) => building.complete
        && building.queue === 0 && building.productionOptions?.some((option) => option.kind === 'worker' && option.available));
      if (workers.length < 4 && workerProducer && friendly.length < limits.roster
        && observation.resources.food >= UNIT_DEFINITIONS.worker.cost.food + limits.foodReserve) {
        postpone(observation.tick);
        return [{ type: 'trainUnit', kind: 'worker', buildingId: workerProducer.id }];
      }
      const damaged = observation.buildings.friendly.find((building) => building.complete && building.maxHp > 0 && building.hp < building.maxHp * 0.65);
      const repairer = workers.find((worker) => ['idle', 'gathering'].includes(worker.task) && worker.cargo === 0);
      if (damaged && repairer && observation.resources.wood >= 50) {
        postpone(observation.tick);
        return [{ type: 'repairBuilding', buildingId: damaged.id, ids: [repairer.id], unitGenerations: [repairer.generation] }];
      }
      if (barracks?.complete && friendly.filter(unit => unit.kind !== 'worker').length >= 6 && !observation.research?.active) {
        const priorities = ['military-tier-2', 'siege-engineering', 'military-armor', 'infantry-attack', 'archer-attack', 'mounted-attack'];
        for (const upgrade of priorities) {
          const definition = TECHNOLOGY_DEFINITIONS[upgrade];
          const producer = observation.buildings.friendly.find(building => building.complete
            && building.researchOptions?.some(option => option.upgrade === upgrade && option.available));
          if (producer && observation.resources.food >= definition.cost.food + limits.foodReserve
            && observation.resources.wood >= definition.cost.wood + limits.woodReserve) {
            postpone(observation.tick);
            return [{ type: 'researchUpgrade', buildingId: producer.id, upgrade }];
          }
        }
      }
      if (!barracks) {
        // Keep one living Barracks; even the last Worker may rebuild after losses.
        // Reserves and backoff still bound spending while gathering pauses.
        if (!home || workers.length === 0
          || observation.resources.wood < limits.barracksWoodCost + limits.woodReserve) return [];
        const builder = workers.find((worker) => ['idle', 'gathering'].includes(worker.task) && worker.cargo === 0);
        if (!builder) return [];
        const sites = candidateSites(observation, home, seed);
        if (!sites.length) { postpone(observation.tick); return []; }
        const point = sites[siteAttempt++ % sites.length];
        postpone(observation.tick);
        return [{ type: 'build', ids: [builder.id], unitGenerations: [builder.generation], buildingType: 'barracks', ...point }];
      }
      if (!barracks.complete) {
        const builder = workers.find((worker) => ['idle', 'gathering'].includes(worker.task) && worker.cargo === 0);
        if (!builder) return [];
        postpone(observation.tick);
        return [{ type: 'build', ids: [builder.id], unitGenerations: [builder.generation], buildingId: barracks.id }];
      }
      const storehouse = observation.buildings.friendly.find((building) => building.type === 'storehouse' && building.hp > 0);
      const remoteResource = home && observation.resourceNodes.find((node) => node.stock > 0
        && Math.hypot(node.x - home.x, node.z - home.z) > 12);
      const economyBuilder = workers.find((worker) => ['idle', 'gathering'].includes(worker.task) && worker.cargo === 0);
      if (remoteResource && economyBuilder && friendly.filter((unit) => unit.kind !== 'worker').length >= 2) {
        if (storehouse && !storehouse.complete) {
          postpone(observation.tick);
          return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingId: storehouse.id }];
        }
        if (!storehouse && observation.resources.wood >= BUILDING_DEFINITIONS.storehouse.cost.wood + limits.woodReserve) {
          const sites = candidateSites(observation, remoteResource, seed);
          if (sites.length) {
            const point = sites[siteAttempt++ % sites.length]; postpone(observation.tick);
            return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingType: 'storehouse', ...point }];
          }
        }
      }
      const expansion = observation.buildings.friendly.find((building) => building.type === 'town-center' && !building.home && building.hp > 0);
      if (remoteResource && economyBuilder && storehouse?.complete && friendly.length >= 8) {
        if (expansion && !expansion.complete) {
          postpone(observation.tick);
          return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingId: expansion.id }];
        }
        const center = BUILDING_DEFINITIONS['town-center'];
        if (!expansion && observation.resources.wood >= center.cost.wood + limits.woodReserve
          && observation.resources.food >= center.cost.food + limits.foodReserve) {
          const sites = candidateSites(observation, remoteResource, seed, center.id);
          if (sites.length) {
            const point = sites[siteAttempt++ % sites.length]; postpone(observation.tick);
            return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingType: center.id, ...point }];
          }
        }
      }
      const tower = observation.buildings.friendly.find((building) => building.type === 'watchtower' && building.hp > 0);
      if (economyBuilder && home && (tower && !tower.complete || observation.units.visibleEnemies.some((unit) => unit.hp > 0 && Math.hypot(unit.x - home.x, unit.z - home.z) < 18))
        && friendly.filter((unit) => unit.kind !== 'worker').length >= 6) {
        if (tower && !tower.complete) {
          postpone(observation.tick);
          return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingId: tower.id }];
        }
        const defense = BUILDING_DEFINITIONS.watchtower;
        if (!tower && observation.resources.wood >= defense.cost.wood + limits.woodReserve
          && observation.resources.food >= defense.cost.food + limits.foodReserve) {
          const sites = candidateSites(observation, home, seed, defense.id);
          if (sites.length) {
            const point = sites[siteAttempt++ % sites.length]; postpone(observation.tick);
            return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingType: defense.id, ...point }];
          }
        }
      }
      const visibleDefense = observation.buildings.visibleEnemies.some(building => building.hp > 0
        && BUILDING_DEFINITIONS[building.type]?.tags.includes('defense'));
      const workshop = observation.buildings.friendly.find(building => building.type === 'workshop' && building.hp > 0);
      if (economyBuilder && home && friendly.filter(unit => unit.kind !== 'worker').length >= 6) {
        if (workshop && !workshop.complete) {
          postpone(observation.tick);
          return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingId: workshop.id }];
        }
        if (!workshop && visibleDefense && observation.research?.militaryTier2
          && observation.resources.wood >= BUILDING_DEFINITIONS.workshop.cost.wood + limits.woodReserve) {
          const sites = candidateSites(observation, home, seed, 'workshop');
          if (sites.length) {
            const point = sites[siteAttempt++ % sites.length]; postpone(observation.tick);
            return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingType: 'workshop', ...point }];
          }
        }
      }
      const militaryCount = friendly.filter(unit => unit.kind !== 'worker').length;
      const stable = observation.buildings.friendly.find(building => building.type === 'stable' && building.hp > 0);
      // One mounted producer, after a viable opening army; resume paid foundations.
      if (economyBuilder && home && militaryCount >= 4 && militaryCount < limits.military) {
        if (stable && !stable.complete) {
          postpone(observation.tick);
          return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingId: stable.id }];
        }
        if (!stable && observation.resources.wood >= BUILDING_DEFINITIONS.stable.cost.wood + limits.woodReserve
          && observation.resources.food >= UNIT_DEFINITIONS.rider.cost.food + limits.foodReserve) {
          const sites = candidateSites(observation, home, seed, 'stable');
          if (sites.length) {
            const point = sites[siteAttempt++ % sites.length]; postpone(observation.tick);
            return [{ type: 'build', ids: [economyBuilder.id], unitGenerations: [economyBuilder.generation], buildingType: 'stable', ...point }];
          }
        }
      }
      const queued = observation.buildings.friendly.filter((building) => !building.home).reduce((sum, building) => sum + building.queue, 0);
      const workerQueue = observation.workerProduction?.queue ?? 0;
      if (barracks.productionBlocked || barracks.queue >= limits.queue
        || friendly.filter((unit) => unit.kind !== 'worker').length + queued >= limits.military
        || friendly.length + queued + workerQueue >= limits.roster
        || observation.resources.food < limits.infantryFoodCost + limits.foodReserve) return [];
      const siege = UNIT_DEFINITIONS['siege-engine'];
      if (visibleDefense && workshop?.complete && workshop.queue === 0 && queued === 0
        && friendly.filter(unit => unit.kind === siege.id).length < 2
        && workshop.productionOptions?.some(option => option.kind === siege.id && option.available)
        && observation.resources.food >= siege.cost.food + limits.foodReserve
        && observation.resources.wood >= siege.cost.wood + limits.woodReserve) {
        postpone(observation.tick);
        return [{ type: 'trainUnit', kind: siege.id, buildingId: workshop.id }];
      }
      const visibleMounted = observation.units.visibleEnemies.filter(unit => unit.hp > 0 && UNIT_DEFINITIONS[unit.kind]?.tags.includes('mounted')).length;
      const scoutCount = friendly.filter(unit => unit.kind === 'scout').length;
      const riderCount = friendly.filter(unit => unit.kind === 'rider').length;
      const ownSpears = friendly.filter(unit => unit.kind === 'spearman').length;
      if (stable?.complete && !stable.productionBlocked && stable.queue === 0 && queued === 0
        && !(visibleMounted > ownSpears) && (scoutCount === 0 || riderCount < 2)) {
        const kind = scoutCount === 0 ? 'scout' : 'rider';
        const definition = UNIT_DEFINITIONS[kind];
        const option = stable.productionOptions?.find(option => option.kind === kind);
        if (option?.available && observation.resources.food >= definition.cost.food + limits.foodReserve
          && observation.resources.wood >= definition.cost.wood + limits.woodReserve) {
          postpone(observation.tick);
          return [{ type: 'trainUnit', kind, buildingId: stable.id }];
        }
      }
      const infantry = friendly.filter((unit) => unit.kind === 'infantry').length;
      const spearmen = friendly.filter((unit) => unit.kind === 'spearman').length;
      const spear = UNIT_DEFINITIONS.spearman;
      const spearOption = barracks.productionOptions?.find((option) => option.kind === spear.id);
      const infantryOption = barracks.productionOptions?.find((option) => option.kind === 'infantry');
      const wantsSpear = spearOption?.available !== false && spearmen < Math.max(Math.ceil(infantry / 3), visibleMounted)
        && BUILDING_DEFINITIONS[barracks.type].products.includes(spear.id)
        && observation.resources.food >= spear.cost.food + limits.foodReserve
        && observation.resources.wood >= spear.cost.wood + limits.woodReserve;
      if (!wantsSpear && infantryOption?.available === false) return [];
      postpone(observation.tick);
      return [wantsSpear ? { type: 'trainUnit', kind: spear.id, buildingId: barracks.id }
        : { type: 'train', buildingId: barracks.id }];
    },
  };
}
