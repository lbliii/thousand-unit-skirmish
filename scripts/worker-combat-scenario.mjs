import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'rts-worker-combat-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    RTS_HOST: '127.0.0.1',
    RTS_MAP: 'maps/open-field.json',
    RTS_MATCH_STATE_PATH: path.join(temporary, 'checkpoint.json'),
    RTS_CUSTOM_MAP_DIRECTORY: path.join(temporary, 'custom-maps'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });
const clients = [];

function unit(state, id) {
  return state.units.find(row => row[0] === id);
}

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const messages = [];
  const waiters = [];
  const client = {
    socket, messages,
    waitFor(predicate, after = 0, timeoutMs = 35_000) {
      const found = messages.slice(after).find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate, after, resolve,
          timeout: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`message timeout: ${JSON.stringify(messages.slice(-3))}`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
    send(command) { socket.send(JSON.stringify(command)); },
  };
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (messages.length <= waiter.after || !waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  clients.push(client);
  const welcome = await client.waitFor(message => message.type === 'welcome');
  client.team = welcome.player.team;
  return client;
}

try {
  const healthDeadline = Date.now() + 15_000;
  let healthy = false;
  while (Date.now() < healthDeadline) {
    if (server.exitCode !== null) throw new Error(`server exited: ${serverLog}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(healthy, true, `server did not become healthy: ${serverLog}`);

  const azure = await connect();
  const ember = await connect();
  assert.equal(azure.team, 0);
  assert.equal(ember.team, 1);
  const map = JSON.parse(await readFile(path.join(root, 'maps/open-field.json'), 'utf8'));
  map.id = 'worker-duel';
  map.name = 'WORKER DUEL';
  map.fogOfWar = false;
  map.startingArmySize = 10;
  map.spawnPoints = [{ team: 0, x: -8, z: 0 }, { team: 1, x: 8, z: 0 }];
  const azureStart = azure.messages.length;
  const emberStart = ember.messages.length;
  azure.send({ type: 'publishMap', map });
  const [azureMap, emberMap] = await Promise.all([
    azure.waitFor(message => message.type === 'mapChange' && message.map?.id === map.id, azureStart),
    ember.waitFor(message => message.type === 'mapChange' && message.map?.id === map.id, emberStart),
  ]);
  assert.equal(azureMap.state.armySize, 10);
  assert.equal(emberMap.state.armySize, 10);

  async function duel(azureId, emberId) {
    const start = azure.messages.length;
    // mapChange carries the new snapshot before the next ordinary state tick.
    // Do not select a stale pre-publication state from the previous army size.
    const message = [...azure.messages].reverse().find(message => message.type === 'state'
      || message.type === 'mapChange');
    const latest = message?.type === 'mapChange' ? message.state : message ?? azureMap.state;
    const a = unit(latest, azureId);
    const b = unit(latest, emberId);
    assert.equal(a[1], 0);
    assert.equal(b[1], 1);
    azure.send({ type: 'attack', ids: [azureId], targetId: emberId });
    ember.send({ type: 'attack', ids: [emberId], targetId: azureId });
    const resolved = await azure.waitFor(message => message.type === 'state'
      && (unit(message, azureId)?.[4] === 0 || unit(message, emberId)?.[4] === 0), start);
    const azureHp = unit(resolved, azureId)[4];
    const emberHp = unit(resolved, emberId)[4];
    return {
      azureKind: a[5], emberKind: b[5], azureHp, emberHp,
      winner: azureHp > 0 ? 'azure' : emberHp > 0 ? 'ember' : 'draw',
    };
  }

  const first = await duel(0, 9);
  const resetStart = azure.messages.length;
  azure.send({ type: 'reset' });
  const reset = await azure.waitFor(message => message.type === 'state' && message.armySize === 10
    && unit(message, 0)?.[4] === 100 && unit(message, 9)?.[4] === 100, resetStart);
  assert.equal(reset.armySize, 10);
  const second = await duel(4, 5);
  console.log(JSON.stringify({ first, second }));
  assert.equal(first.winner, 'ember', 'Ember infantry should defeat Azure worker');
  assert.equal(second.winner, 'azure', 'Azure infantry should defeat Ember worker');
  assert.ok(first.azureHp === 0 && first.emberHp < 100);
  assert.ok(second.emberHp === 0 && second.azureHp < 100);
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  for (const client of clients) client.socket.close();
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  }
  await rm(temporary, { recursive: true, force: true });
}
