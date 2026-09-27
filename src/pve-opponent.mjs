/**
 * Team-visible adapter and deterministic opening policy for an ordinary RTS
 * WebSocket player. The server assigns the seat and remains authoritative for
 * every command. See docs/gameplay-command-observation-contract.md for DTO v1.
 */

import { createProductionPolicy } from './pve-production.mjs';

export const OPPONENT_OBSERVATION_SCHEMA_VERSION = 1;
export const DEFAULT_OPPONENT_SEED = 20260925;
export const DEFAULT_OPPONENT_DECISION_INTERVAL_MS = 1_000;

const RESOURCE_TYPES = ['food', 'wood'];
const GATHER_ORDER_RETRY_TICKS = 20;
// At the authoritative 30 Hz simulation rate: 10 seconds, capped at 60.
const TACTICAL_STALL_TICKS = 300;
const TACTICAL_MAX_RETRY_TICKS = 1_800;
const TACTICAL_RECENT_COMBAT_TICKS = 120;

function validTeam(team) {
  return Number.isInteger(team) && (team === 0 || team === 1);
}

function assertTeam(team) {
  if (!validTeam(team)) throw new TypeError('Opponent seat must be assigned team 0 or 1.');
}

function decodeVisibility(state, map) {
  if (state.fogOfWar !== true) return null;
  const mask = state.visibility;
  const columns = Number.isInteger(map?.width) ? map.width : mask?.columns;
  const rows = Number.isInteger(map?.height) ? map.height : mask?.rows;
  if (!mask || !Number.isInteger(columns) || !Number.isInteger(rows)
    || mask.columns !== columns || mask.rows !== rows || typeof mask.data !== 'string') {
    throw new TypeError('Fogged opponent state requires a matching team visibility mask.');
  }

  let binary;
  try {
    binary = typeof atob === 'function'
      ? atob(mask.data)
      : Buffer.from(mask.data, 'base64').toString('binary');
  } catch {
    throw new TypeError('Opponent visibility mask is not valid base64.');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < Math.ceil(columns * rows / 4)) {
    throw new TypeError('Opponent visibility mask is truncated.');
  }

  function cellStateAtWorld(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const column = Math.floor(x + columns / 2);
    const row = Math.floor(z + rows / 2);
    if (column < 0 || column >= columns || row < 0 || row >= rows) return 0;
    const cell = row * columns + column;
    return (bytes[cell >> 2] >> ((cell & 3) * 2)) & 0b11;
  }

  function buildingVisibleAtWorld(x, z) {
    const centerColumn = Math.floor(x + columns / 2);
    const centerRow = Math.floor(z + rows / 2);
    if (cellStateAtWorld(x, z) === 2) return true;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
        const column = centerColumn + dx;
        const row = centerRow + dz;
        if (column < 0 || column >= columns || row < 0 || row >= rows) continue;
        const cell = row * columns + column;
        if (((bytes[cell >> 2] >> ((cell & 3) * 2)) & 0b11) === 2) return true;
      }
    }
    return false;
  }

  function zoneFullyVisible(zone) {
    if (!zone || !Number.isInteger(zone.column) || !Number.isInteger(zone.row)
      || !Number.isInteger(zone.width) || !Number.isInteger(zone.height)
      || zone.width < 1 || zone.height < 1
      || zone.column < 0 || zone.row < 0
      || zone.column + zone.width > columns || zone.row + zone.height > rows) return false;
    for (let row = zone.row; row < zone.row + zone.height; row++) {
      for (let column = zone.column; column < zone.column + zone.width; column++) {
        const cell = row * columns + column;
        if (((bytes[cell >> 2] >> ((cell & 3) * 2)) & 0b11) !== 2) return false;
      }
    }
    return true;
  }

  return {
    columns,
    rows,
    data: mask.data,
    cellStateAtWorld,
    buildingVisibleAtWorld,
    zoneFullyVisible,
  };
}

function normalizeUnit(row, team) {
  if (!Array.isArray(row) || !Number.isInteger(row[0]) || !validTeam(row[1])
    || !Number.isFinite(row[2]) || !Number.isFinite(row[3])
    || !Number.isFinite(row[4]) || typeof row[5] !== 'string') return null;
  const own = row[1] === team;
  const lastAttack = Number.isFinite(row[11]) && Number.isFinite(row[12]) && Number.isFinite(row[13])
    ? { tick: row[11], x: row[12], z: row[13] } : null;
  return {
    id: row[0],
    team: row[1],
    x: row[2],
    z: row[3],
    hp: row[4],
    kind: row[5],
    cargo: Number.isFinite(row[6]) ? row[6] : 0,
    cargoType: typeof row[7] === 'string' ? row[7] : '',
    generation: Number.isInteger(row[8]) ? row[8] : 0,
    task: own && row[5] === 'worker' && typeof row[9] === 'string' ? row[9] : null,
    focusedCount: Number.isInteger(row[10]) ? row[10] : 0,
    lastAttack,
  };
}

