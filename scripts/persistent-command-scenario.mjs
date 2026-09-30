import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 10_000;
const SCENARIO_TIMEOUT_MS = 45_000;
let serverLogs = '';

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, checkpointPath, customMapDirectory, mapPath = 'maps/open-field.json') {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_MAP: mapPath,
      RTS_MATCH_STATE_PATH: checkpointPath,
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); serverLogs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); serverLogs += chunk.toString(); });
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

async function killServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) await killServer(child);
}

function createClient(port, resumeToken = null) {
  const protocols = resumeToken ? ['rts-v1', `rts-resume.${resumeToken}`] : ['rts-v1'];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
  const messages = [];
  const state = { latest: null, waiters: [] };
  const messageWaiters = [];
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'state') {
      state.latest = message;
      for (let index = state.waiters.length - 1; index >= 0; index--) {
        const waiter = state.waiters[index];
        if (!waiter.predicate(message)) continue;
        state.waiters.splice(index, 1);
        clearTimeout(waiter.timeout);
        waiter.resolve(message);
      }
    }
    for (let index = messageWaiters.length - 1; index >= 0; index--) {
      const waiter = messageWaiters[index];
      if (!waiter.predicate(message)) continue;
      messageWaiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  const opened = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening a WebSocket.')), READY_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed.')); }, { once: true });
  });
  function waitForMessage(predicate, timeoutMs = READY_TIMEOUT_MS) {
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
    if (state.latest && predicate(state.latest)) return Promise.resolve(state.latest);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        state.waiters.splice(state.waiters.indexOf(waiter), 1);
        reject(new Error(`Timed out waiting for state after tick ${state.latest?.tick ?? 'unknown'}.`));
      }, timeoutMs) };
      state.waiters.push(waiter);
    });
  }
  return { socket, opened, state, messages, waitForMessage, waitForState, welcome: null };
}

async function connectClient(port, resumeToken = null) {
  const client = createClient(port, resumeToken);
  const welcomePromise = client.waitForMessage((message) => message.type === 'welcome');
  await client.opened;
  client.welcome = await welcomePromise;
  client.state.latest = client.welcome.state;
  return client;
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'queued waypoint scenario complete');
  });
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

function waitForNotice(client, prefix, token) {
  return client.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === token && message.message?.startsWith(prefix));
}

function unitById(state, id) {
  return state.units.find((row) => row[0] === id);
}

function formationMoveCommand(client, ids, generations, point, { type = 'move', queue = false, token }) {
  send(client, {
    type, ids, unitGenerations: generations, x: point.x, z: point.z,
    formation: 'box', ...(queue ? { queue: true } : {}), clientOrderToken: token,
  });
}

async function waitForCheckpoint(checkpointPath, predicate, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (predicate(checkpoint)) return checkpoint;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('Timed out waiting for the expected match checkpoint.');
}

const port = await reservePort();
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rts-persistent-'));
const checkpointPath = path.join(dataDirectory, 'match.json');
const customMapDirectory = path.join(dataDirectory, 'custom-maps');
const definition = JSON.parse(await readFile(path.join(ROOT, 'maps/open-field.json'), 'utf8'));
definition.startingResources = { food: 350, wood: 400 };
definition.id = 'persistent-open-field';
definition.startingArmySize = 250;
definition.scenarioEvents = [{ id: 'follow-scout', name: 'Follow Scout', type: 'timed-supply',
  afterSeconds: 3, team: 'both', foodReward: 0, unitCount: 1, unitKind: 'scout', message: '{team} SCOUT READY' }];
