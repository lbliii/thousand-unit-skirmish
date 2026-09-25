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
      { id: 'ford-hidden', zone: { column: 14, row: 14, width: 1, height: 1 } },
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
      { id: 'ford-visible', owner: -1, progressTeam: -1, progress: 0, unitCounts: [0, 0], victory: false },
      { id: 'ford-hidden', owner: 1, progressTeam: 1, progress: 0.75, unitCounts: [0, 5], victory: true },
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
  assert.deepEqual(observation.units.visibleEnemies, [], 'hidden enemy units must be omitted');
  assert.deepEqual(observation.buildings.visibleEnemies, [], 'hidden enemy buildings must be omitted');
  assert.deepEqual(observation.resourceNodes.map((node) => node.id), ['food-visible'],
    'hidden resource nodes must be omitted');
  assert.deepEqual(observation.objectives.map((objective) => objective.id), ['ford-visible'],
    'objectives outside current vision must be omitted');
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
    })}\n`);
  } catch (error) {
    throw new Error(`PvE smoke for team ${botTeam} failed: ${error.message}\n${serverOutput}`);
  } finally {
    for (const client of clients) await closeClient(client);
    await stopServer(server);
  }
}

verifyPureContract();
await runSeatSmoke(0);
await runSeatSmoke(1);
process.stdout.write('PvE WebSocket smoke passed for Azure and Ember bot seats.\n');