function normalizeBuilding(building) {
  if (!building || !Number.isInteger(building.id) || !validTeam(building.team)
    || typeof building.type !== 'string' || !Number.isFinite(building.x)
    || !Number.isFinite(building.z)) return null;
  const queue = Array.isArray(building.queue)
    ? building.queue.length : Number.isInteger(building.queue) ? building.queue : 0;
  return {
    id: building.id,
    team: building.team,
    type: building.type,
    x: building.x,
    z: building.z,
    hp: Number.isFinite(building.hp) ? building.hp : null,
    maxHp: Number.isFinite(building.maxHp) ? building.maxHp : null,
    progress: Number.isFinite(building.progress) ? building.progress : null,
    complete: building.complete === true,
    queue,
    trainingRemaining: Number.isFinite(building.trainingRemaining) ? building.trainingRemaining : 0,
    productionBlocked: building.productionBlocked === true,
    trainingProgress: Number.isFinite(building.trainingProgress) ? building.trainingProgress : 0,
  };
}

function normalizeWorkerProduction(record, team) {
  if (!record || record.team !== team) return null;
  return {
    queue: Number.isInteger(record.queue) ? record.queue : 0,
    trainingRemaining: Number.isFinite(record.trainingRemaining) ? record.trainingRemaining : 0,
    productionBlocked: record.productionBlocked === true,
    trainingProgress: Number.isFinite(record.trainingProgress) ? record.trainingProgress : 0,
  };
}

function normalizeResearch(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    infantryAttack: record.infantryAttack === true,
    archerAttack: record.archerAttack === true,
    active: record.active && typeof record.active === 'object'
      ? {
        type: typeof record.active.type === 'string' ? record.active.type : null,
        buildingId: Number.isInteger(record.active.buildingId) ? record.active.buildingId : null,
        remaining: Number.isFinite(record.active.remaining) ? record.active.remaining : 0,
        progress: Number.isFinite(record.active.progress) ? record.active.progress : 0,
      }
      : null,
  };
}

function visibleResources(state, map, visibility) {
  const stateNodes = Array.isArray(state.resourceNodes) ? state.resourceNodes : [];
  const mapNodes = new Map((Array.isArray(map?.resourceNodes) ? map.resourceNodes : [])
    .filter((node) => typeof node?.id === 'string')
    .map((node) => [node.id, node]));
  const visible = [];
  for (const record of stateNodes) {
    if (typeof record?.id !== 'string' || typeof record.type !== 'string'
      || !Number.isFinite(record.stock)) continue;
    const location = mapNodes.get(record.id);
    if (!location || !Number.isFinite(location.x) || !Number.isFinite(location.z)) continue;
    if (visibility && visibility.cellStateAtWorld(location.x, location.z) !== 2) continue;
    visible.push({ id: record.id, type: record.type, stock: record.stock, x: location.x, z: location.z });
  }
  return visible.sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeObjectiveZone(zone) {
  if (!zone || !Number.isInteger(zone.column) || !Number.isInteger(zone.row)
    || !Number.isInteger(zone.width) || !Number.isInteger(zone.height)
    || zone.width < 1 || zone.height < 1) return null;
  return {
    column: zone.column,
    row: zone.row,
    width: zone.width,
    height: zone.height,
  };
}

function countObservableUnits(units, zone, map, visibility) {
  const columns = Number.isInteger(map?.width) ? map.width : visibility?.columns;
  const rows = Number.isInteger(map?.height) ? map.height : visibility?.rows;
  const counts = [0, 0];
  if (!zone || !Number.isInteger(columns) || !Number.isInteger(rows)) return counts;
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const column = Math.floor(unit.x + columns / 2);
    const row = Math.floor(unit.z + rows / 2);
    if (column >= zone.column && column < zone.column + zone.width
      && row >= zone.row && row < zone.row + zone.height) counts[unit.team]++;
  }
  return counts;
}

