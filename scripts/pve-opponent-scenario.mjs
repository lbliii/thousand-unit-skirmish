import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attachDeterministicOpponent,
  createDeterministicPolicy,
  DEFAULT_OPPONENT_SEED,
  OPPONENT_OBSERVATION_SCHEMA_VERSION,
  toOpponentObservation,
} from '../src/pve-opponent.mjs';
import {
  PVE_MAP_IDS, parseUint32Seed, readPveLaunchOptions, selectPveMapId,
} from '../src/pve-match.mjs';
import { createPveRoomUrl } from '../src/pve-entry.mjs';
import {
  attachModelProposalOpponent,
  MODEL_PROPOSAL_LIMITS,
  MODEL_PROPOSAL_SCHEMA_VERSION,
  parseModelProposal,
} from '../src/pve-model-proposal.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const FORKED_VALE_MAP = JSON.parse(readFileSync(path.join(ROOT, 'maps/forked-vale.json'), 'utf8'));
const WOODLAND_EXPANSE_MAP = JSON.parse(readFileSync(path.join(ROOT, 'maps/woodland-expanse.json'), 'utf8'));
const ENDPOINT = (port) => `ws://127.0.0.1:${port}/ws`;
const CONNECT_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 8_000;
// Workers return to the real Town Center behind the authored spawn marker.
const ECONOMY_TIMEOUT_MS = 30_000;
const TACTICS_TIMEOUT_MS = 15_000;
const OBJECTIVE_CONTEST_TIMEOUT_MS = 45_000;
const DECISION_INTERVAL_MS = 1_000;
const PVE_RUNTIME_TIMEOUT_MS = 20_000;

function verifyPveLaunchRules() {
  assert.deepEqual(PVE_MAP_IDS, ['bellweather-millrace', 'underbough-rootways'],
    'the solo pool contains only the two authored small-army scenarios');
  const authoredMaps = new Map([
    ['bellweather-millrace', JSON.parse(readFileSync(path.join(ROOT, 'maps/bellweather-millrace.json'), 'utf8'))],
    ['underbough-rootways', JSON.parse(readFileSync(path.join(ROOT, 'maps/underbough-rootways.json'), 'utf8'))],
  ]);
  for (const mapId of PVE_MAP_IDS) {
    const map = authoredMaps.get(mapId);
    assert.ok(map, `${mapId} is a shipped authored map`);
    assert.equal(map.startingArmySize, 24, `${mapId} has the lightweight 24-unit scenario roster`);
    assert.ok(map.resourceNodes.length >= 2, `${mapId} supports the deterministic opening economy`);
    assert.ok(map.triggers.length > 0, `${mapId} has an authored objective for the opponent to contest`);
  }
  assert.equal(selectPveMapId(0), 'bellweather-millrace');
  assert.equal(selectPveMapId(1), 'underbough-rootways');
  assert.equal(selectPveMapId(0xffff_ffff), 'underbough-rootways');
  assert.equal(parseUint32Seed('4294967295'), 0xffff_ffff);
  assert.throws(() => parseUint32Seed(-1), /unsigned 32-bit/);
  assert.throws(() => parseUint32Seed('4294967296'), /unsigned 32-bit/);
  assert.throws(() => selectPveMapId(1, []), /map pool/);
  assert.equal(readPveLaunchOptions({ RTS_GAME_MODE: 'pvp' }), null);
  assert.deepEqual(readPveLaunchOptions({
    RTS_GAME_MODE: 'pve', RTS_PVE_MAP_SEED: '1', RTS_PVE_POLICY_SEED: '20260926',
  }), {
    mode: 'pve', mapSeed: 1, policySeed: 20260926, mapId: 'underbough-rootways',
  });
  assert.throws(() => readPveLaunchOptions({ RTS_GAME_MODE: 'pve', RTS_PVE_MAP_SEED: '1' }),
    /RTS_PVE_POLICY_SEED/);
  const roomUrl = createPveRoomUrl('https://game.example/?mode=pvp#overview', {
    roomId: 'a'.repeat(32), mode: 'pve', mapSeed: '1', policySeed: '20260926',
  });
  assert.equal(roomUrl.searchParams.get('mode'), 'pve');
  assert.equal(roomUrl.searchParams.get('mapSeed'), '1');
  assert.equal(roomUrl.searchParams.get('policySeed'), '20260926');
  assert.equal(roomUrl.searchParams.get('room'), 'a'.repeat(32));
  assert.equal(roomUrl.hash, '', 'the feedback URL does not preserve a stale fragment');
  process.stdout.write('PvE launch rules passed: curated maps and repeatable uint32 map/policy seeds.\n');
}

function setVisibility(cells, columns, rows) {
  const packed = Buffer.alloc(Math.ceil(columns * rows / 4));
  for (const [column, row, value] of cells) {
    const cell = row * columns + column;
    packed[cell >> 2] |= value << ((cell & 3) * 2);
  }
  return { columns, rows, data: packed.toString('base64') };
}

function verifyPureContract() {
  const map = {
    id: 'contract-smoke', width: 16, height: 16,
    spawnPoints: [{ team: 0, x: -6.5, z: -6.5 }, { team: 1, x: 6.5, z: 6.5 }],
    resourceNodes: [
      { id: 'food-visible', type: 'food', x: -6.5, z: -6.5, stock: 999 },
      { id: 'wood-hidden', type: 'wood', x: 6.5, z: 6.5, stock: 999 },
    ],
    triggers: [
      { id: 'ford-visible', zone: { column: 1, row: 1, width: 1, height: 1 } },
      { id: 'ford-hidden', zone: { column: 1, row: 1, width: 3, height: 1 } },
      { id: 'ford-north', zone: { column: 14, row: 1, width: 1, height: 1 } },
    ],
  };
  const state = {
    type: 'state', tick: 30, mapId: map.id, fogOfWar: true,
    visibility: setVisibility([[1, 1, 2], [2, 1, 2]], map.width, map.height),
    food: [220, null], wood: [180, null],
    units: [
      [1, 0, -6.5, -6.5, 100, 'worker', 0, '', 1, 'idle', 0],
      [2, 0, -5.5, -6.5, 100, 'infantry', 0, '', 1, null, 0],
      [16, 1, 6.5, 6.5, 100, 'infantry', 0, '', 1, null, 0],
      [17, 1, -5.5, -6.5, 100, 'infantry', 0, '', 1, null, 0],
    ],
    buildings: [
      { id: 1, team: 0, type: 'town-center', x: -6.5, z: -6.5, hp: 1800 },
      { id: 2, team: 1, type: 'barracks', x: 6.5, z: 6.5, hp: 1800 },
    ],
    workerProduction: [
      { team: 0, queue: 0, trainingRemaining: 0, productionBlocked: false, trainingProgress: 0 },
      null,
    ],
    teamResearch: [{ infantryAttack: false, archerAttack: false, active: null }, null],
    resourceNodes: [{ id: 'food-visible', type: 'food', stock: 400 }],
    objectives: [
      {
        id: 'ford-visible', owner: -1, progressTeam: -1, progress: 0,
        unitCounts: [0, 0], victory: false, requires: null, requiredOwner: -1,
      },
      {
        id: 'ford-hidden', owner: 1, progressTeam: 1, progress: 0.75,
        unitCounts: [0, 5], victory: true,
        requires: 'ford-visible', requiredOwner: 0,
        requiresAll: ['ford-visible', 'ford-north'], requiredOwners: [0, -1],
      },
      {
        id: 'ford-north', owner: -1, progressTeam: -1, progress: 0,
        unitCounts: [0, 0], victory: false, requires: null, requiredOwner: -1,
      },
    ],
    // These server payload fields are not safe inputs under fog and are omitted.
    victoryHold: { activeTeams: [false, true], progressSeconds: [0, 20] },
    scenarioEvents: [{ id: 'hidden-event', fired: true, triggeredByTeam: 1 }],
    winner: -1,
    connected: 2,
  };
  const observation = toOpponentObservation(state, 0, map);
  assert.equal(observation.schemaVersion, OPPONENT_OBSERVATION_SCHEMA_VERSION);
  assert.equal(observation.team, 0);
  assert.deepEqual(observation.resources, { food: 220, wood: 180 });
  assert.deepEqual(observation.units.visibleEnemies.map((unit) => unit.id), [17],
    'only individually visible enemy units must be included');
  assert.deepEqual(observation.buildings.visibleEnemies, [], 'hidden enemy buildings must be omitted');
  assert.deepEqual(observation.resourceNodes.map((node) => node.id), ['food-visible'],
    'hidden resource nodes must be omitted');
  assert.deepEqual(observation.objectives.map((objective) => objective.id),
    ['ford-hidden', 'ford-north', 'ford-visible'], 'all objective identities stay public under fog');
  const objectivesById = new Map(observation.objectives.map((objective) => [objective.id, objective]));
  assert.deepEqual(objectivesById.get('ford-visible').zone,
    { column: 1, row: 1, width: 1, height: 1 }, 'visible objective location is public');
  assert.deepEqual(objectivesById.get('ford-visible').unitCounts, [1, 0],
    'visible objective counts remain available');
  assert.equal(objectivesById.get('ford-visible').progressTeam, -1,
    'fully visible objective progress team remains available');
  assert.equal(objectivesById.get('ford-visible').progress, 0,
    'fully visible objective capture progress remains available');
  assert.equal(objectivesById.get('ford-hidden').owner, 1,
    'hidden objective ownership remains public');
  assert.deepEqual(objectivesById.get('ford-hidden').zone,
    { column: 1, row: 1, width: 3, height: 1 }, 'partially visible objective location remains public');
  assert.deepEqual(objectivesById.get('ford-hidden').unitCounts, [2, 1],
    'partial-zone counts include only individually observable units');
  assert.equal(objectivesById.get('ford-hidden').requiredOwner, 0,
    'hidden objective prerequisite owner remains public');
  assert.deepEqual(objectivesById.get('ford-hidden').requiresAll, ['ford-visible', 'ford-north']);
  assert.deepEqual(objectivesById.get('ford-hidden').requiredOwners, [0, -1]);
  assert.deepEqual(objectivesById.get('ford-north').unitCounts, [0, 0],
    'fully hidden zone counts do not copy concealed snapshot totals');
  for (const id of ['ford-hidden', 'ford-north']) {
    for (const transient of ['progressTeam', 'progress']) {
      assert.equal(Object.hasOwn(objectivesById.get(id), transient), false,
        `objective ${id} without full-zone visibility omits transient ${transient}`);
    }
  }
  assert.equal(Object.hasOwn(observation, 'victoryHold'), false);
  assert.equal(Object.hasOwn(observation, 'scenarioEvents'), false);
  assert.equal(Object.hasOwn(observation, 'winner'), false);
  assert.equal(Object.hasOwn(observation, 'connected'), false);
  assert.equal(Object.hasOwn(observation.map, 'spawnPoints'), false);
  assert.throws(() => toOpponentObservation({ ...state, visibility: null }, 0, map),
    /visibility mask/, 'a fogged state without its team mask must fail closed');

  const firstPolicy = createDeterministicPolicy(DEFAULT_OPPONENT_SEED);
  const secondPolicy = createDeterministicPolicy(DEFAULT_OPPONENT_SEED);
  const firstCommands = firstPolicy.next(observation);
  assert.deepEqual(firstCommands, secondPolicy.next(observation),
    'the same seed and observation must produce identical commands');
  assert.deepEqual(firstCommands.filter(({ type }) => type === 'gather').map(({ nodeId }) => nodeId),
    ['food-visible'], 'the policy may gather only from the peer-visible stocked node');
  const followUpCommands = firstPolicy.next(observation);
  assert.deepEqual(followUpCommands, secondPolicy.next(observation),
    'the same seed and observation history must produce identical follow-up commands');
  process.stdout.write('PvE DTO contract passed: team-only resources, units, buildings, objectives, and seeded decisions.\n');
}

