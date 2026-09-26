import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { townCenterSpawnPosition } from '../src/town-center-spawn.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = process.env.RTS_SERVER_ROOT || ROOT;
const temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-worker-production-spawn-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: serverRoot,
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
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
const clients = [];

function workerUnits(state, team) {
  return state.units.filter((unit) => unit[1] === team && unit[4] > 0 && unit[5] === 'worker');
}

function latestState(client) {
  const message = [...client.messages].reverse().find((entry) => (
    entry.type === 'state' || entry.type === 'mapChange'
  ));
  return message?.type === 'mapChange' ? message.state : message;
}

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const waiters = [];
  const client = {
    socket,
    messages,
    send(command) { socket.send(JSON.stringify(command)); },
    waitFor(predicate, after = 0, timeoutMs = 90_000) {
      const found = messages.slice(after).find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          after,
          resolve,
          timeout: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`message timeout: ${JSON.stringify(messages.slice(-3))}`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
    waitForState(predicate, after = 0, timeoutMs = 90_000) {
      return this.waitFor((message) => message.type === 'state' && predicate(message), after, timeoutMs);
    },
  };
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (messages.length <= waiter.after || !waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  clients.push(client);
  const welcome = await client.waitFor((message) => message.type === 'welcome');
  client.team = welcome.player.team;
  return client;
}

function assertWorkerIsOnHomeSide(unit, team, spawnPoints) {
  const spawn = spawnPoints.find((point) => point.team === team);
  const opponent = spawnPoints.find((point) => point.team === 1 - team);
  const dot = (unit[2] - spawn.x) * (spawn.x - opponent.x)
    + (unit[3] - spawn.z) * (spawn.z - opponent.z);
  assert.ok(dot > 0,
    `team ${team} worker should spawn away from the opponent: ${JSON.stringify({ unit, spawn, opponent, dot })}`);
}

try {
  const healthDeadline = Date.now() + 15_000;
  let healthy = false;
  while (Date.now() < healthDeadline) {
    if (server.exitCode !== null) throw new Error(`server exited: ${serverLog}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(healthy, true, `server did not become healthy: ${serverLog}`);

  const azure = await connect();
  const ember = await connect();
  assert.equal(azure.team, 0);
  assert.equal(ember.team, 1);
  const base = JSON.parse(await readFile(path.join(serverRoot, 'maps/open-field.json'), 'utf8'));
  const spawnPoints = [{ team: 0, x: 16, z: 12 }, { team: 1, x: -16, z: -12 }];
  const map = {
    ...base,
    id: 'worker-production-outward',
    name: 'WORKER PRODUCTION OUTWARD',
    summary: 'REVERSED DIAGONAL SPAWNS · TOWN CENTER WORKERS EMERGE ON THE HOME SIDE',
    fogOfWar: false,
    startingArmySize: 8,
    startingResources: { food: 100, wood: 0 },
    spawnPoints,
    resourceNodes: [],
    obstacles: [],
    triggers: [],
    scenarioEvents: [],
  };

  const publishStart = [azure, ember].map((client) => client.messages.length);
  const publishResults = [
    azure.waitFor((message) => message.type === 'mapPublished' && message.mapId === map.id,
      publishStart[0]),
    ...[azure, ember].map((client, index) => client.waitFor(
      (message) => message.type === 'mapChange' && message.map?.id === map.id,
      publishStart[index],
    )),
  ];
  azure.send({ type: 'publishMap', map });
  await Promise.all(publishResults);

  const initialStates = [latestState(azure), latestState(ember)];
  const initialWorkerIds = [0, 1].map((team) => new Set(workerUnits(initialStates[team], team)
    .map((unit) => unit[0])));
  for (const team of [0, 1]) {
    assert.equal(workerUnits(initialStates[team], team).length, 4);
    assert.equal(initialStates[team].food[team], 100);
  }

  const orderStarts = [azure, ember].map((client) => client.messages.length);
  const queuedStates = [0, 1].map((team) => [azure, ember][team].waitForState((state) => (
    state.mapId === map.id && state.food[team] === 50
      && state.workerProduction[team].queue === 1
  ), orderStarts[team]));
  const queuedNotices = [azure, ember].map((client, team) => client.waitFor(
    (message) => message.type === 'notice' && message.message?.startsWith('WORKER QUEUED · 1/'),
    orderStarts[team],
  ));
  azure.send({ type: 'trainWorker' });
  ember.send({ type: 'trainWorker' });
  const trainingStates = await Promise.all([...queuedStates, ...queuedNotices]);

  const productionStarts = [azure, ember].map((client) => client.messages.length);
  const completedStates = [0, 1].map((team) => [azure, ember][team].waitForState((state) => (
    state.mapId === map.id && workerUnits(state, team).length === 5
      && state.workerProduction[team].queue === 0
  ), productionStarts[team]));
  const states = await Promise.all(completedStates);
  assert.ok(Math.abs(states[0].tick - states[1].tick) <= 6,
    'both teams should complete Town Center worker training at the same time');
  assert.ok(Math.abs(trainingStates[0].matchElapsedSeconds - trainingStates[1].matchElapsedSeconds) <= 0.1,
    'both teams should begin Town Center worker training at the same time');
  for (const team of [0, 1]) {
    const elapsed = states[team].matchElapsedSeconds - trainingStates[team].matchElapsedSeconds;
    assert.ok(elapsed >= 24.7 && elapsed <= 25.3,
      `team ${team} worker should retain the 25-second training time: ${elapsed}`);
  }
  assert.ok(trainingStates[0].food[0] === trainingStates[1].food[1]
    && trainingStates[0].workerProduction[0].queue === trainingStates[1].workerProduction[1].queue,
  'both teams should pay the same worker cost and reserve the same queue slot');
  const produced = [0, 1].map((team) => {
    const unit = workerUnits(states[team], team)
      .find((candidate) => !initialWorkerIds[team].has(candidate[0]));
    assert.ok(unit, `team ${team} should receive exactly one Town Center worker`);
    assert.equal(workerUnits(states[team], team).length, 5);
    assert.equal(states[team].food[team], 50);
    assertWorkerIsOnHomeSide(unit, team, spawnPoints);
    return { team, id: unit[0], x: unit[2], z: unit[3] };
  });

  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }], 0, 64, 64,
  ), { x: -23, z: 0 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }], 1, 64, 64,
  ), { x: 23, z: 0 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: 16, z: 12 }, { team: 1, x: -16, z: -12 }], 0, 64, 64,
  ), { x: 18.4, z: 13.8 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: 16, z: 12 }, { team: 1, x: -16, z: -12 }], 1, 64, 64,
  ), { x: -18.4, z: -13.8 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: 0, z: -15 }, { team: 1, x: 0, z: 15 }], 0, 64, 64,
  ), { x: 0, z: -18 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: 31, z: 31 }, { team: 1, x: -31, z: -31 }], 0, 64, 64,
  ), { x: 30.5, z: 30.5 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: 0, z: 0 }, { team: 1, x: 0, z: 0 }], 0, 64, 64,
  ), { x: -3, z: 0 });
  assert.deepEqual(townCenterSpawnPosition(
    [{ team: 0, x: 0, z: 0 }, { team: 1, x: 0, z: 0 }], 1, 64, 64,
  ), { x: 3, z: 0 });

  console.log(JSON.stringify({ mapId: map.id, spawnPoints, produced }));
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  for (const client of clients) client.socket.close();
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  }
  await rm(temporary, { recursive: true, force: true });
}
