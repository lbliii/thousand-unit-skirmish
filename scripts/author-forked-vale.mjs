import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
const SCENARIO_SUMMARY = 'Both Signals unlock the Watch. Hold all three for 20s. Relief at 2:00; 15:00, Watch owner wins or unclaimed is a draw.';
const children = new Set();
let tempRoot = null;
let cdp = null;
let interruptSignal = null;

process.once('SIGINT', () => { interruptSignal = 'SIGINT'; });
process.once('SIGTERM', () => { interruptSignal = 'SIGTERM'; });

function checkInterrupted() {
  if (interruptSignal) throw new Error(`Interrupted by ${interruptSignal}`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startChild(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const record = {
    label, child, stdout: '', stderr: '',
    exit: new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
  };
  child.stdout?.on('data', (chunk) => { record.stdout = (record.stdout + chunk).slice(-300_000); });
  child.stderr?.on('data', (chunk) => { record.stderr = (record.stderr + chunk).slice(-300_000); });
  child.once('error', (error) => { record.stderr += `\n${error.message}`; });
  children.add(record);
  return record;
}

function childIsRunning(record) {
  return record.child.exitCode === null && record.child.signalCode === null;
}

function childFailure(record) {
  return `${record.label} exited (${record.child.signalCode || record.child.exitCode || 'unknown'})\n`
    + `${record.stderr.trim()}\n${record.stdout.trim()}`.trim();
}

async function stopChild(record) {
  if (!record || !childIsRunning(record)) return;
  const signalGroup = (signal) => {
    try {
      if (process.platform === 'win32') record.child.kill(signal);
      else process.kill(-record.child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        try { record.child.kill(signal); } catch {}
      }
    }
  };
  signalGroup('SIGTERM');
  await Promise.race([record.exit, sleep(2500)]);
  if (childIsRunning(record)) {
    signalGroup('SIGKILL');
    await Promise.race([record.exit, sleep(1000)]);
  }
}

async function reservePort() {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(port, server, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (!childIsRunning(server)) throw new Error(childFailure(server));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        cache: 'no-store', signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).ok === true) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Server did not become healthy: ${lastError?.message || 'timed out'}`);
}

async function findChromeExecutable() {
  const configured = process.env.CHROME_PATH || process.env.CHROME_BIN;
  const candidates = configured ? [configured] : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : process.platform === 'win32'
      ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const candidate of candidates) {
    try { await stat(candidate); return candidate; } catch {}
  }
  throw new Error(`Chrome was not found. Set CHROME_PATH to an installed Chrome or Chromium. Tried: ${candidates.join(', ')}`);
}

class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket connection failed')), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
    });
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  async call(method, params = {}, timeoutMs = 10_000) {
    await this.open;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, timeout: 10_000,
    });
    if (result.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || result.exceptionDetails.exception?.description}`);
    }
    return result.result?.value;
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      try { this.socket.close(); } catch {}
    }
  }
}

