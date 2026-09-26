import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A direct attack across disconnected terrain must not replace a valid order.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 12_000;

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const waiters = [];
  let latest = null;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    messages.push(message);
    if (message.type === 'state') latest = message;
    if (message.type === 'welcome' || message.type === 'mapChange') latest = message.state;
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  function wait(predicate) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for server message'));
      }, TIMEOUT_MS) };
      waiters.push(waiter);
    });
  }
  return { socket, wait, get latest() { return latest; } };
}

function send(client, command) {
  client.socket.send(JSON.stringify(command));
}

function assertWalkableSpawns(map, units) {
  for (const unit of units) {
    const column = Math.floor(unit[2] + map.width / 2);
    const row = Math.floor(unit[3] + map.height / 2);
    assert.ok(column >= 0 && column < map.width
      && row >= 0 && row < map.height, `unit ${unit[0]} must spawn inside the map`);
    assert.ok(map.obstacles.every((block) => column < block.column
      || column >= block.column + block.width || row < block.row
      || row >= block.row + block.height),
    `unit ${unit[0]} must spawn on walkable terrain`);
  }
}

async function checkpointWith(checkpointPath, predicate) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (predicate(checkpoint)) return checkpoint;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error('Timed out waiting for the expected match checkpoint');
}

const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-unreachable-attack-'));
const checkpointPath = path.join(temp, 'match.json');
const child = spawn(process.execPath, [SERVER_PATH], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MAP: 'maps/open-field.json',
    RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'custom-maps'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });
const clients = [];

