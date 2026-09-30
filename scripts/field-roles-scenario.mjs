import { createReconnaissancePolicy } from '../src/pve-reconnaissance.mjs';
import { toOpponentObservation } from '../src/pve-opponent.mjs';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise fog reconnaissance and mounted raids on representative terrain.
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
    const failure = new Error('Timed out waiting for server message');
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        failure.message += `: ${predicate.toString()}\n${logs.slice(-1600)}`;
        reject(failure);
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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-field-roles-'));
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
function exploredCount(state) {
  const bytes = Buffer.from(state.visibility.data, 'base64'); let count = 0;
  for (let cell = 0; cell < state.visibility.columns * state.visibility.rows; cell++) if ((bytes[cell >> 2] >> ((cell & 3) * 2)) & 3) count++;
  return count;
}
try {
  await start();
  const map = JSON.parse(await readFile(path.join(ROOT, 'maps/forked-vale.json'), 'utf8'));
  Object.assign(map, { id: 'forked-vale-field-roles', name: 'Forked Vale Field Roles', startingArmySize: 24, fogOfWar: true });
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map(client => client.wait(m => m.type === 'mapChange' && m.state.mapId === map.id)));
  await stop(); const baseline = JSON.parse(await readFile(checkpointPath, 'utf8')); const results = [];
  for (const team of [0, 1]) {
    const direction = team ? -1 : 1, scoutId = team * 12 + 4, probeId = (1 - team) * 12 + 4;
    const fixture = structuredClone(baseline); fixture.state.seatSessions = [];
    Object.assign(fixture.state.units[scoutId], { kind: 'worker', hp: 100, x: -12.5 * direction, z: .5 });
    Object.assign(fixture.state.units[probeId], { x: -2.5 * direction, z: .5 });
    await writeFile(checkpointPath, JSON.stringify(fixture)); await start();
    await checkpointWith(checkpointPath, checkpoint => checkpoint.state.tickNumber > fixture.state.tickNumber + 30);
    assert.ok(!clients[team].latest.units.some(u => u[0] === probeId), 'ordinary eight-cell sight cannot see the ten-cell probe');
    await stop(); const scoutFixture = JSON.parse(await readFile(checkpointPath, 'utf8')); scoutFixture.state.seatSessions = [];
    Object.assign(scoutFixture.state.units[scoutId], { kind: 'scout', hp: 60 });
    await writeFile(checkpointPath, JSON.stringify(scoutFixture)); await start();
    assert.ok(clients[team].latest.units.some(u => u[0] === probeId), 'Scout sight reveals the ten-cell probe on reconnect');
    assert.ok(!clients[1 - team].latest.units.some(u => u[0] === scoutId), 'Scout reveals the probe before the probe reveals it');
    const before = exploredCount(clients[team].latest), policy = createReconnaissancePolicy(42), commands = [];
    let lastTick = -Infinity, moved = false, retreated = false, threatApproaching = false;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !(moved && retreated && exploredCount(clients[team].latest) > before)) {
      const state = clients[team].latest;
      if (state.tick - lastTick >= 30) {
        lastTick = state.tick; const observation = toOpponentObservation(state, team, map);
        for (const command of policy.next(observation).commands) {
          commands.push(command); send(clients[team], command);
          retreated ||= Math.abs(command.x) > 25;
        }
        const scout = state.units.find(u => u[0] === scoutId);
        moved ||= Math.hypot(scout[2] + 12.5 * direction, scout[3] - .5) > 1;
        if (moved && exploredCount(state) > before && !threatApproaching) {
          send(clients[1 - team], { type: 'move', ids: [probeId], x: scout[2] + direction * 4, z: scout[3] });
          threatApproaching = true;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(moved && retreated && exploredCount(clients[team].latest) > before, JSON.stringify(commands));
    assert.equal(clients[team].latest.units.find(u => u[0] === scoutId)[4], 60);
    const discovered = exploredCount(clients[team].latest) - before; await stop();

    const raid = structuredClone(baseline); raid.state.seatSessions = [];
    const riderId = team * 12 + 5, workerId = (1 - team) * 12, spearId = (1 - team) * 12 + 5;
    Object.assign(raid.state.units[riderId], { kind: 'rider', hp: 130 });
    Object.assign(raid.state.units[spearId], { kind: 'spearman', hp: 110,
      x: raid.state.units[workerId].x - direction, z: raid.state.units[workerId].z });
    await writeFile(checkpointPath, JSON.stringify(raid)); await start();
    const worker = raid.state.units[workerId];
    send(clients[team], { type: 'move', ids: [riderId], x: worker.x - direction * 5.5, z: worker.z });
    await clients[team].wait(m => m.type === 'state' && m.units.some(u => u[0] === workerId)
      && Math.hypot(m.units.find(u => u[0] === riderId)[2] - worker.x + direction * 5.5,
        m.units.find(u => u[0] === riderId)[3] - worker.z) < 1);
    send(clients[team], { type: 'attack', ids: [riderId], targetId: workerId });
    const struck = await clients[team].wait(m => m.type === 'state' && m.units.some(u => u[0] === workerId && u[4] < 100));
    assert.ok(struck.units.find(u => u[0] === workerId)[4] > 0, 'a raid exposes damage before economic elimination');
    send(clients[1 - team], { type: 'attack', ids: [spearId], targetId: riderId });
    const countered = await checkpointWith(checkpointPath, s => s.state.units[riderId].hp === 0);
    assert.ok(countered.state.units[workerId].hp > 0, 'timely Spearman response preserves the raided Worker');
    assert.ok(countered.state.units[spearId].hp > 0);
    results.push({ team, discovered, scoutOrders: commands.length, workerHp: countered.state.units[workerId].hp,
      spearmanHp: countered.state.units[spearId].hp }); await stop();
  }
  console.log(JSON.stringify({ passed: 'Forked Vale both-seat Scout fog advantage, frontier exploration/retreat and cross-map mounted raid with Spearman response', results }));
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
