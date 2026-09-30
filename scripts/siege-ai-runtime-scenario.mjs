import { createProductionPolicy } from '../src/pve-production.mjs';
import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS, TECHNOLOGY_DEFINITIONS } from '../src/gameplay-definitions.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolate real AI acquisition and siege targeting; ordinary troops hold their opening positions.
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
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-siege-ai-'));
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
  const map = { id: 'siege-ai-acquisition', name: 'Siege AI Acquisition', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 24, startingResources: { food: 3000, wood: 3000 },
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [] };
  send(clients[0], { type: 'publishMap', map });
  await Promise.all(clients.map(client => client.wait(m => m.type === 'mapChange' && m.state.mapId === map.id)));
  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter(u => u[1] === team && u[5] === 'worker').map(u => u[0]);
    send(client, { type: 'build', ids: workers.slice(0, 2), buildingType: 'barracks', x: team ? 15.5 : -15.5, z: -6.5 });
    send(client, { type: 'build', ids: workers.slice(2), buildingType: 'watchtower', x: team ? 8.5 : -8.5, z: 8.5 });
  }
  await checkpointWith(checkpointPath, s => s.state.buildings.length === 4); await stop();
  const baseline = JSON.parse(await readFile(checkpointPath, 'utf8'));
  baseline.state.seatSessions = [];
  for (const unit of baseline.state.units) if (unit.kind === 'worker') Object.assign(unit, { buildingTargetId: null,
    repairing: false, path: [], pathIndex: 0, movePlanningPending: false, moveGoalCell: -1 });
  for (const building of baseline.state.buildings) { building.complete = true; building.progress = 1; }
  const results = [];
  const teams = process.argv[2] === undefined ? [0, 1] : [Number(process.argv[2])];
  assert.ok(teams.every(team => team === 0 || team === 1));
  for (const team of teams) {
    await writeFile(checkpointPath, JSON.stringify(baseline)); await start();
    const production = createProductionPolicy(42), tactics = createDeterministicPolicy(42), commands = [];
    const tower = baseline.state.buildings.find(building => building.team !== team && building.type === 'watchtower');
    let lastTick = -Infinity, engines = [], destroyed = false;
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline && !destroyed) {
      const state = clients[team].latest;
      // The harness supplies only checkpoint tick cadence when idle snapshots
      // are coalesced. All tactical/economic inputs still come from the DTO.
      const clock = JSON.parse(await readFile(checkpointPath, 'utf8'));
      const tick = clock.state.tickNumber;
      if (tick - lastTick >= 30) {
        const observation = toOpponentObservation({ ...state, tick }, team, map);
        lastTick = tick;
        engines = observation.units.friendly.filter(unit => unit.kind === 'siege-engine');
        assert.ok(engines.length <= 2, 'bounded engine roster');
        const acquisition = production.next(observation);
        const assaults = engines.length ? tactics.next(observation).filter(command => command.type === 'attackBuilding') : [];
        for (const command of [...acquisition, ...assaults]) {
          commands.push({ tick, command }); send(clients[team], command);
        }
        destroyed = !state.buildings.some(building => building.id === tower.id);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(destroyed, JSON.stringify({ team, commands, notices: clients[team].latest, logs: logs.slice(-1000) }));
    assert.ok(commands.some(({ command }) => command.upgrade === 'military-tier-2'));
    assert.ok(commands.some(({ command }) => command.buildingType === 'workshop'));
    assert.ok(commands.some(({ command }) => command.upgrade === 'siege-engineering'));
    assert.ok(commands.some(({ command }) => command.kind === 'siege-engine'));
    assert.ok(commands.some(({ command }) => command.type === 'attackBuilding' && command.buildingId === tower.id));
    const saved = await checkpointWith(checkpointPath, checkpoint => !checkpoint.state.buildings.some(building => building.id === tower.id));
    assert.equal(saved.state.teamUpgrades[team].militaryTier2, true);
    assert.equal(saved.state.teamUpgrades[team].siegeEngineering, true);
    const acquired = saved.state.buildings.filter(building => building.team === team && building.type === 'workshop');
    assert.equal(acquired.length, 1);
    assert.ok(engines.length > 0 && engines.every(unit => unit.hp === 90), 'pathing finds firing positions outside tower range');
    const paid = { food: 0, wood: 0 };
    const add = definition => { paid.food += definition.cost.food; paid.wood += definition.cost.wood; };
    for (const building of saved.state.buildings) if (building.team === team && !baseline.state.buildings.some(original => original.id === building.id)) add(BUILDING_DEFINITIONS[building.type]);
    for (const unit of saved.state.units) if (unit.team === team && unit.id >= baseline.state.units.length) add(UNIT_DEFINITIONS[unit.kind]);
    // Costs are charged when queued, before a unit spawns or research completes.
    // A policy decision on the tower's final tick can leave a paid Rider pending.
    for (const building of saved.state.buildings) if (building.team === team) {
      for (const kind of building.productionQueue) add(UNIT_DEFINITIONS[kind]);
    }
    for (let count = 0; count < saved.state.workerProduction[team].queue; count++) add(UNIT_DEFINITIONS.worker);
    if (saved.state.teamResearch[team]) add(TECHNOLOGY_DEFINITIONS[saved.state.teamResearch[team].type]);
    for (const technology of Object.values(TECHNOLOGY_DEFINITIONS)) if (saved.state.teamUpgrades[team][technology.upgradeKey]
      && !baseline.state.teamUpgrades[team][technology.upgradeKey]) add(technology);
    assert.equal(saved.state.teamFood[team], baseline.state.teamFood[team] - paid.food, 'exact paid AI food ledger');
    assert.equal(saved.state.teamWood[team], baseline.state.teamWood[team] - paid.wood, 'exact paid AI wood ledger');
    results.push({ team, tick: saved.state.tickNumber, engines: engines.length,
      survivingEngineHp: engines.map(unit => unit.hp), acquisition: commands.filter(({ command }) => ['build', 'researchUpgrade', 'trainUnit'].includes(command.type)) });
    await stop();
  }
  console.log(JSON.stringify({ passed: 'Live AI paid tier, Workshop, unlock, engine production and defended-position assault; ordinary army held stationary to isolate the siege role', results }));
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
