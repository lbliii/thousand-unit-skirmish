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


const profile=await mkdtemp('/tmp/vaelora-variety-chrome-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--window-size=1280,720','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let cdp;
const out='docs/qa-evidence/vaelora-terrain-variety-2026-09-29';
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 // Compare identical cameras, then render flat fields using the consuming shader.
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await mkdir(out,{recursive:true});
 const room=await(await fetch(new URL('/api/rooms',BASE),{method:'POST',headers:{origin:BASE.origin,'content-type':'application/json'},body:'{}'})).json();
 if(!room.roomId)throw new Error(room.error || 'isolated review room failed');
 for(const mode of ['mirror','stochastic']){
  await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId+'&terrainTiling='+mode});await sleep(5000);
  if(mode==='mirror')console.log(await cdp.evaluate('JSON.stringify({openingGroundRequests:performance.getEntriesByType("resource").filter(e=>e.name.includes("?v=vaelora-ground-v1")).map(e=>e.name)})'));
  await cdp.evaluate('(()=>{const el=document.querySelector("#map-select");el.value="frontier-materials";el.dispatchEvent(new Event("change"))})()');await sleep(2500);await cdp.evaluate('document.querySelector("#camera-fit-map").click()');await sleep(300);
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/materials-'+mode+'.png',Buffer.from(shot.data,'base64'));
  console.log(await cdp.evaluate('JSON.stringify({boot:document.documentElement.dataset.boot,map:document.querySelector("#map-label-title")?.textContent,team:document.querySelector("#player-team")?.textContent,error:document.querySelector("#runtime-error")?.textContent})'));
 }
 await cdp.evaluate('document.querySelector("#map-studio-open").click()');await cdp.call('DOM.enable');const doc=await cdp.call('DOM.getDocument');const input=await cdp.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#studio-import-file'});
 await cdp.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(ROOT,'docs/qa-evidence/vaelora-terrain-blend-2026-09-29/organic-ground-study.json')]});await sleep(600);await cdp.evaluate('document.querySelector("#studio-publish").click()');await sleep(1800);
 for(const mode of ['stochastic','mirror']){
  await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId+'&terrainTiling='+mode});await sleep(4000);
  await cdp.evaluate('document.querySelector("#camera-fit-map").click()');await sleep(500);
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/organic-'+mode+'.png',Buffer.from(shot.data,'base64'));
 }
 for(const terrain of ['scree','meadow']){
  for(const enabled of [false,true]){
   const data=await cdp.evaluate(`(async()=>{
    const THREE=await import('/vendor/three.module.js');
    const {applyTerrainTextureSampling}=await import('/src/terrain-texture-sampling.mjs');
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:false});renderer.setSize(512,512);renderer.setPixelRatio(1);
    const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-64,64,64,-64,0.1,200);camera.position.z=100;
    const texture=await new THREE.TextureLoader().loadAsync('/assets/environment/frontier-v1/${terrain}.webp');texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping;texture.repeat.set(128/12,128/12);
    const material=applyTerrainTextureSampling(new THREE.MeshBasicMaterial({map:texture}),42,${enabled});const geometry=new THREE.PlaneGeometry(128,128);
    scene.add(new THREE.Mesh(geometry,material));renderer.render(scene,camera);
    const image=renderer.domElement.toDataURL('image/png');geometry.dispose();material.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();return image;
   })()`);
   await writeFile(out+'/'+terrain+'-'+(enabled?'stochastic':'mirror')+'-128.png',Buffer.from(data.split(',')[1],'base64'));
  }
 }
 await cdp.evaluate('document.querySelector("#map-studio-open").click()');
 const studyDocument=await cdp.call('DOM.getDocument');const studyInput=await cdp.call('DOM.querySelector',{nodeId:studyDocument.root.nodeId,selector:'#studio-import-file'});
 await cdp.call('DOM.setFileInputFiles',{nodeId:studyInput.nodeId,files:[path.join(ROOT,out,'wet-ground-study.json')]});await sleep(700);console.log(await cdp.evaluate('document.querySelector("#studio-message").textContent'));await cdp.evaluate('document.querySelector("#studio-publish").click()');await sleep(1500);
 for(const atmosphere of ['clear','mist']){
  await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId+'&terrainAtmosphere='+atmosphere+'&terrainAtmosphereTime=12'});await sleep(4000);
  await cdp.evaluate('document.querySelector("#camera-fit-map").click()');await sleep(500);
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/atmosphere-'+atmosphere+'.png',Buffer.from(shot.data,'base64'));
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:550,y:320,deltaX:0,deltaY:-550});await sleep(800);
  const closeShot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/atmosphere-'+atmosphere+'-close.png',Buffer.from(closeShot.data,'base64'));
 }
 console.log(await cdp.evaluate('JSON.stringify({map:document.querySelector("#map-label-title")?.textContent,error:document.querySelector("#runtime-error")?.textContent,materials:[...document.querySelectorAll("#studio-terrain-base option")].map(o=>o.value)})'));
 if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')!=='VAELORA WET GROUND STUDY')throw new Error('Atmosphere study was not published successfully');
 console.log(JSON.stringify({consoleErrors:errors}));if(errors.length)process.exitCode=1;
}finally{cdp?.close();chrome.kill()}