function projectObjectives(state, map, visibility, units) {
  const stateObjectives = Array.isArray(state.objectives) ? state.objectives : [];
  const triggers = new Map((Array.isArray(map?.triggers) ? map.triggers : [])
    .filter((trigger) => typeof trigger?.id === 'string')
    .map((trigger) => [trigger.id, trigger]));
  const objectives = [];
  for (const record of stateObjectives) {
    if (typeof record?.id !== 'string' || !Number.isInteger(record.owner)) continue;
    const trigger = triggers.get(record.id);
    const zone = normalizeObjectiveZone(trigger?.zone);
    const objective = {
      id: record.id,
      zone,
      owner: record.owner,
      victory: record.victory === true,
      requires: typeof record.requires === 'string' ? record.requires : null,
      requiredOwner: Number.isInteger(record.requiredOwner) ? record.requiredOwner : -1,
    };
    if (Array.isArray(record.requiresAll)) {
      objective.requiresAll = record.requiresAll.filter((id) => typeof id === 'string');
    }
    if (Array.isArray(record.requiredOwners)) {
      objective.requiredOwners = record.requiredOwners
        .filter((owner) => Number.isInteger(owner));
    }

    objective.unitCounts = countObservableUnits(units, zone, map, visibility);
    const progressVisible = !visibility || (zone !== null && visibility.zoneFullyVisible(zone));
    if (progressVisible) {
      objective.progressTeam = Number.isInteger(record.progressTeam) ? record.progressTeam : -1;
      objective.progress = Number.isFinite(record.progress) ? record.progress : 0;
    }
    objectives.push(objective);
  }
  return objectives.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Convert only a peer-specific `welcome.state` / `state` / `mapChange.state`
 * into the stable bot/model DTO. `team` must come from `welcome.player.team`.
 * The full map supplies resource coordinates for peer-visible resource IDs
 * and public objective zones; resource positions are rechecked against the
 * peer's visibility mask, while objective visibility gates transient progress.
 */
export function toOpponentObservation(state, team, map = null) {
  assertTeam(team);
  if (!state || state.type !== 'state') throw new TypeError('Opponent adapter requires a peer-scoped state snapshot.');
  if (typeof state.fogOfWar !== 'boolean') throw new TypeError('Opponent state must declare its fog-of-war mode.');
  const visibility = decodeVisibility(state, map);
  const units = (Array.isArray(state.units) ? state.units : [])
    .map((row) => normalizeUnit(row, team))
    .filter((unit) => unit && (unit.team === team
      || !visibility || visibility.cellStateAtWorld(unit.x, unit.z) === 2))
    .sort((left, right) => left.id - right.id);
  const buildings = (Array.isArray(state.buildings) ? state.buildings : [])
    .map(normalizeBuilding)
    .filter((building) => building && (building.team === team
      || !visibility || visibility.buildingVisibleAtWorld(building.x, building.z)))
    .sort((left, right) => left.id - right.id);
  const research = Array.isArray(state.teamResearch) ? normalizeResearch(state.teamResearch[team]) : null;
  const food = Array.isArray(state.food) ? state.food[team] : null;
  const wood = Array.isArray(state.wood) ? state.wood[team] : null;
  if (!Number.isFinite(food) || !Number.isFinite(wood)) {
    throw new TypeError('Opponent state is missing the assigned team resource balances.');
  }

  return {
    schemaVersion: OPPONENT_OBSERVATION_SCHEMA_VERSION,
    team,
    tick: Number.isSafeInteger(state.tick) ? state.tick : 0,
    map: {
      id: typeof state.mapId === 'string' ? state.mapId : typeof map?.id === 'string' ? map.id : null,
      width: Number.isInteger(map?.width) ? map.width : visibility?.columns ?? null,
      height: Number.isInteger(map?.height) ? map.height : visibility?.rows ?? null,
    },
    fogOfWar: state.fogOfWar === true,
    visibility: visibility ? { columns: visibility.columns, rows: visibility.rows, data: visibility.data } : null,
    resources: { food, wood },
    units: {
      friendly: units.filter((unit) => unit.team === team),
      visibleEnemies: units.filter((unit) => unit.team !== team),
    },
    buildings: {
      friendly: buildings.filter((building) => building.team === team),
      visibleEnemies: buildings.filter((building) => building.team !== team),
    },
    workerProduction: normalizeWorkerProduction(
      Array.isArray(state.workerProduction) ? state.workerProduction[team] : null,
      team,
    ),
    research,
    resourceNodes: visibleResources(state, map, visibility),
    objectives: projectObjectives(state, map, visibility, units),
  };
}

function seededIndex(seed, team, stream, length) {
  let value = (seed >>> 0) ^ Math.imul(team + 1, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca6b);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) % length;
}

