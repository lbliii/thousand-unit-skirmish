import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Archers approach reachable firing positions without needing the building perimeter.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 40_000;

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
  return { socket, wait, get latest() { return latest; } };
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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-archer-approach-'));
const checkpointPath = path.join(temp, 'match.json');
let child = spawn(process.execPath, [SERVER_PATH], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MAP: 'maps/open-field.json',
    RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'custom-maps'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });
const clients = [];

try {
  const readyBy = Date.now() + TIMEOUT_MS;
  while (Date.now() < readyBy) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(Date.now() < readyBy, `Server did not start: ${logs}`);
  clients.push(connect(port), connect(port));
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'welcome')));
  const map = {
    id: 'archer-firing-approach', name: 'Archer Firing Approach', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: true, startingArmySize: 20,
    startingResources: { food: 500, wood: 1000 },
    spawnPoints: [{ team: 0, x: -14, z: 0 }, { team: 1, x: 14, z: 0 }],
    obstacles: [{ id: 'river', column: 31, row: 0, width: 2, height: 64, material: 'water' }],
    resourceNodes: [], triggers: [], scenarioEvents: [],
  };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'mapChange' && m.state.mapId === map.id)));
  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter((u) => u[1] === team && u[5] === 'worker');
    send(client, { type: 'build', buildingType: 'archery-range',
      ids: workers.map((u) => u[0]), unitGenerations: workers.map((u) => u[8]),
      x: team === 0 ? -3.5 : 3.5, z: 10.5, clientOrderToken: 1 });
    const notice = await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 1 && !m.message.startsWith('PLANNING'));
    assert.match(notice.message, /^ARCHERY RANGE PLACED/);
  }
  await clients[0].wait((m) => m.type === 'state' && m.buildings.length === 2 && m.buildings.every((b) => b.complete));
  const ranges = [0, 1].map((team) => clients[0].latest.buildings.find((b) => b.team === team));
  for (const [team, client] of clients.entries()) send(client, { type: 'trainArcher', buildingId: ranges[team].id });
  await Promise.all(clients.map((client, team) => client.wait((m) => m.type === 'state' && m.units.some((u) => u[1] === team && u[5] === 'archer'))));
  const archers = [0, 1].map((team) => clients[team].latest.units.find((u) => u[1] === team && u[5] === 'archer'));
  for (const [team, client] of clients.entries()) {
    const archer = archers[team];
    send(client, { type: 'move', ids: [archer[0]], unitGenerations: [archer[8]],
      x: team === 0 ? -8.5 : 8.5, z: 15.5, clientOrderToken: 2 });
    await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 2 && m.message === 'MOVE ORDER · 1 UNITS');
  }
  await checkpointWith(checkpointPath, (snapshot) => archers.every((archer, team) => {
    const u = snapshot.state.units[archer[0]];
    return Math.abs(u.x - (team === 0 ? -8.5 : 8.5)) < 0.1 && Math.abs(u.z - 15.5) < 0.1;
  }));
  for (const [team, client] of clients.entries()) {
    const archer = archers[team];
    const infantry = client.latest.units.find((u) => u[1] === team && u[5] === 'infantry');
    // Put infantry first to catch accidentally shared melee/ranged cached goals.
    send(client, { type: 'attackBuilding', ids: [infantry[0], archer[0]],
      unitGenerations: [infantry[8], archer[8]], buildingId: ranges[1 - team].id, clientOrderToken: 3 });
    assert.equal((await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 3)).message,
      'ATTACK BUILDING ORDER · 1 UNITS', 'only the Archer can approach a firing position across the river');
  }
  const routed = await checkpointWith(checkpointPath, (snapshot) => archers.every((archer, team) => {
    const u = snapshot.state.units[archer[0]];
    return u.attackBuildingTargetId === ranges[1 - team].id && u.path.length > 0;
  }));
  for (const [team, archer] of archers.entries()) {
    const u = routed.state.units[archer[0]];
    for (const cell of u.path) assert.ok(team === 0 ? cell % 64 < 31 : cell % 64 > 32,
      'approach path must stay on the Archer’s own river bank');
    const goal = { x: u.moveGoalCell % 64 - 31.5, z: Math.floor(u.moveGoalCell / 64) - 31.5 };
    const target = ranges[1 - team];
    assert.ok(Math.hypot(Math.max(0, Math.abs(goal.x - target.x) - 1.5),
      Math.max(0, Math.abs(goal.z - target.z) - 1.5)) <= 4.5, 'destination must be in weapon range');
  }
  // A fresh footprint invalidates flow fields while both Archers are approaching.
  // Their ranged attack must be repaired instead of cancelled for missing melee access.
  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter((u) => u[1] === team && u[5] === 'worker');
    send(client, { type: 'build', buildingType: 'barracks', ids: workers.map((u) => u[0]),
      unitGenerations: workers.map((u) => u[8]), x: team === 0 ? -14.5 : 14.5, z: 15.5, clientOrderToken: 4 });
    const notice = await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 4
      && (m.message.startsWith('BARRACKS PLACED') || m.message.startsWith('BUILD REJECTED')));
    assert.match(notice.message, /^BARRACKS PLACED/);
  }
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'state'
    && ranges.every((range) => m.buildings.find((b) => b.id === range.id)?.hp < range.hp))));
  const firing = await checkpointWith(checkpointPath, (snapshot) => archers.every((archer, team) => {
    const u = snapshot.state.units[archer[0]];
    return u.attackBuildingTargetId === ranges[1 - team].id && u.lastAttackTick > routed.state.tickNumber;
  }));
  for (const [team, archer] of archers.entries()) {
    const u = firing.state.units[archer[0]];
    assert.equal(Math.sign(u.x), team === 0 ? -1 : 1);
    assert.equal(u.path.length, 0);
  }
  for (const [team, client] of clients.entries()) {
    const archer = archers[team];
    const infantry = client.latest.units.find((u) => u[1] === team && u[5] === 'infantry');
    for (const [clientOrderToken, ids, generations, buildingId, expected] of [
      [5, [infantry[0]], [infantry[8]], ranges[1 - team].id, 'TARGET UNREACHABLE'],
      [6, [archer[0]], [archer[8] + 1], ranges[1 - team].id, 'SELECT MILITARY UNITS'],
      [7, [archers[1 - team][0]], [archers[1 - team][8]], ranges[1 - team].id, 'SELECT MILITARY UNITS'],
      [8, [archer[0]], [archer[8]], ranges[team].id, 'TARGET UNAVAILABLE'],
    ]) {
      send(client, { type: 'attackBuilding', ids, unitGenerations: generations, buildingId, clientOrderToken });
      assert.equal((await client.wait((m) => m.type === 'notice' && m.clientOrderToken === clientOrderToken)).message,
        `ATTACK BUILDING REJECTED · ${expected}`);
    }
  }
  const hiddenBuilders = clients[1].latest.units.filter((u) => u[1] === 1 && u[5] === 'worker');
  send(clients[1], { type: 'build', buildingType: 'barracks', ids: hiddenBuilders.map((u) => u[0]),
    unitGenerations: hiddenBuilders.map((u) => u[8]), x: 14.5, z: -20.5, clientOrderToken: 9 });
  const hiddenPlaced = await clients[1].wait((m) => m.type === 'notice' && m.clientOrderToken === 9
    && (m.message.startsWith('BARRACKS PLACED') || m.message.startsWith('BUILD REJECTED')));
  assert.match(hiddenPlaced.message, /^BARRACKS PLACED/);
  const hiddenState = await clients[1].wait((m) => m.type === 'state'
    && m.buildings.some((b) => b.x === 14.5 && b.z === -20.5));
  const hiddenBuilding = hiddenState.buildings.find((b) => b.x === 14.5 && b.z === -20.5);
  assert.ok(!clients[0].latest.buildings.some((b) => b.id === hiddenBuilding.id));
  send(clients[0], { type: 'attackBuilding', ids: [archers[0][0]], unitGenerations: [archers[0][8]],
    buildingId: hiddenBuilding.id, clientOrderToken: 9 });
  assert.equal((await clients[0].wait((m) => m.type === 'notice' && m.clientOrderToken === 9)).message,
    'ATTACK BUILDING REJECTED · TARGET UNAVAILABLE', 'hidden buildings must remain untargetable');
  console.log('Archer approach passed: both seats route to firing range across water, repair after placement, deal damage, and preserve melee/ownership/generation restrictions.');
} catch (error) {
  error.message += `\nServer logs:\n${logs}`;
  throw error;
} finally {
  await Promise.all(clients.map((client) => new Promise((resolve) => {
    if (client.socket.readyState === WebSocket.CLOSED) return resolve();
    client.socket.addEventListener('close', resolve, { once: true });
    client.socket.close();
  })));
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGINT');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(temp, { recursive: true, force: true });
}
