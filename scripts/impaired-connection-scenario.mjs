import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delayMs = 40;
const timeoutMs = 15_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-impaired-'));
const clients = [];
const relays = [];
let child;
let output = '';

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

// Delay ordered TCP bytes in each direction. This is not IP packet-loss emulation.
async function relay(port) {
  const peers = new Set();
  const observedDelays = [];
  const listener = createServer((downstream) => {
    const upstream = createConnection({ host: '127.0.0.1', port });
    const timers = new Set();
    const peer = { suppressReplies: false, drop };
    peers.add(peer);
    function drop() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      downstream.destroy(); upstream.destroy(); peers.delete(peer);
    }
    for (const socket of [downstream, upstream]) {
      socket.on('error', drop);
      socket.on('close', drop);
      socket.setNoDelay(true);
    }
    function transfer(source, destination, replies) {
      source.on('data', (chunk) => {
        if (replies && peer.suppressReplies) return;
        const started = performance.now();
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (destination.destroyed || (replies && peer.suppressReplies)) return;
          observedDelays.push(performance.now() - started);
          if (!destination.write(chunk)) {
            source.pause();
            destination.once('drain', () => source.resume());
          }
        }, delayMs);
        timers.add(timer);
      });
    }
    transfer(downstream, upstream, false);
    transfer(upstream, downstream, true);
  });
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const result = { port: listener.address().port, peers, observedDelays,
    async close() { for (const peer of peers) peer.drop(); await new Promise((r) => listener.close(r)); } };
  relays.push(result);
  return result;
}

async function connect(proxy, token = null) {
  const protocols = token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1'];
  const socket = new WebSocket(`ws://127.0.0.1:${proxy.port}/ws`, protocols);
  const messages = [];
  const client = { socket, messages, latest: null,
    send(command) { socket.send(JSON.stringify(command)); },
    async wait(predicate, start = 0) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = messages.slice(start).find(predicate);
        if (found) return found;
        await sleep(10);
      }
      throw new Error(`Timed out waiting for message; recent: ${JSON.stringify(messages.slice(-2))}`);
    } };
  socket.addEventListener('error', () => {});
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    messages.push(message);
    if (message.type === 'state') client.latest = message;
    if (message.state) client.latest = message.state;
  });
  clients.push(client);
  client.welcome = await client.wait((m) => m.type === 'welcome');
  client.peer = [...proxy.peers].at(-1);
  return client;
}

async function resume(proxy, token) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const client = await connect(proxy, token);
    if (!client.welcome.player.resumePending) return client;
    await client.wait((m) => m.type === 'resumeAvailable');
    client.peer.drop();
  }
  throw new Error('Seat did not become reclaimable after the resume handshake');
}

