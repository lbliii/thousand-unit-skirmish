import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 10_000;
const SCENARIO_TIMEOUT_MS = 90_000;
const FOOD_NODE_ID = 'azure-food';
const FOOD_NODE_STOCK = 50;

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

let child;
let serverLog = '';

async function startServer(port, temporary) {
  child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_MAP: 'maps/forked-vale.json',
      RTS_MATCH_STATE_PATH: path.join(temporary, 'checkpoint.json'),
      RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'custom-maps'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup:\n${serverLog}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become healthy within ${READY_TIMEOUT_MS} ms:\n${serverLog}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) {
    const forcedExit = once(child, 'exit');
    child.kill('SIGKILL');
    await forcedExit;
  }
}

function createClient(port, sessionToken = null) {
  const protocols = ['rts-v1'];
  if (sessionToken) protocols.push(`rts-resume.${sessionToken}`);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
  const messages = [];
  const messageWaiters = [];
  const stateWaiters = [];
  let latestState = null;

  function acceptState(state) {
    if (!state || state.type !== 'state') return;
    latestState = state;
    for (let index = stateWaiters.length - 1; index >= 0; index--) {
      const waiter = stateWaiters[index];
      if (!waiter.predicate(state)) continue;
      stateWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(state);
    }
  }

  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'welcome' || message.type === 'mapChange') acceptState(message.state);
    else if (message.type === 'state') acceptState(message);
    for (let index = messageWaiters.length - 1; index >= 0; index--) {
      const waiter = messageWaiters[index];
      if (!waiter.predicate(message)) continue;
      messageWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });

  function waitForMessage(predicate, timeoutMs = SCENARIO_TIMEOUT_MS) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        messageWaiters.splice(messageWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for a server message.'));
      }, timeoutMs) };
      messageWaiters.push(waiter);
    });
  }

  function waitForState(predicate, timeoutMs = SCENARIO_TIMEOUT_MS) {
    if (latestState && predicate(latestState)) return Promise.resolve(latestState);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for an authoritative state.'));
      }, timeoutMs) };
      stateWaiters.push(waiter);
    });
  }

  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening a WebSocket.')), READY_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed.'));
    }, { once: true });
  });
  return { socket, opened, waitForMessage, waitForState };
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

async function close(socket) {
  if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CONNECTING) {
    if (socket.readyState === WebSocket.CONNECTING) socket.close();
    return;
  }
  await new Promise((resolve) => {
    socket.addEventListener('close', resolve, { once: true });
    socket.close(1000, 'elimination scenario complete');
  });
}

