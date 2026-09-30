import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 10_000;
const MESSAGE_TIMEOUT_MS = 30_000;
let stage = 'initialization';

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, customMapDirectory, matchStatePath = null) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
      ...(matchStatePath ? { RTS_MATCH_STATE_PATH: matchStatePath } : {}),
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
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) {
    const forcedExit = once(child, 'exit');
    child.kill('SIGKILL');
    await forcedExit;
  }
}

function createClient(port, token = null) {
  const protocols = token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1'];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
  const messages = [];
  const messageWaiters = [];
  const stateWaiters = [];
  let latestState = null;
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'state' || message.type === 'mapChange') {
      const state = message.type === 'mapChange' ? message.state : message;
      if (state?.type === 'state') {
        latestState = state;
        for (let index = stateWaiters.length - 1; index >= 0; index--) {
          const waiter = stateWaiters[index];
          if (!waiter.predicate(state)) continue;
          stateWaiters.splice(index, 1);
          clearTimeout(waiter.timeout);
          waiter.resolve(state);
        }
      }
    }
    for (let index = messageWaiters.length - 1; index >= 0; index--) {
      const waiter = messageWaiters[index];
      if (messages.length - 1 < waiter.afterIndex || !waiter.predicate(message)) continue;
      messageWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  function waitForMessage(predicate, afterIndex = -1) {
    const existing = messages.find((message, index) => index > afterIndex && predicate(message));
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, afterIndex, resolve, reject, timeout: setTimeout(() => {
        messageWaiters.splice(messageWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for a server message.'));
      }, MESSAGE_TIMEOUT_MS) };
      messageWaiters.push(waiter);
    });
  }
  function waitForState(predicate) {
    if (latestState && predicate(latestState)) return Promise.resolve(latestState);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        const summary = latestState ? {
          tick: latestState.tick, mapId: latestState.mapId,
          armySize: latestState.armySize, units: latestState.units?.length,
          scenarioClockStarted: latestState.scenarioClockStarted,
          connected: latestState.connected, winner: latestState.winner,
          unit0: latestState.units?.find((unit) => unit[0] === 0),
          objectives: latestState.objectives?.map((objective) => ({
            id: objective.id, owner: objective.owner, progressTeam: objective.progressTeam,
            progress: objective.progress, unitCounts: objective.unitCounts,
          })),
          captureEvents: latestState.scenarioEvents?.filter((event) => event.activatedAtSeconds !== undefined),
        } : null;
        reject(new Error(`Timed out waiting for an authoritative state. Latest: ${JSON.stringify(summary)}`));
      }, MESSAGE_TIMEOUT_MS) };
      stateWaiters.push(waiter);
    });
  }
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening WebSocket.')), MESSAGE_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed.')); }, { once: true });
  });
  return { socket, messages, opened, waitForMessage, waitForState };
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'timed event scenario complete');
  });
}

function eventFired(state, id, fired = true) {
  return state.scenarioEvents?.find((event) => event.id === id)?.fired === fired;
}

function liveUnitCount(state, team, kind) {
  return state.units.filter((unit) => unit[1] === team && unit[4] > 0 && unit[5] === kind).length;
}

function cellKey(x, z, width, height) {
  const column = Math.floor(x + width / 2);
  const row = Math.floor(z + height / 2);
  return { column, row, key: `${column},${row}` };
}

