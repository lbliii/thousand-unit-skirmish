import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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

async function reloadAndWait(gameUrl) {
  const previousTimeOrigin = await cdp.evaluate('performance.timeOrigin');
  await cdp.call('Page.reload', { ignoreCache: true });
  await waitForPage(`performance.timeOrigin !== ${previousTimeOrigin}
    && document.documentElement.dataset.boot === 'ready'
    && document.querySelector('#map-studio-open')?.disabled === false`,
    'the host client to reconnect after reload');
  assert.ok(gameUrl.startsWith('http://127.0.0.1:'), 'scenario navigates only to its isolated local server');
}

let failure = null;
try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rts-map-studio-draft-'));
  const chromeProfile = path.join(tempRoot, 'chrome-profile');
  const customMapDirectory = path.join(tempRoot, 'custom-maps');
  const serverPort = await reservePort();
  const gameUrl = `http://127.0.0.1:${serverPort}/`;
  const server = startChild('server', process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      RTS_HOST: '127.0.0.1',
      RTS_MAP: 'maps/open-field.json',
      RTS_CUSTOM_MAP_DIRECTORY: customMapDirectory,
    },
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
    'the host client to connect');

  await click('#map-studio-open');
  await waitForPage("document.querySelector('#map-studio')?.open === true", 'Map Studio to open');
  const startingMapName = await cdp.evaluate("document.querySelector('#studio-name').value");
  const initialResourceCount = await cdp.evaluate("Number.parseInt(document.querySelector('#studio-resource-count').textContent, 10)");
  await setField('#studio-name', 'Draft Recovery Test Map');
  await setField('#studio-starting-food', '750');
  await setField('#studio-regions', JSON.stringify([{ id: 'draft-pass', name: 'Draft Pass', zone: { column: 20, row: 20, width: 4, height: 4 } }]));
  await cdp.evaluate("(() => { const field = document.querySelector('#studio-fog-of-war'); field.checked = true; field.dispatchEvent(new Event('change', { bubbles: true })); })()");

  await clickGridCell(5, 5);
  await click('[data-map-tool="resource-food"]');
  await setField('#studio-resource-stock', '425');
  await clickGridCell(7, 7);

  await click('#studio-add-objective');
  await setField('#studio-objective-name', 'Draft Crown');
  await setField('#studio-required-units', '12');
  await waitForPage("Object.keys(localStorage).some((item) => item.includes(':map-studio-draft:'))", 'the first editor autosave');
  let saved = await cdp.evaluate(`(() => {
    const key = Object.keys(localStorage).find((item) => item.includes(':map-studio-draft:'));
    const draft = key ? JSON.parse(localStorage.getItem(key)) : null;
    return {
      key,
      sourceMapId: draft?.sourceMapId,
      name: draft?.editor?.definition?.name,
      food: draft?.editor?.definition?.startingResources?.food,
      fogOfWar: draft?.editor?.definition?.fogOfWar,
      terrainBlocks: draft?.editor?.definition?.obstacles?.length,
      resourceCount: draft?.editor?.definition?.resourceNodes?.length,
      pendingPlacement: draft?.editor?.triggerCreationPending,
      pendingObjectiveName: draft?.editor?.formValues?.['studio-objective-name']?.value,
      regions: draft?.editor?.formValues?.['studio-regions']?.value,
    };
  })()`);
  assert.ok(saved.key, 'editing should create a local autosave');
  assert.equal(saved.sourceMapId, 'open-field');
  assert.equal(saved.name, 'Draft Recovery Test Map');
  assert.equal(saved.food, 750);
  assert.equal(saved.fogOfWar, true);
  assert.ok(saved.terrainBlocks > 0, 'painted terrain should be included in the draft');
  assert.equal(saved.resourceCount, initialResourceCount + 1, 'placed resources should be included in the draft');
  assert.equal(saved.pendingPlacement, true, 'unfinished objective placement should survive');
  assert.equal(saved.pendingObjectiveName, 'Draft Crown');
  assert.equal(JSON.parse(saved.regions)[0].id, 'draft-pass');

  await click('#map-studio-close');
  await reloadAndWait(gameUrl);
  await click('#map-studio-open');
  await waitForPage("document.querySelector('#studio-draft-recovery')?.hidden === false", 'the recovery prompt to appear');
  assert.equal(await cdp.evaluate("document.querySelector('.studio-layout').inert"), true,
    'the editor stays untouched until the draft choice is made');
  await click('#studio-draft-restore');
  await waitForPage("document.querySelector('#studio-draft-recovery')?.hidden === true", 'the draft to restore');
  let restored = await cdp.evaluate(`(() => ({
    name: document.querySelector('#studio-name').value,
    food: document.querySelector('#studio-starting-food').value,
    fog: document.querySelector('#studio-fog-of-war').checked,
    resources: document.querySelector('#studio-resource-count').textContent,
    pending: document.querySelector('#studio-add-objective').textContent,
    objectiveName: document.querySelector('#studio-objective-name').value,
  }))()`);
  assert.equal(restored.name, 'Draft Recovery Test Map');
  assert.equal(restored.food, '750');
  assert.equal(restored.fog, true);
  assert.match(restored.resources, new RegExp(`^${initialResourceCount + 1} \\/ 128$`));
  assert.equal(restored.pending, 'CANCEL PLACEMENT');
  assert.equal(restored.objectiveName, 'Draft Crown');
  assert.equal(await cdp.evaluate("JSON.parse(document.querySelector('#studio-regions').value)[0].id"), 'draft-pass');

  await clickGridCell(30, 30);
  await waitForPage("document.querySelector('#studio-trigger-count')?.textContent === '1 / 32'", 'the recovered objective placement to finish');
  await click('#studio-add-event');
  await setField('#studio-event-name', 'Recovered Supply');
  await setField('#studio-event-after', '95');
  await setField('#studio-event-trigger', 'region-entry');
  await setField('#studio-event-region', 'draft-pass');
  await setField('#studio-event-region-team', '1');
  await setField('#studio-event-region-kind', 'worker');
  await setField('#studio-event-region-minimum', '3');
  await waitForPage("(() => { const key = Object.keys(localStorage).find((item) => item.includes(':map-studio-draft:')); return key && JSON.parse(localStorage.getItem(key)).editor.definition.scenarioEvents[0]?.trigger?.minimumUnits === 3; })()", 'the region conditions to autosave');
  saved = await cdp.evaluate(`(() => {
    const key = Object.keys(localStorage).find((item) => item.includes(':map-studio-draft:'));
    const draft = key ? JSON.parse(localStorage.getItem(key)) : null;
    return {
      triggerCount: draft?.editor?.definition?.triggers?.length,
      triggerName: draft?.editor?.definition?.triggers?.[0]?.name,
      eventName: draft?.editor?.definition?.scenarioEvents?.[0]?.name,
      eventDelay: draft?.editor?.definition?.scenarioEvents?.[0]?.afterSeconds,
      eventTrigger: draft?.editor?.definition?.scenarioEvents?.[0]?.trigger,
      terrainBlocks: draft?.editor?.definition?.obstacles?.length,
      resourceCount: draft?.editor?.definition?.resourceNodes?.length,
    };
  })()`);
  assert.equal(saved.triggerCount, 1);
  assert.equal(saved.triggerName, 'Draft Crown');
  assert.equal(saved.eventName, 'Recovered Supply');
  assert.equal(saved.eventDelay, 95);
  assert.deepEqual(saved.eventTrigger, { type: 'region-entry', regionId: 'draft-pass', team: '1', minimumUnits: 3, unitKind: 'worker' });
  assert.ok(saved.terrainBlocks > 0);
  assert.equal(saved.resourceCount, initialResourceCount + 1);

  await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: tempRoot });
  const exportedId = await cdp.evaluate("document.querySelector('#studio-id').value");
  await click('#studio-download');
  const exportedPath = path.join(tempRoot, `${exportedId}.json`);
  let exported;
  const exportDeadline = Date.now() + 10_000;
  while (Date.now() < exportDeadline) {
    try { exported = JSON.parse(await readFile(exportedPath, 'utf8')); break; } catch {}
    await sleep(100);
  }
  assert.ok(exported, 'Download JSON should produce a validated portable map');
  assert.equal(exported.regions[0].id, 'draft-pass');
  assert.deepEqual(exported.scenarioEvents[0].trigger, saved.eventTrigger);
  await setField('#studio-regions', '[]');
  const documentRoot = await cdp.call('DOM.getDocument');
  const fileInput = await cdp.call('DOM.querySelector', { nodeId: documentRoot.root.nodeId, selector: '#studio-import-file' });
  await cdp.call('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [exportedPath] });
  await waitForPage("document.querySelector('#studio-message').textContent.startsWith('Loaded')", 'the region map to import');
  assert.equal(await cdp.evaluate("JSON.parse(document.querySelector('#studio-regions').value)[0].id"), 'draft-pass');
  assert.equal(await cdp.evaluate("document.querySelector('#studio-event-trigger').value"), 'region-entry');
  assert.equal(await cdp.evaluate("document.querySelector('#studio-event-region-kind').value"), 'worker');

  await setField('#studio-name', 'Changed After Recovery');
  await click('#map-studio-close');
  await reloadAndWait(gameUrl);
  await click('#map-studio-open');
  await waitForPage("document.querySelector('#studio-draft-recovery')?.hidden === false", 'the updated draft to be offered again');
  await click('#studio-draft-discard');
  const discardState = await cdp.evaluate(`(() => ({
    recoveryHidden: document.querySelector('#studio-draft-recovery')?.hidden,
    layoutInert: document.querySelector('.studio-layout').inert,
    name: document.querySelector('#studio-name').value,
    hasDraft: Object.keys(localStorage).some((item) => item.includes(':map-studio-draft:')),
  }))()`);
  assert.equal(discardState.recoveryHidden, true);
  assert.equal(discardState.layoutInert, false);
  assert.equal(discardState.name, startingMapName, 'discard should leave a fresh copy of the active map open');
  assert.equal(discardState.hasDraft, false, 'discard should remove the stored draft');
  await click('#map-studio-close');
  await sleep(100);
  await click('#map-studio-open');
  await waitForPage("document.querySelector('#studio-draft-recovery')?.hidden === true", 'a discarded draft to stay cleared');

  process.stdout.write(JSON.stringify({
    status: 'passed',
    sourceMapId: 'open-field',
    persistedComponents: ['terrain', 'resources', 'pending capture placement', 'starting resources', 'fog', 'scenario event', 'named regions', 'region conditions'],
    regionJsonExportImport: 'passed',
    closeReloadRestore: 'passed',
    discard: 'passed',
  }, null, 2) + '\n');
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
