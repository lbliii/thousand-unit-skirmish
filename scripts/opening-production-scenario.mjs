import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = process.env.RTS_SERVER_ROOT || root;
const mapPath = process.env.RTS_OPENING_MAP || path.join(root, 'maps/forked-vale.json');
const buildSiteX = Number(process.env.RTS_OPENING_BUILD_X || 21.5);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-opening-production-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
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
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });
const clients = [];

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const waiters = [];
  const client = {
    socket, messages,
    send(command) { socket.send(JSON.stringify(command)); },
    waitFor(predicate, after = 0, timeoutMs = 60_000) {
      const existing = messages.slice(after).find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate, after, resolve,
          timeout: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`message timeout: ${JSON.stringify(messages.slice(-4))}`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
  };
  socket.addEventListener('message', event => {
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
  const welcome = await client.waitFor(message => message.type === 'welcome');
  client.team = welcome.player.team;
  return client;
}

function ownUnits(state, team, kind) {
  return state.units.filter(row => row[1] === team && row[5] === kind && row[4] > 0);
}

function distanceToBuildingEdge(unit, building) {
  return Math.hypot(
    Math.max(0, Math.abs(building.x - unit[2]) - 1.5),
    Math.max(0, Math.abs(building.z - unit[3]) - 1.5),
  );
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
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(healthy, true, `server did not become healthy: ${serverLog}`);
  const azure = await connect();
  const ember = await connect();
  assert.equal(azure.team, 0);
  assert.equal(ember.team, 1);
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  assert.equal(map.id, 'forked-vale', 'opening fairness fixture must use Forked Vale geometry');
  map.id = 'opening-production';
  map.name = 'OPENING PRODUCTION';
  map.startingArmySize = 24;
  map.startingResources = { food: 150, wood: 250 };
  const after = clients.map(client => client.messages.length);
  azure.send({ type: 'publishMap', map });
  const openings = await Promise.all(clients.map((client, team) => client.waitFor(
    message => message.type === 'mapChange' && message.map?.id === map.id, after[team])));
  for (const [team, opening] of openings.entries()) {
    assert.equal(opening.state.armySize, 24, `team ${team} must use the authored 24-unit roster`);
    assert.equal(ownUnits(opening.state, team, 'worker').length, 4,
      `team ${team} must start with four workers`);
    assert.equal(ownUnits(opening.state, team, 'infantry').length, 8,
      `team ${team} must start with eight infantry`);
    assert.equal(opening.state.food[team], 150, `team ${team} must start with 150 food`);
    assert.equal(opening.state.wood[team], 250, `team ${team} must start with 250 wood`);
  }

  async function round(buildingTypeByTeam) {
    const roundStart = clients.map(client => client.messages.length);
    const roles = ['barracks', 'archery-range'];
    assert.deepEqual([...buildingTypeByTeam].sort(), [...roles].sort());
    const startStates = clients.map(client => {
      const latest = [...client.messages].reverse()
        .find(message => message.type === 'state' && message.mapId === map.id);
      return latest ?? [...client.messages].reverse()
        .find(message => message.type === 'mapChange' && message.map?.id === map.id)?.state;
    });
    const builderIds = [];
    for (let team = 0; team < 2; team++) {
      const client = clients[team];
      const workers = ownUnits(startStates[team], team, 'worker');
      assert.equal(workers.length, 4);
      builderIds.push(workers.slice(0, 2).map(row => row[0]));
      client.send({
        type: 'build', buildingType: buildingTypeByTeam[team],
        ids: builderIds[team],
        x: team === 0 ? -buildSiteX : buildSiteX, z: 0.5,
      });
    }
    const produced = await Promise.all(clients.map(async (client, team) => {
      const type = buildingTypeByTeam[team];
      const completed = await client.waitFor(message => message.type === 'state'
        && message.buildings.some(building => building.team === team
          && building.type === type && building.complete), roundStart[team]);
      const building = completed.buildings.find(row => row.team === team && row.type === type);
      const trainAfter = client.messages.length;
      client.send(type === 'barracks'
        ? { type: 'train', buildingId: building.id }
        : { type: 'trainArcher', buildingId: building.id });
      const trained = await client.waitFor(message => message.type === 'state'
        && ownUnits(message, team, type === 'barracks' ? 'infantry' : 'archer').length
          >= (type === 'barracks' ? 9 : 1), trainAfter);
      return { completed, trained };
    }));
    const results = [];
    for (let team = 0; team < 2; team++) {
      const type = buildingTypeByTeam[team];
      const { completed, trained } = produced[team];
      results.push({
        team, buildingType: type,
        completedAtSeconds: completed.matchElapsedSeconds,
        firstUnitAtSeconds: trained.matchElapsedSeconds,
        food: trained.food[team], wood: trained.wood[team],
        samples: [5, 10, 15, 20].map(seconds => {
          const sample = clients[team].messages.slice(roundStart[team]).find(message =>
            message.type === 'state' && message.matchElapsedSeconds >= seconds);
          const row = sample?.buildings.find(building =>
            building.team === team && building.type === type);
          return {
            seconds, at: sample?.matchElapsedSeconds, progress: row?.progress,
            builders: builderIds[team].map(id => {
              const worker = sample?.units.find(unit => unit[0] === id);
              return worker && row && {
                id, x: worker[2], z: worker[3], task: worker[9],
                distanceToEdge: distanceToBuildingEdge(worker, row),
              };
            }),
          };
        }),
      });
    }
    return results;
  }

  const first = await round(['barracks', 'archery-range']);
  const resetAfter = clients.map(client => client.messages.length);
  azure.send({ type: 'reset' });
  await Promise.all(clients.map((client, team) => client.waitFor(
    message => message.type === 'state' && message.armySize === 24
      && message.buildings.length === 0
      && message.food[team] === 150 && message.wood[team] === 250
      && ownUnits(message, team, 'infantry').length === 8, resetAfter[team])));
  const second = await round(['archery-range', 'barracks']);
  const verbose = process.argv.includes('--verbose');
  const summarize = results => results.map(({ samples, ...result }) =>
    verbose ? { ...result, samples } : result);
  console.log(JSON.stringify({
    baselineMap: 'forked-vale', fixtureMap: map.id, armySize: 24,
    startingResources: { food: 150, wood: 250 }, buildSiteX,
    first: summarize(first), second: summarize(second),
  }));
  for (const result of [...first, ...second]) {
    assert.ok(result.completedAtSeconds > 0);
    assert.ok(result.firstUnitAtSeconds > result.completedAtSeconds);
    assert.ok(result.firstUnitAtSeconds < 90);
    assert.equal(result.food, result.buildingType === 'barracks' ? 100 : 125);
    assert.equal(result.wood, result.buildingType === 'barracks' ? 75 : 55);
    const tenSecondSample = result.samples.find(sample => sample.seconds === 10);
    assert.ok(tenSecondSample.progress >= 0.9,
      `${result.buildingType} should be at least 90% complete by 10 seconds`);
    assert.ok(tenSecondSample.builders.every(builder => builder
      && builder.task === 'building' && builder.distanceToEdge <= 1.4),
    `${result.buildingType} builders should be contributing within 1.4 units of the edge`);
  }
  if (process.argv.includes('--expect-builder-parity')) {
    for (const type of ['barracks', 'archery-range']) {
      const azure = [...first, ...second].find(result =>
        result.team === 0 && result.buildingType === type);
      const ember = [...first, ...second].find(result =>
        result.team === 1 && result.buildingType === type);
      assert.ok(Math.abs(azure.completedAtSeconds - ember.completedAtSeconds) <= 1.5,
        `${type} construction differs by seat: ${azure.completedAtSeconds}s vs ${ember.completedAtSeconds}s`);
      assert.ok(Math.abs(azure.firstUnitAtSeconds - ember.firstUnitAtSeconds) <= 1.5,
        `${type} first unit differs by seat: ${azure.firstUnitAtSeconds}s vs ${ember.firstUnitAtSeconds}s`);
    }
  }
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
