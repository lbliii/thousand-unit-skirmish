import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mapId = process.argv[2] || 'bellweather-millrace';
assert.ok(['bellweather-millrace', 'underbough-rootways'].includes(mapId));
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'regional-objectives-'));
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
    if (child.exitCode !== null || logs.includes('mapRejected') || Date.now() >= deadline) throw new Error(`${label}\n${logs}\n${JSON.stringify(clients.map(c => ({team:c.welcome?.player.team, tick:c.state?.tick, winner:c.state?.winner, hold:c.state?.victoryHold, clock:c.state?.matchElapsedSeconds, started:c.state?.scenarioClockStarted, objectives:c.state?.objectives, notices:c.messages.filter(m => m.type==='notice').slice(-3)})))}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['rts-v1']);
  const client = { socket, messages: [], state: null, welcome: null };
  clients.push(client);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'notice') client.messages.push(message);
    if (client.messages.length > 20) client.messages.shift();
    if (message.type === 'mapRejected') logs += JSON.stringify(message);
    if (message.type === 'welcome') client.welcome = message;
    if (['state', 'welcome', 'mapChange'].includes(message.type)) {
      client.state = message.type === 'state' ? message : message.state;
    }
  });
  await until(() => client.welcome, 'welcome');
  return client;
}
const definition = JSON.parse(await readFile(path.join(root, `maps/${mapId}.json`)));
const send = (client, command) => client.socket.send(JSON.stringify(command));
try {
  await until(() => logs.includes('http://'), 'server listening', 15_000);
  await connect(); await connect();
  for (const team of [0, 1]) {
    const client = clients[team];
    assert.equal(client.welcome.player.team, team);
    const ids = client.state.units.filter(row => row[1] === team && row[4] > 0 && row[5] !== 'worker').map(row => row[0]);
    assert.equal(ids.length, 8);
    const route = mapId === 'underbough-rootways'
      ? [definition.triggers[2], definition.triggers[team], definition.triggers[1-team]]
      : [definition.triggers[team], definition.triggers[1-team], definition.triggers[2]];
    for (const trigger of route) {
      const {column,row,width,height} = trigger.zone;
      send(client, {type:'move',ids,x:column+width/2-definition.width/2,z:row+height/2-definition.height/2});
      await until(() => client.state.objectives.find(o => o.id === trigger.id)?.owner === team,
        `${mapId} team ${team} capture ${trigger.id}`, 90_000);
      assert.ok(client.state.units.some(unit => ids.includes(unit[0]) && unit[4] > 0));
      console.log(`${mapId}: team ${team} captured ${trigger.name}`);
      if (client.state.winner === team) break;
    }
    await until(() => clients.every(c => c.state.winner === team), 'both seats agree on victory', 90_000);
    assert.equal(client.state.winnerReason, 'capture-hold');
    assert.ok(client.state.objectives.filter(o => o.victory).every(o => o.owner === team));
    send(clients[0], {type:'reset'});
    await until(() => clients.every(c => c.state.winner === -1
      && c.state.objectives.every(o => o.owner === -1)), 'authored rematch reset');
    assert.equal(client.state.armySize, 24);
    assert.equal(client.state.food[team], 150);
    assert.equal(client.state.wood[team], 250);
  }
  console.log(`${mapId}: authored 24-unit routes, both-seat capture/hold wins and rematches passed.`);
} finally {
  for (const client of clients) client.socket.close();
  child.kill('SIGTERM');
  await once(child,'exit');
  await rm(temporary,{recursive:true,force:true});
}
