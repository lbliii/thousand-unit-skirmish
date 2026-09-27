import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exact lethal-hit fairness across unit classes and swapped seat/ID ordering.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PATH = path.join(ROOT, 'server.mjs');
const TIMEOUT_MS = 45_000;

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

const port = await freePort();
const temp = await mkdtemp(path.join(os.tmpdir(), 'rts-lethal-fairness-'));
const checkpointPath = path.join(temp, 'match.json');
let child;
let logs = '';
const clients = [];
async function start() {
  child = spawn(process.execPath, [SERVER_PATH], { cwd: ROOT, env: { ...process.env,
    PORT: String(port), RTS_HOST: '127.0.0.1', RTS_MATCH_STATE_PATH: checkpointPath,
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temp, 'maps') }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 10));
  }
  assert.ok(Date.now() < deadline, logs);
  clients.push(connect(port), connect(port));
  await Promise.all(clients.map(c => c.wait(m => m.type === 'welcome')));
}
async function stop() {
  if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGINT'); await exited; }
  clients.splice(0).forEach(c => c.socket.close());
}
try {
  await start();
  send(clients[0], { type: 'publishMap', map: {
    id: 'lethal-fairness', name: 'Lethal Fairness', width: 40, height: 40,
    startingArmySize: 8, fogOfWar: false, startingResources: { food: 0, wood: 0 },
    spawnPoints: [{ team: 0, x: -12, z: 0 }, { team: 1, x: 12, z: 0 }],
    obstacles: [], resourceNodes: [], triggers: [], scenarioEvents: [],
  } });
  await clients[0].wait(m => m.type === 'mapChange' && m.map.id === 'lethal-fairness');
  await stop();
  const initial = JSON.parse(await readFile(checkpointPath, 'utf8'));
  for (let slot = 0; slot < 4; slot++) assert.equal(initial.state.units[slot].attackCooldown,
    initial.state.units[slot+4].attackCooldown, 'opening cadence must match by team slot');
  const results = [];
  for (const [kind, damage] of [['worker', 4], ['infantry', 10], ['archer', 7]]) {
    for (const lowerIdTeam of [0, 1]) {
      for (const strikes of [1, 3, 'staggered']) {
        const fixture = structuredClone(initial);
        fixture.state.seatSessions = [];
        fixture.state.scenarioClockStarted = true;
        for (const unit of fixture.state.units) unit.hp = 0;
        for (const [id, enemyId] of [[0, 4], [4, 0]]) {
          const team = id === 0 ? lowerIdTeam : 1-lowerIdTeam;
          Object.assign(fixture.state.units[id], {
            team, kind, x: team ? .5 : -.5, z: .5, hp: damage * (strikes === 3 ? 3 : 1),
            attackTargetId: enemyId, attackCooldown: strikes === 1 || strikes === 'staggered' && id === 0 ? 0 : .4,
            repathTimer: 0, lastAttackCell: -1, lastAttackTick: -1,
          });
        }
        await writeFile(checkpointPath, JSON.stringify(fixture));
        await start();
        const hits = new Map();
        const collect = state => {
          for (const row of state?.units || []) {
            if (row[0] !== 0 && row[0] !== 4) continue;
            if (row[11] >= 0) {
              if (!hits.has(row[0])) hits.set(row[0], new Set());
              hits.get(row[0]).add(row[11]);
            }
          }
        };
        // The delayed three-hit case exposes every strike through state updates.
        for (const client of clients) collect(client.latest);
        clients[0].socket.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.type === 'state') collect(message);
        });
        if (clients[0].latest.winner < 0) await clients[0].wait(m => m.type === 'state' && m.winner >= 0);
        await stop();
        const result = JSON.parse(await readFile(checkpointPath, 'utf8'));
        const fighters = [result.state.units[0], result.state.units[4]];
        if (strikes === 'staggered') {
          assert.deepEqual(fighters.map(u => u.hp), [damage, 0], 'a future counterattack must not fire early');
          assert.equal(fighters[1].lastAttackTick, -1);
          assert.equal(result.state.matchWinner, lowerIdTeam, 'the attacker whose hit is due wins');
        } else {
          assert.deepEqual(fighters.map(u => u.hp), [0, 0], `${kind}: both lethal hits must land`);
          assert.equal(fighters[0].lastAttackTick, fighters[1].lastAttackTick, 'final strikes must share a tick');
          assert.equal(result.state.matchWinner, 2, 'mutual elimination must draw');
        }
        assert.equal(result.state.matchWinnerReason, 'elimination');
        if (strikes === 3) {
          const ticks = [...hits.get(0)];
          assert.equal(ticks.length, 3, 'observe all three attacks');
          assert.deepEqual(ticks, [...hits.get(4)], 'attack cadence must be identical across seats');
          assert.equal(ticks[1]-ticks[0], ticks[2]-ticks[1], 'repeat cadence must remain consistent');
        }
        results.push({ kind, lowerIdTeam, strikes, finalStrikeTick: fighters[0].lastAttackTick });
      }
    }
  }
  console.log(JSON.stringify({ passed: 'simultaneous lethal damage and equal cadence under both seat/ID orders', results }, null, 2));
} finally { await stop(); await rm(temp, { recursive: true, force: true }); }
