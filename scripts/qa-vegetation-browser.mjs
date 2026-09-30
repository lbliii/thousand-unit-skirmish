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
if(!['bellweather','veyrholds','underbough','sereward','ellionar','pale-meridian','siltmouths','vesperra','sombral-mere','ru-lora'].includes(region))throw new Error('Unknown vegetation capture region');
const brambleCapture=process.env.RTS_VEGETATION_FAMILY==='underbough-bramble';
if(brambleCapture&&region!=='underbough')throw new Error('Bramble capture requires Underbough');
const lifecycle=process.env.RTS_VEGETATION_LIFECYCLE==='1';
if(lifecycle&&!['bellweather','sereward','pale-meridian','siltmouths','vesperra','sombral-mere','underbough'].includes(region))throw new Error('No lifecycle pack for region');
const atlasCapture=process.env.RTS_VEGETATION_ATLAS==='1';
const out=brambleCapture ? 'docs/qa-evidence/vaelora-underbough-bramble-atlas-2026-09-30' : atlasCapture ? 'docs/qa-evidence/vaelora-'+region+'-atlas-2026-09-30' : lifecycle ? 'docs/qa-evidence/vaelora-'+region+'-lifecycle-2026-09-30' : region==='ru-lora' ? 'docs/qa-evidence/vaelora-ru-lora-broken-2026-09-30' : region==='bellweather' ? 'docs/qa-evidence/vaelora-vegetation-2026-09-30' : 'docs/qa-evidence/vaelora-'+region+'-2026-09-30';
let cdp;
try {
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);if(port)break}catch{}await sleep(100)}
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 const errors=[];cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '))});
 await cdp.call('Page.enable');await cdp.call('Runtime.enable');await mkdir(out,{recursive:true});
 if(lifecycle)await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:`
  const NativeWebSocket=window.WebSocket;
  window.WebSocket=class extends NativeWebSocket{
   constructor(...args){super(...args);window.__qaForestSocket=this;
    this.addEventListener('message',event=>{const m=JSON.parse(event.data);
     if(m.type==='state')window.__qaForestState=m;
     else if(m.state)window.__qaForestState=m.state;
    });
   }
  };`});
 const room=await(await fetch(new URL('/api/rooms',BASE),{method:'POST',headers:{origin:BASE.origin,'content-type':'application/json'},body:'{}'})).json();
 if(!room.roomId)throw new Error(room.error || 'isolated review room failed');
 await cdp.call('Page.navigate',{url:BASE.origin+'/?room='+room.roomId});await sleep(5500);
 if(await cdp.evaluate('document.documentElement.dataset.boot')!=='ready')throw new Error('Game did not boot before appearance capture');
 const openingRequests=await cdp.evaluate('performance.getEntriesByType("resource").filter(e=>e.name.includes("assets/environment")).map(e=>new URL(e.name).pathname)');
 if(openingRequests.filter(p=>p.endsWith('.webp')).some(p=>p.includes('underbough-')||p.includes('veyrholds-')||p.includes('sereward-')||p.includes('ellionar-')||p.includes('pale-meridian-')||p.includes('siltmouths-')||p.includes('vesperra-')||p.includes('sombral-mere-')||p.includes('ru-lora-')))throw new Error('Unused regional sprites loaded eagerly');
 await writeFile(out+'/opening-requests.json',JSON.stringify(openingRequests,null,2)+'\n');
 for(const mode of ['ordinary','strategic']) {
  if(mode==='strategic')await cdp.evaluate('document.querySelector("#camera-fit-map").click()');
  await sleep(400);const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/forked-vale-'+mode+'.png',Buffer.from(shot.data,'base64'));
 }
 if(['sereward','ru-lora'].includes(region)) {
  const studyFile=region==='ru-lora'?'docs/qa-evidence/vaelora-ru-lora-interior-2026-09-30/ru-lora-interior-study.json':'docs/qa-evidence/vaelora-sereward-2026-09-30/sereward-oasis-study.json';
  const study=JSON.parse(await readFile(studyFile,'utf8'));
  await cdp.evaluate('document.querySelector("#map-studio-open").click()');await cdp.call('DOM.enable');const doc=await cdp.call('DOM.getDocument');const input=await cdp.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#studio-import-file'});
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(ROOT,studyFile)]});await sleep(600);await cdp.evaluate('document.querySelector("#studio-publish").click()');await sleep(2500);
  if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')!==study.name)throw new Error('Regional study import/save/play failed: '+await cdp.evaluate('document.querySelector("#studio-message")?.textContent'));
  for(const mode of ['ordinary','strategic']){
   if(region==='ru-lora'&&mode==='ordinary'){
    await cdp.evaluate(`const c=document.querySelector('#viewport canvas');const r=c.getBoundingClientRect();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000,clientX:r.x+r.width/2,clientY:r.y+r.height/2,cancelable:true}));document.querySelector('#camera-home-base').click()`);
   }
   if(mode==='strategic')await cdp.evaluate('document.querySelector("#camera-fit-map").click()');
   await sleep(400);const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+(region==='sereward'?'oasis':'interior')+'-save-play-'+mode+'.png',Buffer.from(shot.data,'base64'));
   if(region==='sereward'&&mode==='strategic')await writeFile(out+'/oasis-save-play.png',Buffer.from(shot.data,'base64'));
  }
  if(region==='ru-lora'){
   const requests=await cdp.evaluate('performance.getEntriesByType("resource").filter(e=>e.name.includes("assets/environment")).map(e=>new URL(e.name).pathname)');
   if(!['ru-lora-fiendwood.webp','ru-lora-stone-fern.webp','ru-lora-broken-trunk.webp','rock-boulder-cluster.webp'].every(f=>requests.some(p=>p.endsWith('/'+f))))throw new Error('Interior study regional images missing');
   await writeFile(out+'/study-requests.json',JSON.stringify(requests,null,2)+'\n');
  }
 }
 for(const span of [18,36]) {
  const data=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const {addObstacleEnvironmentSprites,createGroundSurfaces}=await import('/src/environment-art.mjs');
   const d={id:'bellweather-study',width:24,height:24,terrainSeed:941,terrainBase:'meadow',terrainPatches:[{column:0,row:12,width:24,height:12,material:'dry-grass'}],obstacles:[{row:5,column:6,width:5,height:5,material:'forest'},{row:14,column:14,width:4,height:3,material:'forest'}]};
   if(${JSON.stringify(region)}==='veyrholds'){d.id='veyrholds-study';d.terrainBase='scree';d.terrainPatches=[];d.obstacles.push({row:16,column:6,width:5,height:2,material:'stone',elevation:0.72})}
   if(${JSON.stringify(region)}==='ru-lora'){d.id='ru-lora-study';d.terrainBase='salt-crust';d.terrainPatches=[];d.obstacles=[{row:6,column:3,width:18,height:2,material:'stone',elevation:0.72},{row:14,column:6,width:12,height:2,material:'stone',elevation:0.72}]}
   if(${JSON.stringify(region)}==='underbough'){d.id='underbough-study';d.terrainBase='forest-floor';d.terrainPatches=[{column:0,row:12,width:24,height:12,material:'dirt'}]}
   if(${JSON.stringify(region)}==='sereward'){d.id='sereward-study';d.terrainBase='sand';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='sombral-mere'){d.id='sombral-mere-study';d.terrainBase='lunar-soil';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='vesperra'){d.id='vesperra-study';d.terrainBase='jungle-loam';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='siltmouths'){d.id='siltmouths-study';d.terrainBase='tidal-mud';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='pale-meridian'){d.id='pale-meridian-study';d.terrainBase='snow';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='ellionar'){d.id='ellionar-study';d.terrainBase='garden-loam';d.terrainPatches=[{column:0,row:12,width:24,height:12,material:'dirt'}]}
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1000,750);renderer.setPixelRatio(1);
   const scene=new THREE.Scene();scene.background=new THREE.Color(${JSON.stringify(region)}==='ru-lora'?0x34303f:0x859175);const camera=new THREE.OrthographicCamera(-${span}*4/3,${span}*4/3,${span},-${span},0.1,200);camera.position.set(...CAMERA_VIEW_DIRECTION).multiplyScalar(50);camera.lookAt(0,0,0);
   for(const o of createGroundSurfaces(d))scene.add(o);addObstacleEnvironmentSprites(d,12,12,o=>scene.add(o));
   await new Promise(r=>setTimeout(r,1400));renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');
   scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material.dispose()}});renderer.dispose();renderer.forceContextLoss();return image;
  })()`);
  await writeFile(out+'/'+region+'-renderer-'+(span===18?'ordinary':'strategic')+'.png',Buffer.from(data.split(',')[1],'base64'));
 }
 if(lifecycle) {
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const {addObstacleEnvironmentSprites,createGroundSurfaces,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const d={width:24,height:24,terrainBase:${JSON.stringify(region==='underbough'?'forest-floor':region==='sombral-mere'?'lunar-soil':region==='vesperra'?'jungle-loam':region==='siltmouths'?'tidal-mud':region==='pale-meridian'?'snow':region==='sereward'?'sand':'meadow')},obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]};
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x727a57);
   const slots=addObstacleEnvironmentSprites(d,12,12,o=>scene.add(o));
   for(const slot of slots.values())setForestSpriteStock(slot,0);
   // Hide every non-preview slot, including registered depleted frames.
   for(const m of scene.children){const zero=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<m.count;i++)m.setMatrixAt(i,zero);m.instanceMatrix.needsUpdate=true}
   const selected=[...slots.values()].filter(s=>s.family===${JSON.stringify(brambleCapture?'underbough-bramble':region==='underbough'?'underbough-copperleaf':region==='sombral-mere'?'sombral-mere-merebloom':region==='vesperra'?'vesperra-mistbark':region==='siltmouths'?'siltmouths-tidal-tree':region==='pale-meridian'?'pale-meridian-conifer':region==='sereward'?'sereward-palm':'bellweather-field-maple')}&&s.atlas).slice(0,4);
   if(selected.length!==4)throw new Error('Lifecycle pilot slots missing');
   const expected=['full','worked','low','depleted'],stocks=[6,3,1,0],checks=[];
   for(let i=0;i<4;i++){
    const s=selected[i];s.x=(i-1.5)*3;s.z=-s.x;
    const actual=setForestSpriteStock(s,stocks[i]);if(actual!==expected[i])throw new Error('Wrong stock stage');
    const uv=Array.from(s.atlas.rects.array.slice(s.index*4,s.index*4+4));
    if(uv.some((v,j)=>Math.abs(v-s.atlas.frameRects[expected[i]][j])>1e-7))throw new Error('Wrong atlas UV');
    const matrix=new THREE.Matrix4();s.mesh.getMatrixAt(s.index,matrix);
    if(new THREE.Vector3().setFromMatrixScale(matrix).length()===0)throw new Error('Atlas state hidden');
    const view=new THREE.Matrix4().lookAt(new THREE.Vector3(...CAMERA_VIEW_DIRECTION),new THREE.Vector3(),new THREE.Vector3(0,1,0));
    const up=new THREE.Vector3(0,1,0).transformDirection(matrix).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(view).invert());
    const roll=Math.atan2(-up.x,up.y)*180/Math.PI;if(Math.abs(roll)>0.0001)throw new Error('Sprite screen roll '+roll);
    checks.push({stock:stocks[i],stage:actual,uv,matrix:matrix.elements,screenRollDegrees:roll});
   }
   if(new Set(selected.map(s=>s.mesh)).size!==1)throw new Error('Lifecycle not batched into one mesh');
   const s=selected[3];setForestSpriteStock(s,6);
   const resetUv=Array.from(s.atlas.rects.array.slice(s.index*4,s.index*4+4));
   if(resetUv.some((v,j)=>Math.abs(v-s.atlas.frameRects.full[j])>1e-7))throw new Error('Atlas reset failed');setForestSpriteStock(s,0);
   for(const o of createGroundSurfaces({...d,obstacles:[]}))scene.add(o);
   for(let i=0;i<50&&scene.children.some(o=>o.material.map&&!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   if(scene.children.some(o=>o.material.map&&!o.material.map.image?.naturalWidth))throw new Error('Lifecycle texture load failed');
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1200,500);
   const camera=new THREE.OrthographicCamera(-12,12,5,-5,0.1,200);camera.position.set(...CAMERA_VIEW_DIRECTION).multiplyScalar(50).add(new THREE.Vector3(0,1,0));camera.lookAt(0,1,0);
   renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');
   scene.traverse(o=>{o.geometry?.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material?.dispose()});renderer.dispose();renderer.forceContextLoss();
   return {checks,reset:true,forestBatches:1,image};
  })()`);
  await writeFile(out+'/lifecycle-renderer.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
  await writeFile(out+'/lifecycle-proof.json',JSON.stringify(result,null,2)+'\n');
 }
 const proof=await cdp.evaluate(`(async()=>{
  const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
  const {addObstacleEnvironmentSprites,createGroundSurfaces}=await import('/src/environment-art.mjs');
  const results=[];
  for(const terrainBase of ['meadow','snow','scree','forest-floor','sand','garden-loam','ice','tidal-mud','jungle-loam','lunar-soil','salt-crust']) {
   const d={id:'vegetation-proof',width:12,height:12,terrainBase,obstacles:[{row:3,column:3,width:6,height:6,material:'forest'},{row:10,column:1,width:10,height:1,material:'stone',elevation:0.72},{row:9,column:1,width:10,height:1,material:'stone',elevation:0.72}]};
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
 if(!proof[0].files.includes('bellweather-lifecycle-atlas.webp')||!proof[0].files.includes('bellweather-hedgerow.webp')||proof[1].files.some(f=>f.startsWith('bellweather')))throw new Error('Vegetation palette binding mismatch');
 if(!proof[2].files.includes('veyrholds-highpine.webp')||!proof[2].files.includes('veyrholds-ironlichen-outcrop.webp')||proof.slice(0,2).some(r=>r.files.some(f=>f.startsWith('veyrholds'))))throw new Error('Veyrholds palette binding mismatch');
 if(!proof[3].files.includes('underbough-lifecycle-atlas.webp')||!proof[3].files.includes('underbough-bramble-lifecycle-atlas.webp')||proof[3].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,3).some(r=>r.files.some(f=>f.startsWith('underbough'))))throw new Error('Underbough forest mix mismatch');
 if(!['sereward-lifecycle-atlas.webp','sereward-acacia.webp','sereward-scrub.webp'].every(f=>proof[4].files.includes(f))||proof[4].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,4).some(r=>r.files.some(f=>f.startsWith('sereward'))))throw new Error('Sereward forest mix mismatch');
 if(!['ellionar-cultivated-palm.webp','ellionar-garden-hedge.webp'].every(f=>proof[5].files.includes(f))||proof[5].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,5).some(r=>r.files.some(f=>f.startsWith('ellionar'))))throw new Error('Ellionar garden mix mismatch');
 for(const i of [1,6])if(!proof[i].files.includes('pale-meridian-lifecycle-atlas.webp')||proof[i].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Pale Meridian forest mix mismatch');
 if(!proof[7].files.includes('siltmouths-lifecycle-atlas.webp')||proof[7].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Siltmouths forest mix mismatch');
 if(!proof[8].files.includes('vesperra-lifecycle-atlas.webp')||proof[8].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Vesperra forest mix mismatch');
 if(!proof[9].files.includes('sombral-mere-lifecycle-atlas.webp')||proof[9].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Sombral Mere forest mix mismatch');
 if(!['ru-lora-fiendwood.webp','ru-lora-stone-fern.webp','ru-lora-broken-trunk.webp','rock-boulder-cluster.webp'].every(f=>proof[10].files.includes(f))||proof.slice(0,10).some(r=>r.files.some(f=>f.startsWith('ru-lora-'))))throw new Error('Ru Lora stone scenery binding mismatch');
 if(region==='ru-lora'){
  const placement=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const {addObstacleEnvironmentSprites}=await import('/src/environment-art.mjs');
   const up=new THREE.Vector3(0,1,0);const normal=new THREE.Vector3(...CAMERA_VIEW_DIRECTION).normalize();const screenRight=new THREE.Vector3().crossVectors(up,normal).normalize();
   const result=[];
   for(const id of ['ru-lora-placement-proof','meshy-resource-review']){
    const objects=[];addObstacleEnvironmentSprites({id,width:32,height:32,terrainBase:'salt-crust',obstacles:[{column:3,row:8,width:25,height:1,material:'stone',elevation:0.72},{column:3,row:18,width:25,height:1,material:'stone',elevation:0.72}]},16,16,o=>objects.push(o));
    const positions=[];let maxRoll=0;
    for(const mesh of objects){
     const matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);positions.push([matrix.elements[12],matrix.elements[13],matrix.elements[14]]);
      const spriteUp=new THREE.Vector3().setFromMatrixColumn(matrix,1).normalize();maxRoll=Math.max(maxRoll,Math.abs(spriteUp.dot(screenRight)));
     }
     mesh.geometry.dispose();mesh.material.dispose();
    }
    positions.sort((a,b)=>a[0]-b[0]||a[2]-b[2]);result.push({id,positions,maxScreenRollComponent:maxRoll});
   }
   if(JSON.stringify(result[0].positions)!==JSON.stringify(result[1].positions))throw new Error('Regional stone positions changed');
   if(result.some(r=>r.maxScreenRollComponent>0.0001))throw new Error('Stone sprites have screen roll');
   return result;
  })()`);
  await writeFile(out+'/stone-placement-proof.json',JSON.stringify(placement,null,2)+'\n');
 }
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
 if(lifecycle&&['sereward','pale-meridian','siltmouths','vesperra','sombral-mere','underbough'].includes(region)){
  const cold=region==='pale-meridian';
  const harvestCell=brambleCapture?769:768;
  const map={id:region+'-harvest-check',name:region.toUpperCase()+' HARVEST CHECK',summary:'Observe one regional tree through harvest and reset.',width:40,height:40,terrainBase:region==='underbough'?'forest-floor':region==='sombral-mere'?'lunar-soil':region==='vesperra'?'jungle-loam':region==='siltmouths'?'tidal-mud':cold?'snow':'sand',startingArmySize:8,startingResources:{wood:0},fogOfWar:true,spawnPoints:[{team:0,x:-14,z:0},{team:1,x:14,z:0}],obstacles:[{column:harvestCell%40,row:Math.floor(harvestCell/40),width:1,height:1,material:'forest'}],resourceNodes:[],triggers:[],scenarioEvents:[]};
  await cdp.evaluate(`window.__qaForestSocket.send(JSON.stringify({type:'publishMap',persist:false,map:${JSON.stringify(map)}}))`);
  for(let i=0;i<50;i++){if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')===map.name)break;await sleep(100)}
  if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')!==map.name)throw new Error('Harvest map publication failed');
  await cdp.evaluate('document.querySelector("#camera-home-base").click()');
  const anchor=await cdp.evaluate('(()=>{const r=document.querySelector("#viewport canvas").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await cdp.evaluate(`document.querySelector('#viewport canvas').dispatchEvent(new WheelEvent('wheel',{deltaY:-1600,clientX:${anchor.x},clientY:${anchor.y},cancelable:true}))`);
  await cdp.evaluate('document.querySelector("#camera-home-base").click()');
  await sleep(500);
  const before=await cdp.evaluate('window.__qaForestState.forestEpoch');
  let shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/harvest-full.png',Buffer.from(shot.data,'base64'));
  await cdp.evaluate(`window.__qaForestSocket.send(JSON.stringify({type:"gather",ids:[0],forestCell:${harvestCell}}))`);
  const observed=[];
  for(const [stage,limit] of [['worked',4],['low',2],['depleted',0]]){
   let stock=null;
   for(let i=0;i<300;i++){
    stock=await cdp.evaluate(`window.__qaForestState.forestStocks?.find(r=>r[0]===${harvestCell})?.[1] ?? null`);
    if(stock!==null&&stock<=limit)break;await sleep(100);
   }
   if(stock===null||stock>limit)throw new Error('Live harvest did not reach '+stage);
   if((stage==='worked'&&stock<=2)||(stage==='low'&&stock<=0))throw new Error('Missed live stock stage '+stage);
   await sleep(40);shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/harvest-'+stage+'.png',Buffer.from(shot.data,'base64'));observed.push({stage,stock});
  }
  await cdp.evaluate('window.__qaForestSocket.send(JSON.stringify({type:"reset"}))');
  let restored=false;
  for(let i=0;i<100;i++){
   restored=await cdp.evaluate(`window.__qaForestState.forestEpoch>${before}&&!window.__qaForestState.forestStocks?.length`);
   if(restored)break;await sleep(100);
  }
  if(!restored)throw new Error('Live forest reset failed');
  await sleep(100);shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/harvest-reset.png',Buffer.from(shot.data,'base64'));
  await writeFile(out+'/live-harvest-proof.json',JSON.stringify({mapId:map.id,targetCell:harvestCell,family:brambleCapture?'underbough-bramble':region==='underbough'?'underbough-copperleaf':region==='sombral-mere'?'sombral-mere-merebloom':region==='vesperra'?'vesperra-mistbark':region==='siltmouths'?'siltmouths-tidal-tree':cold?'pale-meridian-conifer':'sereward-palm',observed,reset:true},null,2)+'\n');
 }
 if(atlasCapture){
  cdp.on('Fetch.requestPaused',e=>{void cdp.call('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:404,responseHeaders:[{name:'content-type',value:'application/json'}],body:Buffer.from('{}').toString('base64')})});
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*-lifecycle-atlas.json',requestStage:'Request'}]});
  await cdp.call('Page.reload',{ignoreCache:true});await sleep(3500);
  const fallback=await cdp.evaluate(`(async()=>{
   const {addObstacleEnvironmentSprites,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const result=[];
   for(const [base,family] of [['meadow','bellweather-field-maple'],['sand','sereward-palm'],['snow','pale-meridian-conifer'],['tidal-mud','siltmouths-tidal-tree'],['jungle-loam','vesperra-mistbark'],['lunar-soil','sombral-mere-merebloom'],['forest-floor','underbough-copperleaf'],['forest-floor','underbough-bramble']]){
    const objects=[];const slots=addObstacleEnvironmentSprites({width:24,height:24,terrainBase:base,obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]},12,12,o=>objects.push(o));
    const s=[...slots.values()].find(s=>s.family===family);if(!s?.stateMeshes||s.atlas)throw new Error('Atlas fallback did not restore individual state batches');
    for(let i=0;i<50&&objects.some(o=>!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
    if(objects.some(o=>!o.material.map.image?.naturalWidth))throw new Error('Fallback textures did not decode');
    const stage=setForestSpriteStock(s,0);if(stage!=='depleted')throw new Error('Fallback state mapping failed');
    result.push({family,states:Object.keys(s.stateMeshes),depleted:true});
    for(const o of objects){o.geometry.dispose();o.material.dispose()}
   }
   return result;
  })()`);
  await writeFile(out+'/fallback-proof.json',JSON.stringify(fallback,null,2)+'\n');
 }
 console.log(await cdp.evaluate('JSON.stringify({boot:document.documentElement.dataset.boot,map:document.querySelector("#map-label-title")?.textContent,error:document.querySelector("#runtime-error")?.textContent})'));
 console.log(JSON.stringify({forestCells:36,errors}));if(errors.length)process.exitCode=1;
} finally {cdp?.socket.close();chrome.kill('SIGTERM')}
