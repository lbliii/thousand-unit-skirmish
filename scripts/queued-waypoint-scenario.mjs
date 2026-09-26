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

function cellFor(point) {
  const column = Math.floor(point.x + 32);
  const row = Math.floor(point.z + 32);
  return row * 64 + column;
}

function cellCenter(point) {
  const column = Math.floor(point.x + 32);
  const row = Math.floor(point.z + 32);
  return { x: column - 31.5, z: row - 31.5 };
}

function moveCommand(client, point, { type = 'move', queue = false, token }) {
  const unit = unitById(client.state.latest, 0);
  send(client, {
    type, ids: [0], unitGenerations: [unit[8]], x: point.x, z: point.z,
    formation: 'box', ...(queue ? { queue: true } : {}), clientOrderToken: token,
  });
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
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rts-waypoint-'));
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
  stage = 'initial connection state';
  assert.equal(azure.welcome.player.team, 0);
  assert.equal(ember.welcome.player.team, 1);
  const previousGeneration = unitById(azure.state.latest, 0)?.[8];
  send(azure, { type: 'selectArmySize', count: 250 });
  // Existing welcome snapshots already contain these IDs. Wait for the reset
  // before sending an order with the unit's replacement generation.
  await azure.waitForState((state) => state.armySize === 250
    && unitById(state, 0)?.[8] !== previousGeneration && unitById(state, 0)?.[1] === 0, 5_000);
  await ember.waitForState((state) => state.armySize === 250
    && unitById(state, 125)?.[1] === 1, 5_000);
  const azureToken = azure.welcome.player.sessionToken;
  const emberToken = ember.welcome.player.sessionToken;

  const firstPoint = { x: -8, z: 9 };
  const secondPoint = { x: -4, z: 9 };
  const firstOrder = waitForNotice(azure, 'MOVE ORDER ·', 1);
  moveCommand(azure, firstPoint, { token: 1 });
  await firstOrder;
  const queuedOrder = waitForNotice(azure, 'WAYPOINT QUEUED ·', 2);
  moveCommand(azure, secondPoint, { type: 'attackMove', queue: true, token: 2 });
  await queuedOrder;
  const queueSnapshot = await azure.waitForState((state) => (
    state.queuedWaypointCounts?.some(([id, count]) => id === 0 && count === 1)
  ));
  await ember.waitForState((state) => state.tick >= queueSnapshot.tick);
  assert.equal(ember.state.latest.queuedWaypointCounts?.some(([id]) => id === 0), false,
    'fog-of-war snapshots should not disclose the other team’s queued route counts');

  stage = 'checkpoint with queued attack-move waypoint';
  const queuedCheckpoint = await waitForCheckpoint(checkpointPath, (checkpoint) => {
    const unit = checkpoint.state?.units?.[0];
    return unit?.queuedWaypoints?.length === 1
      && unit.queuedWaypoints[0].attackMove === true
      && unit.queuedWaypoints[0].destination === cellFor(secondPoint)
      && unit.moveGoalCell !== unit.queuedWaypoints[0].destination;
  });
  const queuedUnit = queuedCheckpoint.state.units[0];
  assert.ok(queuedUnit.path.length > queuedUnit.pathIndex, 'the first move should still be in progress at checkpoint time');

  // Model a crash checkpoint captured during attack-move route repair, after a
  // target was acquired but before the transient planner applied the new path.
  const pendingAttackMoveCheckpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const pendingAttackMoveUnit = pendingAttackMoveCheckpoint.state.units[0];
  pendingAttackMoveUnit.attackMove = true;
  pendingAttackMoveUnit.attackMoveRouteReady = true;
  pendingAttackMoveUnit.movePlanningPending = true;
  pendingAttackMoveUnit.attackTargetId = 125;
  pendingAttackMoveUnit.attackMoveResumePath = [];
  pendingAttackMoveUnit.attackMoveResumePathIndex = 0;
  pendingAttackMoveUnit.path = [];
  pendingAttackMoveUnit.pathIndex = 0;
  await writeFile(checkpointPath, JSON.stringify(pendingAttackMoveCheckpoint));

  await killServer(child);
  child = null;
  await Promise.allSettled(clients.map(closeClient));
  clients = [];

  stage = 'checkpoint recovery and seat reclaim';
  child = await startServer(port, checkpointPath, customMapDirectory);
  azure = await connectClient(port, azureToken);
  ember = await connectClient(port, emberToken);
  clients = [azure, ember];
  assert.equal(azure.welcome.player.team, 0, 'Azure should reclaim its seat after worker recovery');
  assert.equal(ember.welcome.player.team, 1, 'Ember should reclaim its seat after worker recovery');
  const finalPoint = cellCenter(secondPoint);
  stage = 'recovered route arrival at queued attack-move waypoint';
  const arrived = await azure.waitForState((state) => {
    const unit = unitById(state, 0);
    return unit && Math.hypot(unit[2] - finalPoint.x, unit[3] - finalPoint.z) < 1.1;
  });
  assert.ok(arrived.tick > queuedCheckpoint.state.tickNumber, 'the recovered route should continue making progress');

  stage = 'schema-2 checkpoint migration';
  await waitForCheckpoint(checkpointPath, (checkpoint) => {
    const unit = checkpoint.state?.units?.[0];
    return unit?.queuedWaypoints?.length === 0 && unit.moveGoalCell === cellFor(secondPoint);
  });
  await killServer(child);
  child = null;
  await Promise.allSettled(clients.map(closeClient));
  clients = [];
  const schemaTwoCheckpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  schemaTwoCheckpoint.schemaVersion = 2;
  for (const unit of schemaTwoCheckpoint.state.units) delete unit.queuedWaypoints;
  await writeFile(checkpointPath, JSON.stringify(schemaTwoCheckpoint));
  child = await startServer(port, checkpointPath, customMapDirectory);
  azure = await connectClient(port, azureToken);
  ember = await connectClient(port, emberToken);
  clients = [azure, ember];
  assert.equal(azure.welcome.recoveredFromCheckpoint, true, 'schema-2 checkpoints should migrate without resetting the match');
  assert.equal(azure.welcome.player.team, 0);
  assert.equal(ember.welcome.player.team, 1);

  const replacementFirst = { x: -14, z: 14 };
  const replacementFinal = { x: -12, z: -10 };
  stage = 'plain move replacing the queued route';
  const replaceOrder = waitForNotice(azure, 'MOVE ORDER ·', 3);
  moveCommand(azure, replacementFirst, { token: 3 });
  await replaceOrder;
  const replacedQueue = waitForNotice(azure, 'WAYPOINT QUEUED ·', 4);
  moveCommand(azure, { x: 8, z: 15 }, { queue: true, token: 4 });
  await replacedQueue;
  const replacementAck = waitForNotice(azure, 'MOVE ORDER ·', 5);
  moveCommand(azure, replacementFinal, { token: 5 });
  await replacementAck;
  const replacedCheckpoint = await waitForCheckpoint(checkpointPath, (checkpoint) => (
    checkpoint.state?.units?.[0]?.queuedWaypoints?.length === 0
      && checkpoint.state.units[0].moveGoalCell === cellFor(replacementFinal)
  ));
  const replacementCellCenter = cellCenter(replacementFinal);
  await azure.waitForState((state) => {
    const unit = unitById(state, 0);
    return unit && Math.hypot(unit[2] - replacementCellCenter.x, unit[3] - replacementCellCenter.z) < 1.1;
  });

  const longPoint = { x: -2, z: -20 };
  stage = 'eight-waypoint queue limit';
  const longOrder = waitForNotice(azure, 'MOVE ORDER ·', 6);
  moveCommand(azure, longPoint, { token: 6 });
  await longOrder;
  for (let index = 0; index < 8; index++) {
    const ack = waitForNotice(azure, 'WAYPOINT QUEUED ·', 7 + index);
    moveCommand(azure, { x: index - 4, z: -20 }, { queue: true, token: 7 + index });
    await ack;
  }
  const overflow = waitForNotice(azure, 'WAYPOINT REJECTED · QUEUE LIMIT 8', 15);
  moveCommand(azure, { x: 7, z: -20 }, { queue: true, token: 15 });
  await overflow;
  const cappedCheckpoint = await waitForCheckpoint(checkpointPath, (checkpoint) => (
    checkpoint.state?.units?.[0]?.queuedWaypoints?.length === 8
  ));

  stage = 'waypoint after direct attack';
  const attackGroup = azure.state.latest.units
    .filter((row) => row[1] === 0 && row[4] > 0 && row[0] >= 4 && row[0] < 20);
  const attackIds = attackGroup.map((row) => row[0]);
  const attackGenerations = attackGroup.map((row) => row[8]);
  assert.equal(attackIds.length, 16);
  const approachAck = waitForNotice(azure, 'MOVE ORDER · 16 UNITS', 16);
  formationMoveCommand(azure, attackIds, attackGenerations, { x: 12, z: 0 }, { token: 16 });
  await approachAck;
  const visibleEnemyState = await azure.waitForState((state) => (
    state.units.some((row) => row[1] === 1 && row[4] > 0)
  ), 20_000);
  const attackers = attackIds
    .map((id) => unitById(visibleEnemyState, id))
    .filter((row) => row && row[4] > 0);
  const attackersCenter = attackers.reduce((center, row) => ({
    x: center.x + row[2] / attackers.length,
    z: center.z + row[3] / attackers.length,
  }), { x: 0, z: 0 });
  const target = visibleEnemyState.units
    .filter((row) => row[1] === 1 && row[4] > 0)
    .sort((left, right) => (
      Math.hypot(left[2] - attackersCenter.x, left[3] - attackersCenter.z)
      - Math.hypot(right[2] - attackersCenter.x, right[3] - attackersCenter.z)
    ))[0];
  assert.ok(target, 'at least one enemy should be visible before ordering a direct attack');
  const attackStartTick = azure.state.latest.tick;
  const attackAck = waitForNotice(azure, 'ATTACK ORDER · 16 UNITS', 17);
  send(azure, {
    type: 'attack', ids: attackIds, unitGenerations: attackGenerations,
    targetId: target[0], targetGeneration: target[8], clientOrderToken: 17,
  });
  await attackAck;
  const focusedAzure = await azure.waitForState((state) => state.tick > attackStartTick
    && unitById(state, target[0])?.[10] === attackIds.length, 20_000);
  const focusedEmber = await ember.waitForState((state) => state.tick > attackStartTick
    && unitById(state, target[0])?.[10] === 0, 20_000);
  assert.equal(unitById(focusedAzure, target[0])?.[10], attackIds.length,
    'the attacker should see the number of friendly units focusing its target');
  assert.equal(unitById(focusedEmber, target[0])?.[10], 0,
    'fog should hide the opposing focus order from the defender');
  const attackWaypoint = { x: 14, z: 9 };
  const attackWaypointAck = waitForNotice(azure, 'WAYPOINT QUEUED · 16 UNITS', 18);
  formationMoveCommand(azure, attackIds, attackGenerations, attackWaypoint, { queue: true, token: 18 });
  await attackWaypointAck;
  const attackCompletedCheckpoint = await waitForCheckpoint(checkpointPath, (checkpoint) => {
    const deadTarget = checkpoint.state?.units?.[target[0]];
    if (!deadTarget || deadTarget.hp > 0) return false;
    const waypointCell = cellFor(attackWaypoint);
    const waypointColumn = waypointCell % 64;
    const waypointRow = Math.floor(waypointCell / 64);
    return attackIds.some((id) => {
      const unit = checkpoint.state.units[id];
      if (!unit || unit.hp <= 0 || unit.attackTargetId >= 0 || unit.queuedWaypoints.length > 0) return false;
      const goalColumn = unit.moveGoalCell % 64;
      const goalRow = Math.floor(unit.moveGoalCell / 64);
      return Math.hypot(goalColumn - waypointColumn, goalRow - waypointRow) <= 6;
    });
  }, 25_000);
  const attackWaypointReached = await azure.waitForState((state) => attackIds.some((id) => {
    const row = unitById(state, id);
    return row && row[4] > 0 && Math.hypot(row[2] - attackWaypoint.x, row[3] - attackWaypoint.z) < 5;
  }), 20_000);
  assert.ok(attackCompletedCheckpoint && attackWaypointReached,
    'attack completion should release at least one living unit toward its queued destination');

  stage = '1000-unit route and queued waypoint';
  send(azure, { type: 'selectArmySize', count: 2000 });
  await azure.waitForState((state) => state.armySize === 2000
    && state.units.filter((row) => row[1] === 0 && row[4] > 0).length === 1000);
  const azureRows = azure.state.latest.units.filter((row) => row[1] === 0 && row[4] > 0);
  const groupIds = azureRows.map((row) => row[0]);
  const generations = azureRows.map((row) => row[8]);
  const largeArmyStartedAt = Date.now();
  const largeArmyMove = waitForNotice(azure, 'MOVE ORDER · 1000 UNITS', 19);
  const largeArmyQueue = waitForNotice(azure, 'WAYPOINT QUEUED · 1000 UNITS', 20);
  formationMoveCommand(azure, groupIds, generations, { x: -6, z: 14 }, { token: 19 });
  formationMoveCommand(azure, groupIds, generations, { x: 5, z: 14 }, { type: 'attackMove', queue: true, token: 20 });
  await largeArmyQueue;
  await largeArmyMove;
  const largeArmyAcknowledgementMs = Date.now() - largeArmyStartedAt;

  await Promise.allSettled(clients.map(closeClient));
  clients = [];
  await stopServer(child);
  child = null;
  stage = 'team-private queued route counts without fog';
  const noFogCheckpointPath = path.join(dataDirectory, 'no-fog-match.json');
  child = await startServer(port, noFogCheckpointPath, customMapDirectory, 'maps/stone-pass.json');
  azure = await connectClient(port);
  ember = await connectClient(port);
  clients = [azure, ember];
  const noFogFirstMove = waitForNotice(azure, 'MOVE ORDER ·', 1);
  moveCommand(azure, { x: -8, z: 10 }, { token: 1 });
  await noFogFirstMove;
  const noFogQueueAck = waitForNotice(azure, 'WAYPOINT QUEUED ·', 2);
  moveCommand(azure, { x: -4, z: 10 }, { queue: true, token: 2 });
  await noFogQueueAck;
  await azure.waitForMessage((message) => message.type === 'waypointQueueCounts'
    && message.rows?.some(([id, count]) => id === 0 && count === 1));
  await ember.waitForState((state) => state.tick > ember.welcome.state.tick);
  assert.ok(!ember.state.latest.queuedWaypointCounts?.some(([id]) => id === 0),
    'non-fog state broadcasts should not carry the other team’s queue counts');
  assert.equal(ember.messages.some((message) => message.type === 'waypointQueueCounts'), false,
    'non-fog route-count events should only reach the owning team');

  console.log(JSON.stringify({
    workload: 'two-client queued movement and checkpoint recovery',
    recoveredWaypoint: { ...finalPoint, attackMove: true },
    recoveryTick: arrived.tick,
    pendingAttackMoveRouteRecovered: true,
    schemaTwoCheckpointMigrated: true,
    fogOfWarQueueCountsAreTeamPrivate: true,
    replacementClearedQueue: replacedCheckpoint.state.units[0].queuedWaypoints.length === 0,
    perUnitQueueLimit: cappedCheckpoint.state.units[0].queuedWaypoints.length,
    overLimitOrderRejected: true,
    directAttackTargetDefeated: attackCompletedCheckpoint.state.units[target[0]].hp === 0,
    queuedWaypointAfterDirectAttackReached: true,
    unitAttackFocusCountsAreFogPrivate: unitById(focusedAzure, target[0])?.[10] === attackIds.length
      && unitById(focusedEmber, target[0])?.[10] === 0,
    largeArmyQueuedUnits: groupIds.length,
    largeArmyAcknowledgementMs,
    noFogQueueCountsAreTeamPrivate: true,
  }, null, 2));
} catch (error) {
  console.error(error);
  const latest = clients[0]?.state?.latest;
  console.error(JSON.stringify({ stage, serverLogs, state: latest && {
    tick: latest.tick, unitCount: latest.units?.length, firstRows: latest.units?.slice(0, 2),
  } }, null, 2));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map(closeClient));
  await stopServer(child);
  await rm(dataDirectory, { recursive: true, force: true });
}
