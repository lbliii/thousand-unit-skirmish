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



const profile=await mkdtemp('/tmp/vaelora-quiet-meadow-chrome-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--window-size=1024,768','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const out='docs/qa-evidence/vaelora-quiet-meadow-2026-09-30';let cdp;
try {
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await mkdir(out,{recursive:true});
 await cdp.call('Page.navigate',{url:BASE.origin});await sleep(5000);
 const proof=[];
 for(const terrain of ['meadow','bellweather-quiet-meadow'])for(const span of [32,128])for(const free of [false,true]){
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');const {applyTerrainTextureSampling}=await import('/src/terrain-texture-sampling.mjs');
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:false});renderer.setSize(512,512);renderer.setPixelRatio(1);
   const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-${span}/2,${span}/2,${span}/2,-${span}/2,.1,200);camera.position.z=100;
   const texture=await new THREE.TextureLoader().loadAsync('/assets/environment/frontier-v1/${terrain}.webp');texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping;texture.repeat.set(${span}/12,${span}/12);
   const material=applyTerrainTextureSampling(new THREE.MeshBasicMaterial({map:texture}),42,true,${free});const geometry=new THREE.PlaneGeometry(${span},${span});scene.add(new THREE.Mesh(geometry,material));
   renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');renderer.render(scene,camera);const stable=image===renderer.domElement.toDataURL('image/png');const programs=renderer.info.programs.length;
   geometry.dispose();material.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();return {image,stable,programs};
  })()`);
  const name=terrain+'-'+span+'-'+(free?'free':'cardinal')+'.png';await writeFile(out+'/'+name,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;if(!result.stable||result.programs!==1)throw new Error('Terrain render registration failed');proof.push({terrain,span,free,...result});
 }
 await cdp.call('Page.navigate',{url:BASE.origin+'/?meadowSurface=quiet'});await sleep(5000);
 const boot=await cdp.evaluate('({ready:document.documentElement.dataset.boot,error:document.querySelector("#runtime-error")?.textContent,quietLoaded:performance.getEntriesByType("resource").some(e=>e.name.includes("bellweather-quiet-meadow.webp"))})');if(boot.ready!=='ready'||boot.error||!boot.quietLoaded)throw new Error('Runtime quiet-meadow boot failed');
 const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/runtime-quiet.png',Buffer.from(shot.data,'base64'));
 if(errors.length)throw new Error(errors.join('\n'));await writeFile(out+'/rotation-proof.json',JSON.stringify({seed:42,boot,errors,proof},null,2)+'\n');console.log(JSON.stringify({views:proof.length,errors}));
}finally{cdp?.close();chrome.kill()}
