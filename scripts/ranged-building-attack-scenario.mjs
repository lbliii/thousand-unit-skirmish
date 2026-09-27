import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// An archer already in range must not require a walking route to a building.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 40_000;
const EDGE_RANGE_REPAIR = process.argv.includes('--edge-range-repair');

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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-ranged-building-'));
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
    id: 'ranged-building-wall', name: 'Ranged Building Wall', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 20,
    startingResources: { food: 500, wood: 1000 },
    spawnPoints: [{ team: 0, x: -14, z: 0 }, { team: 1, x: 14, z: 0 }],
    obstacles: [],
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
  await clients[0].wait((m) => m.type === 'state' && [0, 1].every((team) => m.units.some((u) => u[1] === team && u[5] === 'archer')));
  const archers = [0, 1].map((team) => clients[0].latest.units.find((u) => u[1] === team && u[5] === 'archer'));
  for (const [team, client] of clients.entries()) {
    const archer = archers[team];
    send(client, { type: 'move', ids: [archer[0]], unitGenerations: [archer[8]],
      x: team === 0 ? -1.5 : 1.5, z: 10.5, clientOrderToken: 2 });
    await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 2 && m.message === 'MOVE ORDER · 1 UNITS');
  }
  await checkpointWith(checkpointPath, (snapshot) => archers.every((archer, team) => {
    const u = snapshot.state.units[archer[0]];
    return Math.abs(u.x - (team === 0 ? -1.5 : 1.5)) < 0.1 && Math.abs(u.z - 10.5) < 0.1;
  }));
  // Restore an authored disconnected battlefield with the real constructed roster.
  // Keep the combat fixture independent of the placement rules under test.
  for (const client of clients) client.socket.close();
  const stopped = once(child, 'exit');
  child.kill('SIGINT');
  await stopped;
  const fixture = JSON.parse(await readFile(checkpointPath, 'utf8'));
  fixture.mapDefinition.obstacles = [{ id: 'wall', column: EDGE_RANGE_REPAIR ? 30 : 31,
    row: 0, width: EDGE_RANGE_REPAIR ? 4 : 2, height: 64 }];
  if (EDGE_RANGE_REPAIR) {
    // Actual range is ~4.451, while the current cell center is ~4.528 away.
    // The friendly Range occupies the neighboring cells that could otherwise fire.
    for (const [team, archer] of archers.entries()) {
      const unit = fixture.state.units[archer[0]];
      unit.x = team === 0 ? -2.45 : 2.45;
      unit.z = 8.9;
      unit.path = [];
      unit.pathIndex = 0;
    }
  }
  fixture.mapHash = createHash('sha256').update(JSON.stringify(fixture.mapDefinition)).digest('base64url');
  fixture.state.seatSessions = [];
  await writeFile(checkpointPath, JSON.stringify(fixture));
  child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1',
      RTS_MATCH_STATE_PATH: checkpointPath, RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'custom-maps') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const restoredBy = Date.now() + TIMEOUT_MS;
  while (Date.now() < restoredBy) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  clients.length = 0;
  clients.push(connect(port), connect(port));
  const welcomes = await Promise.all(clients.map((client) => client.wait((m) => m.type === 'welcome')));
  for (const [team, welcome] of welcomes.entries()) {
    assert.equal(welcome.player.team, team);
    assert.equal(welcome.state.mapId, map.id, 'must restore the fixture');
  }
  for (const [team, client] of clients.entries()) {
    const archer = archers[team];
    // Infantry at its remote spawn still cannot attack across the disconnected map.
    const infantry = client.latest.units.find((u) => u[1] === team && u[5] === 'infantry');
    send(client, { type: 'attackBuilding', ids: [infantry[0]], unitGenerations: [infantry[8]],
      buildingId: ranges[1 - team].id, clientOrderToken: 3 });
    assert.equal((await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 3)).message,
      'ATTACK BUILDING REJECTED · TARGET UNREACHABLE');
    send(client, { type: 'attackBuilding', ids: [archer[0]], unitGenerations: [archer[8]],
      buildingId: ranges[1 - team].id, clientOrderToken: 4 });
    assert.equal((await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 4)).message,
      'ATTACK BUILDING ORDER · 1 UNITS', 'an in-range archer must not need a walking route across the wall');
  }
  await Promise.all(clients.map((client) => client.wait((m) => m.type === 'state'
    && ranges.every((range) => m.buildings.find((b) => b.id === range.id)?.hp < range.hp))));
  const firing = await checkpointWith(checkpointPath, (snapshot) => archers.every((archer, team) => {
    const u = snapshot.state.units[archer[0]];
    return u.attackBuildingTargetId === ranges[1 - team].id && u.lastAttackTick > 0;
  }));
  for (const [team, archer] of archers.entries()) {
    assert.equal(firing.state.units[archer[0]].path.length, 0, 'archer should fire without walking');
    assert.equal(Math.sign(firing.state.units[archer[0]].x), team === 0 ? -1 : 1);
  }
  // Existing ranged combat across islands must not make unrelated construction invalid.
  for (const attackType of EDGE_RANGE_REPAIR ? ['attackBuilding'] : ['attackBuilding', 'attack']) {
    for (const [team, client] of clients.entries()) {
      if (attackType === 'attack') {
        send(client, { type: 'attack', ids: [archers[team][0]], unitGenerations: [archers[team][8]],
          targetId: archers[1 - team][0], targetGeneration: archers[1 - team][8], clientOrderToken: 6 });
        assert.equal((await client.wait((m) => m.type === 'notice' && m.clientOrderToken === 6)).message,
          'ATTACK ORDER · 1 UNITS');
      }
      const workers = client.latest.units.filter((u) => u[1] === team && u[5] === 'worker');
      const clientOrderToken = attackType === 'attackBuilding' ? 5 : 7;
      send(client, { type: 'build', buildingType: 'barracks', ids: workers.map((u) => u[0]),
        unitGenerations: workers.map((u) => u[8]),
        x: (team === 0 ? -1 : 1) * (attackType === 'attackBuilding' ? 10.5 : 16.5),
        z: 12.5, clientOrderToken });
      const placed = await client.wait((m) => m.type === 'notice' && m.clientOrderToken === clientOrderToken
        && (m.message.startsWith('BARRACKS PLACED') || m.message.startsWith('BUILD REJECTED')));
      assert.match(placed.message, /^BARRACKS PLACED/, `${attackType} across islands must not block local building`);
      if (EDGE_RANGE_REPAIR) {
        const afterBuild = await checkpointWith(checkpointPath, (snapshot) => snapshot.state.buildings.length >= 3 + team);
        for (const [firingTeam, archer] of archers.entries()) {
          const unit = afterBuild.state.units[archer[0]];
          const enemy = ranges[1 - firingTeam];
          const distance = (point) => Math.hypot(Math.max(0, Math.abs(point.x - enemy.x) - 1.5),
            Math.max(0, Math.abs(point.z - enemy.z) - 1.5));
          assert.ok(distance(unit) > 4.4 && distance(unit) < 4.5, 'unit remains just inside weapon range');
          assert.ok(distance({ x: Math.floor(unit.x) + 0.5, z: Math.floor(unit.z) + 0.5 }) > 4.5,
            'its cell center remains outside weapon range');
          assert.equal(unit.attackBuildingTargetId, enemy.id,
            'unrelated construction must preserve both accepted in-range building attacks');
          assert.equal(unit.path.length, 0, 'in-range archers must not be sent walking');
        }
        await checkpointWith(checkpointPath, (snapshot) => archers.every((archer) => (
          snapshot.state.units[archer[0]].lastAttackTick > afterBuild.state.tickNumber
        )));
      }

    }
  }
  console.log(EDGE_RANGE_REPAIR
    ? 'Building range-edge repair passed: both seats keep firing after each unrelated placement with their cell centers outside weapon range.'
    : 'Ranged building attack passed: both seats fire across disconnected terrain; unreachable infantry rejected.');
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