async function waitForDevTools(profileDirectory, chrome, timeoutMs = 15_000) {
  const endpointFile = path.join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (!childIsRunning(chrome)) throw new Error(childFailure(chrome));
    try {
      const [portLine, browserPath] = (await readFile(endpointFile, 'utf8')).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (port > 0 && browserPath) return { port, browserPath };
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome did not create DevToolsActivePort. ${chrome.stderr.trim()}`);
}

async function waitForPageTarget(debugPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    checkInterrupted();
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error('Could not find the Chrome page target.');
}

async function waitForPage(expression, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (await cdp.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function setField(selector, value) {
  const selectorLiteral = JSON.stringify(selector);
  const valueLiteral = JSON.stringify(String(value));
  await cdp.evaluate(`(() => {
    const field = document.querySelector(${selectorLiteral});
    if (!field) throw new Error('Missing field ' + ${selectorLiteral});
    field.value = ${valueLiteral};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function click(selector) {
  const selectorLiteral = JSON.stringify(selector);
  await cdp.evaluate(`(() => {
    const element = document.querySelector(${selectorLiteral});
    if (!element) throw new Error('Missing control ' + ${selectorLiteral});
    element.click();
  })()`);
}

async function clickGridCell(column, row) {
  const bounds = await cdp.evaluate(`(() => {
    const rect = document.querySelector('#studio-grid').getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  const x = bounds.left + bounds.width * (column + 0.5) / 64;
  const y = bounds.top + bounds.height * (row + 0.5) / 64;
  await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function gridPoint(column, row) {
  const bounds = await cdp.evaluate(`(() => {
    const rect = document.querySelector('#studio-grid').getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      columns: Number(document.querySelector('#studio-width').value),
      rows: Number(document.querySelector('#studio-height').value) };
  })()`);
  return {
    x: bounds.left + bounds.width * (column + 0.5) / bounds.columns,
    y: bounds.top + bounds.height * (row + 0.5) / bounds.rows,
  };
}

async function paint(tool, startColumn, startRow, endColumn = startColumn, endRow = startRow) {
  await click(`[data-map-tool="${tool}"]`);
  const start = await gridPoint(startColumn, startRow);
  const end = await gridPoint(endColumn, endRow);
  await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', clickCount: 1 });
}

async function check(selector, value) {
  await cdp.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) throw new Error('Missing checkbox: ' + ${JSON.stringify(selector)});
    field.checked = ${value};
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function addZone(name, message, units, seconds, rect, rewards = {}, prerequisites = []) {
  await click('#studio-add-objective');
  await setField('#studio-objective-name', name);
  await setField('#studio-objective-message', message);
  await setField('#studio-required-units', String(units));
  await setField('#studio-capture-seconds', String(seconds));
  await setField('#studio-objective-food-reward', String(rewards.food || 0));
  await setField('#studio-objective-wood-reward', String(rewards.wood || 0));
  await check('#studio-objective-victory', true);
  for (const id of prerequisites) {
    await check(`#studio-objective-requires input[value="${id}"]`, true);
  }
  await paint('objective', ...rect);
}

let failure = null;
const shippedPath = path.join(ROOT, 'maps', 'forked-vale.json');
let priorMapBackup = null;
try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-author-forked-vale-'));
  try {
    priorMapBackup = path.join(tempRoot, 'previous-forked-vale.json');
    await import('node:fs/promises').then(({ copyFile, unlink }) =>
      copyFile(shippedPath, priorMapBackup).then(() => unlink(shippedPath)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    priorMapBackup = null;
  }
  const chromeProfile = path.join(tempRoot, 'chrome-profile');
  const customMapDirectory = path.join(tempRoot, 'custom-maps');
  const serverPort = await reservePort();
  const gameUrl = `http://127.0.0.1:${serverPort}/`;
  const server = startChild('server', process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(serverPort), RTS_HOST: '127.0.0.1',
      RTS_MAP: 'maps/open-field.json', RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
      RTS_MATCH_STATE_PATH: path.join(tempRoot, 'match.json') },
  });
  await waitForHealth(serverPort, server);
  const chromeExecutable = await findChromeExecutable();
  const chrome = startChild('Chrome', chromeExecutable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${chromeProfile}`, 'about:blank',
  ]);
  const { port: debugPort } = await waitForDevTools(chromeProfile, chrome);
  const target = await waitForPageTarget(debugPort);
  cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await cdp.call('Page.navigate', { url: gameUrl });
  await waitForPage("document.documentElement.dataset.boot === 'ready' && document.querySelector('#map-studio-open')?.disabled === false",
    'host client');
  await click('#map-studio-open');
  await waitForPage("document.querySelector('#map-studio')?.open === true", 'Map Studio');

  // Every scenario property below is entered through Map Studio controls.
  await setField('#studio-width', '80');
  await setField('#studio-name', 'FORKED VALE');
  await setField('#studio-id', 'forked-vale');
  await setField('#studio-summary', SCENARIO_SUMMARY);
  await setField('#studio-starting-army-size', '24');
  await setField('#studio-starting-food', '150');
  await setField('#studio-starting-wood', '250');
  await setField('#studio-victory-mode', 'all');
  await setField('#studio-victory-hold-seconds', '20');
  await check('#studio-fog-of-war', true);

  // Mirrored bases, three crossings, broad side lanes, and a shorter central choke.
  await paint('azure', 13, 32);
  await paint('ember', 66, 32);
  for (const [a, b] of [[0, 9], [23, 27], [37, 41], [54, 63]]) {
    await paint('water', 38, a, 41, b);
  }
  for (const [left, right] of [[14, 18], [61, 65]]) {
    await paint('forest', left, 2, right, 6);
    await paint('forest', left, 57, right, 61);
  }
  // Remove the Open Field seed resources in the editor before placing mirrored nodes.
  for (const [tool, column, row] of [
    ['resource-food', 18, 37], ['resource-wood', 18, 27],
    ['resource-food', 46, 37], ['resource-wood', 46, 27],
  ]) {
    await paint(tool, column, row);
    await click('#studio-remove-resource');
  }
  for (const [tool, column, row, stock] of [
    ['resource-food', 17, 39, 600], ['resource-wood', 17, 25, 600],
    ['resource-food', 62, 39, 600], ['resource-wood', 62, 25, 600],
    ['resource-food', 27, 48, 400], ['resource-wood', 27, 16, 400],
    ['resource-food', 52, 48, 400], ['resource-wood', 52, 16, 400],
  ]) {
    await paint(tool, column, row);
    await setField('#studio-resource-stock', String(stock));
  }

  await addZone('North Signal', '{team} CLAIMED THE NORTH SIGNAL', 5, 9,
    [33, 11, 46, 21], { food: 75, wood: 50 });
  await addZone('South Signal', '{team} CLAIMED THE SOUTH SIGNAL', 5, 9,
    [33, 42, 46, 52], { food: 75, wood: 50 });
  await addZone('Vale Watch', '{team} HOLDS THE VALE WATCH', 8, 12,
    [33, 28, 46, 35], {}, ['capture-zone-1', 'capture-zone-2']);
  await setField('#studio-deadline-objective', 'capture-zone-3');
  await setField('#studio-deadline-seconds', '900');

  await click('#studio-add-event');
  await setField('#studio-event-name', 'Relief Caravan');
  await setField('#studio-event-after', '120');
  await setField('#studio-event-team', 'both');
  await setField('#studio-event-food', '100');
  await setField('#studio-event-wood', '75');
  await setField('#studio-event-message', '{team} RELIEF CARAVAN ARRIVED · +{reward} FOOD · +{wood} WOOD');

  await click('#studio-publish');
  await waitForPage("document.querySelector('#map-select')?.value === 'forked-vale' && document.querySelector('#map-studio')?.open === false",
    'Forked Vale publication', 30_000);
  const savedPath = path.join(customMapDirectory, 'forked-vale.json');
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  assert.equal(saved.id, 'forked-vale');
  assert.equal(saved.summary, SCENARIO_SUMMARY);
  assert.equal(saved.startingArmySize, 24);
  assert.equal(saved.triggers.length, 3);
  assert.equal(saved.scenarioEvents.length, 1);
  assert.deepEqual(saved.triggers[2].requiresAll, ['capture-zone-1', 'capture-zone-2']);
  await import('node:fs/promises').then(({ copyFile }) => copyFile(savedPath, shippedPath));

  // Reload the published map in Map Studio to prove its full editor round trip.
  await click('#map-studio-open');
  await waitForPage("document.querySelector('#map-studio')?.open === true", 'published map in editor');
  const restored = await cdp.evaluate(`(() => ({
    name: document.querySelector('#studio-name').value,
    summary: document.querySelector('#studio-summary').value,
    army: document.querySelector('#studio-starting-army-size').value,
    food: document.querySelector('#studio-starting-food').value,
    wood: document.querySelector('#studio-starting-wood').value,
    objectives: document.querySelector('#studio-trigger-count').textContent,
    events: document.querySelector('#studio-event-count').textContent,
    victory: document.querySelector('#studio-victory-mode').value,
    hold: document.querySelector('#studio-victory-hold-seconds').value,
  }))()`);
  assert.equal(restored.name, 'FORKED VALE CUSTOM');
  assert.equal(restored.summary, SCENARIO_SUMMARY);
  assert.equal(restored.army, '24');
  assert.equal(restored.objectives, '3 / 32');
  assert.equal(restored.events, '1 / 32');
  assert.equal(restored.victory, 'all');
  assert.equal(restored.hold, '20');
  console.log(JSON.stringify({ status: 'passed', map: saved.id, savedPath: 'maps/forked-vale.json',
    restored, obstacles: saved.obstacles.length, resources: saved.resourceNodes.length }, null, 2));
} catch (error) {
  failure = error;
  if (cdp) {
    try {
      process.stderr.write(`${JSON.stringify(await cdp.evaluate(`(() => ({
        boot: document.documentElement.dataset.boot,
        url: location.href,
        body: document.body?.innerText?.slice(0, 1000),
      }))()`), null, 2)}\n`);
    } catch {}
  }
} finally {
  cdp?.close();
  for (const record of [...children].reverse()) await stopChild(record);
  if (failure && priorMapBackup) {
    await import('node:fs/promises').then(({ copyFile }) => copyFile(priorMapBackup, shippedPath));
  }
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
}
if (failure) {
  process.stderr.write(`${failure.stack || failure}\n`);
  for (const record of children) {
    const output = `${record.stderr.trim()}\n${record.stdout.trim()}`.trim();
    if (output) process.stderr.write(`\n${record.label}:\n${output}\n`);
  }
  process.exitCode = 1;
}

async function reloadAndWait(gameUrl) {
  const previousTimeOrigin = await cdp.evaluate('performance.timeOrigin');
  await cdp.call('Page.reload', { ignoreCache: true });
  await waitForPage(`performance.timeOrigin !== ${previousTimeOrigin}
    && document.documentElement.dataset.boot === 'ready'
    && document.querySelector('#map-studio-open')?.disabled === false`,
    'the host client to reconnect after reload');
  assert.ok(gameUrl.startsWith('http://127.0.0.1:'), 'scenario navigates only to its isolated local server');
}
