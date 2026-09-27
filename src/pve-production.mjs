/** Bounded production using only the existing team-visible opponent DTO. */
export const PVE_PRODUCTION_LIMITS = Object.freeze({
  openingDelayTicks: 300,
  barracksWoodCost: 175,
  woodReserve: 25,
  infantryFoodCost: 50,
  foodReserve: 50,
  military: 12,
  roster: 24,
  queue: 1,
  retryTicks: 150,
  maxRetryTicks: 900,
});

function visibleFootprint(observation, column, row) {
  if (!observation.fogOfWar) return true;
  const mask = observation.visibility;
  if (!mask || mask.columns !== observation.map.width || mask.rows !== observation.map.height) return false;
  const bytes = atob(mask.data);
  for (let z = row - 1; z <= row + 1; z++) {
    for (let x = column - 1; x <= column + 1; x++) {
      const cell = z * mask.columns + x;
      if (((bytes.charCodeAt(cell >> 2) >> ((cell & 3) * 2)) & 3) !== 2) return false;
    }
  }
  return true;
}

function candidateSites(observation, home, seed) {
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
    if (column < 1 || row < 1 || column >= width - 1 || row >= height - 1
      || !visibleFootprint(observation, column, row)) return [];
    const point = { x: column + 0.5 - width / 2, z: row + 0.5 - height / 2 };
    const inFootprint = (entity) => {
      const x = Math.floor(entity.x + width / 2);
      const z = Math.floor(entity.z + height / 2);
      return Math.abs(x - column) <= 1 && Math.abs(z - row) <= 1;
    };
    if (objects.some(inFootprint) || observation.resourceNodes.some(inFootprint)
      || buildings.some((building) => Math.abs(building.x - point.x) < 3 && Math.abs(building.z - point.z) < 3)
      || observation.objectives.some(({ zone }) => zone && column + 1 >= zone.column
        && column - 1 < zone.column + zone.width && row + 1 >= zone.row && row - 1 < zone.row + zone.height)) return [];
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
      if (barracks?.queue > 0 || workers.some((worker) => worker.task === 'building')) {
        retryTicks = limits.retryTicks;
        nextAttemptTick = observation.tick + limits.retryTicks;
        return [];
      }
      if (observation.tick < nextAttemptTick) return [];
      if (!barracks) {
        // Keep one living Barracks; a loss may be replaced under the same reserves and backoff.
        if (!home || workers.length < 2
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
      const queued = observation.buildings.friendly.reduce((sum, building) => sum + building.queue, 0);
      const workerQueue = observation.workerProduction?.queue ?? 0;
      if (barracks.productionBlocked || barracks.queue >= limits.queue
        || friendly.filter((unit) => unit.kind !== 'worker').length + queued >= limits.military
        || friendly.length + queued + workerQueue >= limits.roster
        || observation.resources.food < limits.infantryFoodCost + limits.foodReserve) return [];
      postpone(observation.tick);
      return [{ type: 'train', buildingId: barracks.id }];
    },
  };
}
