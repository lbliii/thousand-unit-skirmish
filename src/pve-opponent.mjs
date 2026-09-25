/**
 * Team-visible adapter and deterministic opening policy for an ordinary RTS
 * WebSocket player. The server assigns the seat and remains authoritative for
 * every command. See docs/gameplay-command-observation-contract.md for DTO v1.
 */

export const OPPONENT_OBSERVATION_SCHEMA_VERSION = 1;
export const DEFAULT_OPPONENT_SEED = 20260925;
export const DEFAULT_OPPONENT_DECISION_INTERVAL_MS = 1_000;

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

/** Create a tiny deterministic opening policy for smoke checks and early PvE. */
export function createDeterministicPolicy(seed = DEFAULT_OPPONENT_SEED) {
  if (!Number.isSafeInteger(seed)) throw new TypeError('Opponent seed must be a safe integer.');
  const normalizedSeed = seed >>> 0;
  let economyStarted = false;
  let tacticsStarted = false;

  return {
    next(observation) {
      if (observation?.schemaVersion !== OPPONENT_OBSERVATION_SCHEMA_VERSION
        || !validTeam(observation.team)) throw new TypeError('Policy requires opponent observation schema v1.');

      if (!economyStarted) {
        const workers = observation.units.friendly
          .filter((unit) => unit.kind === 'worker' && unit.hp > 0 && unit.task === 'idle')
          .sort((left, right) => left.id - right.id);
        const availableNodes = observation.resourceNodes.filter((node) => node.stock > 0);
        const commands = [];
        const assignedWorkers = new Set();
        for (const [resourceType, stream] of [['food', 0], ['wood', 1]]) {
          const nodes = availableNodes.filter((node) => node.type === resourceType);
          const remainingWorkers = workers.filter((worker) => !assignedWorkers.has(worker.id));
          if (nodes.length === 0 || remainingWorkers.length === 0) continue;
          const worker = remainingWorkers[seededIndex(normalizedSeed, observation.team, stream, remainingWorkers.length)];
          const node = nearestResource(nodes, worker);
          if (!node) continue;
          assignedWorkers.add(worker.id);
          commands.push({ type: 'gather', ids: [worker.id], nodeId: node.id });
        }
        if (commands.length > 0) {
          economyStarted = true;
          return commands;
        }
      }

      if (!tacticsStarted) {
        const soldiers = observation.units.friendly
          .filter((unit) => unit.kind !== 'worker' && unit.hp > 0)
          .map((unit) => unit.id)
          .sort((left, right) => left - right);
        if (soldiers.length > 0) {
          const visibleTarget = observation.units.visibleEnemies
            .filter((unit) => unit.hp > 0)
            .sort((left, right) => left.id - right.id)[0];
          tacticsStarted = true;
          return [{
            type: 'attackMove',
            ids: soldiers,
            x: visibleTarget?.x ?? 0,
            z: visibleTarget?.z ?? 0,
          }];
        }
      }

      return [];
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