function isPristineMatchState(state, team, map) {
  if (!state || state.type !== 'state' || state.winner !== -1
    || !Number.isInteger(state.armySize) || state.armySize < 2 || state.armySize % 2 !== 0
    || !Array.isArray(state.buildings) || state.buildings.length !== 0) return false;

  let observation;
  try {
    observation = toOpponentObservation(state, team, map);
  } catch {
    return false;
  }

  const teamSize = state.armySize / 2;
  if (observation.units.friendly.length !== teamSize
    || observation.units.friendly.some((unit, slot) => (
      unit.id !== team * teamSize + slot
      || unit.kind !== (slot < 4 ? 'worker' : 'infantry')
      || unit.hp !== 100
      || unit.cargo !== 0
      || (slot < 4 && unit.task !== 'idle')
    ))) return false;

  const startingResources = map?.startingResources ?? {};
  if (observation.resources.food !== (startingResources.food ?? 0)
    || observation.resources.wood !== (startingResources.wood ?? 0)) return false;

  const production = observation.workerProduction;
  if (!production || production.queue !== 0 || production.trainingRemaining !== 0
    || production.productionBlocked) return false;

  const research = observation.research;
  if (!research || research.infantryAttack || research.archerAttack || research.active !== null) return false;

  const mapResources = new Map((Array.isArray(map?.resourceNodes) ? map.resourceNodes : [])
    .filter((node) => typeof node?.id === 'string')
    .map((node) => [node.id, node.stock]));
  if (observation.resourceNodes.some((node) => mapResources.get(node.id) !== node.stock)) return false;
  if (observation.objectives.some((objective) => (
    objective.owner !== -1
      || (Object.hasOwn(objective, 'progressTeam') && objective.progressTeam !== -1)
      || (Object.hasOwn(objective, 'progress') && objective.progress !== 0)
  ))) return false;
  return true;
}

function nearestResource(nodes, worker) {
  return [...nodes].sort((left, right) => (
    ((left.x - worker.x) ** 2 + (left.z - worker.z) ** 2)
      - ((right.x - worker.x) ** 2 + (right.z - worker.z) ** 2)
    || left.id.localeCompare(right.id)
  ))[0] || null;
}

function objectiveWorldPoint(objective, map) {
  const zone = objective?.zone;
  if (!Number.isInteger(map?.width) || map.width < 1
    || !Number.isInteger(map?.height) || map.height < 1
    || !Number.isInteger(zone?.column) || !Number.isInteger(zone?.row)
    || !Number.isInteger(zone?.width) || zone.width < 1
    || !Number.isInteger(zone?.height) || zone.height < 1
    || zone.column < 0 || zone.row < 0
    || zone.column + zone.width > map.width || zone.row + zone.height > map.height) return null;
  return {
    x: zone.column + zone.width / 2 - map.width / 2,
    z: zone.row + zone.height / 2 - map.height / 2,
  };
}

function objectivePrerequisitesMet(objective, team) {
  const ids = Array.isArray(objective?.requiresAll) ? objective.requiresAll
    : typeof objective?.requires === 'string' ? [objective.requires] : [];
  if (ids.length === 0) return true;
  const owners = Array.isArray(objective.requiredOwners) ? objective.requiredOwners
    : typeof objective.requires === 'string' ? [objective.requiredOwner] : [];
  return owners.length === ids.length && owners.every((owner) => owner === team);
}

function nearestObjective(objectives, team, soldiers, map, lostObjectiveIds) {
  if (soldiers.length === 0) return null;
  const armyCenter = soldiers.reduce((center, unit) => ({
    x: center.x + unit.x / soldiers.length,
    z: center.z + unit.z / soldiers.length,
  }), { x: 0, z: 0 });
  const enemyTeam = 1 - team;
  const candidates = objectives.flatMap((objective) => {
    if (typeof objective?.id !== 'string'
      || !Number.isInteger(objective.owner)
      || objective.owner === team
      || ![-1, enemyTeam].includes(objective.owner)
      || !objectivePrerequisitesMet(objective, team)) return [];
    const point = objectiveWorldPoint(objective, map);
    if (!point) return [];
    const recentlyLost = lostObjectiveIds.has(objective.id);
    const priority = recentlyLost ? 0
      : objective.victory === true ? (objective.owner === enemyTeam ? 1 : 2)
        : (objective.owner === enemyTeam ? 3 : 4);
    return [{
      id: objective.id,
      point,
      priority,
      distance: (point.x - armyCenter.x) ** 2 + (point.z - armyCenter.z) ** 2,
    }];
  });
  return candidates.sort((left, right) => (
    left.priority - right.priority
      || left.distance - right.distance
      || left.id.localeCompare(right.id)
  ))[0] || null;
}