try {
  const readyBy = Date.now() + TIMEOUT_MS;
  while (Date.now() < readyBy) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(Date.now() < readyBy, `Server did not start: ${logs}`);

  const azure = connect(port);
  const ember = connect(port);
  clients.push(azure, ember);
  const [azureWelcome, emberWelcome] = await Promise.all([
    azure.wait((message) => message.type === 'welcome'),
    ember.wait((message) => message.type === 'welcome'),
  ]);
  assert.equal(azureWelcome.player.team, 0);
  assert.equal(emberWelcome.player.team, 1);

  const map = {
    id: 'unreachable-attack-test', name: 'Unreachable Attack Test',
    width: 64, height: 64, terrainSeed: 19, fogOfWar: false,
    startingArmySize: 250,
    spawnPoints: [{ team: 0, x: -18, z: 0 }, { team: 1, x: 18, z: 0 }],
    obstacles: [{ id: 'dividing-wall', column: 31, row: 0, width: 2, height: 64 }],
    resourceNodes: [], triggers: [], scenarioEvents: [],
  };
  send(azure, { type: 'publishMap', map });
  await azure.wait((message) => message.type === 'mapPublished' && message.mapId === map.id);
  send(azure, { type: 'selectArmySize', count: 250 });
  await azure.wait((message) => message.type === 'state'
    && message.mapId === map.id && message.armySize === 250);

  const worker = azure.latest.units.find((unit) => unit[1] === 0 && unit[5] === 'worker');
  const enemy = azure.latest.units.find((unit) => unit[1] === 1 && unit[4] > 0);
  assert.ok(worker && enemy);
  const moveGoal = { x: -11, z: -2 };
  send(azure, {
    type: 'move', ids: [worker[0]], unitGenerations: [worker[8]],
    ...moveGoal, clientOrderToken: 1,
  });
  await azure.wait((message) => message.type === 'notice'
    && message.clientOrderToken === 1 && message.message === 'MOVE ORDER · 1 UNITS');
  const moving = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[worker[0]];
    return snapshot.mapDefinition?.id === map.id && unit?.moveGoalCell >= 0
      && unit.pathIndex < unit.path.length;
  });
  const oldRevision = moving.state.units[worker[0]].orderRevision;

  send(azure, {
    type: 'attack', ids: [worker[0]], unitGenerations: [worker[8]],
    targetId: enemy[0], targetGeneration: enemy[8], clientOrderToken: 2,
  });
  const rejection = await azure.wait((message) => message.type === 'notice'
    && message.clientOrderToken === 2);
  assert.equal(rejection.message, 'ATTACK REJECTED · TARGET UNREACHABLE');
  const preserved = await checkpointWith(checkpointPath, (snapshot) => {
    const unit = snapshot.state?.units?.[worker[0]];
    return snapshot.state?.tickNumber > moving.state.tickNumber
      && unit?.orderRevision === oldRevision && unit.attackTargetId === -1
      && unit.moveGoalCell === moving.state.units[worker[0]].moveGoalCell;
  });
  assert.ok(preserved.state.units[worker[0]].pathIndex < preserved.state.units[worker[0]].path.length,
    'the existing move should continue after the rejected attack');

  send(ember, { type: 'reset', clientOrderToken: 3 });
  const guestReset = await ember.wait((message) => message.type === 'notice'
    && message.clientOrderToken === 3);
  assert.equal(guestReset.message, 'RESET REJECTED · ONLY THE HOST CAN RESET THE MATCH');
  const afterGuestReset = await checkpointWith(checkpointPath, (snapshot) => (
    snapshot.state?.tickNumber > preserved.state.tickNumber
  ));
  assert.equal(afterGuestReset.state.units[worker[0]].generation, worker[8],
    'guest reset must not replace the match roster');

  const obstructedMap = {
    ...map, id: 'spawn-clearance-test', name: 'Spawn Clearance Test',
    obstacles: [
      ...map.obstacles,
      { id: 'azure-spawn-boulder', column: 11, row: 27, width: 3, height: 3 },
    ],
  };
  send(azure, { type: 'publishMap', map: obstructedMap });
  await azure.wait((message) => message.type === 'mapPublished'
    && message.mapId === obstructedMap.id);
  assert.equal(azure.latest.mapId, obstructedMap.id);
  assert.equal(azure.latest.armySize, 250);
  assertWalkableSpawns(obstructedMap, azure.latest.units);
  send(azure, { type: 'selectArmySize', count: 2000 });
  const stressSpawns = await azure.wait((message) => message.type === 'state'
    && message.mapId === obstructedMap.id && message.armySize === 2000);
  assert.equal(stressSpawns.units.length, 2000);
  assertWalkableSpawns(obstructedMap, stressSpawns.units);

  send(azure, { type: 'selectArmySize', count: 250 });
  await azure.wait((message) => message.type === 'state'
    && message.mapId === obstructedMap.id && message.armySize === 250
    && message.units[0][8] > stressSpawns.units[0][8]);
  const holdMap = {
    ...map, id: 'decisive-hold-test', name: 'Decisive Hold Test',
    victoryMode: 'all', victoryHoldSeconds: 2, obstacles: [],
    triggers: [
      { id: 'first-zone', name: 'First Zone', type: 'capture-zone',
        zone: { column: 14, row: 31, width: 4, height: 3 },
        requiredUnits: 1, captureSeconds: 0.5, victory: true },
      { id: 'second-zone', name: 'Second Zone', type: 'capture-zone',
        zone: { column: 25, row: 31, width: 3, height: 3 },
        requiredUnits: 1, captureSeconds: 0.5, victory: true, requires: 'first-zone' },
    ],
  };
  send(azure, { type: 'publishMap', map: holdMap });
  await azure.wait((message) => message.type === 'mapPublished' && message.mapId === holdMap.id);
  await azure.wait((message) => message.type === 'state'
    && message.mapId === holdMap.id
    && message.objectives.find((objective) => objective.id === 'first-zone')?.owner === 0);
  const holdWorker = azure.latest.units.find((unit) => unit[1] === 0 && unit[5] === 'worker');
  send(azure, {
    type: 'move', ids: [holdWorker[0]], unitGenerations: [holdWorker[8]],
    x: -5.5, z: 0.5, clientOrderToken: 4,
  });
  await azure.wait((message) => message.type === 'notice'
    && message.clientOrderToken === 4 && message.message === 'MOVE ORDER · 1 UNITS');
  const activeHold = await checkpointWith(checkpointPath, (snapshot) => (
    snapshot.mapDefinition?.id === holdMap.id
    && snapshot.state?.victoryHoldState?.activeTeams?.[0] === true
    && snapshot.state?.matchWinner === -1
  ));
  assert.equal(activeHold.state.victoryHoldState.triggerIds[0], 'second-zone',
    'the hold should remember the zone that completed the all-zones condition');
  const [azureVictory, emberVictory] = await Promise.all([azure, ember].map((client) => (
    client.wait((message) => message.type === 'state' && message.mapId === holdMap.id
      && message.winner === 0 && message.winnerReason === 'capture-hold')
  )));
  assert.equal(azureVictory.winnerTriggerId, 'second-zone');
  assert.equal(emberVictory.winnerTriggerId, 'second-zone');
  console.log('Gameplay scenario passed: unreachable attacks, guest reset, obstructed spawns, and decisive all-zones hold attribution.');
} catch (error) {
  error.message += `\nServer logs:\n${logs}`;
  throw error;
} finally {
  await Promise.all(clients.map((client) => new Promise((resolve) => {
    if (client.socket.readyState === WebSocket.CLOSED) return resolve();
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close();
  })));
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGINT');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(temp, { recursive: true, force: true });
}
