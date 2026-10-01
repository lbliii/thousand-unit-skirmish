import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(ROOT);
const BASE=new URL(process.env.RTS_QA_URL || 'http://127.0.0.1:4173');
if(!['127.0.0.1','localhost'].includes(BASE.hostname))throw new Error('Terrain study captures must use an isolated local server.');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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

const profile=await mkdtemp('/tmp/vaelora-mist-chrome-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--window-size=1280,720','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const out='docs/qa-evidence/vaelora-regional-mist-2026-09-30';let cdp;
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await mkdir(out,{recursive:true});
 const room=await(await fetch(new URL('/api/rooms',BASE),{method:'POST',headers:{origin:BASE.origin,'content-type':'application/json'},body:'{}'})).json();if(!room.roomId)throw new Error(room.error||'Review room failed');
 const proof=[];
 for(const map of ['vesperra-pale-clearings','sombral-mere-shore-gardens'])for(const mode of ['clear','mist','auto']){
  const expectedMap=JSON.parse(await readFile('maps/'+map+'.json','utf8'));
  await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId+(mode==='auto'?'':'&terrainAtmosphere='+mode)+'&terrainAtmosphereTime=12'});await sleep(4000);
  await cdp.evaluate(`(()=>{const el=document.querySelector('#map-select');el.value=${JSON.stringify(map)};if(el.value!==${JSON.stringify(map)})throw new Error('Map option missing');el.dispatchEvent(new Event('change'))})()`);await sleep(2000);
  if(await cdp.evaluate('document.documentElement.dataset.boot')!=='ready')throw new Error('Map boot failed');
  if(await cdp.evaluate("document.querySelector('#map-label-title')?.textContent")!==expectedMap.name)throw new Error('Regional map did not load');
  for(const view of ['strategic','ordinary']){
   await cdp.evaluate(`document.querySelector(${JSON.stringify(view==='strategic'?'#camera-fit-map':'#camera-home-base')}).click()`);await sleep(350);
   if(view==='ordinary'){for(let i=0;i<4;i++){await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:550,y:320,deltaX:0,deltaY:-850});await sleep(150);}await cdp.evaluate("document.querySelector('#camera-home-base').click()");await sleep(400);}
   const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+map+'-'+mode+'-'+view+'.png',Buffer.from(shot.data,'base64'));
  }
  proof.push(await cdp.evaluate(`(async()=>{const {groundMistProfile}=await import('/src/terrain-atmosphere.mjs');return {map:${JSON.stringify(map)},mode:${JSON.stringify(mode)},boot:document.documentElement.dataset.boot,error:document.querySelector('#runtime-error')?.textContent,profile:groundMistProfile({terrainBase:${JSON.stringify(map.startsWith('vesperra')?'jungle-loam':'lunar-soil')}})}})()`));
 }
 await writeFile(out+'/runtime-proof.json',JSON.stringify({proof,errors},null,2)+'\n');if(errors.length||proof.some(p=>p.error))throw new Error('Mist runtime errors');console.log(JSON.stringify({maps:2,views:12,errors}));
}finally{cdp?.close();chrome.kill()}
