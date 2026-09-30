import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = new URL('http://127.0.0.1:0/');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await stat(chromePath);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-persistent-browser-'));
const browsers = [];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(check, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let result;
  while (Date.now() < deadline) {
    result = await check();
    if (result) return result;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

const readState = `(() => ({
  boot: document.documentElement.dataset.boot || null,
  team: document.querySelector('#player-team')?.textContent || null,
  network: document.querySelector('#network-status')?.textContent || null,
  players: document.querySelector('#players-online')?.textContent || null,
  map: document.querySelector('#map-label-title')?.textContent || null,
  error: document.querySelector('#runtime-error')?.textContent || null,
  canvas: Boolean(document.querySelector('#viewport canvas')),
}))()`;

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP connection failed')), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
      } else for (const listener of this.events.get(message.method) || []) listener(message.params || {});
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP connection closed'));
      this.pending.clear();
    });
  }

  on(method, callback) {
    const listeners = this.events.get(method) || new Set();
    listeners.add(callback);
    this.events.set(method, listeners);
  }

  async call(method, params = {}, timeoutMs = 10_000) {
    await this.open;
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  }

  close() { this.socket.close(); }
}

async function launch(label) {
  const profile = path.join(tempRoot, `${label}-profile`);
  const child = spawn(chromePath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    '--window-size=1440,900', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const record = { label, child, output: '', cdp: null, diagnostics: [] };
  child.stdout.on('data', (chunk) => { record.output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { record.output += chunk.toString(); });
  browsers.push(record);

  let port;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} Chrome exited: ${record.output.slice(-1000)}`);
    try {
      port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]);
      if (port > 0) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(port > 0, `${label} Chrome did not start DevTools`);
  let target;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      target = (await response.json()).find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(target, `${label} Chrome has no page target`);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  record.cdp = cdp;
  await cdp.open;
  await Promise.all([cdp.call('Runtime.enable'), cdp.call('Page.enable'), cdp.call('Network.enable')]);
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    record.diagnostics.push(`JS: ${exceptionDetails?.text || 'exception'}`);
  });
  cdp.on('Network.loadingFailed', ({ errorText, requestId }) => {
    record.diagnostics.push(`LOAD: ${errorText} (${requestId})`);
  });
  cdp.on('Network.webSocketHandshakeResponseReceived', ({ response }) => {
    record.diagnostics.push(`WS HTTP ${response?.status || 'unknown'}`);
  });

  const url = new URL(base);

  await cdp.call('Page.navigate', { url: url.toString() });
  let last = null;
  while (Date.now() < deadline + 15_000) {
    last = await cdp.evaluate(readState);
    if (last.boot === 'ready' && ['AZURE', 'EMBER'].includes(last.team)) break;
    await sleep(150);
  }
  assert.equal(last.boot, 'ready', `${label} page did not boot: ${JSON.stringify({ last, diagnostics: record.diagnostics })}`);
  record.state = last;
  return record;
}

const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT,
  env: { ...process.env, PORT: '0', RTS_HOST: '127.0.0.1', RTS_MAP: 'maps/open-field.json', RTS_CUSTOM_MAP_DIRECTORY: path.join(tempRoot, 'maps') },
  stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
try {
  const port = await waitFor(() => Number(serverOutput.match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1]), 'server port');
  base.port = String(port);
  const azure = await launch('azure'); const ember = await launch('ember');
  for (const record of [azure, ember]) {
    const cdp = record.cdp;
    await cdp.evaluate("document.querySelector('#select-all').click()");
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p', code: 'KeyP' });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP' });
    assert.equal(await cdp.evaluate("document.querySelector('.command-mode').textContent"), 'PATROL');
    const rect = await cdp.evaluate("(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height }; })()");
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.6, button: 'right', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.6, button: 'right', clickCount: 1 });
    await waitFor(async () => /PATROL ORDER/.test(await cdp.evaluate("document.querySelector('#order-status').textContent")), `${record.label} Patrol applied`, 30_000);
    await waitFor(async () => /PATROL/.test(await cdp.evaluate("document.querySelector('#selected-persistent-orders').textContent")), `${record.label} selection shows Patrol`);
    await cdp.evaluate("document.querySelector('[data-stationary-order=holdPosition]').click()");
    await waitFor(async () => /HOLD POSITION ORDER/.test(await cdp.evaluate("document.querySelector('#order-status').textContent")), 'Hold applied');
    await waitFor(async () => await cdp.evaluate("document.querySelector('#selected-persistent-orders').hidden"), 'persistent summary cleared');
    await cdp.evaluate("document.querySelector('[data-persistent-order=follow]').click()");
    assert.equal(await cdp.evaluate("document.querySelector('.command-mode').textContent"), 'FOLLOW');
    // Find an actual friendly rendered unit with bounded real pointer input.
    let followed = false;
    for (let y = rect.y + 80; y < rect.y + rect.h - 40 && !followed; y += 35) {
      for (let x = rect.x + 40; x < rect.x + rect.w - 40 && !followed; x += 35) {
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
        followed = (await cdp.evaluate("document.querySelector('.command-mode').textContent")) !== 'FOLLOW';
      }
    }
    assert.ok(followed, `${record.label} found a friendly Follow target`);
    await waitFor(async () => /FOLLOW ORDER/.test(await cdp.evaluate("document.querySelector('#order-status').textContent")), 'Follow applied');
    await waitFor(async () => /FOLLOW/.test(await cdp.evaluate("document.querySelector('#selected-persistent-orders').textContent")), 'selection shows Follow');
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS' });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS' });
    await waitFor(async () => /STOP ORDER/.test(await cdp.evaluate("document.querySelector('#order-status').textContent")), 'Stop applied');
    assert.equal(await cdp.evaluate("document.querySelector('#runtime-error')?.textContent || ''"), '');
  }
  const health = await (await fetch(new URL('/health', base))).json();
  const persistentPlans = health.movePlanning.filter(sample => sample.mode === 'persistent-order');
  assert.ok(persistentPlans.length, 'large selections produced persistent planning work');
  assert.ok(persistentPlans.every(sample => sample.unitCount <= 64), 'every persistent replan stayed within the 64-unit admission cap');
  console.log(JSON.stringify({ armySize: health.armySize, persistentPlanningSamples: persistentPlans.length, maximumPersistentBatch: Math.max(...persistentPlans.map(sample => sample.unitCount)), passed: true, seats: ['Azure','Ember'], controls: ['keyboard Patrol', 'ground target', 'selected intent', 'Hold interruption', 'Follow button', 'friendly pointer target', 'keyboard Stop'], mode: 'headless owner-run UI smoke; not unassisted human evidence' }));
} finally {
  for (const record of browsers) { try { await record.cdp?.call('Browser.close'); } catch {} record.cdp?.close(); record.child.kill('SIGTERM'); }
  server.kill('SIGINT');
  await sleep(1000);
  if (server.exitCode === null) server.kill('SIGKILL');
  for (const record of browsers) if (record.child.exitCode === null) record.child.kill('SIGKILL');
  await rm(tempRoot, { recursive: true, force: true });
}