/** Create a deterministic economy-and-tactics policy for an ordinary player seat. */
export function createDeterministicPolicy(seed = DEFAULT_OPPONENT_SEED) {
  if (!Number.isSafeInteger(seed)) throw new TypeError('Opponent seed must be a safe integer.');
  const normalizedSeed = seed >>> 0;
  const productionPolicy = createProductionPolicy(normalizedSeed);
  const gatherAssignments = new Map();
  const objectiveOwners = new Map();
  const lostObjectiveIds = new Set();
  let tacticalObjectiveId = null;
  let fallbackTacticsStarted = false;
  let previousDecisionGatherOnly = false;
  let tacticalWatch = null;
  const orderedSoldiers = new Set();
  const soldierKey = (unit) => `${unit.id}:${unit.generation}`;
  const recordOrderedSoldiers = (soldiers) => soldiers.forEach((unit) => orderedSoldiers.add(soldierKey(unit)));

  function watchTacticalOrder(soldiers, point, tick, retry = false) {
    if (!tacticalWatch || tacticalWatch.point.x !== point.x || tacticalWatch.point.z !== point.z) {
      tacticalWatch = { point, units: new Map() };
    }
    for (const unit of soldiers) {
      const key = soldierKey(unit);
      const previous = tacticalWatch.units.get(key);
      tacticalWatch.units.set(key, {
        sinceTick: tick,
        retryTicks: retry && previous
          ? Math.min(previous.retryTicks * 2, TACTICAL_MAX_RETRY_TICKS)
          : TACTICAL_STALL_TICKS,
        x: unit.x, z: unit.z,
      });
    }
  }

  // Watch each issued unit independently: an arrived soldier must not hide a
  // stranded reinforcement, and a retry must not interrupt arrived/fighting units.
  function stalledTacticalSoldiers(observation, soldiers, zone = null) {
    if (!tacticalWatch || soldiers.length === 0) return [];
    const tick = observation.tick;
    const liveKeys = new Set(soldiers.map(soldierKey));
    for (const key of tacticalWatch.units.keys()) {
      if (!liveKeys.has(key)) tacticalWatch.units.delete(key);
    }
    return soldiers.filter((unit) => {
      const previous = tacticalWatch.units.get(soldierKey(unit));
      if (!previous) return false;
      const column = Math.floor(unit.x + observation.map.width / 2);
      const row = Math.floor(unit.z + observation.map.height / 2);
      const atDestination = zone
        ? column >= zone.column && column < zone.column + zone.width
          && row >= zone.row && row < zone.row + zone.height
        : Math.hypot(unit.x - tacticalWatch.point.x, unit.z - tacticalWatch.point.z) <= 2;
      const progressing = Math.hypot(unit.x - previous.x, unit.z - previous.z) >= 0.5;
      const fighting = unit.focusedCount > 0
        || (unit.lastAttack && tick - unit.lastAttack.tick >= 0
          && tick - unit.lastAttack.tick < TACTICAL_RECENT_COMBAT_TICKS);
      if (atDestination || progressing || fighting || tick < previous.sinceTick) {
        watchTacticalOrder([unit], tacticalWatch.point, tick);
        return false;
      }
      return tick - previous.sinceTick >= previous.retryTicks;
    });
  }

  function recordObjectiveOwnership(observation) {
    const objectives = Array.isArray(observation.objectives) ? observation.objectives : [];
    const observedIds = new Set();
    for (const objective of objectives) {
      if (typeof objective?.id !== 'string' || !Number.isInteger(objective.owner)) continue;
      observedIds.add(objective.id);
      const previousOwner = objectiveOwners.get(objective.id);
      if (previousOwner === observation.team && objective.owner !== observation.team) {
        lostObjectiveIds.add(objective.id);
      } else if (objective.owner === observation.team) {
        lostObjectiveIds.delete(objective.id);
      }
      objectiveOwners.set(objective.id, objective.owner);
    }
    for (const id of objectiveOwners.keys()) {
      if (!observedIds.has(id)) {
        objectiveOwners.delete(id);
        lostObjectiveIds.delete(id);
      }
    }
  }

  function nextGatherCommands(observation) {
    const workers = observation.units.friendly
      .filter((unit) => unit.kind === 'worker' && unit.hp > 0)
      .sort((left, right) => left.id - right.id);
    const liveKeys = new Set(workers.map((worker) => `${worker.id}:${worker.generation}`));
    for (const key of gatherAssignments.keys()) {
      if (!liveKeys.has(key)) gatherAssignments.delete(key);
    }

    const nodesByType = { food: [], wood: [] };
    for (const node of observation.resourceNodes) {
      if (RESOURCE_TYPES.includes(node.type) && node.stock > 0
        && Number.isFinite(node.x) && Number.isFinite(node.z)) {
        nodesByType[node.type].push(node);
      }
    }
    for (const nodes of Object.values(nodesByType)) {
      nodes.sort((left, right) => left.id.localeCompare(right.id));
    }
    if (workers.length === 0 || RESOURCE_TYPES.every((type) => nodesByType[type].length === 0)) return [];

    const tick = Number.isSafeInteger(observation.tick) ? observation.tick : 0;
    const observedNodesById = new Map(observation.resourceNodes.map((node) => [node.id, node]));
    const availableNodeIds = new Set(RESOURCE_TYPES.flatMap((type) => nodesByType[type].map((node) => node.id)));
    const typeLoads = { food: 0, wood: 0 };
    const nodeLoads = new Map();
    const isGathering = (worker) => worker.task === 'gathering' || worker.task === 'returning';
    const isGatherOrderPending = (assignment) => {
      if (!assignment || !Number.isSafeInteger(assignment.pendingSinceTick)) return false;
      const observedNode = observedNodesById.get(assignment.nodeId);
      if (observedNode && observedNode.stock <= 0) return false;
      return tick - assignment.pendingSinceTick < GATHER_ORDER_RETRY_TICKS;
    };
    const addLoad = (assignment) => {
      if (!RESOURCE_TYPES.includes(assignment.type)) return;
      typeLoads[assignment.type]++;
      if (availableNodeIds.has(assignment.nodeId)) {
        nodeLoads.set(assignment.nodeId, (nodeLoads.get(assignment.nodeId) || 0) + 1);
      }
    };

    for (const worker of workers) {
      const key = `${worker.id}:${worker.generation}`;
      const assignment = gatherAssignments.get(key);
      if (isGathering(worker)) {
        if (assignment) {
          assignment.pendingSinceTick = null;
          addLoad(assignment);
        } else if (RESOURCE_TYPES.includes(worker.cargoType)) {
          typeLoads[worker.cargoType]++;
        }
        continue;
      }
      if (worker.task !== 'idle') {
        gatherAssignments.delete(key);
        continue;
      }
      if (isGatherOrderPending(assignment)) addLoad(assignment);
    }

    const commandsByNode = new Map();
    const chosenNodeByType = new Map();
    for (const worker of workers) {
      if (worker.task !== 'idle') continue;
      const key = `${worker.id}:${worker.generation}`;
      const previous = gatherAssignments.get(key);
      if (isGatherOrderPending(previous)) continue;

      const availableTypes = RESOURCE_TYPES.filter((type) => nodesByType[type].length > 0);
      const preferredType = availableTypes.includes(previous?.type) ? previous.type : null;
      let type = preferredType;
      if (!type) {
        const leastLoad = Math.min(...availableTypes.map((candidate) => typeLoads[candidate]));
        const leastLoadedTypes = availableTypes.filter((candidate) => typeLoads[candidate] === leastLoad);
        type = leastLoadedTypes[seededIndex(normalizedSeed, observation.team, worker.id, leastLoadedTypes.length)];
      }

      const previousNode = previous && nodesByType[type].find((node) => node.id === previous.nodeId);
      let node = previousNode || chosenNodeByType.get(type);
      if (!node) {
        const leastNodeLoad = Math.min(...nodesByType[type].map((candidate) => nodeLoads.get(candidate.id) || 0));
        const leastLoadedNodes = nodesByType[type]
          .filter((candidate) => (nodeLoads.get(candidate.id) || 0) === leastNodeLoad);
        node = nearestResource(leastLoadedNodes, worker);
        chosenNodeByType.set(type, node);
      }
      if (!node) continue;

      gatherAssignments.set(key, { type, nodeId: node.id, pendingSinceTick: tick });
      addLoad({ type, nodeId: node.id });
      const ids = commandsByNode.get(node.id) || [];
      ids.push(worker.id);
      commandsByNode.set(node.id, ids);
    }

    return [...commandsByNode.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, ids]) => ({
        type: 'gather',
        ids: ids.sort((left, right) => left - right),
        nodeId,
      }));
  }

  function nextOrders(observation) {
    if (observation?.schemaVersion !== OPPONENT_OBSERVATION_SCHEMA_VERSION
      || !validTeam(observation.team)) throw new TypeError('Policy requires opponent observation schema v1.');

    recordObjectiveOwnership(observation);
    const gathering = nextGatherCommands(observation);
    // Keep the opening economy first, but do not let rejected gather orders
    // consume every decision (the retry window is shorter than a normal turn).
    if (gathering.length > 0 && !previousDecisionGatherOnly) {
      previousDecisionGatherOnly = true;
      return gathering;
    }
    previousDecisionGatherOnly = false;

    const soldiers = observation.units.friendly
      .filter((unit) => unit.kind !== 'worker' && unit.hp > 0)
      .sort((left, right) => left.id - right.id);
    const liveSoldiers = new Set(soldiers.map(soldierKey));
    for (const key of orderedSoldiers) if (!liveSoldiers.has(key)) orderedSoldiers.delete(key);
    const reinforcements = soldiers.filter((unit) => !orderedSoldiers.has(soldierKey(unit)));
    const objectives = Array.isArray(observation.objectives) ? observation.objectives : [];
    const target = nearestObjective(
      objectives, observation.team, soldiers, observation.map, lostObjectiveIds,
    );
    if (target) {
      const mustReissue = target.id !== tacticalObjectiveId || lostObjectiveIds.has(target.id);
      tacticalObjectiveId = target.id;
      const stalled = mustReissue ? [] : stalledTacticalSoldiers(
        observation, soldiers, objectives.find((objective) => objective.id === target.id)?.zone,
      );
      if (mustReissue || stalled.length > 0 || reinforcements.length > 0) {
        const retryKeys = new Set(stalled.map(soldierKey));
        const ordered = mustReissue ? soldiers
          : soldiers.filter((unit) => retryKeys.has(soldierKey(unit)) || !orderedSoldiers.has(soldierKey(unit)));
        watchTacticalOrder(ordered, target.point, observation.tick, stalled.length > 0);
        recordOrderedSoldiers(ordered);
        lostObjectiveIds.delete(target.id);
        return [...gathering, {
          type: 'attackMove',
          ids: ordered.map((unit) => unit.id),
          x: target.point.x,
          z: target.point.z,
        }];
      }
      return gathering;
    }

    tacticalObjectiveId = null;
    if (objectives.length > 0 || soldiers.length === 0) {
      tacticalWatch = null;
      if (soldiers.length === 0) fallbackTacticsStarted = false;
      return gathering;
    }
    if (fallbackTacticsStarted) {
      const stalled = stalledTacticalSoldiers(observation, soldiers);
      if (stalled.length === 0 && reinforcements.length === 0) return gathering;
      const point = tacticalWatch.point;
      const retryKeys = new Set(stalled.map(soldierKey));
      const ordered = soldiers.filter((unit) => retryKeys.has(soldierKey(unit)) || !orderedSoldiers.has(soldierKey(unit)));
      watchTacticalOrder(ordered, point, observation.tick, stalled.length > 0);
      recordOrderedSoldiers(ordered);
      return [...gathering, { type: 'attackMove', ids: ordered.map((unit) => unit.id), ...point }];
    }

    const visibleTarget = observation.units.visibleEnemies
      .filter((unit) => unit.hp > 0)
      .sort((left, right) => left.id - right.id)[0];
    fallbackTacticsStarted = true;
    recordOrderedSoldiers(soldiers);
    watchTacticalOrder(soldiers, { x: visibleTarget?.x ?? 0, z: visibleTarget?.z ?? 0 }, observation.tick);
    return [...gathering, {
      type: 'attackMove',
      ids: soldiers.map((unit) => unit.id),
      x: visibleTarget?.x ?? 0,
      z: visibleTarget?.z ?? 0,
    }];

  }

  return {
    next(observation) {
      const orders = nextOrders(observation);
      const production = productionPolicy.next(observation);
      const builders = new Set(production.filter((command) => command.type === 'build').flatMap((command) => command.ids));
      const compatibleOrders = orders.map((command) => command.type === 'gather'
        ? { ...command, ids: command.ids.filter((id) => !builders.has(id)) } : command)
        .filter((command) => !Array.isArray(command.ids) || command.ids.length > 0);
      return [...compatibleOrders, ...production];
    },
  };
}