const port = await reservePort();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-region-events-'));
const customMapDirectory = path.join(tempRoot, 'custom-maps');
const checkpointPath = path.join(tempRoot, 'match-state.json');
const clients = [];
let server;
try {
  server = await startServer(port, customMapDirectory, checkpointPath);
  let azure = createClient(port); clients.push(azure); await azure.opened;
  const azureWelcome = await azure.waitForMessage((message) => message.type === 'welcome');
  let ember = createClient(port); clients.push(ember); await ember.opened;
  const emberWelcome = await ember.waitForMessage((message) => message.type === 'welcome');
  const base = JSON.parse(await readFile(new URL('../maps/open-field.json', import.meta.url), 'utf8'));
  const map = { ...base, id: 'region-events', name: 'Region Events', startingArmySize: 8,
    fogOfWar: false, startingResources: { food: 0, wood: 0 },
    regions: [{ id: 'field', name: 'Field', zone: { column: 26, row: 26, width: 12, height: 12 } }],
    scenarioEvents: [0, 1].map((team) => ({ id: `arrival-${team}`, name: `Arrival ${team}`,
      type: 'timed-supply', afterSeconds: 3, team: String(team), foodReward: 11,
      trigger: { type: 'region-entry', regionId: 'field', team: String(team), minimumUnits: 1 },
      message: '{event} · {team}' })) };
  stage = 'publish and round trip region conditions';
  const changed = azure.waitForMessage((message) => message.type === 'mapChange' && message.map.id === map.id);
  send(azure, { type: 'publishMap', map });
  assert.deepEqual((await changed).map.regions, map.regions);
  const pending = await azure.waitForState((state) => state.mapId === map.id && state.connected === 2);
  assert.ok(pending.scenarioEvents.every((event) => event.activatedAtSeconds === null));
  send(azure, { type: 'move', ids: [0], x: -3, z: 0 });
  send(ember, { type: 'move', ids: [4], x: 3, z: 0 });
  const activated = await azure.waitForState((state) => state.mapId === map.id
    && state.scenarioEvents.every((event) => Number.isFinite(event.activatedAtSeconds)));
  assert.deepEqual(activated.scenarioEvents.map((event) => event.triggeredByTeam), [0, 1]);
  stage = 'recover pending region delays';
  await stopServer(server); server = null;
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.ok(checkpoint.state.scenarioEventStates.every((event) => !event.fired));
  server = await startServer(port, customMapDirectory, checkpointPath);
  azure = createClient(port, azureWelcome.player.sessionToken); ember = createClient(port, emberWelcome.player.sessionToken);
  clients.push(azure, ember); await Promise.all([azure.opened, ember.opened]);
  await Promise.all([azure.waitForMessage((m) => m.type === 'welcome'), ember.waitForMessage((m) => m.type === 'welcome')]);
  const delivered = await Promise.all([azure, ember].map((client) => client.waitForState((state) => state.mapId === map.id
    && state.scenarioEvents.every((event) => event.fired))));
  assert.deepEqual(delivered[0].food, [11, 11]);
  for (const client of [azure, ember]) assert.equal(client.messages.filter((m) => m.type === 'scenarioEvent').length, 2);
  stage = 'reset rearms region events';
  send(azure, { type: 'reset' });
  await azure.waitForState((state) => state.mapId === map.id && state.scenarioEvents.every((event) => !event.fired));
  send(azure, { type: 'move', ids: [0], x: -3, z: 0 });
  send(ember, { type: 'move', ids: [4], x: 3, z: 0 });
  const replayed = await azure.waitForState((state) => state.mapId === map.id && state.scenarioEvents.every((event) => event.fired));
  assert.deepEqual(replayed.food, [11, 11]);
  stage = 'reject missing region without replacing active map';
  const notice = azure.waitForMessage((m) => m.type === 'mapRejected' && /invalid timed supply event/i.test(m.message));
  send(azure, { type: 'publishMap', map: { ...map, id: 'invalid-regions', regions: [] } });
  await notice;
  console.log(JSON.stringify({ scenario: 'region events', result: 'pass', checks: ['both teams', 'import/export schema', 'pending checkpoint recovery', 'rematch rearming', 'invalid references'] }));
} catch (error) { throw new Error(`${stage}: ${error.message}`, { cause: error }); }
finally { await Promise.all(clients.map(closeClient)); await stopServer(server); await rm(tempRoot, { recursive: true, force: true }); }
