import { createProductionPolicy } from '../src/pve-production.mjs';
import { toOpponentObservation } from '../src/pve-opponent.mjs';
import { BUILDING_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Drive real base expansion through filtered production observations; military holds position.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 360_000;

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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-expansion-ai-'));
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
  const map = { id: 'ai-expansion-proof', name: 'AI Expansion Proof', width: 80, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 24, startingResources: { food: 2000, wood: 2000 },
    spawnPoints: [{ team: 0, x: -28, z: 0 }, { team: 1, x: 28, z: 0 }], obstacles: [],
    resourceNodes: [{ id: 'remote-food', type: 'food', x: -8.5, z: 12.5, stock: 1000 },
      { id: 'remote-wood', type: 'wood', x: 8.5, z: -12.5, stock: 1000 }], triggers: [], scenarioEvents: [] };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map(client => client.wait(m => m.type === 'mapChange' && m.state.mapId === map.id)));
  await checkpointWith(checkpointPath, checkpoint => Number.isInteger(checkpoint.state.tickNumber));
  const teams = process.argv[2] === undefined ? [0, 1] : [Number(process.argv[2])];
  assert.ok(teams.every(team => team === 0 || team === 1));
  const policies = teams.map(team => ({ team, policy: createProductionPolicy(42), shadow: createProductionPolicy(42), commands: [], lastTick: -Infinity }));
  const deadline = Date.now() + TIMEOUT_MS;
  let saved;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, logs.slice(-2000));
    saved = JSON.parse(await readFile(checkpointPath, 'utf8'));
    const tick = saved.state.tickNumber;
    for (const entry of policies) {
      if (tick - entry.lastTick < 30) continue;
      entry.lastTick = tick;
      const observation = toOpponentObservation({ ...clients[entry.team].latest, tick }, entry.team, map);
      const commands = entry.policy.next(observation);
      assert.deepEqual(commands, entry.shadow.next(observation), 'identical observations yield identical expansion decisions');
      for (const command of commands) { entry.commands.push({ tick, command }); send(clients[entry.team], command); }
    }
    if (teams.every(team => saved.state.buildings.some(b => b.team === team && b.type === 'town-center' && b.complete))) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const entry of policies) {
    const structures = saved.state.buildings.filter(b => b.team === entry.team);
    assert.equal(structures.filter(b => b.type === 'town-center' && b.complete).length, 1, JSON.stringify(entry));
    for (const type of ['barracks', 'storehouse', 'town-center']) assert.ok(entry.commands.some(({command}) => command.buildingType === type), `AI purchased ${type}`);
    const center = structures.find(b => b.type === 'town-center');
    assert.equal(center.hp, BUILDING_DEFINITIONS['town-center'].maxHp);
    assert.ok(entry.commands.filter(({command}) => command.buildingType === 'town-center').length === 1, 'no duplicate expansion spending');
  }
  console.log(JSON.stringify({ passed: 'Live deterministic AI purchases and completes Barracks, remote Storehouse and expansion Town Center through authoritative commands', tick: saved.state.tickNumber, results: policies.map(({team,commands}) => ({team,commands})) }));
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