/**
 * Attach the deterministic policy to a normal WebSocket player. The server's
 * welcome message supplies the assigned team; no seat is passed in commands.
 */
export function attachDeterministicOpponent(socket, {
  seed = DEFAULT_OPPONENT_SEED,
  decisionIntervalMs = DEFAULT_OPPONENT_DECISION_INTERVAL_MS,
  onCommand = () => {},
  onError = () => {},
} = {}) {
  if (!socket || typeof socket.send !== 'function' || typeof socket.addEventListener !== 'function') {
    throw new TypeError('Opponent needs a WebSocket-compatible player connection.');
  }
  if (!Number.isSafeInteger(seed)) throw new TypeError('Opponent seed must be a safe integer.');
  if (!Number.isInteger(decisionIntervalMs) || decisionIntervalMs < 100 || decisionIntervalMs > 60_000) {
    throw new TypeError('Opponent decision interval must be from 100 to 60000 milliseconds.');
  }

  let team = null;
  let map = null;
  let latestState = null;
  let finished = false;
  let socketClosed = false;
  let disposed = false;
  let nextClientOrderToken = 1;
  let reportedNoSeat = false;
  let timer = null;
  let policy = createDeterministicPolicy(seed);
  let previousWinner = null;
  let hostResetPending = false;

  const resetForNewMatch = () => {
    policy = createDeterministicPolicy(seed);
    finished = false;
    hostResetPending = false;
  };

  const handleMessage = async (event) => {
    let message;
    try {
      const data = typeof event?.data === 'string' ? event.data
        : typeof event?.data?.text === 'function' ? await event.data.text()
          : String(event?.data ?? '');
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === 'welcome') {
      team = validTeam(message.player?.team) ? message.player.team : null;
      map = message.map && typeof message.map === 'object' ? message.map : null;
      latestState = message.state?.type === 'state' ? message.state : null;
      previousWinner = Number.isInteger(latestState?.winner) ? latestState.winner : null;
      if (team === null && !reportedNoSeat) {
        reportedNoSeat = true;
        onError(new Error('The server assigned this connection as a spectator; no bot seat is available.'));
      }
    } else if (message.type === 'mapChange') {
      map = message.map && typeof message.map === 'object' ? message.map : map;
      latestState = message.state?.type === 'state' ? message.state : latestState;
      previousWinner = Number.isInteger(latestState?.winner) ? latestState.winner : null;
      resetForNewMatch();
    } else if (message.type === 'notice'
      && typeof message.message === 'string' && message.message.startsWith('BATTLEFIELD RESET')) {
      hostResetPending = true;
    } else if (message.type === 'state') {
      latestState = message;
      const winner = Number.isInteger(message.winner) ? message.winner : null;
      const winnerCleared = previousWinner !== null && previousWinner >= 0 && winner === -1;
      const hostResetConfirmed = hostResetPending && team !== null
        && isPristineMatchState(message, team, map);
      hostResetPending = false;
      previousWinner = winner;
      if (winnerCleared || hostResetConfirmed) resetForNewMatch();
    } else if (message.type === 'victory') {
      finished = true;
    }
  };

  const handleClose = () => {
    socketClosed = true;
    if (timer) clearInterval(timer);
  };
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', handleClose);
  timer = setInterval(() => {
    if (socketClosed || disposed || finished || team === null || !latestState || socket.readyState !== 1) return;
    let observation;
    try {
      observation = toOpponentObservation(latestState, team, map);
      const commands = policy.next(observation);
      for (const command of commands) {
        const outbound = { ...command, clientOrderToken: nextClientOrderToken++ };
        socket.send(JSON.stringify(outbound));
        onCommand({ team, command: outbound, observation });
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      finished = true;
    }
  }, decisionIntervalMs);

  return {
    get team() { return team; },
    get seed() { return seed; },
    close() {
      if (disposed) return;
      disposed = true;
      if (timer) clearInterval(timer);
      socket.removeEventListener?.('message', handleMessage);
      socket.removeEventListener?.('close', handleClose);
    },
  };
}
