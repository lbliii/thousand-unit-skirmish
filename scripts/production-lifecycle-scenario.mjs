import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise production destruction and builder death through the authoritative runtime.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 70_000;

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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-lifecycle-audit-'));
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
  const map = { id: 'production-lifecycle-audit', name: 'Production Lifecycle Audit', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 24, startingResources: { food: 1000, wood: 1000 },
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [] };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'mapChange' && m.state.mapId === map.id)));
  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter((u) => u[1] === team && u[5] === 'worker');
    send(client, { type: 'build', ids: workers.map((u) => u[0]), buildingType: 'barracks',
      x: team === 0 ? -14.5 : 14.5, z: 8.5, clientOrderToken: 1 });
  }
  await clients[0].wait((m) => m.type === 'state' && m.buildings.length === 2 && m.buildings.every((b) => b.complete));
  const buildings = [0, 1].map((team) => clients[0].latest.buildings.find((b) => b.team === team));
  for (const [team, client] of clients.entries()) {
    send(client, { type: 'train', buildingId: buildings[team].id });
    send(client, { type: 'train', buildingId: buildings[team].id });
    send(client, { type: 'researchUpgrade', buildingId: buildings[team].id, upgrade: 'infantry-attack' });
  }
  await checkpointWith(checkpointPath, (s) => s.state.buildings.every((b) => b.queue === 2) && s.state.teamResearch.every(Boolean));
  await stop();
  const base = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const createFixture = () => { const f = structuredClone(base); f.state.seatSessions = []; return f; };
  const doomed = createFixture();
  for (const b of doomed.state.buildings) {
    b.hp = 1; b.trainingRemaining = 1 / 60;
    doomed.state.teamResearch[b.team].remaining = 1 / 60;
    const attacker = doomed.state.units.find((u) => u.team === 1 - b.team && u.kind === 'infantry');
    Object.assign(attacker, { x: b.x - 2, z: b.z, path: [], pathIndex: 0,
      attackTargetId: -1, attackBuildingTargetId: b.id, attackCooldown: 0, movePlanningPending: false });
  }
  await writeFile(checkpointPath, JSON.stringify(doomed));
  await start();
  const destroyed = await checkpointWith(checkpointPath, (s) => s.mapDefinition.id === map.id
    && s.state.tickNumber >= doomed.state.tickNumber + 30 && s.state.buildings.length === 0);
  assert.equal(destroyed.state.units.length, doomed.state.units.length, 'destruction before completion produces no ghost units');
  assert.deepEqual(destroyed.state.teamFood, doomed.state.teamFood, 'lost queues are not charged or refunded again');
  assert.deepEqual(destroyed.state.teamWood, doomed.state.teamWood);
  assert.deepEqual(destroyed.state.teamResearch, [null, null]);
  assert.ok(destroyed.state.teamUpgrades.every((u) => !u.infantryAttack), 'research cannot complete on the destruction tick');
  assert.ok(destroyed.state.units.every((u) => u.attackBuildingTargetId === -1));
  for (const client of clients) send(client, { type: 'trainWorker' });
  const afterQueue = await checkpointWith(checkpointPath, (s) => s.state.workerProduction.every((p) => p.queue === 1));
  assert.deepEqual(afterQueue.state.teamFood, destroyed.state.teamFood.map((food) => food - 50));
  await stop();
  console.log('Both seats: near-complete production/research canceled on destruction; no ghost units/upgrades, duplicate debit/refund, or surviving building queues.');

  const abandoned = createFixture();
  for (const b of abandoned.state.buildings) {
    Object.assign(b, { complete: false, progress: 0.999, queue: 0, trainingRemaining: 0, productionBlocked: false });
    abandoned.state.teamResearch[b.team] = null;
    const workers = abandoned.state.units.filter((u) => u.team === b.team && u.kind === 'worker');
    for (const worker of workers) worker.buildingTargetId = null;
    Object.assign(workers[0], { x: b.x - 2, z: b.z, hp: 1, buildingTargetId: b.id, path: [], pathIndex: 0 });
    const attacker = abandoned.state.units.find((u) => u.team === 1 - b.team && u.kind === 'infantry');
    Object.assign(attacker, { x: b.x - 2.5, z: b.z, path: [], pathIndex: 0,
      attackTargetId: workers[0].id, attackBuildingTargetId: -1, attackCooldown: 0, movePlanningPending: false });
  }
  await writeFile(checkpointPath, JSON.stringify(abandoned));
  await start();
  const paused = await checkpointWith(checkpointPath, (s) => s.mapDefinition.id === map.id
    && s.state.tickNumber >= abandoned.state.tickNumber + 60);
  for (const b of paused.state.buildings) {
    assert.equal(b.progress, 0.999, 'dead builder does not complete construction later in the same tick');
    assert.equal(b.complete, false);
    assert.equal(paused.state.units.find((u) => u.team === b.team && u.kind === 'worker').hp, 0);
  }
  for (const [team, client] of clients.entries()) {
    const worker = client.latest.units.find((u) => u[1] === team && u[5] === 'worker' && u[4] > 0);
    send(client, { type: 'build', ids: [worker[0]], buildingId: buildings[team].id, clientOrderToken: 2 });
  }
  const resumed = await checkpointWith(checkpointPath, (s) => s.state.buildings.length === 2 && s.state.buildings.every((b) => b.complete));
  assert.deepEqual(resumed.state.teamWood, paused.state.teamWood, 'replacement builders do not pay construction cost again');
  assert.deepEqual(resumed.state.teamFood, paused.state.teamFood);
  console.log('Both seats: lethal hit pauses construction at 99.9%; another worker resumes and completes without a second resource debit.');
  await stop();

  // Saturate both the per-team 1,000 cap and global 2,000 cap: 998 living
  // units plus two paid Barracks reservations per seat. Keep added units far
  // from opponents and production exits; this tests capacity, not spawn blocking.
  const capped = createFixture();
  for (const team of [0, 1]) {
    const template = capped.state.units.find((u) => u.team === team && u.kind === 'infantry');
    let count = capped.state.units.filter((u) => u.team === team && u.hp > 0).length;
    while (count < 998) {
      const unit = structuredClone(template);
      Object.assign(unit, { id: capped.state.units.length, generation: 1,
        x: (team === 0 ? -1 : 1) * (24 + (count % 7)), z: -28 + Math.floor(count / 7) % 45,
        path: [], pathIndex: 0, attackTargetId: -1, attackBuildingTargetId: -1 });
      capped.state.unitGenerationCounters[unit.id] = 1;
      capped.state.units.push(unit);
      count++;
    }
    const b = capped.state.buildings.find((building) => building.team === team);
    b.hp = 1;
    b.trainingRemaining = 12;
    capped.state.teamResearch[team] = null;
    const attacker = capped.state.units.find((u) => u.team === 1 - team && u.kind === 'infantry');
    Object.assign(attacker, { x: b.x - 2, z: b.z, path: [], pathIndex: 0,
      attackTargetId: -1, attackBuildingTargetId: -1, attackCooldown: 0 });
  }
  await writeFile(checkpointPath, JSON.stringify(capped));
  await start();
  for (const client of clients) {
    send(client, { type: 'trainWorker' });
    await client.wait((m) => m.type === 'notice' && m.message === 'WORKER TRAINING REJECTED · UNIT CAP REACHED');
  }
  const blocked = await checkpointWith(checkpointPath, (s) => s.state.tickNumber > capped.state.tickNumber);
  assert.deepEqual(blocked.state.teamFood, capped.state.teamFood, 'cap rejection spends nothing');
  assert.ok(blocked.state.workerProduction.every((p) => p.queue === 0));
  for (const [team, client] of clients.entries()) {
    const attacker = capped.state.units.find((u) => u.team === team && u.kind === 'infantry');
    send(client, { type: 'attackBuilding', ids: [attacker.id], unitGenerations: [attacker.generation],
      buildingId: buildings[1 - team].id, clientOrderToken: 3 });
  }
  const released = await checkpointWith(checkpointPath, (s) => s.state.buildings.length === 0);
  assert.equal(released.state.units.filter((u) => u.hp > 0).length, 1996);
  assert.deepEqual(released.state.teamFood, capped.state.teamFood);
  for (const client of clients) {
    client.clearMessages();
    send(client, { type: 'trainWorker' });
    send(client, { type: 'trainWorker' });
    send(client, { type: 'trainWorker' });
    await client.wait((m) => m.type === 'notice' && m.message === 'WORKER TRAINING REJECTED · UNIT CAP REACHED');
  }
  const refilled = await checkpointWith(checkpointPath, (s) => s.state.workerProduction.every((p) => p.queue === 2));
  assert.deepEqual(refilled.state.teamFood, capped.state.teamFood.map((food) => food - 100),
    'exactly the two freed reservations are paid once');
  const completed = await checkpointWith(checkpointPath, (s) => s.state.workerProduction.every((p) => p.queue === 0)
    && s.state.units.filter((u) => u.hp > 0).length === 2000);
  for (const team of [0, 1]) {
    assert.equal(completed.state.units.filter((u) => u.team === team && u.hp > 0).length, 1000);
    clients[team].clearMessages();
    send(clients[team], { type: 'trainWorker' });
    await clients[team].wait((m) => m.type === 'notice' && m.message === 'WORKER TRAINING REJECTED · UNIT CAP REACHED');
  }
  const final = await checkpointWith(checkpointPath, (s) => s.state.tickNumber > completed.state.tickNumber + 15);
  assert.deepEqual(final.state.teamFood, refilled.state.teamFood, 'completion and repeated rejection cannot release capacity twice');
  assert.ok(final.state.workerProduction.every((p) => p.queue === 0));
  assert.equal(final.state.units.filter((u) => u.hp > 0).length, 2000);
  console.log('Both seats: producer destruction releases exactly two capped reservations; replacement production reaches 1,000 each / 2,000 total and further training stays blocked.');

} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