function createResetFixture() {
  const map = {
    id: 'opponent-lifecycle-smoke', width: 16, height: 16,
    startingResources: { food: 220, wood: 180 },
    resourceNodes: [
      { id: 'lifecycle-food', type: 'food', x: -6.5, z: -6.5, stock: 400 },
      { id: 'lifecycle-wood', type: 'wood', x: -5.5, z: -6.5, stock: 400 },
    ],
    triggers: [],
  };
  const units = [];
  for (let team = 0; team < 2; team++) {
    for (let slot = 0; slot < 6; slot++) {
      const id = team * 6 + slot;
      const baseX = team === 0 ? -6 : 6;
      const baseZ = team === 0 ? -6 : 6;
      units.push([
        id, team, baseX + (slot % 3) * 0.5, baseZ + Math.floor(slot / 3) * 0.5,
        100, slot < 4 ? 'worker' : 'infantry', 0, '', 1,
        slot < 4 ? 'idle' : null, 0,
      ]);
    }
  }
  const state = {
    type: 'state', tick: 1, armySize: 12, mapId: map.id,
    fogOfWar: false, visibility: null,
    food: [220, 220], wood: [180, 180], units, buildings: [],
    workerProduction: [0, 1].map((team) => ({
      team, queue: 0, trainingRemaining: 0, productionBlocked: false, trainingProgress: 0,
    })),
    teamResearch: [0, 1].map(() => ({
      infantryAttack: false, archerAttack: false, active: null,
    })),
    resourceNodes: map.resourceNodes.map(({ id, type, stock }) => ({ id, type, stock })),
    objectives: [], winner: -1,
  };
  return { map, state };
}

function verifyIdleWorkerEconomyLoop() {
  const { map, state } = createResetFixture();
  const replacementFood = {
    id: 'lifecycle-food-replacement', type: 'food', x: -5.5, z: -5.5, stock: 400,
  };
  const initial = toOpponentObservation(state, 0, map);
  const initialWorkers = initial.units.friendly
    .filter((unit) => unit.kind === 'worker' && unit.hp > 0 && unit.task === 'idle')
    .map((unit) => unit.id)
    .sort((left, right) => left - right);
  const policy = createDeterministicPolicy(DEFAULT_OPPONENT_SEED);
  const openingCommands = policy.next(initial).filter(({ type }) => type === 'gather');
  assert.equal(openingCommands.length, 2, 'opening gathering groups workers by the two resource types');
  const visibleNodes = new Map(initial.resourceNodes.map((node) => [node.id, node]));
  const openingAssignments = openingCommands.flatMap((command) => command.ids);
  assert.deepEqual([...openingAssignments].sort((left, right) => left - right), initialWorkers,
    'every initially idle worker receives exactly one visible resource assignment');
  assert.equal(new Set(openingAssignments).size, initialWorkers.length,
    'opening gather orders never assign a worker twice');
  const typeCounts = { food: 0, wood: 0 };
  for (const command of openingCommands) {
    const node = visibleNodes.get(command.nodeId);
    assert.ok(node && node.stock > 0, 'gather orders target currently visible stocked nodes');
    typeCounts[node.type] += command.ids.length;
  }
  assert.deepEqual(typeCounts, { food: 2, wood: 2 },
    'the opening balances the four starting workers evenly between food and wood');
  assert.deepEqual(policy.next(initial).map(({ type }) => type), ['attackMove'],
    'a repeated snapshot does not duplicate pending gather orders');

  const foodCommand = openingCommands.find(({ nodeId }) => visibleNodes.get(nodeId)?.type === 'food');
  const woodCommand = openingCommands.find(({ nodeId }) => visibleNodes.get(nodeId)?.type === 'wood');
  const foodWorkerIds = new Set(foodCommand.ids);
  map.resourceNodes.push(replacementFood);
  const afterFoodNodeDepletion = {
    ...state,
    tick: state.tick + 1,
    units: state.units.map((row) => {
      const next = [...row];
      if (next[1] === 0 && next[5] === 'worker') {
        next[9] = foodWorkerIds.has(next[0]) ? 'idle' : 'gathering';
      }
      return next;
    }),
    resourceNodes: [
      ...state.resourceNodes.map((node) => (
        node.id === foodCommand.nodeId ? { ...node, stock: 0 } : node
      )),
      { id: replacementFood.id, type: replacementFood.type, stock: replacementFood.stock },
    ],
  };
  const replacementObservation = toOpponentObservation(afterFoodNodeDepletion, 0, map);
  assert.deepEqual(policy.next(replacementObservation), [{
    type: 'gather', ids: foodCommand.ids, nodeId: replacementFood.id,
  }], 'idle workers move to another visible stocked node of their assigned resource type');

  const afterFoodDepletion = {
    ...afterFoodNodeDepletion,
    tick: afterFoodNodeDepletion.tick + 100,
    resourceNodes: afterFoodNodeDepletion.resourceNodes.map((node) => (
      node.type === 'food' ? { ...node, stock: 0 } : node
    )),
  };
  const fallbackObservation = toOpponentObservation(afterFoodDepletion, 0, map);
  assert.deepEqual(policy.next(fallbackObservation), [{
    type: 'gather', ids: foodCommand.ids, nodeId: woodCommand.nodeId,
  }], 'idle workers use a visible stocked alternate when their resource type is exhausted');
  process.stdout.write('PvE economy policy passed: balanced idle-worker gathering, depletion reassignment, and retry deduplication.\n');
}

