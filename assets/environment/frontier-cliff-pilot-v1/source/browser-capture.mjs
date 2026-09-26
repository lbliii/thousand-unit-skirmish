import { spawn } from 'node:child_process';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket connection failed')), { once: true });
    });
    this.socket.addEventListener('message', (event) => this.#receive(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  #receive(raw) {
    const message = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
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

  async evaluate(expression, timeoutMs = 10_000) {
    const result = await this.call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs,
    }, timeoutMs + 1000);
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

const profile = await mkdtemp(path.join(os.tmpdir(), 'cliff-capture-'));
const child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
 '--headless=new', '--no-first-run', '--no-default-browser-check',
 '--disable-background-networking', '--disable-background-timer-throttling',
 '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
 '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], {stdio: ['ignore','ignore','pipe']});
let logs = ''; child.stderr.on('data', d => { logs = (logs + d).slice(-4000); });
let browser, page;
try {
 let port;
 for(let i=0; i<150; i++) {
  try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
  await sleep(100);
 }
 if(!port) throw new Error('Chrome did not start: '+logs);
 const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
 browser = new CdpConnection(info.webSocketDebuggerUrl);
 const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 page = new CdpConnection(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
 await page.call('Runtime.enable'); await page.call('Page.enable');
 page.on('Runtime.exceptionThrown', e => console.error(JSON.stringify(e)));
 await page.call('Page.navigate', {url: process.argv[2]});
 let done = false;
 for(let i=0;i<240;i++) {
  await sleep(1000);
  if(await page.evaluate('window.__renderDone === true')) { done = true; break; }
 }
 if(!done) throw new Error('Render timed out: '+await page.evaluate('document.body.innerText')+' '+logs);
 console.log('RENDER_DONE');
} finally {
 if(browser) await browser.call('Browser.close').catch(()=>{});
 page?.close(); browser?.close(); child.kill();
}