let child; let clients = []; let stage = 'startup';
try {
  child = await startServer(port, checkpointPath, customMapDirectory);
  let azure = await connectClient(port); let ember = await connectClient(port);
  clients = [azure, ember];
  send(azure, { type: 'publishMap', map: definition });
  const published = await Promise.all(clients.map(client => client.waitForMessage(message => message.type === 'mapChange' && message.map.id === definition.id)));
  clients.forEach((client, index) => { client.state.latest = published[index].state; });
  const tokens = clients.map(client => client.welcome.player.sessionToken);
  const old = unitById(azure.state.latest, 0)[8];
  const guestOld = unitById(ember.state.latest, 129)[8];
  send(azure, { type: 'selectArmySize', count: 250 });
  await azure.waitForState(state => unitById(state, 0)?.[8] !== old);
  await ember.waitForState(state => state.armySize === 250 && unitById(state, 129)?.[8] !== guestOld);
  const ids = [4, 129];
  stage = 'patrol outbound and return';
  const starts = clients.map((client, team) => unitById(client.state.latest, ids[team]));
  for (let team = 0; team < 2; team++) {
    const client = clients[team], id = ids[team], row = starts[team];
    formationMoveCommand(client, [id], [row[8]], { x: row[2] + (team ? -6 : 6), z: row[3] }, { type: 'patrol', token: 1 });
    await waitForNotice(client, 'PATROL ORDER', 1);
  }
  await Promise.all(clients.map((client, team) => client.waitForState(state =>
    Math.abs(unitById(state, ids[team])[2] - starts[team][2]) > 4)));
  await Promise.all(clients.map((client, team) => client.waitForState(state =>
    Math.abs(unitById(state, ids[team])[2] - starts[team][2]) < 1)));
  stage = 'generation-safe friendly follow and interrupts';
  for (let team = 0; team < 2; team++) {
    const client = clients[team], id = ids[team];
    const supplied = await client.waitForState(state => state.units.some(row => row[1] === team && row[5] === 'scout'));
    const target = supplied.units.find(row => row[1] === team && row[5] === 'scout');
    const leader = target[0];
    send(client, { type: 'follow', ids: [id], targetId: leader, targetGeneration: target[8] + 1, clientOrderToken: 2 });
    await waitForNotice(client, 'FOLLOW REJECTED', 2);
    send(client, { type: 'follow', ids: [id], targetId: ids[1-team], targetGeneration: unitById(clients[1-team].state.latest, ids[1-team])[8], clientOrderToken: 3 });
    await waitForNotice(client, 'FOLLOW REJECTED', 3);
    send(client, { type: 'follow', ids: [id], targetId: leader, targetGeneration: target[8], clientOrderToken: 4 });
    await waitForNotice(client, 'FOLLOW ORDER', 4);
    formationMoveCommand(client, [leader], [target[8]], { x: target[2] + (team ? -16 : 16), z: target[3] }, { token: 5 });
    await waitForNotice(client, 'MOVE ORDER', 5);
    await client.waitForState(state => Math.abs(unitById(state, id)[2] - starts[team][2]) > 5);
  }
  const recoveryPatrolIds = ids.map(id => id + 2);
  for (let team = 0; team < 2; team++) {
    const row = unitById(clients[team].state.latest, recoveryPatrolIds[team]);
    formationMoveCommand(clients[team], [row[0]], [row[8]], { x: row[2] + (team ? -6 : 6), z: row[3] + 5 }, { type: 'patrol', token: 40 });
    await waitForNotice(clients[team], 'PATROL ORDER', 40);
  }
  stage = 'checkpoint restart';
  const saved = await waitForCheckpoint(checkpointPath, checkpoint => ids.every(id => checkpoint.state.units[id].persistentOrder?.type === 'follow') && recoveryPatrolIds.every(id => checkpoint.state.units[id].persistentOrder?.type === 'patrol'));
  assert.ok(saved.state.units[ids[0]].persistentOrder.targetGeneration > 0);
  for (const client of clients) await closeClient(client);
  await stopServer(child); child = await startServer(port, checkpointPath, customMapDirectory);
  azure = await connectClient(port, tokens[0]); ember = await connectClient(port, tokens[1]); clients = [azure, ember];
  assert.equal(azure.welcome.recoveredFromCheckpoint, true);
  for (let team = 0; team < 2; team++) {
    assert.ok(clients[team].welcome.state.persistentOrders.some(row => row[0] === ids[team] && row[1] === 'follow'));
    assert.ok(clients[team].welcome.state.persistentOrders.some(row => row[0] === recoveryPatrolIds[team] && row[1] === 'patrol'));
    send(clients[team], { type: 'stop', ids: [recoveryPatrolIds[team]], clientOrderToken: 41 });
    await waitForNotice(clients[team], 'STOP ORDER', 41);
    send(clients[team], { type: 'holdPosition', ids: [ids[team]], clientOrderToken: 6 });
    await waitForNotice(clients[team], 'HOLD POSITION ORDER', 6);
    await clients[team].waitForState(state => !state.persistentOrders.some(row => row[0] === ids[team]));
  }
  stage = 'reset invalidates generation and all intent';
  const generation = unitById(azure.state.latest, ids[0])[8];
  send(azure, { type: 'reset' });
  await azure.waitForState(state => unitById(state, ids[0])?.[8] !== generation);
  await ember.waitForState(state => unitById(state, ids[1])?.[8] !== generation);
  assert.deepEqual(azure.state.latest.persistentOrders, []);
  stage = 'combat acquisition and return to patrol';
  for (let team = 0; team < 2; team++) {
    const client = clients[team], enemyClient = clients[1-team];
    const id = ids[team], victimId = team ? 0 : 125, z = team ? 9.5 : -9.5;
    const row = unitById(client.state.latest, id);
    const victim = unitById(enemyClient.state.latest, victimId);
    formationMoveCommand(client, [id], [row[8]], { x: -3.5, z }, { token: 10 + team });
    formationMoveCommand(enemyClient, [victimId], [victim[8]], { x: 0.5, z }, { token: 12 + team });
    stage = `combat seat ${team}: patroller staging`;
    await client.waitForState(state => Math.hypot(unitById(state, id)[2] + 3.5, unitById(state, id)[3] - z) < 0.5);
    stage = `combat seat ${team}: victim staging`;
    await enemyClient.waitForState(state => Math.hypot(unitById(state, victimId)[2] - 0.5, unitById(state, victimId)[3] - z) < 0.5);
    send(enemyClient, { type: 'holdPosition', ids: [victimId], clientOrderToken: 14 + team });
    await waitForNotice(enemyClient, 'HOLD POSITION ORDER', 14 + team);
    formationMoveCommand(client, [id], [row[8]], { x: 4.5, z }, { type: 'patrol', token: 16 + team });
    await waitForNotice(client, 'PATROL ORDER', 16 + team);
    stage = `combat seat ${team}: wounded leader`;
    await enemyClient.waitForState(state => unitById(state, victimId)?.[4] > 0 && unitById(state, victimId)[4] <= 20);
    const deathFollower = recoveryPatrolIds[1-team];
    send(enemyClient, { type: 'follow', ids: [deathFollower], targetId: victimId, targetGeneration: victim[8], clientOrderToken: 42 + team });
    await waitForNotice(enemyClient, 'FOLLOW ORDER', 42 + team);
    stage = `combat seat ${team}: kill`;
    await enemyClient.waitForState(state => unitById(state, victimId)?.[4] === 0);
    await enemyClient.waitForState(state => !state.persistentOrders.some(row => row[0] === deathFollower));
    stage = `combat seat ${team}: resume outbound`;
    await client.waitForState(state => unitById(state, id)?.[4] > 0 && unitById(state, id)[2] > 3.5);
    stage = `combat seat ${team}: repeated return`;
    await client.waitForState(state => unitById(state, id)?.[2] < -2.5);
    assert.ok(client.state.latest.persistentOrders.some(row => row[0] === id && row[1] === 'patrol'));
    send(client, { type: 'stop', ids: [id], clientOrderToken: 18 + team });
    await waitForNotice(client, 'STOP ORDER', 18 + team);
  }
  stage = 'live construction blocks Patrol endpoint';
  const patrolRow = unitById(azure.state.latest, ids[0]);
  formationMoveCommand(azure, [ids[0]], [patrolRow[8]], { x: -14.5, z: -15.5 }, { token: 30 });
  await azure.waitForState(state => Math.hypot(unitById(state, ids[0])[2] + 14.5, unitById(state, ids[0])[3] + 15.5) < 0.5);
  formationMoveCommand(azure, [ids[0]], [patrolRow[8]], { x: -8.5, z: -15.5 }, { type: 'patrol', token: 31 });
  await waitForNotice(azure, 'PATROL ORDER', 31);
  send(azure, { type: 'build', ids: [1], buildingType: 'barracks', x: -8.5, z: -15.5, clientOrderToken: 32 });
  await waitForNotice(azure, 'BARRACKS PLACED', 32);
  await azure.waitForState(state => state.persistentOrders.some(row => row[0] === ids[0] && row[2] === 'blocked'));
  const blocked = await waitForCheckpoint(checkpointPath, checkpoint => checkpoint.state.units[ids[0]].persistentOrder?.status === 'blocked');
  const construction = blocked.state.buildings.find(building => building.type === 'barracks' && building.team === 0 && !building.complete);
  assert.ok(construction, 'endpoint obstruction is a real unfinished paid building');
  send(azure, { type: 'cancelConstruction', buildingId: construction.id });
  await azure.waitForState(state => !state.buildings.some(building => building.id === construction.id)
    && state.persistentOrders.some(row => row[0] === ids[0] && row[2] === 'active'));
  await azure.waitForState(state => unitById(state, ids[0])[2] > -9.5);
  console.log('Persistent commands passed: both-seat patrol return, friendly generation validation, mixed-speed Scout following, Patrol/Follow restart, leader death, Hold, reset, combat acquisition, resumed patrol and live endpoint obstruction/removal.');
} catch (error) { throw new Error(`${stage}: ${error.message}\n${serverLogs}\n${JSON.stringify(clients.map(client => client.messages.filter(message => message.type === 'notice').slice(-8)))}`, { cause: error }); }
finally { for (const client of clients) await closeClient(client); await stopServer(child); await rm(dataDirectory, { recursive: true, force: true }); }
