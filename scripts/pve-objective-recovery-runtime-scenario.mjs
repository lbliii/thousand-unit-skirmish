import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Require objective recovery and victory after a bounded Forked Vale loss fixture.
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

const team = Number(process.argv[2] ?? 0);
const seed = Number(process.argv[3] ?? 20260925);
assert.ok([0, 1].includes(team));
const map = JSON.parse(await readFile(path.join(ROOT, 'maps/forked-vale.json'), 'utf8'));
const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'pve-objective-recovery-'));
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
      RTS_MAP: 'maps/forked-vale.json', RTS_MATCH_STATE_PATH: checkpointPath,
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
  const initial = clients[team].latest;
  const workers = initial.units.filter((u) => u[1] === team && u[5] === 'worker');
  send(clients[team], { type: 'build', ids: workers.map((u) => u[0]), buildingType: 'barracks',
    x: team === 0 ? -31.5 : 31.5, z: 6.5 });
  await clients[team].wait((m) => m.type === 'state' && m.buildings.some((b) => b.team === team && b.complete));
  const barracks = clients[team].latest.buildings.find((b) => b.team === team);
  send(clients[team], { type: 'train', buildingId: barracks.id });
  await clients[team].wait((m) => m.type === 'state' && m.units.filter((u) => u[1] === team).length > 12);
  const policy = createDeterministicPolicy(seed);
  const beforeLoss = toOpponentObservation(clients[team].latest, team, map);
  for (const objective of beforeLoss.objectives) if (objective.id !== 'capture-zone-3') objective.owner = team;
  policy.next(beforeLoss);
  await stop();
  const fixture = JSON.parse(await readFile(checkpointPath, 'utf8'));
  fixture.state.seatSessions = [];
  fixture.state.buildings = [];
  fixture.state.teamFood[team] = 350;
  fixture.state.teamWood[team] = 400;
  let workerCount = 0;
  let soldierCount = 0;
  for (const unit of fixture.state.units) {
    unit.buildingTargetId = null;
    unit.path = []; unit.pathIndex = 0;
    if (unit.team !== team) continue;
    if (unit.kind === 'worker' ? ++workerCount > 1 : ++soldierCount > 5) unit.hp = 0;
  }
  for (const objective of fixture.state.triggerStates) {
    objective.owner = objective.id === 'capture-zone-1' ? 1 - team : objective.id === 'capture-zone-2' ? team : -1;
    objective.progress = 0; objective.progressTeam = -1; objective.unitCounts = [0, 0];
  }
  await writeFile(checkpointPath, JSON.stringify(fixture));
  await start();
  const commands = [];
  let lastTick = -Infinity;
  let replacementComplete = false;
  let regainedSignal = false;
  const startedAt = Date.now();
  const deadline = startedAt + 240_000;
  while (clients[team].latest.winner === -1) {
    assert.ok(Date.now() < deadline, `recovery timeout team=${team} seed=${seed} ${JSON.stringify(clients[team].latest.objectives)} commands=${JSON.stringify(commands.slice(-15))}`);
    const state = clients[team].latest;
    if (state.tick - lastTick >= 30) {
      lastTick = state.tick;
      const observation = toOpponentObservation(state, team, map);
      replacementComplete ||= observation.buildings.friendly.some((b) => b.type === 'barracks' && b.complete);
      regainedSignal ||= observation.objectives.find((o) => o.id === 'capture-zone-1').owner === team;
      for (const [type, maximum] of [['barracks', 1], ['house', 2], ['storehouse', 1], ['watchtower', 1], ['stable', 1], ['workshop', 1]]) {
        assert.ok(observation.buildings.friendly.filter((b) => b.type === type).length <= maximum, `bounded ${type} recovery`);
      }
      assert.ok(observation.buildings.friendly.filter((b) => b.type === 'town-center' && !b.home).length <= 1, 'one expansion');
      assert.ok(observation.buildings.friendly.filter((b) => b.home).length <= 1, 'one living home center');
      assert.ok(observation.buildings.friendly.every((b) => b.queue <= 1));
      assert.ok(observation.units.friendly.filter((u) => u.kind !== 'worker' && u.hp > 0).length <= 12);
      for (const command of policy.next(observation)) {
        commands.push({ tick: observation.tick, command });
        send(clients[team], { ...command, clientOrderToken: commands.length });
      }
      // The unfixed policy never emits a replacement, even with ample stock.
      if (state.tick - fixture.state.tickNumber > 1200) {
        assert.ok(commands.some(({ command }) => command.type === 'build'), 'last surviving worker must rebuild production');
      }
    }
    if (Date.now() - startedAt > 40_000) {
      assert.ok(commands.some(({ command }) => command.type === 'build'), 'last surviving worker must rebuild production');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(clients[team].latest.winner, team);
  assert.ok(replacementComplete && regainedSignal);
  assert.ok(commands.filter(({ command }) => ['train', 'trainUnit'].includes(command.type)).length >= 3);
  assert.ok(commands.some(({ command }) => command.type === 'trainUnit' && command.kind === 'spearman'), 'replacement army includes the new Barracks product');
  assert.ok(clients[team].latest.objectives.every((o) => o.owner === team));
  console.log(JSON.stringify({ team, seed, winner: team, ticks: lastTick - fixture.state.tickNumber,
    builds: commands.filter(({ command }) => command.type === 'build').length,
    trained: commands.filter(({ command }) => ['train', 'trainUnit'].includes(command.type)).length, commands: commands.length }));
} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
