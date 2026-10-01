import { generateRollingGround, compressGroundLevels } from '../src/terrain-authoring.mjs';
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
const raisedCapture=process.env.RTS_MIST_RAISED==='1';
const flatRegression=process.env.RTS_MIST_REGRESSION==='1';
const out=flatRegression?'docs/qa-evidence/vaelora-raised-mist-flat-regression-2026-09-30':raisedCapture?'docs/qa-evidence/vaelora-raised-mist-2026-09-30':'docs/qa-evidence/vaelora-regional-mist-2026-09-30';let cdp;
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await mkdir(out,{recursive:true});
 const room=await(await fetch(new URL('/api/rooms',BASE),{method:'POST',headers:{origin:BASE.origin,'content-type':'application/json'},body:'{}'})).json();if(!room.roomId)throw new Error(room.error||'Review room failed');
 const proof=[],geometryProof=[];
 for(const map of ['vesperra-pale-clearings','sombral-mere-shore-gardens'])for(const mode of ['clear','mist','auto']){
  const expectedMap=JSON.parse(await readFile('maps/'+map+'.json','utf8'));
  await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId+(mode==='auto'?'':'&terrainAtmosphere='+mode)+'&terrainAtmosphereTime=12'});await sleep(4000);
  if(raisedCapture){
   expectedMap.id=map+'-mist-raised-study';expectedMap.name+=' MIST RAISED STUDY';expectedMap.fogOfWar=false;
   expectedMap.elevationPatches=compressGroundLevels(generateRollingGround(expectedMap,93080),expectedMap.width,expectedMap.height);
   const studyPath=out+'/'+map+'-raised-study.json';await writeFile(studyPath,JSON.stringify(expectedMap,null,2)+'\n');
   await cdp.evaluate("document.querySelector('#map-studio-open').click()");await cdp.call('DOM.enable');const doc=await cdp.call('DOM.getDocument');const input=await cdp.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#studio-import-file'});
   await cdp.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(ROOT,studyPath)]});for(let i=0;i<30;i++){if(await cdp.evaluate("document.querySelector('#studio-name')?.value")===expectedMap.name)break;await sleep(100);}
   if(await cdp.evaluate("document.querySelector('#studio-name')?.value")!==expectedMap.name)throw new Error('Raised import failed: '+await cdp.evaluate("document.querySelector('#studio-message')?.textContent"));
   await cdp.evaluate("document.querySelector('#studio-publish').click()");for(let i=0;i<100;i++){if(await cdp.evaluate("document.querySelector('#map-label-title')?.textContent")===expectedMap.name)break;await sleep(100);}
  }else{
  await cdp.evaluate(`(()=>{const el=document.querySelector('#map-select');el.value=${JSON.stringify(map)};if(el.value!==${JSON.stringify(map)})throw new Error('Map option missing');el.dispatchEvent(new Event('change'))})()`);await sleep(2000);
  }
  if(await cdp.evaluate('document.documentElement.dataset.boot')!=='ready')throw new Error('Map boot failed');
  if(await cdp.evaluate("document.querySelector('#map-label-title')?.textContent")!==expectedMap.name)throw new Error('Regional map did not load: '+await cdp.evaluate("JSON.stringify({title:document.querySelector('#map-label-title')?.textContent,studio:document.querySelector('#studio-message')?.textContent,error:document.querySelector('#runtime-error')?.textContent})"));
  if(raisedCapture&&mode==='auto')geometryProof.push(await cdp.evaluate(`(async()=>{
   const {createGroundSurfaces}=await import('/src/environment-art.mjs');const {terrainHeightField}=await import('/src/terrain-height.mjs');const d=${JSON.stringify(expectedMap)},before=JSON.stringify(d),objects=createGroundSurfaces(d),base=objects[0],mist=objects.find(o=>o.userData.groundMistProfile);
   if(!mist)throw new Error('Raised mist missing');const a=base.geometry.getAttribute('position'),b=mist.geometry.getAttribute('position'),uv=mist.geometry.getAttribute('uv');
   if(a.count!==b.count||JSON.stringify(Array.from(a.array))!==JSON.stringify(Array.from(b.array))||JSON.stringify(Array.from(base.geometry.index.array))!==JSON.stringify(Array.from(mist.geometry.index.array)))throw new Error('Mist terrain triangles changed');
   let maxUvError=0;for(let i=0;i<a.count;i++)maxUvError=Math.max(maxUvError,Math.abs(uv.getX(i)-(a.getX(i)+d.width/2)/d.width),Math.abs(uv.getY(i)-(1-(a.getZ(i)+d.height/2)/d.height)));if(maxUvError>1e-6||mist.position.y!==.065)throw new Error('Mist ground registration mismatch');
   const field=terrainHeightField(d),coverage=mist.material.uniforms.coverage.value.image;let excludedWaterCells=0;for(const o of d.obstacles)if(o.material==='water')for(let r=o.row;r<o.row+o.height;r++)for(let c=o.column;c<o.column+o.width;c++)if(field.corners(c,r).some(h=>h>0)){for(let y=r*2;y<r*2+2;y++)for(let x=c*2;x<c*2+2;x++)if(coverage.data[(y*coverage.width+x)*4+1]!==0)throw new Error('Raised water mist leaked');excludedWaterCells++;}
   if(JSON.stringify(d)!==before)throw new Error('Mist mutated authored map');const result={map:d.id,vertices:a.count,triangles:base.geometry.index.count/3,maxUvError,groundLift:.04,excludedWaterCells,sourceUnchanged:true};for(const o of objects){o.geometry.dispose();o.material.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose())}return result;
  })()`));
  for(const view of ['strategic','ordinary']){
   await cdp.evaluate(`document.querySelector(${JSON.stringify(view==='strategic'?'#camera-fit-map':'#camera-home-base')}).click()`);await sleep(350);
   if(view==='ordinary'){for(let i=0;i<4;i++){await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:550,y:320,deltaX:0,deltaY:-850});await sleep(150);}await cdp.evaluate("document.querySelector('#camera-home-base').click()");await sleep(400);}
   const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+map+'-'+mode+'-'+view+'.png',Buffer.from(shot.data,'base64'));
  }
  proof.push(await cdp.evaluate(`(async()=>{const {groundMistProfile}=await import('/src/terrain-atmosphere.mjs');return {map:${JSON.stringify(map)},mode:${JSON.stringify(mode)},boot:document.documentElement.dataset.boot,error:document.querySelector('#runtime-error')?.textContent,profile:groundMistProfile({terrainBase:${JSON.stringify(map.startsWith('vesperra')?'jungle-loam':'lunar-soil')}})}})()`));
 }
 if(raisedCapture)await writeFile(out+'/geometry-proof.json',JSON.stringify(geometryProof,null,2)+'\n');
 await writeFile(out+'/runtime-proof.json',JSON.stringify({proof,errors},null,2)+'\n');if(errors.length||proof.some(p=>p.error))throw new Error('Mist runtime errors');console.log(JSON.stringify({maps:2,views:12,errors}));
}finally{cdp?.close();chrome.kill()}