try {
  const port = await freePort();
  child = spawn(process.execPath, ['server.mjs'], { cwd: root,
    env: { ...process.env, RTS_HOST: '127.0.0.1', PORT: String(port), RTS_GAME_MODE: 'pvp',
      RTS_MAP: 'maps/open-field.json', RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'maps'),
      RTS_MATCH_STATE_PATH: path.join(temporary, 'match.json'), RTS_SESSION_GRACE_MS: '30000' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (s) => { output += s; });
  child.stderr.on('data', (s) => { output += s; });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (child.exitCode !== null || child.signalCode !== null || Date.now() > deadline) throw new Error(output);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await sleep(25);
  }
  const proxies = [await relay(port), await relay(port)];
  const seats = [await connect(proxies[0]), await connect(proxies[1])];
  for (const team of [0, 1]) assert.equal(seats[team].welcome.player.team, team);
  const map = { id: 'impaired-connection-check', name: 'Delayed Connection', width: 64, height: 64,
    terrainSeed: 19, fogOfWar: false, startingArmySize: 24, startingResources: { food: 1000, wood: 1000 },
    spawnPoints: [{ team: 0, x: -20, z: 0 }, { team: 1, x: 20, z: 0 }],
    resourceNodes: [], obstacles: [], triggers: [], scenarioEvents: [] };
  seats[0].send({ type: 'publishMap', map });
  await Promise.all(seats.map((c) => c.wait((m) => m.type === 'mapChange' && m.map.id === map.id)));
  const results = [];
  for (const team of [0, 1]) {
    let client = seats[team];
    const token = client.welcome.player.sessionToken;
    const opponent = seats[1 - team];
    const worker = client.latest.units.find((u) => u[1] === team && u[5] === 'worker');
    const moveToken = 100 + team;
    const started = performance.now();
    client.send({ type: 'move', ids: [worker[0]], unitGenerations: [worker[8]],
      x: team ? 19 : -19, z: 4, clientOrderToken: moveToken });
    await client.wait((m) => m.type === 'notice' && m.clientOrderToken === moveToken && m.message.startsWith('MOVE ORDER'));
    const acknowledgementMs = performance.now() - started;
    assert.ok(acknowledgementMs >= delayMs * 2 - 5, 'acknowledgement must traverse both delayed directions');
    const woodBefore = client.latest.wood[team];
    const build = { type: 'build', ids: [worker[0]], unitGenerations: [worker[8]],
      buildingType: 'barracks', x: team ? 14.5 : -14.5, z: 8.5, clientOrderToken: 200 + team };
    // Lose feedback after the server accepts: observe acceptance from the other seat.
    client.peer.suppressReplies = true;
    client.send(build);
    await opponent.wait((m) => m.type === 'state' && m.buildings.some((b) => b.team === team));
    client.peer.drop();
    client = seats[team] = await resume(proxies[team], token);
    assert.equal(client.welcome.player.team, team);
    assert.equal(client.welcome.player.resumed, true);
    assert.equal(client.latest.buildings.filter((b) => b.team === team).length, 1);
    assert.equal(client.latest.wood[team], woodBefore - 175, 'accepted build debits once through reconnect');
    const acceptedWood = client.latest.wood[team];
    // Lose the next command before the relay forwards it. Never replay uncertain orders.
    client.send({ ...build, z: -8.5, clientOrderToken: 300 + team });
    client.peer.drop();
    client = seats[team] = await resume(proxies[team], token);
    assert.equal(client.welcome.player.team, team);
    assert.equal(client.welcome.player.resumed, true);
    const from = client.messages.length;
    const state = await client.wait((m) => m.type === 'state', from);
    assert.equal(state.buildings.filter((b) => b.team === team).length, 1);
    assert.equal(state.wood[team], acceptedWood, 'undelivered build cannot spend resources');
    assert.equal(state.units.find((u) => u[0] === worker[0])[1], team);
    const recoveredToken = 400 + team;
    client.send({ type: 'move', ids: [worker[0]], unitGenerations: [worker[8]],
      x: team ? 19 : -19, z: -4, clientOrderToken: recoveredToken });
    await client.wait((m) => m.type === 'notice' && m.clientOrderToken === recoveredToken
      && m.message.startsWith('MOVE ORDER'));
    results.push({ team, acknowledgementMs: Number(acknowledgementMs.toFixed(2)),
      acceptedBuilds: 1, woodAfter: state.wood[team], resumedTwice: true });
  }
  const delays = proxies.flatMap((p) => p.observedDelays).sort((a, b) => a - b);
  console.log(JSON.stringify({ passed: true, sourceProfile: 'ordered TCP stream delay plus forced connection reset',
    configuredOneWayDelayMs: delayMs, measuredRelayDelayMs: {
      samples: delays.length, min: Number(delays[0].toFixed(2)),
      p95: Number(delays[Math.ceil(delays.length * .95) - 1].toFixed(2)) }, results }, null, 2));
} finally {
  for (const proxy of relays) await proxy.close();
  for (const client of clients) client.socket.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const done = once(child, 'exit'); child.kill('SIGINT');
    await Promise.race([done, sleep(3000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; }
  }
  await rm(temporary, { recursive: true, force: true });
}
