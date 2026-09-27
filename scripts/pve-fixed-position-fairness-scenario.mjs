import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep opening geometry fixed while independently permuting team and unit IDs.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PATH = process.env.RTS_FAIRNESS_SERVER_PATH || path.join(ROOT, 'server.mjs');
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

const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'pve-fixed-position-'));
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
const leftTeam = Number(process.argv[2] ?? 0);
const lowIdsLeft = process.argv[3] !== 'right';
assert.ok([0, 1].includes(leftTeam));
try {
  await start();
  const map = JSON.parse(await readFile(path.join(ROOT, 'maps/forked-vale.json'), 'utf8'));
  map.id = 'forked-vale-fixed-opening'; map.name = 'FORKED VALE FIXED OPENING';
  map.resourceNodes = []; map.startingResources = { food: 0, wood: 0 }; map.scenarioEvents = [];
  send(clients[0], { type: 'publishMap', map });
  await clients[0].wait((m) => m.type === 'mapChange' && m.state.mapId === map.id);
  await stop();
  const fixture = JSON.parse(await readFile(checkpointPath, 'utf8'));
  fixture.state.seatSessions = [];
  const positions = [];
  for (const unit of fixture.state.units) {
    const low = unit.id < 12;
    const left = low === lowIdsLeft;
    const slot = unit.id % 12;
    unit.team = left ? leftTeam : 1 - leftTeam;
    if (unit.kind === 'infantry') {
      const index = slot - 4;
      unit.x = (left ? -1 : 1) * (3.5 + Math.floor(index / 4));
      unit.z = 13.5 + index % 4;
      positions.push({ id: unit.id, team: unit.team, x: unit.x, z: unit.z });
    } else {
      unit.x = (left ? -1 : 1) * (24.5 + slot % 2);
      unit.z = -5.5 - Math.floor(slot / 2);
    }
    unit.attackMoveScanTick = fixture.state.tickNumber;
  }
  await writeFile(checkpointPath, JSON.stringify(fixture));
  await start();
  const policies = [createDeterministicPolicy(20260925), createDeterministicPolicy(20260925)];
  const shadows = [createDeterministicPolicy(20260925), createDeterministicPolicy(20260925)];
  const commands = [[], []];
  let nextTick = fixture.state.tickNumber;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (Math.min(...clients.map((c) => c.latest.tick)) >= nextTick) {
      nextTick += 30;
      for (const team of [0, 1]) {
        const observation = toOpponentObservation(clients[team].latest, team, map);
        const orders = policies[team].next(observation);
        assert.deepEqual(orders, shadows[team].next(structuredClone(observation)));
        for (const command of orders) {
          assert.equal(command.type, 'attackMove', 'zero-stock opening isolates tactical commands');
          commands[team].push({ tick: observation.tick, command });
          send(clients[team], command);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await stop();
  const final = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const results = [0, 1].map((team) => {
    const army = final.state.units.filter((u) => u.team === team && u.kind === 'infantry');
    assert.ok(army.some((u) => u.hp < 100), 'both sides must engage');
    return { team, side: team === leftTeam ? 'left' : 'right', lowIds: army[0].id < 12,
      alive: army.filter((u) => u.hp > 0).length, hp: army.reduce((sum, u) => sum + u.hp, 0),
      attackTicks: army.map((u) => u.lastAttackTick) };
  });
  if (process.argv.includes('--expect-parity')) {
    assert.equal(results[0].alive, results[1].alive, 'mirrored fixed-position forces must have equal survivors');
    assert.equal(results[0].hp, results[1].hp, 'mirrored fixed-position forces must have equal remaining HP');
  }
  console.log(JSON.stringify({ leftTeam, lowIdsLeft, positions, results, commands,
    objectives: final.state.triggerStates, ticks: final.state.tickNumber - fixture.state.tickNumber }));
} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
