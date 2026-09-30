import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resizeWorldMarkers } from '../src/map-resize.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const READY_TIMEOUT_MS = 10_000;

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, customMapDirectory) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      RTS_HOST: '127.0.0.1',
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
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

function createClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  function waitForMessage(predicate) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timeout: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for a server message.'));
      }, READY_TIMEOUT_MS) };
      waiters.push(waiter);
    });
  }
  return { socket, waitForMessage };
}

async function closeClient(client) {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close(1000, 'map persistence scenario complete');
  });
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

const port = await reservePort();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-map-persistence-'));
const customMapDirectory = path.join(tempRoot, 'custom-maps');
  const map = {
  id: 'restart-persistence-check',
  name: 'Restart Persistence Check',
  width: 32,
  height: 32,
  terrainSeed: 27,
  terrainBase: 'snow',
  terrainPatches: ['meadow', 'short-grass', 'long-grass', 'forest-floor', 'dirt', 'sand', 'scree', 'cinder', 'snow', 'ice', 'tidal-mud', 'jungle-loam', 'lunar-soil'].map((material, column) => ({ column, row: 2, width: 1, height: 1, material })),
  fogOfWar: true,
  audio: { packId: 'sample-pack', profileId: 'battle-default' },
  victoryMode: 'all',
  spawnPoints: [{ team: 0, x: -11, z: 0 }, { team: 1, x: 11, z: 0 }],
  obstacles: [{ column: 15, row: 13, width: 2, height: 6, elevation: 1.2, material: 'stone' }],
  resourceNodes: [{ id: 'saved-wood', type: 'wood', x: -7, z: 4, stock: 300 }],
  triggers: [{
    id: 'saved-control-zone', type: 'capture-zone', name: 'Saved Control Zone',
    zone: { column: 7, row: 13, width: 3, height: 3 }, requiredUnits: 1,
    captureSeconds: 1.5, foodReward: 25, woodReward: 35, unitCount: 2, unitKind: 'archer',
    victory: true, message: '{team} HOLDS {objective}',
  }],
  scenarioEvents: [{
    id: 'saved-supply-drop', type: 'timed-supply', name: 'Saved Supply Drop',
    afterSeconds: 45, repeatCount: 3, repeatEverySeconds: 90,
    team: 'both', foodReward: 75, woodReward: 90,
    message: '{event} · +{reward} FOOD · +{wood} WOOD TO {team}',
    }],
  };
  const oldSpawnCells = map.spawnPoints.map((spawn) => ({
    team: spawn.team,
    column: Math.floor(spawn.x + map.width / 2),
    row: Math.floor(spawn.z + map.height / 2),
  }));
  const expandedWidth = 48;
  const expandedHeight = 48;
  const expandedSpawns = resizeWorldMarkers(
    map.spawnPoints, map.width, map.height, expandedWidth, expandedHeight,
  );
  const expandedResources = resizeWorldMarkers(
    map.resourceNodes, map.width, map.height, expandedWidth, expandedHeight,
  );
  const clippedMarkers = resizeWorldMarkers([
    { id: 'inside', x: -10.5, z: -8.5 },
    { id: 'cropped', x: 9.5, z: 10.5 },
  ], 32, 32, 16, 16);
  assert.equal(expandedSpawns.clippedCount, 0);
  assert.equal(expandedResources.clippedCount, 0);
  assert.equal(clippedMarkers.clippedCount, 1,
    'shrinking across a marker should report that it was moved to the nearest edge');
  assert.equal(clippedMarkers.markers[1].x, 7.5);
  assert.equal(clippedMarkers.markers[1].z, 7.5);
  const reducedWidth = 24;
  const reducedHeight = 24;
  const reducedSpawns = resizeWorldMarkers(
    map.spawnPoints, map.width, map.height, reducedWidth, reducedHeight,
  );
  const reducedResources = resizeWorldMarkers(
    map.resourceNodes, map.width, map.height, reducedWidth, reducedHeight,
  );
  assert.equal(reducedSpawns.clippedCount, 1,
    'shrinking across one team spawn should report exactly that marker');
  assert.equal(reducedResources.clippedCount, 0,
    'a resource node still inside the shrunken map should not be reported as cropped');
  const reducedSpawnCells = reducedSpawns.markers.map((spawn) => ({
    team: spawn.team,
    column: Math.floor(spawn.x + reducedWidth / 2),
    row: Math.floor(spawn.z + reducedHeight / 2),
  }));
  assert.deepEqual(reducedSpawnCells, [
    { team: 0, column: 5, row: 16 },
    { team: 1, column: 23, row: 16 },
  ], 'shrinking should preserve retained cells and clamp the cropped spawn to the new edge');
  assert.deepEqual(reducedResources.markers.map((node) => ({
    column: Math.floor(node.x + reducedWidth / 2),
    row: Math.floor(node.z + reducedHeight / 2),
  })), [{ column: 9, row: 20 }], 'retained resource nodes should stay on their old grid cells');

