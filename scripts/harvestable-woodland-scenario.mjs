import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 10_000;
const STATE_TIMEOUT_MS = 22_000;

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, customMapDirectory, matchStatePath) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
      RTS_MATCH_STATE_PATH: matchStatePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { cache: 'no-store' });
      if (response.ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill('SIGKILL');
  throw new Error(`Server did not become healthy within ${READY_TIMEOUT_MS} ms:\n${output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  const timeout = new Promise((resolve) => setTimeout(resolve, 5_000));
  await Promise.race([exited, timeout]);
  if (child.exitCode === null) {
    const forcedExit = once(child, 'exit');
    child.kill('SIGKILL');
    await forcedExit;
  }
}

function createClient(port, protocols = ['rts-v1']) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
  const messages = [];
  const waiters = [];
  let latestState = null;
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'state') latestState = message;
    if (message.type === 'mapChange' && message.state) latestState = message.state;
    if (message.type === 'welcome' && message.state) latestState = message.state;
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  function waitForMessage(predicate, label = 'server message', timeoutMs = READY_TIMEOUT_MS) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error(`Timed out waiting for ${label}.`));
      }, timeoutMs) };
      waiters.push(waiter);
    });
  }
  function waitForState(predicate, label, timeoutMs = STATE_TIMEOUT_MS) {
    if (latestState && predicate(latestState)) return Promise.resolve(latestState);
    return waitForMessage((message) => message.type === 'state' && predicate(message), label, timeoutMs)
      .then((message) => message);
  }
  return { socket, messages, waitForMessage, waitForState, get latestState() { return latestState; } };
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'woodland scenario complete');
  });
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

function forestStock(state, cell) {
  return state.forestStocks?.find(([rowCell]) => rowCell === cell)?.[1] ?? null;
}

function visibilityAt(state, cell) {
  const packed = Buffer.from(state.visibility?.data || '', 'base64');
  return packed.length === Math.ceil(state.visibility.columns * state.visibility.rows / 4)
    ? (packed[cell >> 2] >> ((cell & 3) * 2)) & 3 : null;
}

function workerRow(state, id) {
  return state.units?.find((row) => row[0] === id) || null;
}

function isCell(point, column, row, width, height) {
  return Math.floor(point[2] + width / 2) === column
    && Math.floor(point[3] + height / 2) === row;
}

const port = await reservePort();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-harvestable-woodland-'));
const customMapDirectory = path.join(tempRoot, 'custom-maps');
const matchStatePath = path.join(tempRoot, 'match-state.json');
const width = 40;
const height = 40;
const targetColumn = 8;
const targetRow = 20;
const targetCell = targetRow * width + targetColumn;
const map = {
  id: 'woodland-cell-check',
  name: 'Woodland Cell Check',
  summary: 'Cut one tree, open its cell, and recover the clearing.',
  width,
  height,
  startingArmySize: 8,
  startingResources: { wood: 0 },
  fogOfWar: true,
  spawnPoints: [{ team: 0, x: -14, z: 0 }, { team: 1, x: 14, z: 0 }],
  obstacles: [{ column: targetColumn, row: 18, width: 1, height: 5, material: 'forest' }],
  resourceNodes: [],
  triggers: [],
  scenarioEvents: [],
};

let server = null;
let azure = null;
let ember = null;
try {
  server = await startServer(port, customMapDirectory, matchStatePath);
  azure = createClient(port);
  const firstWelcome = await azure.waitForMessage((message) => message.type === 'welcome', 'Azure welcome');
  assert.equal(firstWelcome.player.team, 0, 'first seat should control Azure');
  const sessionToken = firstWelcome.player.sessionToken;

  ember = createClient(port);
  const secondWelcome = await ember.waitForMessage((message) => message.type === 'welcome', 'Ember welcome');
  assert.equal(secondWelcome.player.team, 1, 'second seat should control Ember');

  const mapChange = azure.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === map.id, 'woodland map publication');
  send(azure, { type: 'publishMap', map, persist: true });
  const published = await mapChange;
  await ember.waitForMessage((message) => message.type === 'mapChange' && message.map.id === map.id,
    'Ember woodland map publication');
  assert.equal(forestStock(published.state, targetCell), null,
    'unmodified forest cells should stay implicit in the sparse state');
  assert.equal(visibilityAt(published.state, targetCell), 2,
    'Azure should see the forest cell before ordering a worker');
  assert.equal(visibilityAt(ember.latestState, targetCell), 0,
    'Ember should not see the woodland pilot target');

  const gatherNotice = azure.waitForMessage((message) => message.type === 'notice'
    && message.message?.startsWith('GATHER ORDER'), 'forest gather order');
  send(azure, { type: 'gather', ids: [0], forestCell: targetCell });
  await gatherNotice;
  const harvested = await azure.waitForState((state) => forestStock(state, targetCell) === 0
    && Number(state.wood?.[0]) >= 5.9, 'worker to cut the tree and deposit its wood');
  const worker = workerRow(harvested, 0);
  assert.ok(worker, 'forest worker should remain synchronized');
  assert.equal(worker[5], 'worker');

  const emberObservation = await ember.waitForState((state) => state.tick >= harvested.tick,
    'fog-safe Ember snapshot');
  assert.equal(forestStock(emberObservation, targetCell), null,
    'a cut hidden behind fog must not leak its state to the other team');
  assert.equal(visibilityAt(emberObservation, targetCell), 0,
    'the tree cut should remain outside Ember vision');

  const moveNotice = azure.waitForMessage((message) => message.type === 'notice'
    && message.message?.startsWith('MOVE ORDER'), 'route through cleared cell');
  const target = {
    x: targetColumn - width / 2 + 0.5,
    z: targetRow - height / 2 + 0.5,
  };
  send(azure, { type: 'move', ids: [0], x: target.x, z: target.z });
  await moveNotice;
  const crossed = await azure.waitForState((state) => {
    const row = workerRow(state, 0);
    return row && isCell(row, targetColumn, targetRow, width, height);
  }, 'worker to enter the opened forest cell');
  assert.equal(forestStock(crossed, targetCell), 0,
    'the traversable forest cell should stay recorded as cleared');

  await closeClient(ember);
  ember = null;
  await closeClient(azure);
  azure = null;
  await stopServer(server);
  server = null;

  server = await startServer(port, customMapDirectory, matchStatePath);
  azure = createClient(port, ['rts-v1', `rts-resume.${sessionToken}`]);
  const resumedWelcome = await azure.waitForMessage((message) => message.type === 'welcome', 'recovery welcome');
  assert.equal(resumedWelcome.recoveredFromCheckpoint, true,
    'the server should recover the woodland match checkpoint');
  assert.equal(resumedWelcome.player.team, 0, 'the host seat should resume from its saved token');
  assert.equal(resumedWelcome.map.id, map.id, 'the saved woodland map should recover');
  assert.equal(forestStock(resumedWelcome.state, targetCell), 0,
    'the cleared tree and its open route should survive checkpoint recovery');
  assert.ok(resumedWelcome.state.wood[0] >= 5.9,
    'the deposited wood should survive checkpoint recovery');

  send(azure, { type: 'reset' });
  const reset = await azure.waitForState((state) => state.forestEpoch > resumedWelcome.state.forestEpoch
    && (!state.forestStocks || state.forestStocks.length === 0), 'forest reset');
  assert.equal(reset.wood[0], 0, 'match reset should restore the opening wood bank');
  const resetNotice = azure.messages.find((message) => message.type === 'notice'
    && message.message?.startsWith('BATTLEFIELD RESET'));
  assert.ok(resetNotice, 'host reset should complete after recovery');

  console.log(JSON.stringify({
    passed: [
      'cell-target gather depletes one tree and deposits finite wood',
      'forest changes stay sparse and fog-filtered by current visibility',
      'cleared cell becomes a valid movement destination',
      'woodland state, route, and host session recover from checkpoint',
      'match reset restores forest stock',
    ],
    mapId: map.id,
    targetCell,
    depositedWood: resumedWelcome.state.wood[0],
    recoveredForestStock: forestStock(resumedWelcome.state, targetCell),
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeClient(ember).catch(() => {});
  await closeClient(azure).catch(() => {});
  await stopServer(server);
  await rm(tempRoot, { recursive: true, force: true });
}
