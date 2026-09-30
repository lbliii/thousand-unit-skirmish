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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-progression-'));
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
  const map = { id: 'progression-audit', name: 'Progression Audit', width: 64, height: 64,
    fogOfWar: false, startingArmySize: 20, startingResources: { food: 1000, wood: 1000 },
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [] };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map(client => client.wait(m => m.type === 'mapChange' && m.state.mapId === map.id)));
  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter(u => u[1] === team && u[5] === 'worker');
    for (const [index, type] of ['barracks', 'stable'].entries()) send(client, { type: 'build',
      ids: workers.slice(index * 2, index * 2 + 2).map(u => u[0]), buildingType: type,
      x: team ? 14.5 : -14.5, z: index ? 8.5 : -8.5 });
  }
  await clients[0].wait(m => m.type === 'state' && m.buildings.length === 4 && m.buildings.every(b => b.complete));
  for (const [team, client] of clients.entries()) {
    await client.wait(m => m.type === 'state' && m.buildings.filter(b => b.team === team).every(b => b.complete));
    const barracks = client.latest.buildings.find(b => b.team === team && b.type === 'barracks');
    const enemy = client.latest.buildings.find(b => b.team !== team && b.type === 'barracks');
    assert.deepEqual(enemy.researchOptions, [], 'no-fog choices remain private');
    assert.match(barracks.researchOptions.find(o => o.upgrade === 'military-armor').reason, /REQUIRES MILITARY TIER II/);
    send(client, { type: 'researchUpgrade', buildingId: barracks.id, upgrade: 'military-armor' });
    assert.match((await client.wait(m => m.type === 'notice' && /RESEARCH REJECTED/.test(m.message))).message, /REQUIRES MILITARY TIER II/);
    const home = client.latest.homeTownCenters.find(b => b.team === team);
    assert.equal(home.researchOptions.find(o => o.upgrade === 'military-tier-2').available, true);
    send(client, { type: 'researchUpgrade', buildingId: home.id, upgrade: 'military-tier-2' });
  }
  await checkpointWith(checkpointPath, s => s.state.teamResearch.every(r => r?.type === 'military-tier-2'));
  await stop();
  const saved = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.deepEqual(saved.state.teamFood, [800, 800]); assert.deepEqual(saved.state.teamWood, [475, 475]);
  assert.ok(saved.state.teamResearch.every(r => r.remaining > 0 && r.remaining <= 35));
  saved.state.seatSessions = []; await writeFile(checkpointPath, JSON.stringify(saved)); await start();
  for (const [team, client] of clients.entries()) assert.equal(client.latest.teamResearch[team].active.type, 'military-tier-2');
  await checkpointWith(checkpointPath, s => s.state.teamUpgrades.every(u => u.militaryTier2));
  for (const [team, client] of clients.entries()) {
    await client.wait(m => m.type === 'state' && m.teamResearch[team].militaryTier2);
    const barracks = client.latest.buildings.find(b => b.team === team && b.type === 'barracks');
    send(client, { type: 'researchUpgrade', buildingId: barracks.id, upgrade: 'military-armor' });
    await client.wait(m => m.type === 'state' && m.teamResearch[team].active?.type === 'military-armor');
    client.clearMessages();
    const stable = client.latest.buildings.find(b => b.team === team && b.type === 'stable');
    send(client, { type: 'researchUpgrade', buildingId: stable.id, upgrade: 'mounted-attack' });
    assert.match((await client.wait(m => m.type === 'notice' && /RESEARCH REJECTED/.test(m.message))).message, /RESEARCH IN PROGRESS/);
  }
  await checkpointWith(checkpointPath, s => s.state.teamUpgrades.every(u => u.militaryArmor));
  for (const [team, client] of clients.entries()) {
    await client.wait(m => m.type === 'state' && m.teamResearch[team].militaryArmor);
    const stable = client.latest.buildings.find(b => b.team === team && b.type === 'stable');
    send(client, { type: 'researchUpgrade', buildingId: stable.id, upgrade: 'mounted-attack' });
  }
  const complete = await checkpointWith(checkpointPath, s => s.state.teamUpgrades.every(u => u.mountedAttack));
  assert.deepEqual(complete.state.teamFood, [580, 580]); assert.deepEqual(complete.state.teamWood, [275, 275]);
  await stop();
  const final = JSON.parse(await readFile(checkpointPath, 'utf8')); final.state.seatSessions = [];
  await writeFile(checkpointPath, JSON.stringify(final)); await start();
  for (const [team, client] of clients.entries()) {
    for (const key of ['militaryTier2', 'militaryArmor', 'mountedAttack']) assert.equal(client.latest.teamResearch[team][key], true);
    const home = client.latest.homeTownCenters.find(b => b.team === team);
    assert.equal(home.researchOptions.find(o => o.upgrade === 'military-tier-2').reason, 'ALREADY COMPLETED');
  }
  send(clients[0], { type: 'reset' });
  await clients[0].wait(m => m.type === 'state' && m.buildings.length === 0 && !m.teamResearch[0].militaryTier2);
  assert.ok(clients[0].latest.teamResearch.every(r => !r.militaryArmor && !r.mountedAttack && !r.active));
  console.log('Progression passed: both-seat home research, prerequisite rejection, exact costs, one active project, active/completed restart, legal options privacy and rematch.');
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
