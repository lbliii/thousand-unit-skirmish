import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeterministicPolicy, toOpponentObservation } from '../src/pve-opponent.mjs';

const mapId = 'forked-vale';
const reverseOrder = process.argv.includes('--reverse-order');
const swapSpawns = process.argv.includes('--swap-spawns');
const durationSeconds = Number(process.argv[2] ?? 300);
assert.ok(Number.isInteger(durationSeconds) && durationSeconds >= 60 && durationSeconds <= 930);
const seeds = [Number(process.argv[3] ?? 20260925), Number(process.argv[4] ?? 4294967295)];
assert.ok(seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff));
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'pve-contested-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(process.execPath, [path.join(root, 'server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1',
    RTS_GAME_MODE: 'pvp', RTS_MAP: `maps/${mapId}.json`, RTS_MATCH_STATE_PATH: path.join(temporary, 'match.json'),
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'maps') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });
const clients = [];
async function until(predicate, label, timeout = 40_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (child.exitCode !== null || logs.includes('mapRejected') || Date.now() >= deadline) throw new Error(`${label}\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const client = { socket, messages: [], state: null, welcome: null };
  clients.push(client);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    client.messages.push(message);
    if (message.type === 'mapRejected') logs += JSON.stringify(message);
    if (message.type === 'welcome') client.welcome = message;
    if (message.type === 'mapChange') client.welcome.map = message.map;
    if (['state', 'welcome', 'mapChange'].includes(message.type)) {
      client.state = message.type === 'state' ? message : message.state;
    }
  });
  await until(() => client.welcome, 'welcome');
  return client;
}
try {
  const readyBy = Date.now() + 10_000;
  while (true) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    assert.ok(Date.now() < readyBy, `server ready: ${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await connect();
  await connect();
  if (swapSpawns) {
    const swappedMap = structuredClone(clients[0].welcome.map);
    swappedMap.id = 'forked-vale-swapped-seats';
    swappedMap.name = 'FORKED VALE SWAPPED SEATS';
    swappedMap.spawnPoints = swappedMap.spawnPoints.map((spawn) => ({ ...spawn, team: 1 - spawn.team }));
    clients[0].socket.send(JSON.stringify({ type: 'publishMap', map: swappedMap }));
    await until(() => clients.every((client) => client.state.mapId === swappedMap.id), 'swapped spawn ownership');
  }
  const runs = clients.map((client, team) => ({
    client, team, seed: seeds[team], policy: createDeterministicPolicy(seeds[team]),
    shadow: createDeterministicPolicy(seeds[team]), lastTick: -Infinity,
    commands: [], seenSoldiers: new Set(), losses: new Set(), buildings: new Set(),
    firstCombatTick: null, lastCombatTick: null, firstTrainingTick: null,
    firstBuildingTick: null, lastObservation: null,
  }));
  const decisionOrder = reverseOrder ? [...runs].reverse() : runs;
  const startedAt = Date.now();
  let nextSampleAt = 0;
  const ownership = [];
  let previousOwners = '';
  while (Date.now() - startedAt < durationSeconds * 1000 && clients.every((client) => client.state.winner === -1)) {
    assert.equal(child.exitCode, null, `server must remain running: ${logs}`);
    for (const run of decisionOrder) {
      const state = run.client.state;
      if (state.tick - run.lastTick < 30) continue;
      run.lastTick = state.tick;
      const observation = toOpponentObservation(state, run.team, run.client.welcome.map);
      run.lastObservation = observation;
      const soldiers = observation.units.friendly.filter((u) => u.kind !== 'worker' && u.hp > 0);
      const live = new Set(soldiers.map((u) => `${u.id}:${u.generation}`));
      for (const key of run.seenSoldiers) if (!live.has(key)) run.losses.add(key);
      for (const key of live) run.seenSoldiers.add(key);
      for (const unit of soldiers) if (unit.lastAttack?.tick >= 0) {
        run.firstCombatTick ??= unit.lastAttack.tick;
        run.lastCombatTick = Math.max(run.lastCombatTick ?? 0, unit.lastAttack.tick);
      }
      for (const building of observation.buildings.friendly) {
        run.buildings.add(building.id);
        assert.ok(building.queue <= 1, 'one queued Infantry per producer');
        if (building.complete) run.firstBuildingTick ??= state.tick;
      }
      assert.ok(observation.buildings.friendly.length <= 1, 'one living Barracks');
      assert.ok(soldiers.length <= 12, 'military budget');
      assert.ok(observation.units.friendly.filter((u) => u.hp > 0).length <= 24, 'roster budget');
      const commands = run.policy.next(observation);
      assert.deepEqual(commands, run.shadow.next(structuredClone(observation)), 'same seed and observation trace yields identical commands');
      for (const command of commands) {
        if (command.type === 'train') run.firstTrainingTick ??= state.tick;
        run.commands.push({ tick: state.tick, command });
        run.client.socket.send(JSON.stringify({ ...command, clientOrderToken: run.commands.length }));
      }
    }
    const owners = clients[0].state.objectives.map((o) => ({ id: o.id, owner: o.owner }));
    if (JSON.stringify(owners) !== previousOwners) {
      previousOwners = JSON.stringify(owners);
      ownership.push({ tick: clients[0].state.tick, owners });
    }
    if (Date.now() - startedAt >= nextSampleAt) {
      nextSampleAt += 30_000;
      const sample = { seconds: Math.round((Date.now() - startedAt) / 1000), tick: clients[0].state.tick,
        seats: runs.map((run) => ({ team: run.team,
          military: run.lastObservation?.units.friendly.filter((u) => u.kind !== 'worker' && u.hp > 0).length,
          losses: run.losses.size, resources: run.lastObservation?.resources,
          buildings: run.lastObservation?.buildings.friendly.map((b) => ({ id: b.id, complete: b.complete, queue: b.queue })),
          lastCombatTick: run.lastCombatTick, commands: run.commands.length })), owners };
      console.log(JSON.stringify({ sample }));
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const winner = clients.find((client) => client.state.winner !== -1)?.state.winner ?? -1;
  if (winner !== -1) {
    await until(() => clients.every((client) => client.state.winner === winner), 'both seats agree on result');
    assert.ok([0, 1, 2].includes(winner));
  }
  for (const run of runs) {
    assert.ok(run.commands.some(({ command }) => command.type === 'gather'));
    assert.ok(run.commands.some(({ command }) => command.type === 'attackMove'));
    assert.ok(run.firstBuildingTick !== null && run.firstTrainingTick !== null, 'contested opening reaches production');
    assert.ok(run.firstCombatTick !== null && run.losses.size > 0, 'both active armies fight and suffer losses');
  }
  console.log(JSON.stringify({ result: winner === -1 ? 'bounded-unresolved' : 'finished', winner,
    map: clients[0].state.mapId, seeds, decisionOrder: decisionOrder.map((run) => run.team), swapSpawns, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), ownership,
    seats: runs.map((run) => ({ team: run.team, firstCombatTick: run.firstCombatTick,
      lastCombatTick: run.lastCombatTick, firstBuildingTick: run.firstBuildingTick,
      firstTrainingTick: run.firstTrainingTick, observedSoldiers: run.seenSoldiers.size,
      losses: run.losses.size, commands: run.commands,
      notices: run.client.messages.filter((m) => m.type === 'notice').slice(-8) })) }));

} finally {
  for (const { socket } of clients) socket.close();
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
