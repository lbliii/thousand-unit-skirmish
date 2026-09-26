import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildElevationGrid } from '../src/map-utils.mjs';
import {
  BASE_ELEVATION_PATH_COST, canTraverseElevation, elevationPathCost,
} from '../src/elevation.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TIMEOUT_MS = 20_000;

async function freePort() {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function createClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const stateWaiters = [];
  const messageWaiters = [];
  let latestState = null;
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    if (message.type === 'welcome' || message.type === 'mapChange') latestState = message.state;
    else if (message.type === 'state') latestState = message;
    if (latestState) {
      for (let index = stateWaiters.length - 1; index >= 0; index--) {
        const waiter = stateWaiters[index];
        if (!waiter.predicate(latestState)) continue;
        stateWaiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(latestState);
      }
    }
    for (let index = messageWaiters.length - 1; index >= 0; index--) {
      const waiter = messageWaiters[index];
      if (!waiter.predicate(message)) continue;
      messageWaiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  function waitForMessage(predicate, timeoutMs = TIMEOUT_MS) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        messageWaiters.splice(messageWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for the expected server message.'));
      }, timeoutMs) };
      messageWaiters.push(waiter);
    });
  }
  function waitForState(predicate, timeoutMs = TIMEOUT_MS) {
    if (latestState && predicate(latestState)) return Promise.resolve(latestState);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for an authoritative state.'));
      }, timeoutMs) };
      stateWaiters.push(waiter);
    });
  }
  return { socket, waitForMessage, waitForState, get latestState() { return latestState; } };
}

function send(client, message) {
  assert.equal(client.socket.readyState, WebSocket.OPEN, 'scenario client socket should be open');
  client.socket.send(JSON.stringify(message));
}

