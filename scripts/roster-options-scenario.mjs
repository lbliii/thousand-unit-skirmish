import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise mixed roster production and restart recovery through the authoritative runtime.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const siegeMode = process.argv.includes('--siege');
const TIMEOUT_MS = siegeMode ? 115_000 : 70_000;
const mounted = process.argv.includes('--mounted');
const producerType = siegeMode ? 'workshop' : mounted ? 'stable' : 'barracks';
const products = BUILDING_DEFINITIONS[producerType].products;
const order = siegeMode ? ['siege-engine', 'siege-engine', 'siege-engine'] : mounted ? ['scout', 'rider', 'scout'] : ['spearman', 'infantry', 'spearman'];
const featuredKind = order[0];

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
  return { socket, wait, clearMessages() { messages.length = 0; }, get latest() { return latest; } };
}

function send(client, command) {
  client.socket.send(JSON.stringify(command));
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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-roster-options-'));
const checkpointPath = path.join(temp, 'match.json');
let child;
let clients = [];
let logs = '';
async function stop() {
  for (const client of clients) client.socket.close();
  clients = [];
  if (child && child.exitCode === null) {
    const done = once(child, 'exit'); child.kill('SIGINT'); await done;
  }
}
async function start() {
  child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1', RTS_GAME_MODE: 'pvp',
      RTS_MAP: 'maps/open-field.json', RTS_MATCH_STATE_PATH: checkpointPath,
      RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'custom') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const deadline = Date.now() + TIMEOUT_MS;
  while (true) {
    if (child.exitCode !== null || Date.now() > deadline) throw Error(logs);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  for (const team of [0, 1]) {
    const client = connect(port); clients.push(client);
    const welcome = await client.wait((m) => m.type === 'welcome');
    assert.equal(welcome.player.team, team);
  }
}
try {
  await start();
  const map = { id: 'roster-options-audit', name: 'Roster Options Audit', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: siegeMode ? 12 : mounted ? 20 : 24, startingResources: { food: siegeMode ? 1500 : 1000, wood: siegeMode ? 1500 : 1000 },
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [] };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'mapChange' && m.state.mapId === map.id)));
  const openingCount = clients[0].latest.units.length;
  if (siegeMode) {
    for (const [team, client] of clients.entries()) {
      const worker = client.latest.units.find(u => u[1] === team && u[5] === 'worker');
      send(client, { type: 'build', ids: [worker[0]], buildingType: 'workshop', x: team ? 14.5 : -14.5, z: 8.5 });
      assert.match((await client.wait(m => m.type === 'notice' && /BUILD REJECTED/.test(m.message))).message, /REQUIRES MILITARY TIER II/);
      const home = client.latest.homeTownCenters.find(b => b.team === team);
      send(client, { type: 'researchUpgrade', buildingId: home.id, upgrade: 'military-tier-2' });
    }
    await checkpointWith(checkpointPath, s => s.state.teamUpgrades.every(u => u.militaryTier2));
  }

  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter((u) => u[1] === team && u[5] === 'worker');
    send(client, { type: 'build', ids: workers.map((u) => u[0]), buildingType: producerType,
      x: team === 0 ? -14.5 : 14.5, z: 8.5, clientOrderToken: 1 });
  }
  await clients[0].wait((m) => m.type === 'state' && m.buildings.length === 2 && m.buildings.every((b) => b.complete));
  for (const [team, client] of clients.entries()) {
    await client.wait((m) => m.type === 'state' && m.buildings.some((b) => b.team === team && b.complete));
    const building = client.latest.buildings.find((b) => b.team === team);
    assert.deepEqual(building.productionOptions.map((option) => option.kind), products);
    if (!siegeMode) assert.ok(building.productionOptions.every((option) => option.available), JSON.stringify(building.productionOptions));
    const enemy = client.latest.buildings.find((b) => b.team !== team);
    assert.deepEqual(enemy.productionOptions, [], 'production actions never reveal enemy resources or prerequisites');
    if (siegeMode) {
      assert.equal(building.productionOptions[0].available, false);
      assert.match(building.productionOptions[0].reason, /REQUIRES SIEGE ENGINEERING/);
      client.clearMessages();
      send(client, { type: 'trainUnit', kind: 'siege-engine', buildingId: building.id });
      assert.match((await client.wait(m => m.type === 'notice' && /TRAINING REJECTED/.test(m.message))).message, /REQUIRES SIEGE ENGINEERING/);
      send(client, { type: 'researchUpgrade', buildingId: building.id, upgrade: 'siege-engineering' });
    }
    if (!siegeMode) for (const kind of order) send(client, { type: 'trainUnit', kind, buildingId: building.id });
  }
  if (siegeMode) {
    await checkpointWith(checkpointPath, s => s.state.teamUpgrades.every(u => u.siegeEngineering));
    for (const [team, client] of clients.entries()) {
      await client.wait(m => m.type === 'state' && m.teamResearch[team].siegeEngineering);
      const building = client.latest.buildings.find(b => b.team === team);
      assert.equal(building.productionOptions[0].available, true);
      for (const kind of order) send(client, { type: 'trainUnit', kind, buildingId: building.id });
    }
  }
  await checkpointWith(checkpointPath, (s) => s.state.buildings.every((b) => b.queue === 3));
  await stop();
  const saved = JSON.parse(await readFile(checkpointPath, 'utf8'));
  for (const building of saved.state.buildings) {
    assert.deepEqual(building.productionQueue, order);
    assert.ok(building.trainingRemaining > 0 && building.trainingRemaining <= UNIT_DEFINITIONS[featuredKind].trainSeconds);
  }
  const expectedFood = (siegeMode ? 1500 - 350 : 1000) - order.reduce((sum, kind) => sum + UNIT_DEFINITIONS[kind].cost.food, 0);
  assert.deepEqual(saved.state.teamFood, [expectedFood, expectedFood]);
  const expectedWood = (siegeMode ? 1500 - 300 : 1000) - BUILDING_DEFINITIONS[producerType].cost.wood - order.reduce((sum, kind) => sum + UNIT_DEFINITIONS[kind].cost.wood, 0);
  assert.deepEqual(saved.state.teamWood, [expectedWood, expectedWood]);
  saved.state.seatSessions = [];
  await writeFile(checkpointPath, JSON.stringify(saved));
  await start();
  for (const [team, client] of clients.entries()) {
    const own = client.latest.buildings.find((b) => b.team === team);
    const enemy = client.latest.buildings.find((b) => b.team !== team);
    assert.deepEqual(own.productionQueue, order);
    assert.deepEqual(enemy.productionQueue, [], 'enemy queue products stay private even on a no-fog map');
  }
  const completed = await checkpointWith(checkpointPath, (s) => s.state.buildings.every((b) => b.queue === 0));
  for (const team of [0, 1]) {
    const produced = completed.state.units.filter((u) => u.team === team && u.id >= openingCount);
    assert.deepEqual(produced.map((u) => u.kind), order);
    assert.ok(produced.filter((u) => u.kind === featuredKind).every((u) => u.hp === UNIT_DEFINITIONS[featuredKind].combat.maxHp));
  }
  assert.deepEqual(completed.state.teamFood, saved.state.teamFood, 'restart and completion do not charge twice');
  assert.deepEqual(completed.state.teamWood, saved.state.teamWood);
  await stop();
  const rosterSave = JSON.parse(await readFile(checkpointPath, 'utf8'));
  rosterSave.state.seatSessions = [];
  await writeFile(checkpointPath, JSON.stringify(rosterSave));
  await start();
  assert.equal(clients[0].latest.units.filter((u) => u[5] === featuredKind).length, siegeMode ? 6 : 4, 'completed Spearmen survive restart with registry HP');
  send(clients[0], { type: 'reset' });
  await clients[0].wait((m) => m.type === 'state' && m.buildings.length === 0 && m.units.length === openingCount);
  assert.ok(clients[0].latest.units.every((u) => u[5] !== featuredKind), 'rematch resets trained roster');
  const rewardMap = { ...map, id: 'roster-reward-audit', scenarioEvents: [{ id: 'spear-supply', name: 'Spear Supply',
    type: 'timed-supply', afterSeconds: 0.5, team: 'both', foodReward: 0, woodReward: 0, unitCount: 1, unitKind: featuredKind }] };
  send(clients[0], { type: 'publishMap', map: rewardMap });
  await clients[0].wait((m) => m.type === 'state' && m.mapId === rewardMap.id
    && [0, 1].every((team) => m.units.some((u) => u[1] === team && u[5] === featuredKind)));
  console.log(`Roster options passed: both-seat mixed ${producerType} FIFO, exact costs, restart, queue privacy, ${featuredKind} stats, rematch and authored reinforcements.`);
} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
