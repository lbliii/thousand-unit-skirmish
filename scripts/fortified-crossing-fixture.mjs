// Disposable authoritative worker/clients shared by the milestone proof and scale runner.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function createFortifiedFixture({ mapPath = 'maps/fortified-crossing.json', timeoutMs = 90_000, diagnostics = false } = {}) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rts-fortified-'));
  const checkpointPath = path.join(directory, 'match.json');
  const clients = new Set(); let child = null, logs = '';
  async function stop() {
    for (const client of clients) client.socket.close();
    clients.clear();
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGINT');
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
    }
    child = null;
  }
  async function start() {
    child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { cwd: ROOT,
      env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1', RTS_GAME_MODE: 'pvp',
        RTS_MAP: mapPath, RTS_MATCH_STATE_PATH: checkpointPath,
        RTS_CUSTOM_MAP_DIRECTORY: path.join(directory, 'custom'),
        ...(diagnostics ? { RTS_TICK_DIAGNOSTICS: '1', RTS_SEPARATION_DIAGNOSTICS: '1' } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'] });
    for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
      try { if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      await sleep(50);
    }
    throw new Error(`Worker startup timeout: ${logs}`);
  }
  async function connect(team, token = null) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, token ? ['rts-v1', `rts-resume.${token}`] : ['rts-v1']);
    const pending = new Set(), messages = []; let latest = null, closed = false;
    function finish(waiter, error, message) { pending.delete(waiter); clearTimeout(waiter.timer); error ? waiter.reject(error) : waiter.resolve(message); }
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); messages.push(message);
      if (message.type === 'state') latest = message;
      else if (message.type === 'welcome' || message.type === 'mapChange') latest = message.state;
      for (const waiter of pending) if (waiter.predicate(message)) finish(waiter, null, message);
    });
    socket.addEventListener('close', () => {
      closed = true;
      for (const waiter of pending) finish(waiter, new Error(`Connection closed while waiting: ${waiter.description}; worker log: ${logs}`));
    });
    function wait(predicate, description = 'message', after = 0) {
      const message = messages.slice(after).find(predicate); if (message) return Promise.resolve(message);
      if (closed) return Promise.reject(new Error(`Connection already closed: ${description}`));
      return new Promise((resolve, reject) => {
        const waiter = { predicate, description, resolve, reject };
        waiter.timer = setTimeout(() => finish(waiter, new Error(`${description} timeout at tick ${latest?.tick}: ${logs}`)), timeoutMs);
        pending.add(waiter);
      });
    }
    function state(predicate, description = 'state') {
      if (latest && predicate(latest)) return Promise.resolve(latest);
      return wait(message => message.type === 'state' && predicate(message), description, messages.length);
    }
    const client = { socket, messages, wait, state, get latest() { return latest; },
      send(command) { socket.send(JSON.stringify(command)); },
      async command(command, expression) {
        const after = messages.length; this.send(command);
        return wait(message => message.type === 'notice'
          && message.clientOrderToken === command.clientOrderToken
          && expression.test(message.message), `${command.type} applied`, after);
      } };
    clients.add(client);
    client.welcome = await wait(message => message.type === 'welcome', 'seat welcome');
    assert.equal(client.welcome.player.team, team, 'fixture must reclaim requested seat');
    return client;
  }
  async function checkpoint(predicate = () => true) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { const saved = JSON.parse(await readFile(checkpointPath, 'utf8')); if (predicate(saved)) return saved; } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
      await sleep(40);
    }
    throw new Error(`Checkpoint timeout: ${logs}`);
  }
  return { port, directory, checkpointPath, start, stop, connect, checkpoint,
    async health() { return (await fetch(`http://127.0.0.1:${port}/health`)).json(); },
    async dispose() { await stop(); await rm(directory, { recursive: true, force: true }); } };
}
