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
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  }

  close() { this.socket.close(); }
}


const profile=await mkdtemp('/tmp/forest-habitat-chrome-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const out=process.env.RTS_QA_EVIDENCE || 'docs/qa-evidence/forest-habitat-2026-09-30';
let cdp;
try {
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await cdp.call('DOM.enable');await mkdir(out,{recursive:true});
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 const room=await(await fetch(new URL('/api/rooms',BASE),{method:'POST',headers:{origin:BASE.origin,'content-type':'application/json'},body:'{}'})).json();
 if(!room.roomId)throw new Error('Room creation failed');
 await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId});await sleep(5000);
 for(let i=0;i<100;i++){if(await cdp.evaluate('document.documentElement.dataset.boot')==='ready')break;await sleep(200)}
 if(await cdp.evaluate('document.documentElement.dataset.boot')!=='ready')throw new Error('Boot failed: '+JSON.stringify({errors,state:await cdp.evaluate('({boot:document.documentElement.dataset.boot,text:document.body.innerText.slice(0,900)})')}));
 for(const id of ['underbough-rootways','vesperra-pale-clearings']) for(const mode of ['flat','graduated']) {
  await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId+'&forestHabitat='+mode});await sleep(2500);
  const map=JSON.parse(await readFile('maps/'+id+'.json','utf8'));
  map.id='landscape-review';map.name=id;map.fogOfWar=false;
  const file=path.join(profile,'study.json');await writeFile(file,JSON.stringify(map));
  await cdp.evaluate('document.querySelector("#map-studio-open").click()');
  const doc=await cdp.call('DOM.getDocument');const input=await cdp.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#studio-import-file'});
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});await sleep(400);
  await cdp.evaluate('document.querySelector("#studio-publish").click()');await sleep(1600);
  if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')!==id)throw new Error('Map import failed: '+await cdp.evaluate('document.querySelector("#studio-message")?.textContent'));
  await cdp.evaluate('document.querySelector("#camera-fit-map").click()');await sleep(600);
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+id+'-'+mode+'.png',Buffer.from(shot.data,'base64'));
  if(mode==='graduated') {
   await cdp.evaluate(`(()=>{const c=document.querySelector('#viewport canvas');const r=c.getBoundingClientRect();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-700,clientX:r.x+r.width/2,clientY:r.y+r.height/2,cancelable:true}));document.querySelector('#camera-home-base').click()})()`);
   await sleep(400);const ordinary=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+id+'-ordinary.png',Buffer.from(ordinary.data,'base64'));
   if(process.env.RTS_QA_FOREST_CLOSEUP==='1'){
    await cdp.evaluate(`(()=>{const c=document.querySelector('#viewport canvas');const r=c.getBoundingClientRect();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-1400,clientX:r.x+r.width*.62,clientY:r.y+r.height*.4,cancelable:true}))})()`);
    await sleep(500);const close=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+id+'-closeup.png',Buffer.from(close.data,'base64'));
   }
   const proof=await cdp.evaluate(`(async()=>{
    const {addObstacleEnvironmentSprites,setForestSpriteStock}=await import('/src/environment-art.mjs');
    const map=${JSON.stringify(map)},objects=[];
    const shaped=addObstacleEnvironmentSprites(map,map.width/2,map.height/2,m=>objects.push(m));
    const current=location.href;history.replaceState(null,'',current.replace('forestHabitat=graduated','forestHabitat=flat'));
    const flat=addObstacleEnvironmentSprites(map,map.width/2,map.height/2,m=>objects.push(m));history.replaceState(null,'',current);
    const expected=map.obstacles.filter(r=>r.material==='forest').reduce((n,r)=>n+r.width*r.height,0);
    if(shaped.size!==expected||flat.size!==expected)throw new Error('Harvest-cell identity changed');
    let margins=0,cores=0;const families={};
    for(const [cell,slot] of shaped){
     families[slot.family]=(families[slot.family]||0)+1;
     const baseline=flat.get(cell);const factor=slot.habitatDepth===1?.68:slot.habitatDepth===2?.86:1;
     if(Math.abs(slot.scale-baseline.scale*factor)>1e-9||slot.family!==baseline.family||slot.x!==baseline.x||slot.z!==baseline.z)throw new Error('Habitat changes role, root or wrong scale');
     if(slot.habitatDepth===1)margins++;if(slot.habitatDepth>=3)cores++;
     const before=slot.mesh.instanceMatrix.array.slice(slot.index*16,slot.index*16+16);
     for(const [stock,stage] of [[6,'full'],[4,'worked'],[2,'low'],[0,'depleted'],[6,'full']]){
      if(setForestSpriteStock(slot,stock)!==stage)throw new Error('Harvest appearance lifecycle failed');
      if(slot.atlas){const r=slot.atlas.frameRects[stage],offset=slot.index*4;for(let i=0;i<4;i++)if(Math.abs(slot.atlas.rects.array[offset+i]-r[i])>1e-6)throw new Error('Wrong atlas harvest frame');}
     }
     const after=slot.mesh.instanceMatrix.array.slice(slot.index*16,slot.index*16+16);
     if(before.some((v,i)=>v!==after[i]))throw new Error('Harvest reset moved registered tree');
    }
    for(const mesh of objects)mesh.geometry.dispose();
    return {expectedCells:expected,slots:shaped.size,families,margins,cores,sameRolesAndRoots:true,depletionAndReset:true};
   })()`);
   await writeFile(out+'/'+id+'-renderer-proof.json',JSON.stringify(proof,null,2)+'\n');
  }
  console.log('Captured '+id+' '+mode);
 }
 await writeFile(out+'/capture-report.json',JSON.stringify({source:'current landscape renderer; identical maps/cameras, forestHabitat=flat comparison',fog:'disabled only in disposable capture copies',errors},null,2)+'\n');
 if(errors.length)throw new Error(errors.join('\n'));
}finally{cdp?.close();chrome.kill('SIGTERM');}