const clients = [];
let temporary;
try {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-elimination-scenario-'));
  const port = await reservePort();
  await startServer(port, temporary);

  const azure = createClient(port);
  clients.push(azure);
  await azure.opened;
  const azureWelcome = await azure.waitForMessage((message) => message.type === 'welcome');
  assert.equal(azureWelcome.player.team, 0);
  assert.ok(azureWelcome.player.sessionToken, 'Azure receives a resumable session token');

  const ember = createClient(port);
  clients.push(ember);
  await ember.opened;
  const emberWelcome = await ember.waitForMessage((message) => message.type === 'welcome');
  assert.equal(emberWelcome.player.team, 1);

  const base = JSON.parse(await readFile(path.join(ROOT, 'maps/open-field.json'), 'utf8'));
  const map = {
    ...base,
    id: 'elimination-scenario',
    name: 'ELIMINATION SCENARIO',
    summary: 'NO CAPTURE VICTORY · ELIMINATION',
    startingArmySize: 24,
    startingResources: { food: 0, wood: 0 },
    spawnPoints: [{ team: 0, x: -5, z: 0 }, { team: 1, x: 5, z: 0 }],
    resourceNodes: [{ id: FOOD_NODE_ID, type: 'food', x: -8.5, z: 0.5, stock: FOOD_NODE_STOCK }],
    obstacles: [],
    triggers: [],
    fogOfWar: false,
  };
  const mapPublished = azure.waitForMessage((message) => message.type === 'mapPublished'
    && message.mapId === map.id);
  const mapChanges = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'mapChange' && message.map.id === map.id
  )));
  send(azure.socket, { type: 'publishMap', map });
  await Promise.all([mapPublished, ...mapChanges]);

  const [azureState, emberState] = await Promise.all([azure, ember].map((client) => (
    client.waitForState((state) => state.mapId === map.id && state.armySize === 24 && state.winner === -1)
  )));
  assert.deepEqual(azureState.alive, [12, 12]);
  assert.deepEqual(emberState.alive, [12, 12]);
  assert.equal(azureState.winnerReason, null);
  assert.equal(emberState.winnerReason, null);
  assert.equal(azureState.food[0], 0);
  assert.equal(emberState.food[1], 0);

  const azureWorkers = azureState.units.filter((unit) => unit[1] === 0 && unit[5] === 'worker');
  assert.equal(azureWorkers.length, 4);
  const gatherNotice = azure.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 30 && message.message === 'GATHER ORDER · 4 WORKERS');
  send(azure.socket, { type: 'gather', ids: azureWorkers.map((unit) => unit[0]),
    nodeId: FOOD_NODE_ID, clientOrderToken: 30 });
  await gatherNotice;
  const gatheredFood = await azure.waitForState((state) => state.mapId === map.id
    && state.food[0] === FOOD_NODE_STOCK
    && state.resourceNodes.find((node) => node.id === FOOD_NODE_ID)?.stock === 0);
  assert.equal(gatheredFood.food[1], 0,
    'only the commanded team should gain food before the elimination match');

  const resultStates = [azure, ember].map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.winner !== -1
  )));
  const victoryMessages = [azure, ember].map((client) => client.waitForMessage((message) => (
    message.type === 'victory' && message.reason === 'elimination'
  )));
  send(azure.socket, {
    type: 'attackMove', ids: Array.from({ length: 12 }, (_, index) => index),
    x: 5, z: 0, formation: 'line',
  });
  const [states, victories] = await Promise.all([
    Promise.all(resultStates), Promise.all(victoryMessages),
  ]);
  for (const state of states) {
    assert.equal(state.winner, 0, 'Azure should win after eliminating Ember');
    assert.equal(state.winnerReason, 'elimination');
    assert.equal(state.winnerTriggerId, null);
    assert.equal(state.alive[1], 0);
  }
  assert.ok(victories.every((message) => message.team === 0));
  assert.match(victories[0].message, /EMBER ELIMINATED/);

  const terminalUnit = states[0].units.find((unit) => unit[1] === 0 && unit[4] > 0);
  const terminalUnitId = terminalUnit?.[0] ?? 0;
  const terminalPosition = terminalUnit?.slice(2, 4) ?? null;
  const rejectedOrder = azure.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 31
    && message.message === 'MATCH OVER · RESET BATTLEFIELD TO PLAY AGAIN');
  send(azure.socket, { type: 'move', ids: [terminalUnitId], x: 0, z: 0, clientOrderToken: 31 });
  await rejectedOrder;

  assert.equal(states[0].food[0], FOOD_NODE_STOCK,
    'the winner should still have enough food for a worker order');
  const rejectedProductionOrder = azure.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 32
    && message.message === 'MATCH OVER · RESET BATTLEFIELD TO PLAY AGAIN');
  send(azure.socket, { type: 'trainWorker', clientOrderToken: 32 });
  await rejectedProductionOrder;

  const rejectedGuestOrder = ember.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 33
    && message.message === 'MATCH OVER · WAIT FOR HOST TO RESET');
  send(ember.socket, { type: 'move', ids: [12], x: 0, z: 0, clientOrderToken: 33 });
  await rejectedGuestOrder;

  const rejectedGuestReset = ember.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 34
    && message.message === 'RESET REJECTED · ONLY THE HOST CAN RESET THE MATCH');
  send(ember.socket, { type: 'reset', clientOrderToken: 34 });
  await rejectedGuestReset;

  const sessionToken = azureWelcome.player.sessionToken;
  await close(azure.socket);
  const resumedAzure = createClient(port, sessionToken);
  clients.push(resumedAzure);
  await resumedAzure.opened;
  const resumedWelcome = await resumedAzure.waitForMessage((message) => message.type === 'welcome');
  assert.equal(resumedWelcome.player.team, 0);
  assert.equal(resumedWelcome.player.resumed, true);
  assert.equal(resumedWelcome.state.winner, 0);
  assert.equal(resumedWelcome.state.winnerReason, 'elimination');
  assert.equal(resumedWelcome.state.food[0], FOOD_NODE_STOCK,
    'a terminal production order must not spend the winner’s banked food');
  assert.equal(resumedWelcome.state.workerProduction[0].queue, 0,
    'a terminal production order must not add a worker to the queue');
  assert.deepEqual(resumedWelcome.state.alive, states[0].alive,
    'terminal orders and unauthorized guest reset must not change the roster');
  if (terminalPosition) {
    assert.deepEqual(resumedWelcome.state.units.find((unit) => unit[0] === terminalUnitId).slice(2, 4), terminalPosition,
      'a surviving unit must not move through a terminal order');
  }

  console.log(JSON.stringify({
    passed: [
      'isolated no-objective elimination victory',
      'host movement and affordable production orders stay blocked after victory',
      'guest terminal order rejection',
      'guest reset rejection after victory',
      'reconnect winner persistence',
    ],
    winner: 'Azure', reason: 'elimination', foodBeforeTerminalOrders: states[0].food[0],
    remainingEmberUnits: states[0].alive[1],
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, serverLog }, null, 2));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map((client) => close(client.socket)));
  await stopServer();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