let server = null;
let client = null;
try {
  server = await startServer(port, customMapDirectory);
  client = createClient(port);
  const firstWelcome = await client.waitForMessage((message) => message.type === 'welcome');
  assert.equal(firstWelcome.player.team, 0, 'the first connection should have the host seat');

  const reservedMapRejected = client.waitForMessage((message) => message.type === 'mapRejected');
  send(client, { type: 'publishMap', map: { ...map, id: 'stone-pass' }, persist: true });
  assert.match((await reservedMapRejected).message, /already in the room/,
    'custom maps must not overwrite shipped map IDs');

  const invalidGround = client.waitForMessage((message) => message.type === 'mapRejected' && /base terrain material/.test(message.message));
  send(client, { type: 'publishMap', map: { ...map, terrainBase: 'unknown-ground' } });
  assert.match((await invalidGround).message, /base terrain material/);
  const invalidPatch = client.waitForMessage((message) => message.type === 'mapRejected' && /terrain paint patch/.test(message.message));
  send(client, { type: 'publishMap', map: { ...map, terrainPatches: [{ column: 0, row: 0, width: 1, height: 1, material: 'unknown-ground' }] } });
  assert.match((await invalidPatch).message, /terrain paint patch/);

  const temporaryMap = {
    ...map,
    id: 'temporary-map-check',
    name: 'Temporary Map Check',
    width: expandedWidth,
    height: expandedHeight,
    spawnPoints: expandedSpawns.markers,
    resourceNodes: expandedResources.markers,
  };
  const temporaryNotice = client.waitForMessage((message) => message.type === 'mapPublished'
    && message.mapId === temporaryMap.id);
  const temporaryChange = client.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === temporaryMap.id);
  send(client, { type: 'publishMap', map: temporaryMap });
  const [temporarySaved, temporaryPublished] = await Promise.all([temporaryNotice, temporaryChange]);
  assert.equal(temporarySaved.persisted, false);
  assert.equal(temporaryPublished.map.id, temporaryMap.id);
  assert.deepEqual(temporaryPublished.map.spawnPoints.map((spawn) => ({
    team: spawn.team,
    column: Math.floor(spawn.x + expandedWidth / 2),
    row: Math.floor(spawn.z + expandedHeight / 2),
  })), oldSpawnCells, 'expanding the grid should keep team spawns on their original cells');
  assert.equal(Math.floor(temporaryPublished.map.resourceNodes[0].x + expandedWidth / 2),
    Math.floor(map.resourceNodes[0].x + map.width / 2),
    'expanding the grid should keep resource nodes on their original columns');
  assert.equal(Math.floor(temporaryPublished.map.resourceNodes[0].z + expandedHeight / 2),
    Math.floor(map.resourceNodes[0].z + map.height / 2),
    'expanding the grid should keep resource nodes on their original rows');
  assert.deepEqual(await readdir(customMapDirectory), [], 'session maps should not be written to the saved library');

  const reducedMap = {
    ...map,
    id: 'shrunken-map-check',
    name: 'Shrunken Map Check',
    width: reducedWidth,
    height: reducedHeight,
    spawnPoints: reducedSpawns.markers,
    resourceNodes: reducedResources.markers,
  };
  const reducedNotice = client.waitForMessage((message) => message.type === 'mapPublished'
    && message.mapId === reducedMap.id);
  const reducedChange = client.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === reducedMap.id);
  send(client, { type: 'publishMap', map: reducedMap });
  const [reducedSaved, reducedPublished] = await Promise.all([reducedNotice, reducedChange]);
  assert.equal(reducedSaved.persisted, false);
  assert.equal(reducedPublished.map.width, reducedWidth,
    'the server should validate and accept a map with the resized dimensions');
  assert.deepEqual(reducedPublished.map.spawnPoints.map((spawn) => ({
    team: spawn.team,
    column: Math.floor(spawn.x + reducedWidth / 2),
    row: Math.floor(spawn.z + reducedHeight / 2),
  })), reducedSpawnCells, 'the server should accept the corrected spawn cells after shrinking');
  assert.deepEqual(reducedPublished.map.resourceNodes.map((node) => ({
    column: Math.floor(node.x + reducedWidth / 2),
    row: Math.floor(node.z + reducedHeight / 2),
  })), [{ column: 9, row: 20 }], 'the server should accept the corrected resource cell after shrinking');

  const savedNotice = client.waitForMessage((message) => message.type === 'mapPublished'
    && message.mapId === map.id);
  const firstMapChange = client.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === map.id);
  send(client, { type: 'publishMap', map, persist: true });
  const [saved, published] = await Promise.all([savedNotice, firstMapChange]);
  assert.equal(saved.persisted, true);
  assert.equal(published.map.triggers[0].id, 'saved-control-zone');
  assert.equal(published.map.scenarioEvents[0].id, 'saved-supply-drop');
  assert.equal(published.map.fogOfWar, true);
  assert.deepEqual(published.map.audio, map.audio);
  const savedFile = path.join(customMapDirectory, `${map.id}.json`);
  const savedDefinition = JSON.parse(await readFile(savedFile, 'utf8'));
  assert.equal(savedDefinition.triggers[0].id, 'saved-control-zone');
  assert.deepEqual(savedDefinition.scenarioEvents, map.scenarioEvents);
  assert.equal(savedDefinition.victoryMode, 'all');
  assert.deepEqual(savedDefinition.audio, map.audio);

  await closeClient(client);
  client = null;
  await stopServer(server);
  server = null;

  server = await startServer(port, customMapDirectory);
  client = createClient(port);
  const restartedWelcome = await client.waitForMessage((message) => message.type === 'welcome');
  assert.ok(restartedWelcome.maps.some((entry) => entry.id === map.id),
    'the saved map should return to the catalog after restart');
  assert.equal(restartedWelcome.maps.some((entry) => entry.id === 'temporary-map-check'), false,
    'session-only maps should disappear after restart');
  const restoredMapChange = client.waitForMessage((message) => message.type === 'mapChange'
    && message.map.id === map.id);
  send(client, { type: 'selectMap', mapId: map.id });
  const restored = await restoredMapChange;
  assert.equal(restored.state.mapId, map.id);
  assert.deepEqual(restored.map.triggers, map.triggers);
  assert.deepEqual(restored.map.scenarioEvents, map.scenarioEvents);
  assert.equal(restored.map.resourceNodes[0].id, 'saved-wood');
  assert.equal(restored.map.fogOfWar, true);
  assert.equal(restored.map.victoryMode, 'all');
  assert.deepEqual(restored.map.audio, map.audio);
  assert.equal(restored.map.terrainBase, map.terrainBase);
  assert.deepEqual(restored.map.terrainPatches, map.terrainPatches);

  const libraryFiles = await readdir(customMapDirectory);
  assert.deepEqual(libraryFiles, [`${map.id}.json`]);
  console.log(JSON.stringify({
    passed: ['shipped map IDs reserved', 'map resize preserves marker cells on growth, reports cropped markers on shrink, and passes server validation', 'session-only maps stay temporary', 'thirteen ground materials persist; invalid material names rejected', 'atomic custom map save', 'custom map catalog restored after server restart', 'capture triggers, timed events, map audio references, and map settings restored'],
    mapId: map.id,
    savedCustomMaps: libraryFiles.length,
    restoredTriggers: restored.map.triggers.length,
    restoredScenarioEvents: restored.map.scenarioEvents.length,
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeClient(client).catch(() => {});
  await stopServer(server);
  await rm(tempRoot, { recursive: true, force: true });
}