async function waitForHealth(child, port, output) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${output()}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server health check timed out: ${output()}`);
}

async function checkpointWith(checkpointPath, predicate) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const snapshot = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (predicate(snapshot)) return snapshot;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('Timed out waiting for the expected match checkpoint.');
}

async function closeClient(client) {
  if (client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000);
    client.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
    client.socket.close(1000, 'elevation scenario complete');
  });
}

async function closeServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit').catch(() => {});
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function elevationMap(id, values = {}) {
  return {
    id,
    name: `ELEVATION ${id.toUpperCase()}`,
    width: 64,
    height: 64,
    terrainSeed: 2026,
    startingArmySize: 8,
    fogOfWar: false,
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [],
    resourceNodes: [],
    triggers: [],
    scenarioEvents: [],
    ...values,
  };
}

async function publishMap(host, clients, map) {
  const published = host.waitForMessage((message) => message.type === 'mapPublished' && message.mapId === map.id);
  const changes = clients.map((client) => client.waitForMessage((message) => (
    message.type === 'mapChange' && message.map?.id === map.id
  )));
  send(host, { type: 'publishMap', map });
  const [ack, ...mapChanges] = await Promise.all([published, ...changes]);
  assert.equal(ack.mapId, map.id);
  for (const change of mapChanges) {
    assert.deepEqual(change.map.elevationPatches, map.elevationPatches,
      'map changes should carry the authored elevation patches');
  }
  return Promise.all(clients.map((client) => client.waitForState((state) => (
    state.mapId === map.id && state.armySize === map.startingArmySize
  ))));
}

function snapshotUnit(snapshot, id) {
  return snapshot.state.units.find((unit) => unit.id === id);
}

function cellForWorld(x, z, width, height) {
  return Math.floor(z + height / 2) * width + Math.floor(x + width / 2);
}

function cellRow(cell, width) {
  return Math.floor(cell / width);
}

function verifyPath(snapshot, map, unitId, startCell) {
  const unit = snapshotUnit(snapshot, unitId);
  assert.ok(unit && unit.path.length > 0 && unit.pathIndex < unit.path.length,
    `unit ${unitId} should have a live planned path`);
  const levels = buildElevationGrid(map.width, map.height, map.elevationPatches);
  let previous = startCell;
  let cost = 0;
  for (const cell of unit.path) {
    const row = cellRow(cell, map.width);
    const column = cell % map.width;
    const previousRow = cellRow(previous, map.width);
    const previousColumn = previous % map.width;
    assert.equal(Math.abs(row - previousRow) + Math.abs(column - previousColumn), 1,
      'planned routes should contain only adjacent cells');
    assert.ok(canTraverseElevation(levels, previous, cell),
      'planned routes should never cross a two-level cliff');
    cost += elevationPathCost(levels, previous, cell);
    previous = cell;
  }
  return { unit, levels, cost };
}

function visibleAt(state, column, row) {
  const packed = Buffer.from(state.visibility.data, 'base64');
  const cell = row * state.visibility.columns + column;
  return ((packed[cell >> 2] >> ((cell & 3) * 2)) & 3) === 2;
}

function horizontalPathCost(levels, startCell, goalCell, width) {
  assert.equal(cellRow(startCell, width), cellRow(goalCell, width),
    'the direct comparison route should be horizontal');
  const row = cellRow(startCell, width);
  const startColumn = startCell % width;
  const goalColumn = goalCell % width;
  const step = Math.sign(goalColumn - startColumn);
  let cost = 0;
  for (let column = startColumn + step; column !== goalColumn + step; column += step) {
    const from = row * width + column - step;
    const to = row * width + column;
    cost += elevationPathCost(levels, from, to);
  }
  return cost;
}

const port = await freePort();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-elevation-scenario-'));
const checkpointPath = path.join(tempRoot, 'match.json');
const server = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    RTS_HOST: '127.0.0.1',
    RTS_MAP: 'maps/open-field.json',
    RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(tempRoot, 'custom-maps'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
const clients = [];

try {
  await waitForHealth(server, port, () => serverOutput);
  const azure = createClient(port);
  const ember = createClient(port);
  clients.push(azure, ember);
  const [azureWelcome, emberWelcome] = await Promise.all([
    azure.waitForMessage((message) => message.type === 'welcome'),
    ember.waitForMessage((message) => message.type === 'welcome'),
  ]);
  assert.equal(azureWelcome.player.team, 0);
  assert.equal(emberWelcome.player.team, 1);

  const ridgePatches = Array.from({ length: 29 }, (_, index) => ({
    column: 4 + index * 2, row: 29, width: 1, height: 5, level: 1,
  }));
  const weightedMap = elevationMap('elevation-weighted-path', {
    spawnPoints: [{ team: 0, x: -29, z: -0.5 }, { team: 1, x: 29, z: -0.5 }],
    elevationPatches: ridgePatches,
  });
  await publishMap(azure, clients, weightedMap);
  const initialUnit = azure.latestState.units.find((unit) => unit[0] === 0);
  const flowUnit = azure.latestState.units.find((unit) => unit[0] === 1);
  const flowTarget = azure.latestState.units.find((unit) => unit[0] === 4);
  const mirrorUnit = ember.latestState.units.find((unit) => unit[0] === 5);
  assert.ok(initialUnit);
  assert.ok(flowUnit && flowTarget && mirrorUnit);
  const weightedStartCell = cellForWorld(initialUnit[2], initialUnit[3], 64, 64);
  const flowStartCell = cellForWorld(flowUnit[2], flowUnit[3], 64, 64);
  const mirrorStartCell = cellForWorld(mirrorUnit[2], mirrorUnit[3], 64, 64);
  const flowOrderAck = azure.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 10 && message.message === 'ATTACK ORDER · 1 UNITS');
  send(azure, {
    type: 'attack', ids: [flowUnit[0]], unitGenerations: [flowUnit[8]],
    targetId: flowTarget[0], targetGeneration: flowTarget[8], clientOrderToken: 10,
  });
  await flowOrderAck;
  const flowCheckpoint = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[flowUnit[0]];
    return snapshot.mapDefinition?.id === weightedMap.id && unit?.path?.length > 0
      && unit.pathIndex < unit.path.length;
  });
  const flowPath = verifyPath(flowCheckpoint, weightedMap, flowUnit[0], flowStartCell);
  assert.ok(flowPath.unit.path.some((cell) => cellRow(cell, 64) === 28),
    'reverse weighted attack flow should route around repeated uphill ridges too');

  const orderAck = azure.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 1 && message.message === 'MOVE ORDER · 1 UNITS');
  send(azure, {
    type: 'move', ids: [initialUnit[0]], unitGenerations: [initialUnit[8]],
    x: 30.5, z: -1.5, clientOrderToken: 1,
  });
  await orderAck;
  const weightedCheckpoint = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[0];
    return snapshot.mapDefinition?.id === weightedMap.id && unit?.path?.length > 0
      && unit.pathIndex < unit.path.length;
  });
  const weighted = verifyPath(weightedCheckpoint, weightedMap, 0, weightedStartCell);
  const weightedGoal = cellForWorld(30.5, -1.5, 64, 64);
  const directCost = horizontalPathCost(weighted.levels, weightedStartCell, weightedGoal, 64);
  assert.ok(weighted.cost < directCost,
    'A* should prefer a slightly longer flat route over repeated uphill climbs');
  assert.ok(weighted.unit.path.some((cell) => cellRow(cell, 64) === 28),
    'the weighted route should take the flat bypass above the repeated ridges');

  const mirrorOrderAck = ember.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 20 && message.message === 'MOVE ORDER · 1 UNITS');
  send(ember, {
    type: 'move', ids: [mirrorUnit[0]], unitGenerations: [mirrorUnit[8]],
    x: -30.5, z: -1.5, clientOrderToken: 20,
  });
  await mirrorOrderAck;
  const mirrorCheckpoint = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[mirrorUnit[0]];
    return snapshot.mapDefinition?.id === weightedMap.id && unit?.path?.length > 0
      && unit.pathIndex < unit.path.length;
  });
  const mirrored = verifyPath(mirrorCheckpoint, weightedMap, mirrorUnit[0], mirrorStartCell);
  const mirrorGoal = cellForWorld(-30.5, -1.5, 64, 64);
  assert.ok(mirrored.cost < horizontalPathCost(mirrored.levels, mirrorStartCell, mirrorGoal, 64),
    'the opposite seat should prefer the same lower-cost flat bypass');
  assert.ok(mirrored.unit.path.some((cell) => cellRow(cell, 64) === 28),
    'mirrored A* should avoid repeated uphill ridges');

  const cliffPatches = [
    { column: 32, row: 0, width: 1, height: 32, level: 2 },
    { column: 32, row: 32, width: 1, height: 1, level: 1 },
    { column: 32, row: 33, width: 1, height: 31, level: 2 },
  ];
  const cliffMap = elevationMap('elevation-cliff-ramp', {
    spawnPoints: [{ team: 0, x: -20, z: -10.5 }, { team: 1, x: 20, z: -10.5 }],
    elevationPatches: cliffPatches,
  });
  await publishMap(azure, clients, cliffMap);
  const cliffUnit = azure.latestState.units.find((unit) => unit[0] === 0);
  const cliffMirror = ember.latestState.units.find((unit) => unit[0] === 4);
  const cliffStartCell = cellForWorld(cliffUnit[2], cliffUnit[3], 64, 64);
  const cliffMirrorStartCell = cellForWorld(cliffMirror[2], cliffMirror[3], 64, 64);
  const cliffOrderAck = azure.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 2 && message.message === 'MOVE ORDER · 1 UNITS');
  send(azure, {
    type: 'move', ids: [0], unitGenerations: [cliffUnit[8]],
    x: 20, z: -10.5, clientOrderToken: 2,
  });
  await cliffOrderAck;
  const cliffCheckpoint = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[0];
    return snapshot.mapDefinition?.id === cliffMap.id && unit?.path?.length > 0
      && unit.pathIndex < unit.path.length;
  });
  const cliff = verifyPath(cliffCheckpoint, cliffMap, 0, cliffStartCell);
  assert.ok(cliff.unit.path.includes(32 * 64 + 32),
    'a cross-map route should cross the cliff only through its one-level ramp');

  const reverseCliffAck = ember.waitForMessage((message) => message.type === 'notice'
    && message.clientOrderToken === 21 && message.message === 'MOVE ORDER · 1 UNITS');
  send(ember, {
    type: 'move', ids: [4], unitGenerations: [cliffMirror[8]],
    x: -20, z: -10.5, clientOrderToken: 21,
  });
  await reverseCliffAck;
  const reverseCliffCheckpoint = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[4];
    return snapshot.mapDefinition?.id === cliffMap.id && unit?.path?.length > 0
      && unit.pathIndex < unit.path.length;
  });
  const reverseCliff = verifyPath(reverseCliffCheckpoint, cliffMap, 4, cliffMirrorStartCell);
  assert.ok(reverseCliff.unit.path.includes(32 * 64 + 32),
    'the opposing seat should also route through the only one-level ramp');

  const visionMap = elevationMap('elevation-sight-trial', {
    fogOfWar: true,
    spawnPoints: [{ team: 0, x: -19.5, z: -20.5 }, { team: 1, x: 19.5, z: 20.5 }],
    elevationPatches: [{ column: 10, row: 9, width: 6, height: 6, level: 1 }],
    resourceNodes: [
      { id: 'high-ground-probe', type: 'wood', x: -9.5, z: -21.5, stock: 100 },
      { id: 'low-ground-near-probe', type: 'wood', x: 10.5, z: 19.5, stock: 100 },
      { id: 'low-ground-far-probe', type: 'wood', x: 9.5, z: 19.5, stock: 100 },
    ],
  });
  const [azureSight, emberSight] = await publishMap(azure, clients, visionMap);
  assert.ok(azureSight.visibility && emberSight.visibility);
  assert.equal(visibleAt(azureSight, 22, 10), true,
    'level-one sources should see the ninth cell on the ground plane');
  assert.equal(visibleAt(emberSight, 41, 51), false,
    'flat sources should keep the base eight-cell sight radius');
  assert.equal(visibleAt(emberSight, 42, 51), true,
    'flat sources should retain visibility within the base radius');
  assert.equal(visibleAt(emberSight, 22, 10), false,
    'elevated vision must remain private to its owning team');
  assert.equal(visibleAt(azureSight, 41, 51), false,
    'elevated vision must not leak to unrelated far map cells');
  assert.ok(azureSight.units.every((unit) => unit.length === 11),
    'elevation should not change positional unit snapshot shapes');

  const checkpoint = await checkpointWith(checkpointPath, (snapshot) => (
    snapshot.mapDefinition?.id === visionMap.id
    && snapshot.mapDefinition.elevationPatches?.length === 1
    && snapshot.state?.currentArmySize === 8
  ));
  assert.equal(checkpoint.rulesVersion, 4,
    'elevation semantics should be recorded in the match rules version');
  assert.deepEqual(checkpoint.mapDefinition.elevationPatches, visionMap.elevationPatches,
    'checkpoint recovery data should preserve the authored elevation grid');

  const beforeReset = azureSight.units.map((unit) => [unit[0], unit[1], unit[2], unit[3]]);
  const oldGenerations = azureSight.units.map((unit) => unit[8]);
  send(azure, { type: 'reset', clientOrderToken: 3 });
  const afterReset = await azure.waitForState((state) => state.mapId === visionMap.id
    && state.units.length === oldGenerations.length
    && state.units.some((unit, index) => unit[8] !== oldGenerations[index]));
  assert.deepEqual(afterReset.units.map((unit) => [unit[0], unit[1], unit[2], unit[3]]), beforeReset,
    'rematch reset should reproduce the same spawn positions on the authored elevation map');
  const resetCheckpoint = await checkpointWith(checkpointPath, (snapshot) => (
    snapshot.mapDefinition?.id === visionMap.id
    && snapshot.mapDefinition.elevationPatches?.length === 1
    && snapshot.state.units[0]?.generation !== oldGenerations[0]
  ));
  assert.deepEqual(resetCheckpoint.mapDefinition.elevationPatches, visionMap.elevationPatches);

  console.log('Elevation scenario passed for both seats: weighted A*/attack flow, cliff/ramp traversal, high-ground sight, fog privacy, and deterministic rematch state.');
} catch (error) {
  console.error(`${error.stack || error}\nServer output:\n${serverOutput}`);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(closeClient));
  await closeServer(server);
  await rm(tempRoot, { recursive: true, force: true });
}
