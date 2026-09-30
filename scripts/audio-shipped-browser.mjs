// Owner-run browser integration check. Uses an isolated Chrome profile and local origin.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
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


const root = process.cwd();
const server = createServer(async (req,res) => {
  try {
    const relative = new URL(req.url,'http://local').pathname.slice(1) || 'audio-studio.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    const bytes = await readFile(file);
    res.setHeader('Content-Type', file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : file.endsWith('.mp3') ? 'audio/mpeg' : 'text/html');
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(os.tmpdir(),'tus-audio-browser-'));
const browser = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required',
   '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {stdio:'ignore'});
let cdp;
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
try {
  let port;
  for (let i=0;i<100;i++) { try { port = Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); break; } catch { await sleep(100); } }
  assert.ok(port,'Chrome started');
  for (const seat of ['host', 'fresh-guest']) {
    // Independent browser contexts cannot share an imported pack or decoded cache.
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const manager = new Cdp(version.webSocketDebuggerUrl);
    const {browserContextId} = await manager.call('Target.createBrowserContext');
    const {targetId} = await manager.call('Target.createTarget', {url: origin+'/audio-studio.html', browserContextId});
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    cdp = new Cdp(tabs.find(tab=>tab.id===targetId).webSocketDebuggerUrl);
    await cdp.call('Runtime.enable');
    for (let i=0;i<100;i++) { if(await cdp.evaluate(`document.readyState === 'complete'`)) break; await sleep(30); }
    const result = await cdp.evaluate(`(async () => {
      const {createGameAudio} = await import('./src/audio.mjs');
      const {SHIPPED_AUDIO_REFERENCES} = await import('./src/audio-shipped-catalog.mjs');
      const {createAudioLibraryStore} = await import('./src/audio-library-store.mjs');
      const store = createAudioLibraryStore();
      if ((await store.listPacks()).length) throw Error('Fresh browser unexpectedly has an imported pack');
      const cues = [];
      const audio = createGameAudio({onCue: cue => cues.push(cue)});
      await audio.unlock();
      await audio.setMapAudio(SHIPPED_AUDIO_REFERENCES[0]);
      if (!audio.getPackStatus().includes('ready')) throw Error(audio.getPackStatus());
      audio.updateWork(['wood', 'food', 'repair'].map(resource => ({cue:'work', kind:'worker', resource})));
      for(let i=0;i<100 && cues.filter(c=>c==='work').length < 3;i++) await new Promise(r=>setTimeout(r,20));
      if(cues.filter(c=>c==='work').length !== 3) throw Error('Distinct work clips did not decode/play');
      const inspector = audio.getInspector();
      if(inspector.bindings.some(b=>b.sources.some(s=>!s.available))) throw Error('Missing source');
      audio.stopWork();
      if(audio.getInspector().activeWork) throw Error('Stale work samples');
      const status = audio.getPackStatus(); audio.dispose();
      return {status, cues, inspector};
    })()`);
    assert.equal(result.cues.filter(cue=>cue==='work').length, 3);
    console.log(JSON.stringify({seat, ...result}));
    cdp.close(); cdp = null;
    await manager.call('Target.disposeBrowserContext', {browserContextId}); manager.close();
  }
} finally {
  cdp?.close();browser.kill();await new Promise(resolve=>server.close(resolve));await sleep(300);await rm(profile,{recursive:true,force:true});
}
