import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
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

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const ENDPOINT = (port) => `ws://127.0.0.1:${port}/ws`;
const CONNECT_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 8_000;
const ECONOMY_TIMEOUT_MS = 20_000;
const TACTICS_TIMEOUT_MS = 15_000;
const DECISION_INTERVAL_MS = 1_000;

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
  assert.deepEqual(firstPolicy.next(observation), secondPolicy.next(observation),
    'the same seed and observation must produce identical commands');
  assert.deepEqual(firstPolicy.next(observation), secondPolicy.next(observation),
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

async function openClient(port, name, { botSeed = null, commands = null, errors = null } = {}) {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    const socket = new WebSocket(ENDPOINT(port), ['rts-v1']);
    const client = { name, socket, feed: createFeed(socket), welcome: null, opponent: null };
    if (botSeed !== null) {
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
    assert.equal(gatherCommands.length, 2, 'the opening sends food and wood gathering orders');
    assert.equal(tacticalCommands.length, 1, 'the opening sends one tactical advance order');
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
    const resetNotice = waitForMessage(bot,
      (message) => message.type === 'notice' && message.message === 'BATTLEFIELD RESET',
      `team ${botTeam} host reset notice`);
    const rematchGatherFood = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 4 && message.message?.startsWith('GATHER ORDER'),
    `team ${botTeam} rematch food gather`);
    const rematchGatherWood = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 5 && message.message?.startsWith('GATHER ORDER'),
    `team ${botTeam} rematch wood gather`);
    const rematchAttackMove = waitForMessage(bot, (message) => message.type === 'notice'
      && message.clientOrderToken === 6 && message.message?.startsWith('PLANNING ATTACK MOVE'),
    `team ${botTeam} rematch attack-move`);
    resetHost.socket.send(JSON.stringify({ type: 'reset' }));
    await Promise.all([resetNotice, rematchGatherFood, rematchGatherWood, rematchAttackMove]);
    assert.deepEqual(commands.slice(3).map(({ command }) => command.type),
      ['gather', 'gather', 'attackMove'], 'the deterministic policy reopens after a host reset');

    process.stdout.write(`${JSON.stringify({
      botTeam,
      seed: DEFAULT_OPPONENT_SEED,
      decisionIntervalMs: DECISION_INTERVAL_MS,
      commands: commands.map(({ command }) => command.type),
      visibleResourceNodes: initial.resourceNodes.map(({ id }) => id),
      hiddenResourceNodesOmitted: allMapNodeIds.size - visibleNodeIds.size,
      economy: { food: economy.resources.food, wood: economy.resources.wood },
      tacticalUnitsMoved: tactical.units.friendly.filter((unit) => {
        const before = initialSoldierPositions.get(unit.id);
        return before && unit.kind !== 'worker'
          && Math.hypot(unit.x - before.x, unit.z - before.z) > 0.5;
      }).length,
      foreignUnitRejected: true,
      rematchCommands: commands.slice(3).map(({ command }) => command.type),
    })}\n`);
  } catch (error) {
    throw new Error(`PvE smoke for team ${botTeam} failed: ${error.message}\n${serverOutput}`);
  } finally {
    for (const client of clients) await closeClient(client);
    await stopServer(server);
  }
}

verifyPureContract();
await verifyLifecycleRecovery();
await runSeatSmoke(0);
await runSeatSmoke(1);
process.stdout.write('PvE WebSocket smoke passed for Azure and Ember bot seats.\n');