function verifyObjectiveContestPolicy() {
  const { map: fixtureMap, state: fixtureState } = createResetFixture();
  const map = {
    ...FORKED_VALE_MAP,
    resourceNodes: fixtureMap.resourceNodes,
  };
  const state = {
    ...fixtureState,
    mapId: map.id,
    units: fixtureState.units.map((row) => {
      const next = [...row];
      if (next[1] === 0 && next[5] === 'infantry') {
        next[2] = 0;
        next[3] = -15.5;
      }
      return next;
    }),
  };
  const policy = createDeterministicPolicy(DEFAULT_OPPONENT_SEED);
  const targetAt = (observation, id) => {
    const objective = observation.objectives.find((candidate) => candidate.id === id);
    assert.ok(objective, `authored objective ${id} is present in the public observation`);
    return {
      x: objective.zone.column + objective.zone.width / 2 - map.width / 2,
      z: objective.zone.row + objective.zone.height / 2 - map.height / 2,
    };
  };
  const makeObservation = (tick, owners, units = state.units) => {
    const objectives = map.triggers.map((trigger) => ({
      id: trigger.id,
      owner: owners[trigger.id] ?? -1,
      progressTeam: -1,
      progress: 0,
      unitCounts: [0, 0],
      victory: trigger.victory === true,
      requires: trigger.requires ?? null,
      requiredOwner: trigger.requires ? (owners[trigger.requires] ?? -1) : -1,
      ...(Array.isArray(trigger.requiresAll) ? {
        requiresAll: [...trigger.requiresAll],
        requiredOwners: trigger.requiresAll.map((id) => owners[id] ?? -1),
      } : {}),
    }));
    return toOpponentObservation({
      ...state,
      tick,
      units,
      objectives,
    }, 0, map);
  };
  const onlyTactical = (commands) => commands.find(({ type }) => type === 'attackMove');

  const opening = makeObservation(1, {});
  assert.equal(policy.next(opening).filter(({ type }) => type === 'gather').length, 2,
    'the bot completes its ordinary two-resource opening on Forked Vale');
  const openingAdvance = onlyTactical(policy.next(opening));
  assert.deepEqual({ x: openingAdvance?.x, z: openingAdvance?.z }, targetAt(opening, 'capture-zone-1'),
    'the bot chooses the closest unlocked authored victory objective');

  const gatheringUnits = state.units.map((row) => {
    const next = [...row];
    if (next[1] === 0 && next[5] === 'worker') next[9] = 'gathering';
    return next;
  });
  const northHeld = makeObservation(2, { 'capture-zone-1': 0 }, gatheringUnits);
  const southAdvance = onlyTactical(policy.next(northHeld));
  assert.deepEqual({ x: southAdvance?.x, z: southAdvance?.z }, targetAt(northHeld, 'capture-zone-2'),
    'after the first signal is held, the bot advances to the second unlocked signal');

  const bothSignalsHeld = makeObservation(3, {
    'capture-zone-1': 0,
    'capture-zone-2': 0,
  }, gatheringUnits);
  const watchAdvance = onlyTactical(policy.next(bothSignalsHeld));
  assert.deepEqual({ x: watchAdvance?.x, z: watchAdvance?.z }, targetAt(bothSignalsHeld, 'capture-zone-3'),
    'the bot advances to Vale Watch only after both authored prerequisites are team-owned');

  const lossDuringGather = state.units.map((row) => {
    const next = [...row];
    if (next[1] === 0 && next[5] === 'worker') next[9] = next[0] === 0 ? 'idle' : 'gathering';
    if (next[0] === 4) next[4] = 0;
    return next;
  });
  const northLost = makeObservation(25, {
    'capture-zone-1': 1,
    'capture-zone-2': 0,
  }, lossDuringGather);
  assert.ok(policy.next(northLost).some(({ type }) => type === 'gather'),
    'the ordinary economy can emit a retry while ownership changes');
  const retake = onlyTactical(policy.next(northLost));
  assert.deepEqual(retake, {
    type: 'attackMove', ids: [5], ...targetAt(northLost, 'capture-zone-1'),
  }, 'after observing a lost signal, the surviving army retakes it with a normal attack-move');
  assert.deepEqual(policy.next(northLost), [], 'the retake order is not duplicated for an unchanged observation');
  process.stdout.write('PvE objective policy passed: Forked Vale opening, unlocked objective contest, gate progression, and retake after defeat.\n');
}

class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  emit(message) {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(message) });
    }
  }
}

