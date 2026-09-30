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
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rts-stationary-'));
const checkpointPath = path.join(dataDirectory, 'match.json');
const customMapDirectory = path.join(dataDirectory, 'custom-maps');
let child;
let clients = [];
let stage = 'startup';
try {
  child = await startServer(port, checkpointPath, customMapDirectory);
  let azure = await connectClient(port);
  let ember = await connectClient(port);
  clients = [azure, ember];
  const tokens = clients.map(client => client.welcome.player.sessionToken);
  const old = unitById(azure.state.latest, 0)[8];
  send(azure, { type: 'selectArmySize', count: 250 });
  await azure.waitForState(state => unitById(state, 0)?.[8] !== old);
  await ember.waitForState(state => state.armySize === 250);
  for (const [client, id] of [[azure, 0], [ember, 125]]) {
    const generation = unitById(client.state.latest, id)[8];
    const move = waitForNotice(client, 'MOVE ORDER ·', 1);
    formationMoveCommand(client, [id], [generation], { x: 0, z: 10 }, { token: 1 });
    await move;
    const queued = waitForNotice(client, 'WAYPOINT QUEUED ·', 2);
    formationMoveCommand(client, [id], [generation], { x: 0, z: -10 }, { token: 2, queue: true });
    await queued;
    const hold = waitForNotice(client, 'HOLD POSITION ORDER ·', 3);
    send(client, { type: 'holdPosition', ids: [id], unitGenerations: [generation], clientOrderToken: 3 });
    await hold;
  }
  stage = 'both-seat interruption and persisted hold';
  let checkpoint = await waitForCheckpoint(checkpointPath, checkpoint => [0, 125].every(id => {
    const unit = checkpoint.state.units[id];
    return unit.holdingPosition && !unit.movePlanningPending && !unit.path.length && !unit.queuedWaypoints.length;
  }));
  const positions = [0, 125].map(id => [checkpoint.state.units[id].x, checkpoint.state.units[id].z]);
  const later = await waitForCheckpoint(checkpointPath, next => next.state.tickNumber > checkpoint.state.tickNumber + 12);
  for (const [index, id] of [0, 125].entries()) {
    const unit = later.state.units[id];
    assert.equal(unit.x, positions[index][0]);
    assert.equal(unit.z, positions[index][1]);
  }
  // A seat cannot stop another seat's held unit, and stale generations cannot
  // mutate replacement units. The server must explicitly reject both.
  for (const command of [
    { ids: [125], unitGenerations: [unitById(ember.state.latest, 125)[8]] },
    { ids: [0], unitGenerations: [old] },
  ]) {
    const rejected = waitForNotice(azure, 'STOP REJECTED ·', 4);
    send(azure, { type: 'stop', ...command, clientOrderToken: 4 });
    await rejected;
  }
  stage = 'recovery retains holding and resumes valid replacement orders';
  await stopServer(child); child = null;
  await Promise.all(clients.map(closeClient)); clients = [];
  child = await startServer(port, checkpointPath, customMapDirectory);
  azure = await connectClient(port, tokens[0]); ember = await connectClient(port, tokens[1]);
  clients = [azure, ember];
  assert.equal(azure.welcome.player.team, 0); assert.equal(ember.welcome.player.team, 1);
  checkpoint = await waitForCheckpoint(checkpointPath, checkpoint => [0, 125].every(id => checkpoint.state.units[id].holdingPosition));
  for (const [client, id] of [[azure, 0], [ember, 125]]) {
    const stopped = waitForNotice(client, 'STOP ORDER ·', 5);
    send(client, { type: 'stop', ids: [id], clientOrderToken: 5 }); await stopped;
  }
  await waitForCheckpoint(checkpointPath, checkpoint => [0, 125].every(id => !checkpoint.state.units[id].holdingPosition));
  const generation = unitById(azure.state.latest, 0)[8];
  const hold = waitForNotice(azure, 'HOLD POSITION ORDER ·', 6);
  send(azure, { type: 'holdPosition', ids: [0], clientOrderToken: 6 }); await hold;
  const moved = waitForNotice(azure, 'MOVE ORDER ·', 7);
  formationMoveCommand(azure, [0], [generation], { x: 0, z: 0 }, { token: 7 }); await moved;
  await waitForCheckpoint(checkpointPath, checkpoint => !checkpoint.state.units[0].holdingPosition && checkpoint.state.units[0].moveGoalCell >= 0);
  stage = 'both-seat worker task interruption';
  for (const [client, id, nodeId] of [[azure, 1, 'azure-berries'], [ember, 126, 'ember-berries']]) {
    const gathered = waitForNotice(client, 'GATHER ORDER ·', 8);
    send(client, { type: 'gather', ids: [id], nodeId, clientOrderToken: 8 }); await gathered;
    await waitForCheckpoint(checkpointPath, checkpoint => checkpoint.state.units[id].gatherNodeId === nodeId);
    const held = waitForNotice(client, 'HOLD POSITION ORDER ·', 9);
    send(client, { type: 'holdPosition', ids: [id], clientOrderToken: 9 }); await held;
    await waitForCheckpoint(checkpointPath, checkpoint => {
      const unit = checkpoint.state.units[id];
      return unit.holdingPosition && unit.gatherNodeId === null && unit.gatherForestCell === -1 && unit.gatherPhase === '';
    });
  }
  stage = 'immediate large-group planner supersession';
  for (const [team, client] of clients.entries()) {
    const owned = client.state.latest.units.filter(row => row[1] === team && row[4] > 0);
    const ids = owned.map(row => row[0]);
    formationMoveCommand(client, ids, owned.map(row => row[8]), { x: 0, z: -20 }, { token: 10 });
    const stopped = waitForNotice(client, 'STOP ORDER ·', 11);
    send(client, { type: 'stop', ids, clientOrderToken: 11 }); await stopped;
  }
  await waitForCheckpoint(checkpointPath, checkpoint => checkpoint.state.units.every(unit => !unit.movePlanningPending && !unit.path.length && !unit.queuedWaypoints.length));
  stage = 'rematch resets stance';
  send(azure, { type: 'reset' });
  await azure.waitForState(state => unitById(state, 0)?.[8] !== generation);
  await waitForCheckpoint(checkpointPath, checkpoint => checkpoint.state.units[0].generation !== generation && checkpoint.state.units.every(unit => !unit.holdingPosition));
  stage = 'seeded full-range siege and melee hold combat';
  await stopServer(child); child = null;
  await Promise.all(clients.map(closeClient)); clients = [];
  checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  for (const [id, x, z, kind, hp, holdingPosition] of [
    [4, 0, 10, 'siege-engine', 90, true], [129, 6, 10, 'infantry', 100, false],
    [5, 0, 20, 'infantry', 100, true], [130, 1, 20, 'infantry', 100, false],
  ]) {
    const unit = checkpoint.state.units[id];
    Object.assign(unit, { x, z, kind, hp, holdingPosition, attackCooldown: 0 });
  }
  await writeFile(checkpointPath, JSON.stringify(checkpoint));
  child = await startServer(port, checkpointPath, customMapDirectory);
  azure = await connectClient(port, tokens[0]); ember = await connectClient(port, tokens[1]); clients = [azure, ember];
  const fired = await waitForCheckpoint(checkpointPath, checkpoint => checkpoint.state.units[129].hp < 100 && checkpoint.state.units[130].hp < 100);
  assert.equal(fired.state.units[4].x, 0); assert.equal(fired.state.units[4].z, 10);
  assert.equal(fired.state.units[5].x, 0); assert.equal(fired.state.units[5].z, 20);
  for (const [id, z] of [[129, 10], [130, 20]]) {
    const retreat = waitForNotice(ember, 'MOVE ORDER ·', id);
    send(ember, { type: 'move', ids: [id], x: 20, z, clientOrderToken: id }); await retreat;
  }
  const escaped = await waitForCheckpoint(checkpointPath, checkpoint => checkpoint.state.units[129].x > 10 && checkpoint.state.units[130].x > 10);
  assert.equal(escaped.state.units[4].x, 0); assert.equal(escaped.state.units[4].z, 10);
  assert.equal(escaped.state.units[5].x, 0); assert.equal(escaped.state.units[5].z, 20);
  const quiet = await waitForCheckpoint(checkpointPath, next => next.state.tickNumber > escaped.state.tickNumber + 30);
  assert.equal(quiet.state.units[129].hp, escaped.state.units[129].hp);
  assert.equal(quiet.state.units[130].hp, escaped.state.units[130].hp);
  console.log(JSON.stringify({ bothSeats: true, workerInterruption: true, immediatePlannerSupersession: true, fullWeaponRangeHold: true, noPursuit: true, interruptedQueueAndPlanning: true, heldPositionsStable: true, authorityAndGenerationRejections: true, recoveredHold: true, replacingOrdersClearHold: true, rematchClearsHold: true }));
} catch (error) {
  console.error(error); console.error(JSON.stringify({ stage, serverLogs })); process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(closeClient));
  await stopServer(child);
  await rm(dataDirectory, { recursive: true, force: true });
}
