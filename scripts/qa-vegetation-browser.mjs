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


const profile=await mkdtemp('/tmp/vaelora-vegetation-chrome-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--window-size=1280,720','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const region=process.env.RTS_VEGETATION_REGION || 'bellweather';
if(!['bellweather','veyrholds','underbough','sereward','ellionar'].includes(region))throw new Error('Unknown vegetation capture region');
const lifecycle=process.env.RTS_VEGETATION_LIFECYCLE==='1';
const out=lifecycle ? 'docs/qa-evidence/vaelora-bellweather-lifecycle-2026-09-30' : region==='bellweather' ? 'docs/qa-evidence/vaelora-vegetation-2026-09-30' : 'docs/qa-evidence/vaelora-'+region+'-2026-09-30';
let cdp;
try {
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await mkdir(out,{recursive:true});
 const room=await(await fetch(new URL('/api/rooms',BASE),{method:'POST',headers:{origin:BASE.origin,'content-type':'application/json'},body:'{}'})).json();
 if(!room.roomId)throw new Error(room.error || 'isolated review room failed');
 await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId});await sleep(5500);
 const openingRequests=await cdp.evaluate('performance.getEntriesByType("resource").filter(e=>e.name.includes("assets/environment")).map(e=>new URL(e.name).pathname)');
 if(openingRequests.some(p=>p.includes('underbough-')||p.includes('veyrholds-')||p.includes('sereward-')||p.includes('ellionar-')))throw new Error('Unused regional sprites loaded eagerly');
 await writeFile(out+'/opening-requests.json',JSON.stringify(openingRequests,null,2)+'\n');
 for(const mode of ['ordinary','strategic']) {
  if(mode==='strategic')await cdp.evaluate('document.querySelector("#camera-fit-map").click()');
  await sleep(400);const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/forked-vale-'+mode+'.png',Buffer.from(shot.data,'base64'));
 }
 if(region==='sereward') {
  await cdp.evaluate('document.querySelector("#map-studio-open").click()');await cdp.call('DOM.enable');const doc=await cdp.call('DOM.getDocument');const input=await cdp.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#studio-import-file'});
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(ROOT,out,'sereward-oasis-study.json')]});await sleep(600);await cdp.evaluate('document.querySelector("#studio-publish").click()');await sleep(2500);
  if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')!=='SEREWARD OASIS STUDY')throw new Error('Oasis study import/save/play failed');
  await cdp.evaluate('document.querySelector("#camera-fit-map").click()');await sleep(400);const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/oasis-save-play.png',Buffer.from(shot.data,'base64'));
 }
 for(const span of [18,36]) {
  const data=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {addObstacleEnvironmentSprites,createGroundSurfaces}=await import('/src/environment-art.mjs');
   const d={id:'bellweather-study',width:24,height:24,terrainSeed:941,terrainBase:'meadow',terrainPatches:[{column:0,row:12,width:24,height:12,material:'dry-grass'}],obstacles:[{row:5,column:6,width:5,height:5,material:'forest'},{row:14,column:14,width:4,height:3,material:'forest'}]};
   if(${JSON.stringify(region)}==='veyrholds'){d.id='veyrholds-study';d.terrainBase='scree';d.terrainPatches=[];d.obstacles.push({row:16,column:6,width:5,height:2,material:'stone',elevation:0.72})}
   if(${JSON.stringify(region)}==='underbough'){d.id='underbough-study';d.terrainBase='forest-floor';d.terrainPatches=[{column:0,row:12,width:24,height:12,material:'dirt'}]}
   if(${JSON.stringify(region)}==='sereward'){d.id='sereward-study';d.terrainBase='sand';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='ellionar'){d.id='ellionar-study';d.terrainBase='garden-loam';d.terrainPatches=[{column:0,row:12,width:24,height:12,material:'dirt'}]}
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1000,750);renderer.setPixelRatio(1);
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x859175);const camera=new THREE.OrthographicCamera(-${span}*4/3,${span}*4/3,${span},-${span},0.1,200);camera.position.set(30,43,30);camera.lookAt(0,0,0);
   for(const o of createGroundSurfaces(d))scene.add(o);addObstacleEnvironmentSprites(d,12,12,o=>scene.add(o));
   await new Promise(r=>setTimeout(r,1400));renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');
   scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material.dispose()}});renderer.dispose();renderer.forceContextLoss();return image;
  })()`);
  await writeFile(out+'/'+region+'-renderer-'+(span===18?'ordinary':'strategic')+'.png',Buffer.from(data.split(',')[1],'base64'));
 }
 if(lifecycle) {
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {addObstacleEnvironmentSprites,createGroundSurfaces,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const d={width:24,height:24,terrainBase:'meadow',obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]};
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x727a57);
   const slots=addObstacleEnvironmentSprites(d,12,12,o=>scene.add(o));
   for(const slot of slots.values())setForestSpriteStock(slot,0);
   // Hide every non-preview slot, including registered depleted frames.
   for(const m of scene.children){const zero=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<m.count;i++)m.setMatrixAt(i,zero);m.instanceMatrix.needsUpdate=true}
   const selected=[...slots.values()].filter(s=>s.stateMeshes).slice(0,4);
   if(selected.length!==4)throw new Error('Lifecycle pilot slots missing');
   const expected=['full','worked','low','depleted'],stocks=[6,3,1,0],checks=[];
   for(let i=0;i<4;i++){
    const s=selected[i];s.x=(i-1.5)*3;s.z=-s.x;
    const actual=setForestSpriteStock(s,stocks[i]);if(actual!==expected[i])throw new Error('Wrong stock stage');
    const matrices={};for(const [stage,m] of Object.entries(s.stateMeshes)){
     const matrix=new THREE.Matrix4();m.getMatrixAt(s.index,matrix);const scale=new THREE.Vector3().setFromMatrixScale(matrix);
     if((scale.length()>0)!==(stage===expected[i]))throw new Error('Multiple/missing active frames');
     matrices[stage]=matrix.elements;
    }
    checks.push({stock:stocks[i],stage:actual,matrices});
   }
   // A reset restores full art and hides each prior stock frame at the same address.
   const s=selected[3];setForestSpriteStock(s,6);const matrix=new THREE.Matrix4();s.stateMeshes.full.getMatrixAt(s.index,matrix);
   if(new THREE.Vector3().setFromMatrixScale(matrix).length()===0)throw new Error('Reset failed');setForestSpriteStock(s,0);
   for(const o of createGroundSurfaces({...d,obstacles:[]}))scene.add(o);
   for(let i=0;i<50&&scene.children.some(o=>o.material.map&&!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   if(scene.children.some(o=>o.material.map&&!o.material.map.image?.naturalWidth))throw new Error('Lifecycle texture load failed');
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1200,500);
   const camera=new THREE.OrthographicCamera(-12,12,5,-5,0.1,200);camera.position.set(30,43,30);camera.lookAt(0,1,0);
   renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');
   scene.traverse(o=>{o.geometry?.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material?.dispose()});renderer.dispose();renderer.forceContextLoss();
   return {checks,reset:true,image};
  })()`);
  await writeFile(out+'/lifecycle-renderer.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
  await writeFile(out+'/lifecycle-proof.json',JSON.stringify(result,null,2)+'\n');
 }
 const proof=await cdp.evaluate(`(async()=>{
  const THREE=await import('/vendor/three.module.js');
  const {addObstacleEnvironmentSprites,createGroundSurfaces}=await import('/src/environment-art.mjs');
  const results=[];
  for(const terrainBase of ['meadow','snow','scree','forest-floor','sand','garden-loam']) {
   const d={id:'vegetation-proof',width:12,height:12,terrainBase,obstacles:[{row:3,column:3,width:6,height:6,material:'forest'},{row:10,column:1,width:10,height:1,material:'stone',elevation:0.72}]};
   const objects=[];const slots=addObstacleEnvironmentSprites(d,6,6,o=>objects.push(o));
   for(let i=0;i<50 && objects.some(o=>!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   if(objects.some(o=>!o.material.map.image?.naturalWidth))throw new Error('Environment texture failed to load');
   const files=objects.map(o=>o.material.map.image?.src?.split('/').pop());
   results.push({terrainBase,cells:[...slots.keys()],files});
   for(const o of objects){o.geometry.dispose();o.material.dispose()}
  }
  return results;
 })()`);
 await writeFile(out+'/forest-slot-proof.json',JSON.stringify(proof,null,2)+'\n');
 if(proof.some(r=>r.cells.length!==36)||JSON.stringify(proof[0].cells.slice().sort((a,b)=>a-b))!==JSON.stringify(proof[1].cells.slice().sort((a,b)=>a-b)))throw new Error('Forest slot identity changed');
 if(!proof[0].files.includes('bellweather-field-maple.webp')||!proof[0].files.includes('bellweather-hedgerow.webp')||proof[1].files.some(f=>f.startsWith('bellweather')))throw new Error('Vegetation palette binding mismatch');
 if(!proof[2].files.includes('veyrholds-highpine.webp')||!proof[2].files.includes('veyrholds-ironlichen-outcrop.webp')||proof.slice(0,2).some(r=>r.files.some(f=>f.startsWith('veyrholds'))))throw new Error('Veyrholds palette binding mismatch');
 if(!proof[3].files.includes('underbough-copperleaf.webp')||!proof[3].files.includes('underbough-bramble.webp')||proof[3].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,3).some(r=>r.files.some(f=>f.startsWith('underbough'))))throw new Error('Underbough forest mix mismatch');
 if(!['sereward-palm.webp','sereward-acacia.webp','sereward-scrub.webp'].every(f=>proof[4].files.includes(f))||proof[4].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,4).some(r=>r.files.some(f=>f.startsWith('sereward'))))throw new Error('Sereward forest mix mismatch');
 if(!['ellionar-cultivated-palm.webp','ellionar-garden-hedge.webp'].every(f=>proof[5].files.includes(f))||proof[5].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,5).some(r=>r.files.some(f=>f.startsWith('ellionar'))))throw new Error('Ellionar garden mix mismatch');
 const reference=JSON.stringify(proof[0].cells.slice().sort((a,b)=>a-b));
 if(proof.some(r=>JSON.stringify(r.cells.slice().sort((a,b)=>a-b))!==reference))throw new Error('Regional forest cells differ');
 const covers=await cdp.evaluate(`(async()=>{
  const {createGroundSurfaces,TERRAIN_MATERIALS}=await import('/src/environment-art.mjs');
  const expected={meadow:'forest-floor',sand:'dirt','garden-loam':'garden-loam',scree:'scree',snow:'snow',ice:'snow','tidal-mud':'tidal-mud','jungle-loam':'jungle-loam','lunar-soil':'lunar-soil'};
  const result=[];
  for(const [base,cover] of Object.entries(expected)){
   const meshes=createGroundSurfaces({width:12,height:12,terrainBase:base,obstacles:[{column:4,row:4,width:4,height:4,material:'forest'}]});
   const roots=meshes.find(m=>m.renderOrder===-20+TERRAIN_MATERIALS.length);
   for(let i=0;i<50 && !roots?.material.map.image?.complete;i++)await new Promise(r=>setTimeout(r,100));
   const file=roots?.material.map.image?.src?.split('/').pop()?.split('?')[0];
   if(file!==cover+'.webp'||roots?.userData.ownedGroundTextures?.length!==2||!roots.material.alphaMap)throw new Error('Root-cover texture/ownership mismatch: '+base);
   result.push({base,file,ownedTextures:2});
   for(const m of meshes){m.geometry.dispose();m.userData.ownedGroundTextures?.forEach(t=>t.dispose());m.material.dispose()}
  }
  return result;
 })()`);
 await writeFile(out+'/forest-cover-proof.json',JSON.stringify(covers,null,2)+'\n');
 console.log(await cdp.evaluate('JSON.stringify({boot:document.documentElement.dataset.boot,map:document.querySelector("#map-label-title")?.textContent,error:document.querySelector("#runtime-error")?.textContent})'));
 console.log(JSON.stringify({forestCells:36,errors}));if(errors.length)process.exitCode=1;
} finally {cdp?.socket.close();chrome.kill('SIGTERM')}