async function waitForCount(values, count, description, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (values.length >= count) return;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${description}; received ${values.length} of ${count}.`);
}

async function verifyLifecycleRecovery() {
  const { map, state } = createResetFixture();
  const socket = new FakeSocket();
  const commands = [];
  const errors = [];
  const opponent = attachDeterministicOpponent(socket, {
    seed: DEFAULT_OPPONENT_SEED,
    decisionIntervalMs: 100,
    onCommand: ({ command }) => commands.push(command),
    onError: (error) => errors.push(error),
  });
  const cleanState = { ...state };
  try {
    socket.emit({
      type: 'welcome', player: { team: 0 }, map,
      state: { ...cleanState, units: [...cleanState.units] },
    });
    await waitForCount(commands, 3, 'opening lifecycle commands');
    assert.deepEqual(commands.map(({ type }) => type), ['gather', 'gather', 'attackMove']);

    socket.emit({ type: 'victory', team: 1, reason: 'smoke' });
    socket.emit({ type: 'notice', message: 'BATTLEFIELD RESET' });
    socket.emit({
      type: 'state', ...cleanState,
      buildings: [{ id: 1, team: 0, type: 'barracks', x: -6, z: -6, hp: 100 }],
    });
    await delay(250);
    assert.equal(commands.length, 3, 'a reset notice alone does not restart the policy');

    socket.emit({ type: 'notice', message: 'BATTLEFIELD RESET · 12 UNITS' });
    socket.emit({ type: 'state', ...cleanState, tick: 2, units: [...cleanState.units] });
    await waitForCount(commands, 6, 'policy restart after a clean host reset');

    socket.emit({ type: 'victory', team: 1, reason: 'smoke' });
    socket.emit({ type: 'state', ...cleanState, tick: 3, winner: 0, units: [...cleanState.units] });
    socket.emit({ type: 'state', ...cleanState, tick: 4, units: [...cleanState.units] });
    await waitForCount(commands, 9, 'policy restart after winner clears');

    const nextMap = { ...map, id: `${map.id}-next` };
    socket.emit({
      type: 'mapChange', map: nextMap,
      state: { ...cleanState, tick: 5, mapId: nextMap.id, units: [...cleanState.units] },
    });
    await waitForCount(commands, 12, 'policy restart after map change');

    assert.deepEqual(commands.map(({ type }) => type), [
      'gather', 'gather', 'attackMove',
      'gather', 'gather', 'attackMove',
      'gather', 'gather', 'attackMove',
      'gather', 'gather', 'attackMove',
    ]);
    assert.deepEqual(commands.map(({ clientOrderToken }) => clientOrderToken),
      Array.from({ length: 12 }, (_, index) => index + 1),
      'order tokens remain unique across rematches');
    assert.equal(errors.length, 0, `lifecycle adapter errors: ${errors.map((error) => error.message).join('; ')}`);
  } finally {
    opponent.close();
  }
  process.stdout.write('PvE lifecycle recovery passed: clean reset state, winner-clear transition, and map change.\n');
}

function proposalEnvelope(requestId, action, proposalSchemaVersion = MODEL_PROPOSAL_SCHEMA_VERSION) {
  return JSON.stringify({ proposalSchemaVersion, requestId, action });
}

function verifyProposalSchema() {
  const { map, state } = createResetFixture();
  const observation = toOpponentObservation(state, 0, map);
  const context = { requestId: 'request-1', team: 0, observation };
  assert.deepEqual(parseModelProposal(proposalEnvelope('request-1', { type: 'wait' }), context), { type: 'wait' });
  assert.deepEqual(parseModelProposal(proposalEnvelope('request-1', {
    type: 'gather', ids: [0], nodeId: 'lifecycle-food',
  }), context), { type: 'gather', ids: [0], nodeId: 'lifecycle-food' });
  assert.deepEqual(parseModelProposal(proposalEnvelope('request-1', {
    type: 'attackMove', ids: [4], x: 0, z: 0,
  }), context), { type: 'attackMove', ids: [4], x: 0, z: 0 });

  const invalid = [
    [proposalEnvelope('other-request', { type: 'wait' }), context, /binding/],
    [proposalEnvelope('request-1', { type: 'wait', text: 'attack north' }), context, /extra fields/],
    [proposalEnvelope('request-1', { type: 'move', ids: [0], x: 0, z: 0 }), context, /Unsupported/],
    [proposalEnvelope('request-1', { type: 'gather', ids: [6], nodeId: 'lifecycle-food' }), context, /non-owned/],
    [proposalEnvelope('request-1', { type: 'gather', ids: [4], nodeId: 'lifecycle-food' }), context, /non-worker/],
    [proposalEnvelope('request-1', { type: 'gather', ids: [0], nodeId: 'hidden-resource' }), context, /hidden/],
    [proposalEnvelope('request-1', { type: 'attackMove', ids: [6], x: 0, z: 0 }), context, /non-owned/],
    [proposalEnvelope('request-1', { type: 'attackMove', ids: [4], x: 9, z: 0 }), context, /within the observed map/],
    [proposalEnvelope('request-1', { type: 'attackMove', ids: [4], x: Infinity, z: 0 }), context, /finite and within/],
    [proposalEnvelope('request-1', { type: 'wait' }, 2), context, /schema/],
    [proposalEnvelope('request-1', { type: 'wait' }), { ...context, team: 1 }, /assigned PvE v1 seat/],
    ['{broken', context, /valid JSON/],
  ];
  for (const [content, binding, expected] of invalid) {
    assert.throws(() => parseModelProposal(content, binding), expected);
  }
  assert.throws(() => parseModelProposal('"x"'.repeat(MODEL_PROPOSAL_LIMITS.maxResponseBytes), context), /4 KiB/);

  const fogState = {
    ...state,
    fogOfWar: true,
    visibility: setVisibility([[1, 1, 2]], map.width, map.height),
  };
  const fogObservation = toOpponentObservation(fogState, 0, map);
  assert.deepEqual(fogObservation.resourceNodes.map(({ id }) => id), ['lifecycle-food']);
  assert.throws(() => parseModelProposal(proposalEnvelope('request-1', {
    type: 'gather', ids: [0], nodeId: 'lifecycle-wood',
  }), { ...context, observation: fogObservation }), /hidden/);
  process.stdout.write('PvE proposal schema passed: strict envelope, actions, seat binding, and visible references.\n');
}

function createControlledProposalOpponent(socket, options) {
  return attachModelProposalOpponent(socket, {
    ...options,
    setInterval: (callback) => { socket.decisionTimer = callback; return callback; },
    clearInterval: () => {},
  });
}

async function verifyProposalController() {
  const { map, state } = createResetFixture();
  const disabledProvider = { estimateRequest() { throw new Error('disabled provider was inspected'); } };
  const disabled = attachModelProposalOpponent(null, { provider: disabledProvider });
  assert.equal((await disabled.requestDecision()).status, 'disabled');
  assert.equal(disabled.getMetrics().requestsSent, 0);
  assert.throws(() => attachModelProposalOpponent(new FakeSocket(), {
    enabled: true,
    provider: { estimateRequest: () => ({ inputTokens: 1, reservedCostUsd: 0 }), propose: async () => ({ content: '' }) },
  }), /usage reporting/);

  const requests = [];
  const acceptedSocket = new FakeSocket();
  let time = 100;
  const provider = {
    reportsUsage: true,
    estimateRequest(request) {
      return { inputTokens: Math.ceil(JSON.stringify(request).length / 4), reservedCostUsd: 0.002 };
    },
    async propose(request) {
      requests.push(request);
      return {
        content: proposalEnvelope(request.requestId, {
          type: 'gather', ids: [request.observation.units.friendly[0].id], nodeId: request.observation.resourceNodes[0].id,
        }),
        usage: { inputTokens: 40, outputTokens: 18, costUsd: 0.001 },
      };
    },
  };
  const errors = [];
  const opponent = createControlledProposalOpponent(acceptedSocket, {
    enabled: true, provider, now: () => time, createRequestId: () => 'fake-request-1',
    onError: (error) => errors.push(error),
  });
  acceptedSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  const accepted = await opponent.requestDecision();
  assert.equal(accepted.status, 'accepted');
  assert.equal(opponent.team, 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(Object.keys(requests[0].observation).sort(), [
    'buildings', 'fogOfWar', 'map', 'objectives', 'population', 'research', 'resourceNodes', 'resources',
    'schemaVersion', 'team', 'tick', 'units', 'visibility', 'workerProduction',
  ]);
  assert.equal(Object.hasOwn(requests[0].observation.map, 'spawnPoints'), false);
  assert.deepEqual(acceptedSocket.sent, [{
    type: 'gather', ids: [0], nodeId: 'lifecycle-food', clientOrderToken: 1,
  }], 'model output re-enters the ordinary player command shape with a trusted order token');
  const acceptedMetrics = opponent.getMetrics();
  assert.equal(acceptedMetrics.requestsSent, 1);
  assert.equal(acceptedMetrics.acceptedProposals, 1);
  assert.equal(acceptedMetrics.fallbackSlots, 0);
  assert.equal(acceptedMetrics.observationBytes, Buffer.byteLength(JSON.stringify(requests[0].observation)));
  assert.equal(acceptedMetrics.estimatedInputTokens, Math.ceil(JSON.stringify(requests[0]).length / 4));
  assert.equal(acceptedMetrics.responseBytes, Buffer.byteLength(proposalEnvelope('fake-request-1', {
    type: 'gather', ids: [0], nodeId: 'lifecycle-food',
  })));
  assert.equal(acceptedMetrics.reservedCostUsd, 0.002);
  assert.equal(acceptedMetrics.reportedCostUsd, 0.001);
  assert.deepEqual(acceptedMetrics.latencyMs, [0]);
  assert.deepEqual(acceptedMetrics.decisionAgeTicks, [0]);
  assert.ok(acceptedMetrics.observationBytes > 0);
  assert.equal(errors.length, 0);
  time += MODEL_PROPOSAL_LIMITS.decisionIntervalMs - 1;
  assert.equal((await opponent.requestDecision()).status, 'not-due');
  acceptedSocket.emit({
    type: 'notice', clientOrderToken: 1, message: 'GATHER REJECTED · NO VALID WORKERS',
  });
  time++;
  assert.equal((await opponent.requestDecision()).status, 'fallback',
    'a correlated server rejection routes the next slot through deterministic policy');
  assert.equal(acceptedSocket.sent.length, 2);
  assert.equal(acceptedSocket.sent[1].clientOrderToken, 2);
  assert.equal(opponent.getMetrics().requestsSent, 1, 'rejection fallback does not make a second provider request');
  assert.equal(opponent.getMetrics().fallbackReasons.command_rejected, 1);
  opponent.close();

  const fallbackSocket = new FakeSocket();
  const fallbackProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: 10, reservedCostUsd: 0.01 }),
    async propose() { throw new Error('fake provider failure'); },
  };
  const fallback = createControlledProposalOpponent(fallbackSocket, {
    enabled: true, provider: fallbackProvider, createRequestId: () => 'fake-failure',
    now: () => time,
  });
  fallbackSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  assert.equal((await fallback.requestDecision()).status, 'fallback');
  assert.equal(fallbackSocket.sent.length, 1, 'a failed model slot sends at most one fallback command');
  assert.equal(fallbackSocket.sent[0].type, 'gather');
  assert.equal(fallback.getMetrics().fallbackCommands, 1);
  assert.equal(fallback.getMetrics().providerErrors, 1);
  fallback.close();

  let resolveLate;
  const timeoutSocket = new FakeSocket();
  const timeoutProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: 10, reservedCostUsd: 0.01 }),
    propose: () => new Promise((resolve) => { resolveLate = resolve; }),
  };
  const timeout = createControlledProposalOpponent(timeoutSocket, {
    enabled: true, provider: timeoutProvider, requestTimeoutMs: 15,
    createRequestId: () => 'fake-timeout', now: () => time,
  });
  timeoutSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  const timedOut = timeout.requestDecision();
  await delay(25);
  assert.equal((await timedOut).reason, 'timeout');
  assert.equal(timeout.getMetrics().timeouts, 1);
  assert.equal(timeoutSocket.sent.length, 1, 'timeout enters deterministic fallback once');
  time += MODEL_PROPOSAL_LIMITS.decisionIntervalMs;
  assert.equal((await timeout.requestDecision()).reason, 'provider_unsettled',
    'a provider that ignores cancellation cannot overlap another request');
  assert.equal(timeoutSocket.sent.length, 2, 'an unsettled provider still falls back one command per due slot');
  resolveLate({ content: proposalEnvelope('fake-timeout', { type: 'wait' }) });
  await delay(0);
  assert.equal(timeoutSocket.sent.length, 2, 'a late provider result cannot dispatch after fallback');
  timeout.close();

  const budgetSocket = new FakeSocket();
  let providerCalls = 0;
  const overBudgetProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: MODEL_PROPOSAL_LIMITS.maxInputTokens + 1, reservedCostUsd: 0.01 }),
    async propose() { providerCalls++; return { content: '' }; },
  };
  const overBudget = createControlledProposalOpponent(budgetSocket, {
    enabled: true, provider: overBudgetProvider, createRequestId: () => 'fake-over-budget',
    now: () => time,
  });
  budgetSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  assert.equal((await overBudget.requestDecision()).reason, 'input_tokens');
  assert.equal(providerCalls, 0, 'unaffordable input estimates skip provider dispatch');
  assert.equal(overBudget.getMetrics().requestsSent, 0, 'skipped requests do not consume sent-request budget');
  assert.equal(overBudget.getMetrics().fallbackSlots, 1);
  overBudget.close();

  const largeSocket = new FakeSocket();
  let largeEstimateCalls = 0;
  const largeProvider = {
    reportsUsage: true,
    estimateRequest() { largeEstimateCalls++; return { inputTokens: 1, reservedCostUsd: 0.001 }; },
    async propose() { throw new Error('oversized observations must not reach the provider'); },
  };
  const largeObservation = createControlledProposalOpponent(largeSocket, {
    enabled: true, provider: largeProvider, createRequestId: () => 'fake-large-observation',
    now: () => time,
  });
  largeSocket.emit({
    type: 'welcome', player: { team: 0 }, map,
    state: { ...state, mapId: 'x'.repeat(MODEL_PROPOSAL_LIMITS.maxObservationBytes + 1) },
  });
  assert.equal((await largeObservation.requestDecision()).reason, 'observation_bytes');
  assert.equal(largeEstimateCalls, 0, 'an oversized DTO is skipped before provider token/cost estimation');
  assert.equal(largeObservation.getMetrics().skippedRequests, 1);
  largeObservation.close();

  const costSocket = new FakeSocket();
  let costProviderCalls = 0;
  const overCostProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: 12, reservedCostUsd: MODEL_PROPOSAL_LIMITS.maxEstimatedCostUsd + 0.01 }),
    async propose() { costProviderCalls++; return { content: '' }; },
  };
  const overCost = createControlledProposalOpponent(costSocket, {
    enabled: true, provider: overCostProvider, createRequestId: () => 'fake-over-cost',
    now: () => time,
  });
  costSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  assert.equal((await overCost.requestDecision()).reason, 'cost_budget');
  assert.equal(costProviderCalls, 0, 'requests without room in the match cost budget are skipped');
  overCost.close();

  const violationSocket = new FakeSocket();
  let violationCalls = 0;
  const violationProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: 12, reservedCostUsd: 0.01 }),
    async propose(request) {
      violationCalls++;
      return {
        content: proposalEnvelope(request.requestId, { type: 'wait' }),
        usage: { inputTokens: 12, outputTokens: 2, costUsd: 0.02 },
      };
    },
  };
  const violation = createControlledProposalOpponent(violationSocket, {
    enabled: true, provider: violationProvider, createRequestId: (() => { let next = 0; return () => `violation-${++next}`; })(),
    now: () => time,
  });
  violationSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  assert.equal((await violation.requestDecision()).reason, 'provider_error');
  assert.equal(violation.getMetrics().providerBudgetLocked, true,
    'reported spend above the reservation locks provider use for the match');
  time += MODEL_PROPOSAL_LIMITS.decisionIntervalMs;
  assert.equal((await violation.requestDecision()).reason, 'provider_budget_locked');
  assert.equal(violationCalls, 1);
  violation.close();

  const serializedProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: 12, reservedCostUsd: 0.01 }),
    async propose(request) {
      return {
        content: proposalEnvelope(request.requestId, { type: 'wait' }),
        usage: { inputTokens: 12, outputTokens: 2, costUsd: 0.001 },
      };
    },
  };
  const deferredSocket = new FakeSocket();
  let currentTime = 0;
  let resolveFirst;
  let providerCallsForCoalescing = 0;
  const deferredProvider = {
    reportsUsage: true,
    estimateRequest: serializedProvider.estimateRequest,
    propose(request) {
      providerCallsForCoalescing++;
      if (providerCallsForCoalescing === 1) return new Promise((resolve) => { resolveFirst = () => resolve({
        content: proposalEnvelope(request.requestId, { type: 'wait' }),
        usage: { inputTokens: 12, outputTokens: 2, costUsd: 0.001 },
      }); });
      return serializedProvider.propose(request);
    },
  };
  const deferred = createControlledProposalOpponent(deferredSocket, {
    enabled: true, provider: deferredProvider, now: () => currentTime,
    createRequestId: (() => { let next = 0; return () => `coalesced-${++next}`; })(),
  });
  deferredSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  const firstPending = deferred.requestDecision();
  await Promise.resolve();
  currentTime = MODEL_PROPOSAL_LIMITS.decisionIntervalMs;
  deferredSocket.emit({ type: 'state', ...state, tick: state.tick + MODEL_PROPOSAL_LIMITS.maxDecisionAgeTicks + 1 });
  assert.equal((await deferred.requestDecision()).status, 'in-flight');
  assert.equal(providerCallsForCoalescing, 1, 'one request may be in flight per seat');
  resolveFirst();
  assert.equal((await firstPending).reason, 'stale_response');
  assert.equal(deferred.getMetrics().coalescedSlots, 1);
  assert.equal(deferred.getMetrics().staleResponses, 1);
  currentTime += MODEL_PROPOSAL_LIMITS.decisionIntervalMs;
  assert.equal((await deferred.requestDecision()).status, 'accepted');
  assert.equal(deferred.getMetrics().requestsSent, 2);
  assert.equal(providerCallsForCoalescing, 2, 'the next slot uses the coalesced latest state');
  deferred.close();

  const requestBudgetSocket = new FakeSocket();
  let budgetProviderCalls = 0;
  const waitProvider = {
    reportsUsage: true,
    estimateRequest: () => ({ inputTokens: 8, reservedCostUsd: 0.005 }),
    async propose(request) {
      budgetProviderCalls++;
      return {
        content: proposalEnvelope(request.requestId, { type: 'wait' }),
        usage: { inputTokens: 8, outputTokens: 2, costUsd: 0.001 },
      };
    },
  };
  let budgetTime = 0;
  const requestBudget = createControlledProposalOpponent(requestBudgetSocket, {
    enabled: true, provider: waitProvider, now: () => budgetTime,
    createRequestId: (() => { let next = 0; return () => `budget-${++next}`; })(),
  });
  requestBudgetSocket.emit({ type: 'welcome', player: { team: 0 }, map, state });
  for (let index = 0; index < MODEL_PROPOSAL_LIMITS.maxRequestsPerMatch; index++) {
    budgetTime = index * MODEL_PROPOSAL_LIMITS.decisionIntervalMs;
    assert.equal((await requestBudget.requestDecision()).status, 'accepted');
  }
  budgetTime = MODEL_PROPOSAL_LIMITS.maxRequestsPerMatch * MODEL_PROPOSAL_LIMITS.decisionIntervalMs;
  assert.equal((await requestBudget.requestDecision()).reason, 'request_budget');
  assert.equal(budgetProviderCalls, MODEL_PROPOSAL_LIMITS.maxRequestsPerMatch);
  assert.equal(requestBudget.getMetrics().requestsSent, MODEL_PROPOSAL_LIMITS.maxRequestsPerMatch);
  requestBudget.close();
  process.stdout.write('PvE proposal controller passed: default-off, budgets, fallback, timeout, stale results, and coalescing.\n');
}

function createFeed(socket) {
  const feed = { latest: null, messages: [], stateWaiters: [], messageWaiters: [] };
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    feed.messages.push(message);
    const state = message.type === 'state' ? message
      : message.type === 'welcome' || message.type === 'mapChange' ? message.state
        : null;
    if (state?.type === 'state') {
      feed.latest = state;
      for (let index = feed.stateWaiters.length - 1; index >= 0; index--) {
        const waiter = feed.stateWaiters[index];
        if (!waiter.predicate(state)) continue;
        feed.stateWaiters.splice(index, 1);
        clearTimeout(waiter.timeout);
        waiter.resolve(state);
      }
    }
      for (let index = feed.messageWaiters.length - 1; index >= 0; index--) {
        const waiter = feed.messageWaiters[index];
        if (!waiter.predicate(message)) continue;
        feed.messageWaiters.splice(index, 1);
        clearTimeout(waiter.timeout);
        socket.removeEventListener('error', waiter.onError);
        waiter.resolve(message);
    }
  });
  return feed;
}

function waitForMessage(client, predicate, description, timeoutMs = COMMAND_TIMEOUT_MS) {
  const found = client.feed.messages.find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, timeout: null, onError: null };
    waiter.timeout = setTimeout(() => {
      client.feed.messageWaiters.splice(client.feed.messageWaiters.indexOf(waiter), 1);
      client.socket.removeEventListener('error', waiter.onError);
      reject(new Error(`Timed out waiting for ${description}.`));
    }, timeoutMs);
    waiter.onError = () => {
      client.feed.messageWaiters.splice(client.feed.messageWaiters.indexOf(waiter), 1);
      clearTimeout(waiter.timeout);
      reject(new Error(`WebSocket failed while waiting for ${description}.`));
    };
    client.socket.addEventListener('error', waiter.onError, { once: true });
    client.feed.messageWaiters.push(waiter);
  });
}

function waitForState(client, predicate, description, timeoutMs) {
  if (client.feed.latest && predicate(client.feed.latest)) return Promise.resolve(client.feed.latest);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, timeout: null };
    waiter.timeout = setTimeout(() => {
      client.feed.stateWaiters.splice(client.feed.stateWaiters.indexOf(waiter), 1);
      reject(new Error(`Timed out waiting for ${description}.`));
    }, timeoutMs);
    client.feed.stateWaiters.push(waiter);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findFreePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function openClient(port, name, {
  botSeed = null,
  proposalOptions = null,
  commands = null,
  errors = null,
} = {}) {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    const socket = new WebSocket(ENDPOINT(port), ['rts-v1']);
    const client = { name, socket, feed: createFeed(socket), welcome: null, opponent: null };
    if (proposalOptions) {
      client.opponent = attachModelProposalOpponent(socket, {
        ...proposalOptions,
        onCommand: (entry) => commands.push(entry),
        onError: (error) => errors.push(error),
      });
    } else if (botSeed !== null) {
      client.opponent = attachDeterministicOpponent(socket, {
        seed: botSeed,
        decisionIntervalMs: DECISION_INTERVAL_MS,
        onCommand: (entry) => commands.push(entry),
        onError: (error) => errors.push(error),
      });
    }
    try {
      client.welcome = await waitForMessage(client, (message) => message.type === 'welcome', `${name} welcome`, 800);
      return client;
    } catch (error) {
      lastError = error;
      client.opponent?.close();
      try { if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'retry connection'); } catch {}
      await delay(80);
    }
  }
  throw new Error(`Could not connect ${name} to the local match: ${lastError?.message || 'timeout'}`);
}

async function closeClient(client) {
  if (!client) return;
  client.opponent?.close();
  if (client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 500);
    client.socket.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
    try {
      if (client.socket.readyState === WebSocket.OPEN) client.socket.close(1000, 'PvE smoke complete');
    } catch { clearTimeout(timeout); resolve(); }
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit').catch(() => {});
  server.kill('SIGTERM');
  await Promise.race([exited, delay(2_000)]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await once(server, 'exit').catch(() => {});
  }
}

function stateObservation(client) {
  return toOpponentObservation(client.feed.latest, client.welcome.player.team, client.welcome.map);
}

function isObjectiveZoneFullyVisible(state, zone) {
  if (state.fogOfWar !== true) return true;
  const visibility = state.visibility;
  if (!visibility || !Number.isInteger(visibility.columns) || !Number.isInteger(visibility.rows)
    || typeof visibility.data !== 'string'
    || zone.column < 0 || zone.row < 0 || zone.width < 1 || zone.height < 1
    || zone.column + zone.width > visibility.columns
    || zone.row + zone.height > visibility.rows) return false;
  const packed = Buffer.from(visibility.data, 'base64');
  for (let row = zone.row; row < zone.row + zone.height; row++) {
    for (let column = zone.column; column < zone.column + zone.width; column++) {
      const cell = row * visibility.columns + column;
      if (((packed[cell >> 2] >> ((cell & 3) * 2)) & 0b11) !== 2) return false;
    }
  }
  return true;
}

function countObservableUnits(observation, zone, map) {
  const counts = [0, 0];
  const units = [...observation.units.friendly, ...observation.units.visibleEnemies];
  for (const unit of units) {
    const column = Math.floor(unit.x + map.width / 2);
    const row = Math.floor(unit.z + map.height / 2);
    if (column >= zone.column && column < zone.column + zone.width
      && row >= zone.row && row < zone.row + zone.height) counts[unit.team]++;
  }
  return counts;
}

function verifyObjectiveContract(client, observation) {
  const state = client.feed.latest;
  const map = client.welcome.map;
  const records = new Map(state.objectives.map((record) => [record.id, record]));
  const triggers = new Map(map.triggers.map((trigger) => [trigger.id, trigger]));
  const objectives = new Map(observation.objectives.map((objective) => [objective.id, objective]));
  assert.deepEqual([...objectives.keys()], [...records.keys()].sort(),
    `team ${client.welcome.player.team} receives every public objective`);

  for (const [id, record] of records) {
    const objective = objectives.get(id);
    const trigger = triggers.get(id);
    assert.ok(trigger?.zone, `objective ${id} has a public static zone`);
    assert.deepEqual(objective.zone, {
      column: trigger.zone.column,
      row: trigger.zone.row,
      width: trigger.zone.width,
      height: trigger.zone.height,
    }, `objective ${id} exposes its public zone rectangle`);
    assert.equal(objective.owner, record.owner, `objective ${id} exposes its public owner`);
    assert.equal(objective.victory, record.victory === true);
    for (const field of ['requires', 'requiredOwner', 'requiresAll', 'requiredOwners']) {
      assert.equal(Object.hasOwn(objective, field), Object.hasOwn(record, field),
        `objective ${id} preserves public prerequisite field ${field}`);
      if (Object.hasOwn(record, field)) assert.deepEqual(objective[field], record[field]);
    }

    assert.deepEqual(objective.unitCounts, countObservableUnits(observation, trigger.zone, map),
      `objective ${id} counts only individually observable units`);

    if (isObjectiveZoneFullyVisible(state, trigger.zone)) {
      assert.equal(objective.progressTeam, record.progressTeam,
        `fully visible objective ${id} includes its progress team`);
      assert.equal(objective.progress, record.progress,
        `fully visible objective ${id} includes its capture progress`);
    } else {
      for (const field of ['progressTeam', 'progress']) {
        assert.equal(Object.hasOwn(objective, field), false,
          `objective ${id} without full-zone vision omits transient ${field}`);
      }
    }
  }
}

async function runSeatSmoke(botTeam) {
  const port = await findFreePort();
  const server = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_GAME_MODE: 'pvp',
      RTS_MAP: 'maps/forked-vale.json',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });
  server.stderr.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });

  const clients = [];
  const commands = [];
  const errors = [];
  try {
    let bot;
    let human;
    if (botTeam === 0) {
      bot = await openClient(port, 'bot-seat', {
        botSeed: DEFAULT_OPPONENT_SEED,
        commands,
        errors,
      });
      clients.push(bot);
      human = await openClient(port, 'human-seat');
      clients.push(human);
    } else {
      human = await openClient(port, 'human-seat');
      clients.push(human);
      bot = await openClient(port, 'bot-seat', {
        botSeed: DEFAULT_OPPONENT_SEED,
        commands,
        errors,
      });
      clients.push(bot);
    }

    assert.equal(human.welcome.player.team, 1 - botTeam, 'the human smoke peer takes the other seat');
    assert.equal(bot.welcome.player.team, botTeam, 'the server-assigned WebSocket seat drives bot identity');
    assert.equal(bot.opponent.team, botTeam, 'bot obtains its seat from the server welcome');
    assert.equal(bot.feed.latest.fogOfWar, true, 'Forked Vale exercises team vision');

    const initial = stateObservation(bot);
    verifyObjectiveContract(bot, initial);
    const initialFood = initial.resources.food;
    const initialWood = initial.resources.wood;
    const allMapNodeIds = new Set((bot.welcome.map.resourceNodes || []).map((node) => node.id));
    const visibleNodeIds = new Set(initial.resourceNodes.map((node) => node.id));
    assert.ok(visibleNodeIds.size > 0, `team ${botTeam} should see nearby resource nodes`);
    assert.ok([...allMapNodeIds].some((id) => !visibleNodeIds.has(id)),
      `team ${botTeam} must have at least one hidden resource node on the fog map`);
    assert.equal(initial.units.visibleEnemies.length, 0,
      `team ${botTeam} must not receive the hidden enemy starting army`);
    assert.equal(Object.hasOwn(initial, 'victoryHold'), false, 'both-team victory progress is excluded');
    assert.equal(Object.hasOwn(initial, 'scenarioEvents'), false, 'global scenario activity is excluded');
    assert.equal(Object.hasOwn(initial.map, 'spawnPoints'), false, 'raw map spawn data is excluded');

    await waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 1 && message.message?.startsWith('GATHER ORDER'),
    `team ${botTeam} first validated gather command`);
    await waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 2 && message.message?.startsWith('GATHER ORDER'),
    `team ${botTeam} second validated gather command`);
    await waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 3 && message.message?.startsWith('PLANNING ATTACK MOVE'),
    `team ${botTeam} validated attack-move command`);

    assert.equal(errors.length, 0, `team ${botTeam} bot adapter errors: ${errors.map((e) => e.message).join('; ')}`);
    const gatherCommands = commands.filter(({ command }) => command.type === 'gather');
    const tacticalCommands = commands.filter(({ command }) => command.type === 'attackMove');
    const openingGatherCommands = gatherCommands
      .filter(({ command }) => command.clientOrderToken <= 2);
    assert.equal(openingGatherCommands.length, 2, 'the opening sends one order for food and one for wood');
    const initiallyIdleWorkerIds = initial.units.friendly
      .filter((unit) => unit.kind === 'worker' && unit.hp > 0 && unit.task === 'idle')
      .map((unit) => unit.id)
      .sort((left, right) => left - right);
    const openingWorkerIds = openingGatherCommands.flatMap(({ command }) => command.ids)
      .sort((left, right) => left - right);
    assert.deepEqual(openingWorkerIds, initiallyIdleWorkerIds,
      `team ${botTeam} assigns every idle starting worker to a resource`);
    assert.equal(new Set(openingWorkerIds).size, initiallyIdleWorkerIds.length,
      `team ${botTeam} never assigns a worker twice in its opening`);
    const openingNodes = openingGatherCommands.map(({ command }) => (
      initial.resourceNodes.find((node) => node.id === command.nodeId)
    ));
    assert.ok(openingNodes.every((node) => node && node.stock > 0),
      `team ${botTeam} gathers only at visible stocked nodes`);
    assert.deepEqual([...new Set(openingNodes.map((node) => node.type))].sort(), ['food', 'wood'],
      `team ${botTeam} balances its opening between food and wood`);
    assert.ok(gatherCommands.length >= 2, 'the policy preserves its opening gather orders');
    assert.equal(tacticalCommands.length, 1, 'the opening sends one tactical advance order');
    const openingTactical = tacticalCommands.find(({ command }) => command.clientOrderToken === 3)?.command;
    assert.ok(openingTactical, 'the first tactical command is the third validated order');
    const openingObjective = initial.objectives.find((objective) => {
      if (![-1, 1 - botTeam].includes(objective.owner)) return false;
      const prerequisiteIds = Array.isArray(objective.requiresAll) ? objective.requiresAll
        : typeof objective.requires === 'string' ? [objective.requires] : [];
      const prerequisiteOwners = Array.isArray(objective.requiredOwners) ? objective.requiredOwners
        : typeof objective.requires === 'string' ? [objective.requiredOwner] : [];
      if (prerequisiteIds.length > 0 && (prerequisiteOwners.length !== prerequisiteIds.length
        || prerequisiteOwners.some((owner) => owner !== botTeam))) return false;
      const x = objective.zone.column + objective.zone.width / 2 - bot.welcome.map.width / 2;
      const z = objective.zone.row + objective.zone.height / 2 - bot.welcome.map.height / 2;
      return openingTactical.x === x && openingTactical.z === z;
    });
    assert.ok(openingObjective, 'the opening order targets an unlocked authored objective');
    for (const { command } of commands) {
      assert.equal(Object.hasOwn(command, 'team'), false, 'ordinary player commands do not carry a seat');
      assert.ok(Number.isSafeInteger(command.clientOrderToken), 'ordinary command acknowledgement token is present');
    }

    const initialSoldierPositions = new Map(initial.units.friendly
      .filter((unit) => unit.kind !== 'worker')
      .map((unit) => [unit.id, { x: unit.x, z: unit.z }]));
    const economyState = await waitForState(bot, (state) => {
      const observation = toOpponentObservation(state, botTeam, bot.welcome.map);
      return observation.resources.food > initialFood || observation.resources.wood > initialWood;
    }, `team ${botTeam} resource delivery`, ECONOMY_TIMEOUT_MS);
    const economy = toOpponentObservation(economyState, botTeam, bot.welcome.map);

    const tacticalState = await waitForState(bot, (state) => {
      const observation = toOpponentObservation(state, botTeam, bot.welcome.map);
      return observation.units.friendly.some((unit) => {
        const before = initialSoldierPositions.get(unit.id);
        return before && unit.kind !== 'worker'
          && Math.hypot(unit.x - before.x, unit.z - before.z) > 0.5;
      });
    }, `team ${botTeam} tactical movement`, TACTICS_TIMEOUT_MS);
    const tactical = toOpponentObservation(tacticalState, botTeam, bot.welcome.map);

    const contestedState = await waitForState(bot, (state) => {
      const observation = toOpponentObservation(state, botTeam, bot.welcome.map);
      const objective = observation.objectives.find(({ id }) => id === openingObjective.id);
      return objective && objective.unitCounts[botTeam] > 0;
    }, `team ${botTeam} entering ${openingObjective.id}`, OBJECTIVE_CONTEST_TIMEOUT_MS);
    const contestedObjective = toOpponentObservation(contestedState, botTeam, bot.welcome.map)
      .objectives.find(({ id }) => id === openingObjective.id);

    const foreignUnit = human.feed.latest.units.find((unit) => unit[1] === human.welcome.player.team);
    assert.ok(foreignUnit, 'the passive peer has a unit to use for the ownership rejection check');
    const rejection = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 999
      && message.message?.startsWith('MOVE REJECTED'),
    `team ${botTeam} foreign-unit rejection`);
    bot.socket.send(JSON.stringify({
      type: 'move', ids: [foreignUnit[0]], x: 0, z: 0, clientOrderToken: 999,
    }));
    await rejection;

    const resetHost = botTeam === 0 ? bot : human;
    const commandsBeforeReset = commands.length;
    const nextPolicyToken = Math.max(0, ...commands.map(({ command }) => command.clientOrderToken)) + 1;
    const resetNotice = waitForMessage(bot,
      (message) => message.type === 'notice' && message.message === 'BATTLEFIELD RESET',
      `team ${botTeam} host reset notice`);
    const rematchGatherFood = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === nextPolicyToken && message.message?.startsWith('GATHER ORDER'),
    `team ${botTeam} rematch food gather`);
    const rematchGatherWood = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === nextPolicyToken + 1 && message.message?.startsWith('GATHER ORDER'),
    `team ${botTeam} rematch wood gather`);
    const rematchAttackMove = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === nextPolicyToken + 2 && message.message?.startsWith('PLANNING ATTACK MOVE'),
    `team ${botTeam} rematch attack-move`);
    resetHost.socket.send(JSON.stringify({ type: 'reset' }));
    await Promise.all([resetNotice, rematchGatherFood, rematchGatherWood, rematchAttackMove]);
    const rematchCommands = commands.slice(commandsBeforeReset).map(({ command }) => command.type);
    assert.deepEqual(rematchCommands, ['gather', 'gather', 'attackMove'],
      'the deterministic policy reopens after a host reset');

    process.stdout.write(`${JSON.stringify({
      botTeam,
      seed: DEFAULT_OPPONENT_SEED,
      decisionIntervalMs: DECISION_INTERVAL_MS,
      commands: commands.map(({ command }) => command.type),
      visibleResourceNodes: initial.resourceNodes.map(({ id }) => id),
      hiddenResourceNodesOmitted: allMapNodeIds.size - visibleNodeIds.size,
      economy: { food: economy.resources.food, wood: economy.resources.wood },
      objective: {
        id: openingObjective.id,
        command: { x: openingTactical.x, z: openingTactical.z },
        botUnitsInZone: contestedObjective.unitCounts[botTeam],
        owner: contestedObjective.owner,
      },
      tacticalUnitsMoved: tactical.units.friendly.filter((unit) => {
        const before = initialSoldierPositions.get(unit.id);
        return before && unit.kind !== 'worker'
          && Math.hypot(unit.x - before.x, unit.z - before.z) > 0.5;
      }).length,
      foreignUnitRejected: true,
      rematchCommands,
    })}\n`);
  } catch (error) {
    throw new Error(`PvE smoke for team ${botTeam} failed: ${error.message}\n${serverOutput}`);
  } finally {
    for (const client of clients) await closeClient(client);
    await stopServer(server);
  }
}

async function readHealth(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`PvE health endpoint returned ${response.status}.`);
  return response.json();
}

async function waitForCondition(predicate, description, timeoutMs = PVE_RUNTIME_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function runRuntimePveSmoke(mapSeed = 1) {
  const port = await findFreePort();
  const policySeed = 20260926;
  const selectedMapId = selectPveMapId(mapSeed);
  const server = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_GAME_MODE: 'pve',
      RTS_PVE_MAP_SEED: String(mapSeed),
      RTS_PVE_POLICY_SEED: String(policySeed),
      RTS_MATCH_STATE_PATH: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });
  server.stderr.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });

  const clients = [];
  try {
    const unassigned = await waitForCondition(async () => {
      try { return await readHealth(port); } catch { return null; }
    }, 'PvE worker startup');
    assert.deepEqual(unassigned.pve, {
      enabled: true, active: false,
      mapSeed, policySeed, mapId: selectedMapId, commandsIssued: 0, error: null,
    }, 'the selected map and seeds are visible before a human seat is assigned');
    assert.equal(unassigned.armySize, 24, 'the selected authored map sets its playable opening roster');

    const human = await openClient(port, 'pve-human');
    clients.push(human);
    assert.equal(human.welcome.player.team, 0, 'the human receives the host seat');
    assert.equal(human.welcome.map.id, selectedMapId, 'the map seed selects an authored pool map');
    const spectator = await openClient(port, 'pve-spectator');
    clients.push(spectator);
    assert.equal(spectator.welcome.player.team, null, 'the virtual opponent reserves team 1 from humans');
    assert.equal(human.feed.latest.connected, 2, 'the virtual opponent fills the second room seat');

    const initial = spectator.welcome.state;
    const teamOneSpawn = spectator.welcome.map.spawnPoints.find((spawn) => spawn.team === 1);
    assert.ok(teamOneSpawn, 'the selected map defines the reserved opponent spawn');
    const openingHealth = await waitForCondition(async () => {
      const health = await readHealth(port);
      return health.pve.active && health.pve.commandsIssued >= 3 ? health : null;
    }, 'server-owned opponent opening orders');
    const acted = await waitForState(spectator, (state) => (
      state.units.some((unit) => unit[1] === 1 && unit[5] === 'worker'
        && ['gathering', 'returning'].includes(unit[9]))
      && state.units.some((unit) => {
        if (unit[1] !== 1 || unit[5] === 'worker' || unit[4] <= 0) return false;
        return Math.hypot(unit[2] - teamOneSpawn.x, unit[3] - teamOneSpawn.z) > 2;
      })
    ), 'server-owned gathering and tactical movement', PVE_RUNTIME_TIMEOUT_MS);
    assert.ok(acted.tick > initial.tick);
    assert.equal(openingHealth.pve.error, null);

    const resetTick = spectator.feed.latest.tick;
    const resetNotice = waitForMessage(human,
      (message) => message.type === 'notice' && message.message === 'BATTLEFIELD RESET',
      'PvE rematch reset');
    human.socket.send(JSON.stringify({ type: 'reset' }));
    await resetNotice;
    const rematchHealth = await waitForCondition(async () => {
      const health = await readHealth(port);
      return health.pve.active && health.pve.commandsIssued >= 3 ? health : null;
    }, 'the deterministic opponent to restart after rematch');
    assert.equal(rematchHealth.pve.mapSeed, mapSeed);
    assert.equal(rematchHealth.pve.policySeed, policySeed);
    assert.equal(rematchHealth.map, selectedMapId, 'rematch keeps its selected map');
    await waitForState(spectator, (state) => state.tick > resetTick
      && state.units.some((unit) => unit[1] === 1 && unit[5] === 'worker'
        && ['gathering', 'returning'].includes(unit[9])),
    'PvE rematch economy orders', PVE_RUNTIME_TIMEOUT_MS);
    process.stdout.write(`PvE runtime passed (${selectedMapId}): seeded map, reserved AI seat, gathering, movement, and repeatable rematch.\n`);
  } catch (error) {
    throw new Error(`Server-owned PvE runtime smoke failed: ${error.message}\n${serverOutput}`);
  } finally {
    for (const client of clients) await closeClient(client);
    await stopServer(server);
  }
}

async function runProposalCommandSmoke() {
  const port = await findFreePort();
  const server = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_GAME_MODE: 'pvp',
      RTS_MAP: 'maps/forked-vale.json',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });
  server.stderr.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); });
  const clients = [];
  const commands = [];
  const errors = [];
  const providerRequests = [];
  const fakeProvider = {
    reportsUsage: true,
    estimateRequest(request) {
      return {
        inputTokens: Math.ceil(Buffer.byteLength(JSON.stringify(request), 'utf8') / 4),
        reservedCostUsd: 0.001,
      };
    },
    async propose(request) {
      providerRequests.push(request);
      const worker = request.observation.units.friendly.find((unit) => unit.kind === 'worker' && unit.hp > 0);
      const node = request.observation.resourceNodes
        .filter((entry) => entry.stock > 0)
        .sort((left, right) => (
          ((left.x - worker.x) ** 2 + (left.z - worker.z) ** 2)
            - ((right.x - worker.x) ** 2 + (right.z - worker.z) ** 2)
        ))[0];
      return {
        content: proposalEnvelope(request.requestId, {
          type: 'gather', ids: [worker.id], nodeId: node.id,
        }),
        usage: { inputTokens: 64, outputTokens: 24, costUsd: 0.0005 },
      };
    },
  };

  try {
    const host = await openClient(port, 'human-host');
    clients.push(host);
    const proposalSeat = await openClient(port, 'fake-proposal-seat', {
      proposalOptions: {
        enabled: true,
        provider: fakeProvider,
        createRequestId: () => 'fake-e2e-request',
        setInterval: (callback) => callback,
        clearInterval: () => {},
      },
      commands,
      errors,
    });
    clients.push(proposalSeat);
    assert.equal(proposalSeat.welcome.player.team, 1, 'the fake proposal peer takes the server-assigned second seat');
    assert.equal(proposalSeat.opponent.team, 1, 'the proposal adapter binds its seat from welcome');
    const initial = stateObservation(proposalSeat);
    assert.ok(initial.units.friendly.some((unit) => unit.kind === 'worker'));
    assert.ok(initial.resourceNodes.some((node) => node.stock > 0));
    const firstWorker = initial.units.friendly.find((unit) => unit.kind === 'worker');
    const nearestNode = initial.resourceNodes
      .filter((entry) => entry.stock > 0)
      .sort((left, right) => (
        ((left.x - firstWorker.x) ** 2 + (left.z - firstWorker.z) ** 2)
          - ((right.x - firstWorker.x) ** 2 + (right.z - firstWorker.z) ** 2)
      ))[0];

    const gatherNotice = waitForMessage(proposalSeat, (message) => message.type === 'notice'
      && message.clientOrderToken === 1 && message.message?.startsWith('GATHER ORDER'),
    'server-validated fake proposal gather order');
    const outcome = await proposalSeat.opponent.requestDecision();
    await gatherNotice;
    assert.equal(outcome.status, 'accepted');
    assert.equal(providerRequests.length, 1, 'only the injected fake provider receives a proposal request');
    assert.equal(commands.length, 1, 'one proposal decision emits at most one normal player command');
    assert.deepEqual(commands[0].command, {
      type: 'gather', ids: [firstWorker.id], nodeId: nearestNode.id,
      clientOrderToken: 1,
    });
    assert.equal(Object.hasOwn(commands[0].command, 'team'), false, 'the model cannot choose a seat');
    assert.equal(proposalSeat.opponent.getMetrics().acceptedProposals, 1);
    assert.equal(proposalSeat.opponent.getMetrics().requestsSent, 1);
    assert.equal(errors.length, 0, `fake proposal adapter errors: ${errors.map((error) => error.message).join('; ')}`);
    process.stdout.write(`${JSON.stringify({
      proposalSeat: proposalSeat.opponent.team,
      provider: 'injected fake',
      command: commands[0].command.type,
      serverAcknowledged: true,
      metrics: proposalSeat.opponent.getMetrics(),
    })}\n`);
  } catch (error) {
    throw new Error(`PvE fake proposal smoke failed: ${error.message}\n${serverOutput}`);
  } finally {
    for (const client of clients) await closeClient(client);
    await stopServer(server);
  }
}

verifyPveLaunchRules();

if (process.argv.includes('--runtime-only')) {
  await runRuntimePveSmoke(0);
  await runRuntimePveSmoke(1);
} else if (process.argv.includes('--policy-only')) {
  verifyPureContract();
  verifyIdleWorkerEconomyLoop();
  verifyObjectiveContestPolicy();
  process.stdout.write('PvE policy-only checks passed.\n');
} else if (process.argv.includes('--proposal-only')) {
  verifyPureContract();
  verifyIdleWorkerEconomyLoop();
  verifyObjectiveContestPolicy();
  verifyProposalSchema();
  await verifyProposalController();
} else if (process.argv.includes('--proposal-smoke-only')) {
  verifyPureContract();
  verifyIdleWorkerEconomyLoop();
  verifyObjectiveContestPolicy();
  await runProposalCommandSmoke();
} else {
  verifyPureContract();
  verifyIdleWorkerEconomyLoop();
  verifyObjectiveContestPolicy();
  verifyProposalSchema();
  await verifyProposalController();
  await verifyLifecycleRecovery();
  await runRuntimePveSmoke(0);
  await runRuntimePveSmoke(1);
  await runSeatSmoke(0);
  await runSeatSmoke(1);
  await runProposalCommandSmoke();
  process.stdout.write('PvE WebSocket smoke passed for Azure and Ember bot seats.\n');
}
