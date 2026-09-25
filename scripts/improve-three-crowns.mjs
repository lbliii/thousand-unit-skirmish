import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
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
  const state = await cdp.evaluate(`(() => ({
    url: location.href,
    readyState: document.readyState,
    boot: document.documentElement.dataset.boot || null,
    runtimeError: document.querySelector('#runtime-error')?.textContent || null,
    connection: document.querySelector('#network-status')?.textContent || null,
    team: document.querySelector('#player-team')?.textContent || null,
    mapStudioDisabled: document.querySelector('#map-studio-open')?.disabled ?? null,
  }))()`);
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`);
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

async function downloadEditorMap(downloadPath) {
  await cdp.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });
  await click('#studio-download');
  await waitForPage("document.querySelector('#studio-message')?.textContent?.startsWith('Downloaded ')",
    'Map Studio export');
  const downloaded = path.join(downloadPath, 'three-crowns.json');
  let saved;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { saved = JSON.parse(await readFile(downloaded, 'utf8')); break; } catch { await sleep(100); }
  }
  assert.ok(saved, 'Map Studio download should be complete');
  return saved;
}

function resourceCell(map, node) {
  return [Math.floor(node.x + map.width / 2), Math.floor(node.z + map.height / 2)];
}

async function moveResourceNode(map, type, fromColumn, fromRow, toColumn, toRow, stock) {
  const tool = type === 'wood' ? 'resource-wood' : 'resource-food';
  const sourceNode = map.resourceNodes.find((node) => node.type === type
    && JSON.stringify(resourceCell(map, node)) === JSON.stringify([fromColumn, fromRow]));
  if (!sourceNode) {
    const finalNode = map.resourceNodes.find((node) => node.type === type
      && JSON.stringify(resourceCell(map, node)) === JSON.stringify([toColumn, toRow]));
    assert.ok(finalNode, `Map Studio should find the ${type} resource at its source or final cell`);
    assert.equal(finalNode.stock, stock);
    await click(`[data-map-tool="${tool}"]`);
    await clickGridCell(toColumn, toRow);
    const selected = await cdp.evaluate(`(() => ({
      stock: Number(document.querySelector('#studio-resource-stock')?.value),
      label: document.querySelector('#studio-resource-stock')?.getAttribute('aria-label'),
    }))()`);
    assert.equal(selected.stock, stock);
    assert.ok(selected.label?.includes(finalNode.id), 'Map Studio should select the existing final resource node');
    return;
  }
  assert.equal(sourceNode.stock, stock, 'Map Studio source resource should have the expected stock');
  if (fromColumn === toColumn && fromRow === toRow) return;
  await click(`[data-map-tool="${tool}"]`);
  await clickGridCell(fromColumn, fromRow);
  const selected = await cdp.evaluate(`(() => ({
    stock: Number(document.querySelector('#studio-resource-stock')?.value),
    label: document.querySelector('#studio-resource-stock')?.getAttribute('aria-label'),
  }))()`);
  assert.equal(selected.stock, stock, 'Map Studio should select the expected resource stock');
  assert.ok(selected.label?.includes(sourceNode.id), 'Map Studio should select the expected source resource node');
  await click('#studio-remove-resource');
  await setField('#studio-resource-stock', String(stock));
  await clickGridCell(toColumn, toRow);
  const message = `Added ${type} node at ${toColumn}, ${toRow} with ${stock} ${type}.`;
  await waitForPage(
    "document.querySelector('#studio-message')?.textContent === " + JSON.stringify(message),
    'Map Studio resource placement');
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
try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-improve-three-crowns-'));
  const chromeProfile = path.join(tempRoot, 'chrome-profile');
  const serverPort = await reservePort();
  const gameUrl = `http://127.0.0.1:${serverPort}/`;
  const server = startChild('server', process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(serverPort), RTS_HOST: '127.0.0.1',
      RTS_MAP: 'maps/three-crowns.json',
      RTS_CUSTOM_MAP_DIRECTORY: path.join(tempRoot, 'custom-maps'),
      RTS_MATCH_STATE_PATH: path.join(tempRoot, 'match.json') },
  });
  await waitForHealth(serverPort, server);
  const chromeExecutable = await findChromeExecutable();
  const chrome = startChild('Chrome', chromeExecutable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
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
  const initialMap = JSON.parse(await readFile(path.join(ROOT, 'maps', 'three-crowns.json'), 'utf8'));
  assert.equal(initialMap.id, 'three-crowns');

  await setField('#studio-id', 'three-crowns');
  await setField('#studio-name', 'THREE CROWNS');
  await setField('#studio-summary', 'Claim the outer crowns, then hold the keep. At 15:00, its owner wins regardless of crowns; unclaimed is a draw.');
  await setField('#studio-victory-hold-seconds', '20');
  await setField('#studio-deadline-objective', 'heartland-keep');
  await setField('#studio-deadline-seconds', '900');
  await paint('stone', 27, 19, 36, 22);
  await paint('stone', 27, 41, 36, 44);
  await paint('azure', 11, 32);
  await paint('ember', 52, 32);
  await moveResourceNode(initialMap, 'food', 11, 38, 14, 38, 350);
  await moveResourceNode(initialMap, 'wood', 11, 26, 14, 26, 350);
  await moveResourceNode(initialMap, 'food', 53, 38, 49, 38, 350);
  await moveResourceNode(initialMap, 'wood', 53, 26, 49, 26, 350);
  await moveResourceNode(initialMap, 'food', 32, 18, 31, 18, 500);
  await moveResourceNode(initialMap, 'wood', 32, 46, 32, 46, 500);
  const expectedResources = [
    { id: 'azure-berries', type: 'food', x: -17.5, z: 6.5, stock: 350 },
    { id: 'azure-timber', type: 'wood', x: -17.5, z: -5.5, stock: 350 },
    { id: 'ember-berries', type: 'food', x: 17.5, z: 6.5, stock: 350 },
    { id: 'ember-timber', type: 'wood', x: 17.5, z: -5.5, stock: 350 },
    { id: 'north-market-food', type: 'food', x: -0.5, z: -13.5, stock: 500 },
    { id: 'south-market-wood', type: 'wood', x: 0.5, z: 14.5, stock: 500 },
  ];

  const saved = await downloadEditorMap(tempRoot);
  assert.equal(saved.id, 'three-crowns');
  assert.equal(saved.victoryHoldSeconds, 20);
  assert.equal(saved.timedVictory.objectiveId, 'heartland-keep');
  assert.equal(saved.obstacles.length, 6);
  assert.deepEqual(saved.spawnPoints
    .map((spawn) => [spawn.team, spawn.x, spawn.z])
    .sort((left, right) => left[0] - right[0]),
  [[0, -20.5, 0.5], [1, 20.5, 0.5]]);
  assert.equal(saved.resourceNodes.length, expectedResources.length);
  for (const expected of expectedResources) {
    const found = saved.resourceNodes.find((node) => node.type === expected.type
      && node.x === expected.x && node.z === expected.z);
    assert.ok(found, 'Map Studio should preserve resource marker ' + expected.id);
    assert.equal(found.stock, expected.stock, 'Map Studio should preserve stock for ' + expected.id);
  }
  const stableResourceIds = new Map(expectedResources.map((node) => [
    `${node.type}:${node.x}:${node.z}`, node.id,
  ]));
  for (const node of saved.resourceNodes) {
    const stableId = stableResourceIds.get(`${node.type}:${node.x}:${node.z}`);
    assert.ok(stableId, 'Map Studio created an unexpected resource node ' + node.id);
    node.id = stableId;
  }
  await writeFile(path.join(ROOT, 'maps', 'three-crowns.json'),
    JSON.stringify(saved, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', map: saved.id, authoredIn: 'Map Studio',
    savedPath: 'maps/three-crowns.json', summary: saved.summary,
    terrainBlocks: saved.obstacles.length, holdSeconds: saved.victoryHoldSeconds }, null, 2));
} catch (error) {
  failure = error;
} finally {
  cdp?.close();
  for (const record of [...children].reverse()) await stopChild(record);
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
