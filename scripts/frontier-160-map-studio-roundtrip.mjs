import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildElevationGrid } from '../src/map-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server.mjs');
const CHILDREN = new Set();
let tempRoot = null;
let cdp = null;
let failure = null;

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function startChild(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const record = { label, child, stdout: '', stderr: '', exit: new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  }) };
  child.stdout?.on('data', chunk => { record.stdout = (record.stdout + chunk).slice(-100_000); });
  child.stderr?.on('data', chunk => { record.stderr = (record.stderr + chunk).slice(-100_000); });
  child.once('error', error => { record.stderr += `\n${error.message}`; });
  CHILDREN.add(record);
  return record;
}

function childIsRunning(record) {
  return record.child.exitCode === null && record.child.signalCode === null;
}

async function stopChild(record) {
  if (!record || !childIsRunning(record)) return;
  const signalGroup = signal => {
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
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
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
  throw new Error('Chrome or Chromium was not found. Set CHROME_PATH to an installed browser.');
}

class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools connection failed')), { once: true });
    });
    this.socket.addEventListener('message', event => {
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
      expression, awaitPromise: true, returnByValue: true, timeout: 15_000,
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

async function waitForDevTools(profileDirectory, chrome) {
  const endpointFile = path.join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!childIsRunning(chrome)) throw new Error(`Chrome exited early: ${chrome.stderr}`);
    try {
      const [portLine, browserPath] = (await readFile(endpointFile, 'utf8')).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (port > 0 && browserPath) return port;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome did not create DevToolsActivePort.');
}

async function waitForPageTarget(debugPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json();
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error('Could not find the Chrome page target.');
}

async function waitForHealth(port, server) {
  const deadline = Date.now() + 15_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (!childIsRunning(server)) throw new Error(`Server exited early: ${server.stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).ok === true) return;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw new Error(`Local server did not become healthy: ${lastError?.message || 'timed out'}`);
}

async function waitForPage(expression, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await sleep(100);
  }
  const pageState = await cdp.evaluate(`(() => ({
    url: location.href,
    readyState: document.readyState,
    boot: document.documentElement.dataset.boot || null,
    runtimeError: document.querySelector('#runtime-error')?.textContent || '',
    connection: document.querySelector('#network-status')?.textContent || '',
    playerTeam: document.querySelector('#player-team')?.textContent || '',
    mapStudioDisabled: document.querySelector('#map-studio-open')?.disabled ?? null,
  }))()`);
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(pageState)}.`);
}

async function click(selector) {
  await cdp.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button) throw new Error('Missing control: ' + ${JSON.stringify(selector)});
    button.click();
  })()`);
}

async function clickMapCell(column, row) {
  await waitForPage(`(() => {
    const canvas = document.querySelector('#studio-grid');
    if (!canvas?.isConnected) return false;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  })()`, 'visible Map Studio grid');
  const point = await cdp.evaluate(`(() => {
    const canvas = document.querySelector('#studio-grid');
    const rect = canvas.getBoundingClientRect();
    const width = Number(document.querySelector('#studio-width').value);
    const height = Number(document.querySelector('#studio-height').value);
    return { x: rect.left + ((${column}) + 0.5) * rect.width / width,
      y: rect.top + ((${row}) + 0.5) * rect.height / height };
  })()`);
  await cdp.call('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1,
  });
  await cdp.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1,
  });
}

async function readMapCellLevel(column, row) {
  await waitForPage(`(() => {
    const canvas = document.querySelector('#studio-grid');
    if (!canvas?.isConnected) return false;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  })()`, 'visible Map Studio grid');
  const point = await cdp.evaluate(`(() => {
    const canvas = document.querySelector('#studio-grid');
    const rect = canvas.getBoundingClientRect();
    const width = Number(document.querySelector('#studio-width').value);
    const height = Number(document.querySelector('#studio-height').value);
    return { x: rect.left + ((${column}) + 0.5) * rect.width / width,
      y: rect.top + ((${row}) + 0.5) * rect.height / height };
  })()`);
  await cdp.call('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: point.x, y: point.y, button: 'none',
  });
  return cdp.evaluate("document.querySelector('#studio-grid-position').textContent");
}

async function importJsonIntoStudio(definition, filename) {
  const jsonLiteral = JSON.stringify(JSON.stringify(definition));
  const filenameLiteral = JSON.stringify(filename);
  await cdp.evaluate(`(() => {
    const input = document.querySelector('#studio-import-file');
    if (!input) throw new Error('Map Studio import input is missing.');
    const transfer = new DataTransfer();
    transfer.items.add(new File([${jsonLiteral}], ${filenameLiteral}, { type: 'application/json' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForPage(`document.querySelector('#studio-id')?.value === ${JSON.stringify(definition.id)}
    && document.querySelector('#studio-name')?.value === ${JSON.stringify(definition.name)}`,
  `${definition.id} import`, 30_000);
}

async function waitForDownload(directory, filename) {
  const filePath = path.join(directory, filename);
  const deadline = Date.now() + 15_000;
  let lastSize = -1;
  let stableReads = 0;
  while (Date.now() < deadline) {
    try {
      const currentSize = (await stat(filePath)).size;
      stableReads = currentSize === lastSize ? stableReads + 1 : 0;
      if (currentSize > 0 && stableReads >= 2) return filePath;
      lastSize = currentSize;
    } catch {}
    await sleep(100);
  }
  const files = await readdir(directory);
  throw new Error(`Map Studio did not download ${filename}; files: ${files.join(', ') || '(none)'}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function triggerSignature(triggers) {
  return stable(triggers.map(trigger => {
    const unitCount = trigger.unitCount ?? 0;
    return {
      ...trigger,
      victory: trigger.victory === true,
      foodReward: trigger.foodReward ?? 0,
      woodReward: trigger.woodReward ?? 0,
      unitCount,
      unitKind: unitCount > 0 ? trigger.unitKind ?? 'infantry' : 'infantry',
    };
  }));
}

function cellGrid(definition, patches, fallback, valueOf) {
  const cells = new Array(definition.width * definition.height).fill(fallback);
  for (const patch of patches || []) {
    const value = valueOf(patch);
    for (let row = patch.row; row < patch.row + patch.height; row++) {
      for (let column = patch.column; column < patch.column + patch.width; column++) {
        cells[row * definition.width + column] = value;
      }
    }
  }
  return cells;
}

function assertRoundTrip(source, exported) {
  assert.equal(exported.id, source.id);
  assert.equal(exported.name, source.name);
  assert.equal(exported.summary, source.summary);
  assert.equal(exported.width, source.width);
  assert.equal(exported.height, source.height);
  assert.equal(exported.terrainSeed, source.terrainSeed);
  assert.equal(exported.startingArmySize ?? 1000, source.startingArmySize ?? 1000);
  assert.deepEqual(stable(exported.startingResources || {}), stable(source.startingResources || {}));
  assert.equal(exported.fogOfWar, source.fogOfWar ?? false);
  assert.equal(exported.victoryMode, source.victoryMode ?? 'any');
  assert.equal(exported.victoryHoldSeconds ?? 0, source.victoryHoldSeconds ?? 0);
  assert.deepEqual(stable(exported.spawnPoints), stable(source.spawnPoints));
  assert.deepEqual(stable(exported.resourceNodes), stable(source.resourceNodes || []));
  assert.deepEqual(triggerSignature(exported.triggers || []), triggerSignature(source.triggers || []));
  assert.deepEqual(stable(exported.scenarioEvents || []), stable(source.scenarioEvents || []));

  const defaultTerrain = source.terrainBase || (source.id === 'cinder-ridge' ? 'cinder' : 'meadow');
  assert.deepEqual(
    cellGrid(exported, exported.terrainPatches, exported.terrainBase || defaultTerrain, patch => patch.material),
    cellGrid(source, source.terrainPatches, defaultTerrain, patch => patch.material),
    'painted ground should survive the editor round trip',
  );
  assert.deepEqual(
    cellGrid(exported, exported.obstacles, null,
      obstacle => `${obstacle.material || 'stone'}:${obstacle.elevation ?? 1.12}`),
    cellGrid(source, source.obstacles, null,
      obstacle => `${obstacle.material || 'stone'}:${obstacle.elevation ?? 1.12}`),
    'blocked terrain and obstacle heights should survive the editor round trip',
  );
  const sourceLevels = buildElevationGrid(source.width, source.height, source.elevationPatches);
  const levels = buildElevationGrid(exported.width, exported.height, exported.elevationPatches);
  assert.deepEqual(levels, sourceLevels, 'ground levels should survive the editor round trip');
  if (source.elevationPatches === undefined) {
    assert.equal(exported.elevationPatches, undefined,
      'legacy flat maps should keep the optional elevation field absent');
  }
}

async function roundTripMap(definition, downloadsDirectory, options = {}) {
  await importJsonIntoStudio(definition, `${definition.id}.json`);
  if (options.beforeExport) await options.beforeExport();
  await click('#studio-download');
  const downloadPath = await waitForDownload(downloadsDirectory, `${definition.id}.json`);
  const exported = JSON.parse(await readFile(downloadPath, 'utf8'));
  const expectedDefinition = typeof options.expectedDefinition === 'function'
    ? options.expectedDefinition() : options.expectedDefinition || definition;
  assertRoundTrip(expectedDefinition, exported);
  await importJsonIntoStudio(exported, `${definition.id}-reload.json`);
  const editorState = await cdp.evaluate(`(() => ({
    id: document.querySelector('#studio-id').value,
    name: document.querySelector('#studio-name').value,
    width: Number(document.querySelector('#studio-width').value),
    height: Number(document.querySelector('#studio-height').value),
    gridSize: document.querySelector('#studio-grid-size').textContent,
  }))()`);
  assert.deepEqual(editorState, {
    id: definition.id,
    name: definition.name,
    width: definition.width,
    height: definition.height,
      gridSize: `${definition.width} × ${definition.height} CELLS`,
  });
  if (options.afterReload) await options.afterReload();
  return exported;
}

try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-frontier-roundtrip-'));
  const profileDirectory = path.join(tempRoot, 'chrome-profile');
  const customMapDirectory = path.join(tempRoot, 'custom-maps');
  const downloadsDirectory = path.join(tempRoot, 'downloads');
  await mkdir(downloadsDirectory, { recursive: true });

  const port = await reservePort();
  const gameUrl = `http://127.0.0.1:${port}/`;
  const server = startChild('server', process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1',
      RTS_MAP: 'maps/open-field.json', RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
      RTS_MATCH_STATE_PATH: path.join(tempRoot, 'match.json') },
  });
  await waitForHealth(port, server);

  const chromeExecutable = await findChromeExecutable();
  const chrome = startChild('Chrome', chromeExecutable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profileDirectory}`, `--download-default-directory=${downloadsDirectory}`, 'about:blank',
  ]);
  const debugPort = await waitForDevTools(profileDirectory, chrome);
  const target = await waitForPageTarget(debugPort);
  cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadsDirectory });
  await cdp.call('Page.navigate', { url: gameUrl });
  await waitForPage("document.documentElement.dataset.boot === 'ready' && document.querySelector('#map-studio-open')?.disabled === false",
    'Map Studio host client');
  await click('#map-studio-open');
  await waitForPage("document.querySelector('#map-studio')?.open === true", 'Map Studio dialog');

  const legacyMap = JSON.parse(await readFile(path.join(ROOT, 'maps/stone-pass.json'), 'utf8'));
  const frontierMap = JSON.parse(await readFile(path.join(ROOT, 'maps/frontier-160.json'), 'utf8'));
  const elevationFixture = {
    ...legacyMap,
    id: 'elevation-brush-roundtrip',
    name: 'Elevation Brush Round Trip',
    summary: 'Exercise level patches through Map Studio import, export, and reload.',
    elevationPatches: [
      { column: 20, row: 20, width: 10, height: 8, level: 1 },
      { column: 30, row: 20, width: 5, height: 8, level: 2 },
      { column: 35, row: 20, width: 4, height: 8, level: 1 },
    ],
  };
  await roundTripMap(legacyMap, downloadsDirectory, {
    afterReload: async () => {
      assert.equal(await readMapCellLevel(20, 20), 'CELL 21, 21 · LEVEL 0',
        'reloaded legacy maps should remain at level zero');
    },
  });
  const expectedElevationLevels = buildElevationGrid(
    elevationFixture.width, elevationFixture.height, elevationFixture.elevationPatches,
  );
  const editedCell = (column, row) => row * elevationFixture.width + column;
  const paintLevel = async (levelTool, column, row, expectedLevel) => {
    await click(`[data-map-tool="${levelTool}"]`);
    await clickMapCell(column, row);
    const message = await cdp.evaluate("document.querySelector('#studio-message').textContent");
    assert.match(message, /ground cell/);
    expectedElevationLevels[editedCell(column, row)] = expectedLevel;
  };
  const elevationExport = await roundTripMap(elevationFixture, downloadsDirectory, {
    beforeExport: async () => {
      await paintLevel('elevation:1', 5, 5, 1);
      await paintLevel('elevation:raise', 5, 5, 2);
      await paintLevel('elevation:lower', 5, 5, 1);
      await paintLevel('elevation:0', 5, 5, 0);
      await paintLevel('elevation:2', 6, 5, 2);
    },
    expectedDefinition: () => ({
      ...elevationFixture,
      elevationPatches: Array.from(expectedElevationLevels, (level, index) => level > 0
        ? { column: index % elevationFixture.width, row: Math.floor(index / elevationFixture.width),
          width: 1, height: 1, level }
        : null).filter(Boolean),
    }),
    afterReload: async () => {
      assert.equal(await readMapCellLevel(5, 5), 'CELL 6, 6 · LEVEL 0');
      assert.equal(await readMapCellLevel(6, 5), 'CELL 7, 6 · LEVEL 2');
      assert.equal(await readMapCellLevel(22, 22), 'CELL 23, 23 · LEVEL 1');
      assert.equal(await readMapCellLevel(32, 22), 'CELL 33, 23 · LEVEL 2');
      assert.equal(await readMapCellLevel(36, 22), 'CELL 37, 23 · LEVEL 1');
    },
  });
  const frontierExport = await roundTripMap(frontierMap, downloadsDirectory);

  console.log(JSON.stringify({
    status: 'passed',
    legacyMap: legacyMap.id,
    legacyDimensions: `${legacyMap.width} × ${legacyMap.height}`,
    legacyElevationFieldOmitted: true,
    elevationFixture: elevationExport.id,
    elevationFixtureLevels: [...new Set(buildElevationGrid(
      elevationExport.width, elevationExport.height, elevationExport.elevationPatches,
    ))],
    frontierMap: frontierMap.id,
    frontierDimensions: `${frontierExport.width} × ${frontierExport.height}`,
    frontierNodes: frontierExport.resourceNodes.length,
    frontierObjectives: frontierExport.triggers.length,
    frontierElevationLevels: [...new Set(buildElevationGrid(
      frontierExport.width, frontierExport.height, frontierExport.elevationPatches,
    ))],
  }, null, 2));
} catch (error) {
  failure = error;
} finally {
  cdp?.close();
  for (const record of [...CHILDREN].reverse()) await stopChild(record);
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
}

if (failure) {
  process.stderr.write(`${failure.stack || failure}\n`);
  for (const record of CHILDREN) {
    const output = `${record.stderr.trim()}\n${record.stdout.trim()}`.trim();
    if (output) process.stderr.write(`\n${record.label}:\n${output}\n`);
  }
  process.exitCode = 1;
}
