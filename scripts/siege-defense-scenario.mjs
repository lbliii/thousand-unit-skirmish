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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-siege-defense-'));
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
  const map = { id: 'siege-defense-audit', name: 'Siege Defense Audit', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 24, startingResources: { food: 1000, wood: 1000 },
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [] };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map(client => client.wait(m => m.type === 'mapChange' && m.state.mapId === map.id)));
  for (const [team, client] of clients.entries()) send(client, { type: 'build', ids: client.latest.units.filter(u => u[1] === team && u[5] === 'worker').map(u => u[0]),
    buildingType: 'watchtower', x: team ? 10.5 : -10.5, z: 8.5 });
  await checkpointWith(checkpointPath, s => s.state.buildings.length === 2); await stop();
  const baseline = JSON.parse(await readFile(checkpointPath, 'utf8'));
  baseline.state.seatSessions = [];
  for (const unit of baseline.state.units) if (unit.kind === 'worker') Object.assign(unit, { buildingTargetId: null,
    repairing: false, path: [], pathIndex: 0, movePlanningPending: false, moveGoalCell: -1 });
  for (const tower of baseline.state.buildings) { tower.complete = true; tower.progress = 1; tower.attackCooldown = 0; }
  const attackers = baseline.state.buildings.map(tower => baseline.state.units.find(u => u.team !== tower.team && u.kind === 'infantry').id);
  function positionAttackers(distance) {
    const fixture = structuredClone(baseline);
    for (const [index, tower] of fixture.state.buildings.entries()) Object.assign(fixture.state.units[attackers[index]], {
      kind: 'siege-engine', hp: 90, x: tower.x + (tower.team ? -distance : distance), z: tower.z,
      path: [], pathIndex: 0, moveGoalCell: -1, attackTargetId: -1, attackBuildingTargetId: tower.id,
      attackCooldown: 0, repathTimer: 0, movePlanningPending: false });
    return fixture;
  }
  const outrange = positionAttackers(9.5); await writeFile(checkpointPath, JSON.stringify(outrange)); await start();
  const hit = await checkpointWith(checkpointPath, s => s.state.buildings.every(b => b.hp === 1152));
  assert.ok(attackers.every(id => hit.state.units[id].hp === 90), 'defense bonus lands outside tower range');
  const destroyed = await checkpointWith(checkpointPath, s => s.state.buildings.length === 0);
  assert.ok(attackers.every(id => destroyed.state.units[id].hp === 90), 'correct firing positions destroy full-health towers without return damage');
  assert.ok(destroyed.state.tickNumber - outrange.state.tickNumber >= 24 * 75, '25 shots retain the 2.5-second attack cadence');
  await stop();
  const exposed = positionAttackers(6); await writeFile(checkpointPath, JSON.stringify(exposed)); await start();
  const defeated = await checkpointWith(checkpointPath, s => attackers.every(id => s.state.units[id].hp === 0));
  assert.ok(defeated.state.buildings.every(b => b.hp > 0), 'an exposed engine loses to a completed tower before demolishing it');
  assert.deepEqual(defeated.state.teamFood, baseline.state.teamFood); assert.deepEqual(defeated.state.teamWood, baseline.state.teamWood);
  console.log('Siege defense passed: both-seat full-health towers take 48 per hit, fall after 25 outranged shots, and defeat engines exposed inside range.');
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
