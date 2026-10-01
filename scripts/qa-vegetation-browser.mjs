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
const bellHedgeCapture=process.env.RTS_VEGETATION_FAMILY==='bellweather-hedgerow';
if(bellHedgeCapture&&region!=='bellweather')throw new Error('Hedgerow capture requires Bellweather');
const acaciaCapture=process.env.RTS_VEGETATION_FAMILY==='sereward-acacia';
if(acaciaCapture&&region!=='sereward')throw new Error('Acacia capture requires Sereward');
const scrubCapture=process.env.RTS_VEGETATION_FAMILY==='sereward-scrub';
if(scrubCapture&&region!=='sereward')throw new Error('Scrub capture requires Sereward');
const hedgeCapture=process.env.RTS_VEGETATION_FAMILY==='ellionar-garden-hedge';
if(hedgeCapture&&region!=='ellionar')throw new Error('Hedge capture requires Ellionar');
const brambleCapture=process.env.RTS_VEGETATION_FAMILY==='underbough-bramble';
if(brambleCapture&&region!=='underbough')throw new Error('Bramble capture requires Underbough');
const lifecycle=process.env.RTS_VEGETATION_LIFECYCLE==='1';
if(lifecycle&&!['bellweather','sereward','pale-meridian','siltmouths','vesperra','sombral-mere','underbough','veyrholds','ellionar','bellweather'].includes(region))throw new Error('No lifecycle pack for region');
const atlasCapture=process.env.RTS_VEGETATION_ATLAS==='1';
const understoryCapture=process.env.RTS_VEGETATION_UNDERSTORY==='1';
if(understoryCapture&&!['bellweather','vesperra','siltmouths','pale-meridian','sombral-mere','underbough','veyrholds','ellionar','sereward'].includes(region))throw new Error('Understory capture requires a supported region');
const seedCapture=process.env.RTS_VEGETATION_SEED_STUDY==='1';
if(seedCapture&&!understoryCapture)throw new Error('Seed study requires understory capture');
const readabilityCapture=process.env.RTS_VEGETATION_READABILITY==='1';
if(readabilityCapture&&region!=='veyrholds')throw new Error('Readability fixture requires Veyrholds');
const variationCapture=process.env.RTS_VEGETATION_VARIATION==='1';
if(variationCapture&&(!understoryCapture||!['vesperra','sereward','underbough','pale-meridian','sombral-mere','siltmouths','veyrholds','ellionar','bellweather'].includes(region)))throw new Error('Variation capture requires supported regional understory');
const shoreCapture=process.env.RTS_VEGETATION_SHORE==='1';
if(shoreCapture&&!['siltmouths','sombral-mere'].includes(region))throw new Error('Shore capture requires Siltmouths or Sombral Mere');
const shoreMapFile=region==='sombral-mere'?'maps/sombral-mere-shore-gardens.json':'maps/siltmouths-reed-crossings.json';
const shoreBase=region==='sombral-mere'?'lunar-soil':'tidal-mud';
const lichenCapture=process.env.RTS_VEGETATION_LICHEN==='1';
if(lichenCapture&&region!=='pale-meridian')throw new Error('Lichen capture requires Pale Meridian');
const meadowCapture=process.env.RTS_VEGETATION_MEADOW==='1';
if(meadowCapture&&region!=='bellweather')throw new Error('Meadow capture requires Bellweather');
const gardenCapture=process.env.RTS_VEGETATION_GARDEN==='1';
if(gardenCapture&&region!=='ellionar')throw new Error('Garden capture requires Ellionar');
const fringeCanopyCapture=process.env.RTS_VEGETATION_FRINGE_CANOPY==='1';
const fringeCapture=process.env.RTS_VEGETATION_FRINGE==='1'||fringeCanopyCapture;
if(fringeCapture&&(!understoryCapture||region!=='vesperra'))throw new Error('Fringe capture requires living forest understory');
const plantContractCapture=process.env.RTS_VEGETATION_PLANT_CONTRACT==='1';
const evidenceOverride=process.env.RTS_VEGETATION_OUTPUT;
if(evidenceOverride&&!/^docs\/qa-evidence\/[a-z0-9-]+$/.test(evidenceOverride))throw new Error('Evidence output must name a single QA evidence directory');
const out=evidenceOverride || (plantContractCapture ? 'docs/qa-evidence/vaelora-plant-runtime-contract-2026-09-30' : gardenCapture ? 'docs/qa-evidence/vaelora-ellionar-channel-flowers-2026-09-30' : fringeCanopyCapture ? 'docs/qa-evidence/vaelora-ru-lora-fringe-canopy-2026-09-30' : fringeCapture ? 'docs/qa-evidence/vaelora-ru-lora-fringe-understory-2026-09-30' : meadowCapture ? 'docs/qa-evidence/vaelora-bellweather-open-meadow-2026-09-30' : lichenCapture ? 'docs/qa-evidence/vaelora-meridian-violet-lichen-2026-09-30' : shoreCapture ? (region==='sombral-mere'?'docs/qa-evidence/vaelora-mere-mirelily-2026-09-30':'docs/qa-evidence/vaelora-siltmouths-shore-reeds-2026-09-30') : variationCapture ? 'docs/qa-evidence/vaelora-'+region+'-'+(region==='sereward'?'succulent':region==='underbough'?'fungus':region==='pale-meridian'?'frostberry':region==='sombral-mere'?'noctilune':region==='siltmouths'?'marsh-tuber':region==='veyrholds'?'suncrest':region==='ellionar'?'garden-vine':region==='bellweather'?'clover':'fern')+'-variation-2026-09-30' : readabilityCapture ? 'docs/qa-evidence/vaelora-highpine-low-readability-2026-09-30' : seedCapture ? 'docs/qa-evidence/vaelora-understory-seeds-2026-09-30' : understoryCapture ? 'docs/qa-evidence/vaelora-'+region+'-understory-2026-09-30' : bellHedgeCapture ? 'docs/qa-evidence/vaelora-bellweather-hedgerow-atlas-2026-09-30' : scrubCapture ? 'docs/qa-evidence/vaelora-sereward-scrub-atlas-2026-09-30' : acaciaCapture ? 'docs/qa-evidence/vaelora-sereward-acacia-atlas-2026-09-30' : hedgeCapture ? 'docs/qa-evidence/vaelora-ellionar-hedge-atlas-2026-09-30' : brambleCapture ? 'docs/qa-evidence/vaelora-underbough-bramble-atlas-2026-09-30' : atlasCapture ? 'docs/qa-evidence/vaelora-'+region+'-atlas-2026-09-30' : lifecycle ? 'docs/qa-evidence/vaelora-'+region+'-lifecycle-2026-09-30' : region==='ru-lora' ? 'docs/qa-evidence/vaelora-ru-lora-god-bone-2026-09-30' : region==='bellweather' ? 'docs/qa-evidence/vaelora-vegetation-2026-09-30' : 'docs/qa-evidence/vaelora-'+region+'-2026-09-30');
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
 if(shoreCapture||['sereward','ru-lora'].includes(region)) {
  if(shoreCapture){const study=JSON.parse(await readFile(shoreMapFile,'utf8'));study.id=region+'-shore-study';study.fogOfWar=false;await writeFile(out+'/shore-study.json',JSON.stringify(study,null,2)+'\n');}
  const studyFile=shoreCapture?out+'/shore-study.json':region==='ru-lora'?'docs/qa-evidence/vaelora-ru-lora-interior-2026-09-30/ru-lora-interior-study.json':'docs/qa-evidence/vaelora-sereward-2026-09-30/sereward-oasis-study.json';
  const study=JSON.parse(await readFile(studyFile,'utf8'));
  await cdp.evaluate('document.querySelector("#map-studio-open").click()');await cdp.call('DOM.enable');const doc=await cdp.call('DOM.getDocument');const input=await cdp.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#studio-import-file'});
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(ROOT,studyFile)]});await sleep(600);await cdp.evaluate('document.querySelector("#studio-publish").click()');await sleep(2500);
  if(await cdp.evaluate('document.querySelector("#map-label-title")?.textContent')!==study.name)throw new Error('Regional study import/save/play failed: '+await cdp.evaluate('document.querySelector("#studio-message")?.textContent'));
  for(const mode of ['ordinary','strategic']){
   if((region==='ru-lora'||shoreCapture)&&mode==='ordinary'){
    await cdp.evaluate(`const c=document.querySelector('#viewport canvas');const r=c.getBoundingClientRect();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000,clientX:r.x+r.width/2,clientY:r.y+r.height/2,cancelable:true}));document.querySelector('#camera-home-base').click()`);
   }
   if(mode==='strategic')await cdp.evaluate('document.querySelector("#camera-fit-map").click()');
   await sleep(400);const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+(shoreCapture?'shore':region==='sereward'?'oasis':'interior')+'-save-play-'+mode+'.png',Buffer.from(shot.data,'base64'));
   if(region==='sereward'&&mode==='strategic')await writeFile(out+'/oasis-save-play.png',Buffer.from(shot.data,'base64'));
  }
  if(region==='ru-lora'){
   const requests=await cdp.evaluate('performance.getEntriesByType("resource").filter(e=>e.name.includes("assets/environment")).map(e=>new URL(e.name).pathname)');
   if(!['ru-lora-fiendwood.webp','ru-lora-stone-fern.webp','ru-lora-broken-trunk.webp','ru-lora-god-bone.webp'].every(f=>requests.some(p=>p.endsWith('/'+f))))throw new Error('Interior study regional images missing');
   await writeFile(out+'/study-requests.json',JSON.stringify(requests,null,2)+'\n');
  }
 }
 if(shoreCapture){
  const shipped=JSON.parse(await readFile(shoreMapFile,'utf8'));
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {addObstacleEnvironmentSprites,createGroundSurfaces,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const {setActiveTerrain}=await import('/src/terrain-height.mjs');
   const {WATER_LEVEL}=await import('/src/water-surface-geometry.mjs');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const map=${JSON.stringify(shipped)},original=JSON.stringify(map);setActiveTerrain(map);
   const objects=[],slots=addObstacleEnvironmentSprites(map,map.width/2,map.height/2,o=>objects.push(o));
   const shore=objects.filter(o=>o.userData.shoreVegetation);
   if(shore.length!==1||shore[0].count!==${region==='sombral-mere'?52:42}||slots.size!==256)throw new Error('Shipped shore/forest count mismatch');
   const mesh=shore[0],m=new THREE.Matrix4();let maxScreenRollDegrees=0,maxPlaneNormalError=0;
   const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...CAMERA_VIEW_DIRECTION),new THREE.Vector3(),new THREE.Vector3(0,1,0))).invert();
   const matrices=[];
   for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,m);matrices.push(m.elements.slice());
    if(Math.abs(m.elements[13]+mesh.position.y-WATER_LEVEL-(mesh.userData.waterDecal ? 0.008 : 0))>1e-6)throw new Error('Water plant contact failed');
    if(mesh.userData.waterDecal){
     const normal=new THREE.Vector3(0,0,1).transformDirection(m);maxPlaneNormalError=Math.max(maxPlaneNormalError,Math.abs(normal.y-1),Math.abs(normal.x),Math.abs(normal.z));
     const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();m.decompose(position,rotation,scale);
     const radius=Math.hypot(.75,.7229)*Math.abs(scale.y)/2;
     const x=position.x+map.width/2,z=position.z+map.height/2;
     for(const dx of [-radius,radius])for(const dz of [-radius,radius]){const column=Math.floor(x+dx),row=Math.floor(z+dz);if(!map.obstacles.some(o=>o.material==='water'&&column>=o.column&&column<o.column+o.width&&row>=o.row&&row<o.row+o.height))throw new Error('Water decal extends onto land');}
     continue;
    }
    const up=new THREE.Vector3(0,1,0).transformDirection(m).applyQuaternion(rotation);
    maxScreenRollDegrees=Math.max(maxScreenRollDegrees,Math.abs(Math.atan2(-up.x,up.y)*180/Math.PI));
   }
   if(maxPlaneNormalError>1e-6)throw new Error('Water decal plane tilted');
   if(maxScreenRollDegrees>.0001)throw new Error('Shore reed screen roll');
   for(const slot of slots.values())setForestSpriteStock(slot,0);
   for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);if(JSON.stringify(m.elements)!==JSON.stringify(matrices[i]))throw new Error('Forest harvest changed water reeds');}
   if(JSON.stringify(map)!==original)throw new Error('Shore decoration mutated map');
   for(const o of objects){o.geometry.dispose();o.material.dispose()}
   const exclusions=[];
   for(const [id,terrainBase,raised] of [['meshy-resource-review',${JSON.stringify(shoreBase)},false],['other-region','meadow',false],['other-region','jungle-loam',false],['raised-shore',${JSON.stringify(shoreBase)},true]]){
    const d={...map,id,terrainBase,elevationPatches:raised?[{column:0,row:0,width:map.width,height:map.height,level:2}]:[]};setActiveTerrain(d);
    const objects=[];addObstacleEnvironmentSprites(d,d.width/2,d.height/2,o=>objects.push(o));
    if(objects.some(o=>o.userData.shoreVegetation))throw new Error('Shore exclusions failed');
    exclusions.push({id,terrainBase,raised,shoreBatches:0});for(const o of objects){o.geometry.dispose();o.material.dispose()}
   }
   const reedRegression=[];
   if(${region==='sombral-mere'}){
    const d={...map,terrainBase:'tidal-mud'};setActiveTerrain(d);const objects=[];addObstacleEnvironmentSprites(d,d.width/2,d.height/2,o=>objects.push(o));
    const reeds=objects.find(o=>o.userData.shoreVegetation);
    if(!reeds||reeds.userData.waterDecal||reeds.count!==52)throw new Error('Reed regression batch mismatch');
    for(let i=0;i<50&&!reeds.material.map.image?.complete;i++)await new Promise(r=>setTimeout(r,100));
    if(!reeds.material.map.image?.naturalWidth||!reeds.material.map.image.src.endsWith('/siltmouths-silver-reed.webp'))throw new Error('Reed regression sprite mismatch');
    for(let i=0;i<reeds.count;i++){reeds.getMatrixAt(i,m);const up=new THREE.Vector3(0,1,0).transformDirection(m).applyQuaternion(rotation);if(Math.abs(Math.atan2(-up.x,up.y)*180/Math.PI)>.0001||Math.abs(m.elements[13]+reeds.position.y-WATER_LEVEL)>1e-6)throw new Error('Reed regression pose changed');}
    reedRegression.push({shorePlants:52,waterDecal:false,upright:true,waterContact:true});for(const o of objects){o.geometry.dispose();o.material.dispose()}
   }
   const d={width:24,height:24,terrainBase:${JSON.stringify(shoreBase)},terrainSeed:93007,obstacles:[{column:7,row:0,width:3,height:9,material:'water'},{column:7,row:14,width:3,height:10,material:'water'},{column:16,row:0,width:3,height:9,material:'water'},{column:16,row:14,width:3,height:10,material:'water'}]};setActiveTerrain(d);
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x717a6c);
   for(const o of createGroundSurfaces(d))scene.add(o);
   addObstacleEnvironmentSprites(d,12,12,o=>scene.add(o));
   for(let i=0;i<50&&scene.children.some(o=>o.material.map&&!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   if(scene.children.some(o=>o.material.map&&!o.material.map.image?.naturalWidth))throw new Error('Shore preview texture failed to decode');
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1200,800);
   const camera=new THREE.OrthographicCamera(-15,15,10,-10,.1,200);camera.position.set(...CAMERA_VIEW_DIRECTION).multiplyScalar(50);camera.lookAt(0,0,0);renderer.render(scene,camera);
   const image=renderer.domElement.toDataURL('image/png');
   scene.traverse(o=>{o.geometry?.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material?.dispose()});renderer.dispose();renderer.forceContextLoss();setActiveTerrain(map);
   return {mapId:map.id,shorePlants:mesh.count,shoreBatches:1,forestCells:slots.size,waterDecal:!!mesh.userData.waterDecal,maxPlaneNormalError,maxScreenRollDegrees:mesh.userData.waterDecal?null:maxScreenRollDegrees,waterLevel:WATER_LEVEL,forestHarvestLeavesShoreUnchanged:true,mapUnchanged:true,exclusions,reedRegression,image};
  })()`);
  await writeFile(out+'/shore-renderer.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
  await writeFile(out+'/shore-proof.json',JSON.stringify(result,null,2)+'\n');
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
   if(${JSON.stringify(region)}==='vesperra'){d.id='vesperra-study';d.terrainBase='jungle-loam';d.terrainPatches=[];if(${fringeCapture})d.region='ru-lora-fringe'}
   if(${JSON.stringify(region)}==='siltmouths'){d.id='siltmouths-study';d.terrainBase='tidal-mud';d.terrainPatches=[]}
   if(${JSON.stringify(region)}==='pale-meridian'){d.id='pale-meridian-study';d.terrainBase='snow';d.terrainPatches=[];if(${lichenCapture})d.obstacles.push({row:16,column:6,width:10,height:1,material:'stone',elevation:.72})}
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
   const d={region:${JSON.stringify(fringeCapture?'ru-lora-fringe':null)},width:24,height:24,terrainBase:${JSON.stringify(region==='ellionar'?'garden-loam':region==='veyrholds'?'scree':region==='underbough'?'forest-floor':region==='sombral-mere'?'lunar-soil':region==='vesperra'?'jungle-loam':region==='siltmouths'?'tidal-mud':region==='pale-meridian'?'snow':region==='sereward'?'sand':'meadow')},obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]};
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x727a57);
   const slots=addObstacleEnvironmentSprites(d,12,12,o=>scene.add(o));
   for(const slot of slots.values()){slot.understory=null;setForestSpriteStock(slot,0);} // Isolate the four tree stages in this lineup.
   // Hide every non-preview slot, including registered depleted frames.
   for(const m of scene.children){const zero=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<m.count;i++)m.setMatrixAt(i,zero);m.instanceMatrix.needsUpdate=true}
   const selected=[...slots.values()].filter(s=>s.family===${JSON.stringify(bellHedgeCapture?'bellweather-hedgerow':acaciaCapture?'sereward-acacia':scrubCapture?'sereward-scrub':hedgeCapture?'ellionar-garden-hedge':region==='ellionar'?'ellionar-cultivated-palm':region==='veyrholds'?'veyrholds-highpine':brambleCapture?'underbough-bramble':region==='underbough'?'underbough-copperleaf':region==='sombral-mere'?'sombral-mere-merebloom':fringeCapture?'ru-lora-fringe-canopy':region==='vesperra'?'vesperra-mistbark':region==='siltmouths'?'siltmouths-tidal-tree':region==='pale-meridian'?'pale-meridian-conifer':region==='sereward'?'sereward-palm':'bellweather-field-maple')}&&s.atlas).slice(0,4);
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
 if(understoryCapture){
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {addObstacleEnvironmentSprites,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const objects=[];const slots=addObstacleEnvironmentSprites({region:${JSON.stringify(fringeCapture?'ru-lora-fringe':null)},width:24,height:24,terrainBase:${JSON.stringify(region==='bellweather'?'meadow':region==='sereward'?'sand':region==='ellionar'?'garden-loam':region==='veyrholds'?'scree':region==='underbough'?'forest-floor':region==='sombral-mere'?'lunar-soil':region==='pale-meridian'?'snow':region==='siltmouths'?'tidal-mud':'jungle-loam')},obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]},12,12,o=>objects.push(o));
   const plants=[...slots.values()].filter(s=>s.understory);
   if(!plants.length||plants.length>=slots.size)throw new Error('Understory density invalid');
   const seedFixtures=[];
   for(const terrainBase of ['meadow','short-grass','long-grass','dry-grass','jungle-loam','tidal-mud','snow','ice','lunar-soil','forest-floor','scree','garden-loam','sand']){
    const signatures=[];
    for(const terrainSeed of [93007,93008,93007]){
     const objects=[];const slots=addObstacleEnvironmentSprites({width:24,height:24,terrainBase,terrainSeed,obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]},12,12,o=>objects.push(o));
     const descriptors=[...slots.values()].filter(s=>s.understory).map(s=>{const p=s.understory;return [p.cell,p.x,p.z,p.scale,p.mesh.userData.understoryAsset]});
     if(descriptors.some(([cell,x,z])=>Math.abs(x-(cell%24-11.5))>.450001||Math.abs(z-(Math.floor(cell/24)-11.5))>.450001))throw new Error('Seeded companion escaped parent cell');
     if(slots.size!==256||!descriptors.length)throw new Error('Seed fixture forest identity changed');
     if(['meadow','short-grass','long-grass','dry-grass'].includes(terrainBase)&&descriptors.some(d=>!['bellweather-meadow-herbs','bellweather-meadow-clover'].includes(d[4])))throw new Error('Meadow herbs grass-base binding failed');
     signatures.push(JSON.stringify(descriptors));
     for(const o of objects){o.geometry.dispose();o.material.dispose()}
    }
    if(signatures[0]!==signatures[2]||signatures[0]===signatures[1])throw new Error('Understory seed variation failed');
    seedFixtures.push({terrainBase,repeatSeedStable:true,differentSeedChanges:true,forestCells:256});
   }
   const parentFamilies=[...new Set(plants.map(s=>s.family))];
   if(${region==='bellweather'}&&!['bellweather-field-maple','bellweather-hedgerow'].every(f=>parentFamilies.includes(f)))throw new Error('Meadow herbs missing from a forest family');
   if(${region==='sereward'}&&!['sereward-palm','sereward-acacia','sereward-scrub'].every(f=>parentFamilies.includes(f)))throw new Error('Succulent missing from a forest family');
   if(${region==='ellionar'}&&(!parentFamilies.includes('ellionar-cultivated-palm')||!parentFamilies.includes('ellionar-garden-hedge')))throw new Error('Sunbloom missing from a forest family');
   if(${region==='underbough'}&&(!parentFamilies.includes('underbough-copperleaf')||!parentFamilies.includes('underbough-bramble')))throw new Error('Fungus missing from a forest family');
   const batches=objects.filter(o=>o.userData.forestUnderstory);
   if(batches.length!==${!fringeCapture&&['vesperra','sereward','underbough','pale-meridian','sombral-mere','siltmouths','veyrholds','ellionar','bellweather'].includes(region)?2:1})throw new Error('Understory batch count mismatch');
   const variantCounts=Object.fromEntries(batches.map(o=>[o.userData.understoryAsset,o.count]));
   if(${region==='bellweather'}&&!['bellweather-meadow-herbs','bellweather-meadow-clover'].every(name=>variantCounts[name]>0))throw new Error('Missing meadow companion');
   if(${region==='ellionar'}&&!['ellionar-sunbloom','ellionar-garden-vine'].every(name=>variantCounts[name]>0))throw new Error('Missing garden companion');
   if(${region==='veyrholds'}&&!['veyrholds-ridgegrass','veyrholds-suncrest'].every(name=>variantCounts[name]>0))throw new Error('Missing alpine companion');
   if(${region==='siltmouths'}&&!['siltmouths-silver-reed','siltmouths-marsh-tuber'].every(name=>variantCounts[name]>0))throw new Error('Missing tidal companion');
   if(${region==='sombral-mere'}&&!['sombral-mere-lunewort','sombral-mere-noctilune'].every(name=>variantCounts[name]>0))throw new Error('Missing Mere companion');
   if(${region==='pale-meridian'}&&!['pale-meridian-silver-moss','pale-meridian-frostberry'].every(name=>variantCounts[name]>0))throw new Error('Missing cold understory specimen');
   if(batches.reduce((n,o)=>n+o.count,0)!==plants.length)throw new Error('Understory partition lost cells');
   if(${region==='vesperra'&&!fringeCapture}&&!['vesperra-shade-fern','vesperra-shade-fern-02'].every(name=>variantCounts[name]>0))throw new Error('Missing fern silhouette');
   if(${fringeCapture}&&(variantCounts['ru-lora-fringe-broadleaf']!==plants.length))throw new Error('Fringe broadleaf binding missing');
   if(${region==='sereward'}&&!['sereward-succulent','sereward-succulent-02'].every(name=>variantCounts[name]>0))throw new Error('Missing succulent silhouette');
   if(${region==='underbough'}&&!['underbough-rootward-fungus','underbough-rootward-fungus-02'].every(name=>variantCounts[name]>0))throw new Error('Missing fungus silhouette');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const cameraRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...CAMERA_VIEW_DIRECTION),new THREE.Vector3(),new THREE.Vector3(0,1,0))).invert();
   const checks=[];let maxScreenRollDegrees=0;
   for(const s of plants){
    const p=s.understory,m=new THREE.Matrix4();p.mesh.getMatrixAt(p.index,m);const before=m.elements.slice();
    const up=new THREE.Vector3(0,1,0).transformDirection(m).applyQuaternion(cameraRotation);
    const roll=Math.abs(Math.atan2(-up.x,up.y)*180/Math.PI);maxScreenRollDegrees=Math.max(maxScreenRollDegrees,roll);
    if(roll>.0001)throw new Error('Companion screen roll '+roll);
    if(p.cell!==s.cell||Math.abs(p.x-(p.cell%24-11.5))>.5||Math.abs(p.z-(Math.floor(p.cell/24)-11.5))>.5)throw new Error('Understory outside parent cell');
    setForestSpriteStock(s,3);p.mesh.getMatrixAt(p.index,m);if(JSON.stringify(before)!==JSON.stringify(m.elements))throw new Error('Worked companion changed');
    setForestSpriteStock(s,0);p.mesh.getMatrixAt(p.index,m);if(Math.abs(m.determinant())>1e-9)throw new Error('Cleared companion still visible');
    setForestSpriteStock(s,6);p.mesh.getMatrixAt(p.index,m);if(JSON.stringify(before)!==JSON.stringify(m.elements))throw new Error('Companion reset failed');checks.push(p.cell);
   }
   if(slots.size!==256)throw new Error('Forest cell identities changed');
   const {setActiveTerrain,groundHeight}=await import('/src/terrain-height.mjs');
   setActiveTerrain({width:24,height:24,elevationPatches:[{column:0,row:0,width:24,height:24,level:2}]});
   for(const s of plants){setForestSpriteStock(s,6);const p=s.understory,m=new THREE.Matrix4();p.mesh.getMatrixAt(p.index,m);if(Math.abs(m.elements[13]-groundHeight(p.x,p.z))>1e-6)throw new Error('Raised companion ground contact failed');}
   setActiveTerrain({width:24,height:24});for(const s of plants)setForestSpriteStock(s,6);
   const {createGroundSurfaces}=await import('/src/environment-art.mjs');
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x727a57);
   for(const o of objects){const zero=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<o.count;i++)o.setMatrixAt(i,zero);o.instanceMatrix.needsUpdate=true;scene.add(o)}
   const previewPlants=${region==='bellweather'}?[plants.find(s=>s.family==='bellweather-field-maple'&&s.understory.mesh.userData.understoryAsset==='bellweather-meadow-herbs'),plants.find(s=>s.family==='bellweather-hedgerow'&&s.understory.mesh.userData.understoryAsset==='bellweather-meadow-clover')]:${region==='vesperra'&&!fringeCapture}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='vesperra-shade-fern'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='vesperra-shade-fern-02')]:${region==='sereward'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='sereward-succulent'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='sereward-succulent-02')]:${region==='underbough'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='underbough-rootward-fungus'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='underbough-rootward-fungus-02')]:${region==='pale-meridian'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='pale-meridian-silver-moss'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='pale-meridian-frostberry')]:${region==='sombral-mere'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='sombral-mere-lunewort'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='sombral-mere-noctilune')]:${region==='siltmouths'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='siltmouths-silver-reed'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='siltmouths-marsh-tuber')]:${region==='veyrholds'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='veyrholds-ridgegrass'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='veyrholds-suncrest')]:${region==='ellionar'}?[plants.find(s=>s.understory.mesh.userData.understoryAsset==='ellionar-sunbloom'),plants.find(s=>s.understory.mesh.userData.understoryAsset==='ellionar-garden-vine')]:plants.slice(0,2);
   previewPlants.push(plants.find(s=>!previewPlants.includes(s)));
   for(let i=0;i<3;i++){const s=previewPlants[i];s.x=(i-1)*3;s.z=-s.x;s.understory.x=s.x+${region==='sombral-mere'?'.48':'.3'};s.understory.z=s.z+${region==='sombral-mere'?'.48':'.3'};setForestSpriteStock(s,[3,1,0][i]);}
   for(const o of createGroundSurfaces({width:24,height:24,terrainBase:${JSON.stringify(region==='bellweather'?'meadow':region==='sereward'?'sand':region==='ellionar'?'garden-loam':region==='veyrholds'?'scree':region==='underbough'?'forest-floor':region==='sombral-mere'?'lunar-soil':region==='pale-meridian'?'snow':region==='siltmouths'?'tidal-mud':'jungle-loam')},obstacles:[]}))scene.add(o);
   for(let i=0;i<50&&scene.children.some(o=>o.material.map&&!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1200,600);
   const camera=new THREE.OrthographicCamera(-8,8,4,-4,.1,200);camera.position.set(...CAMERA_VIEW_DIRECTION).multiplyScalar(50).add(new THREE.Vector3(0,1,0));camera.lookAt(0,1,0);
   renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');
   scene.traverse(o=>{o.geometry?.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material?.dispose()});renderer.dispose();renderer.forceContextLoss();
   return {forestCells:slots.size,understoryCells:checks.length,cells:checks,workedRetained:true,depletedHidden:true,resetRestored:true,batches:batches.length,variantCounts,maxScreenRollDegrees,raisedGroundContact:true,parentFamilies,seedFixtures,image};
  })()`);
  await writeFile(out+'/understory-renderer.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
  await writeFile(out+'/understory-proof.json',JSON.stringify(result,null,2)+'\n');
 }
 if(fringeCapture){
  const shipped=JSON.parse(await readFile('maps/ru-lora-fringe-path.json','utf8'));
  const result=await cdp.evaluate(`(async()=>{
   const {addObstacleEnvironmentSprites}=await import('/src/environment-art.mjs');
   const maps=[${JSON.stringify(shipped)},...['ru-lora-fringe','vesperra','ru-lora-interior',undefined].flatMap(region=>['jungle-loam','salt-crust','snow'].map(terrainBase=>({width:24,height:24,region,terrainBase,terrainSeed:93010,obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]}))),{id:'meshy-resource-review',region:'ru-lora-fringe',width:24,height:24,terrainBase:'jungle-loam',obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]}];
   const result=[];for(const d of maps){
    const objects=[];const slots=addObstacleEnvironmentSprites(d,d.width/2,d.height/2,o=>objects.push(o));
    const expected=d.region==='ru-lora-fringe'&&d.terrainBase==='jungle-loam'&&d.id!=='meshy-resource-review';
    const families=[...new Set([...slots.values()].map(s=>s.family))];
    if(expected&&(families.length!==1||families[0]!=='ru-lora-fringe-canopy'))throw new Error('Fringe canopy binding mismatch');
    if(!expected&&families.includes('ru-lora-fringe-canopy'))throw new Error('Fringe canopy leaked');
    const plants=[...slots.values()].filter(s=>s.understory),names=[...new Set(plants.map(s=>s.understory.mesh.userData.understoryAsset))];
    if(expected&&(!plants.length||names.length!==1||names[0]!=='ru-lora-fringe-broadleaf'))throw new Error('Fringe family binding mismatch');
    if(!expected&&names.includes('ru-lora-fringe-broadleaf'))throw new Error('Fringe vegetation leaked');
    for(let i=0;i<50&&objects.some(o=>!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
    if(objects.some(o=>!o.material.map.image?.naturalWidth))throw new Error('Fringe texture failed');
    result.push({id:d.id||'fixture',region:d.region||null,terrainBase:d.terrainBase,forestCells:slots.size,companions:plants.length,names,families,expected});
    for(const o of objects){o.geometry.dispose();o.material.dispose()}
   }
   return result;
  })()`);
  await writeFile(out+'/fringe-binding-proof.json',JSON.stringify(result,null,2)+'\n');
 }
 if(meadowCapture){
  const meadowMap=JSON.parse(await readFile('maps/bellweather-millrace.json','utf8'));
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const {addObstacleEnvironmentSprites,createGroundSurfaces,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const {meadowPlantPositions}=await import('/src/meadow-vegetation.mjs');
   const {setActiveTerrain,groundHeight}=await import('/src/terrain-height.mjs');
   const map=${JSON.stringify(meadowMap)},original=JSON.stringify(map),points=meadowPlantPositions(map);
   setActiveTerrain(map);const objects=[];const slots=addObstacleEnvironmentSprites(map,map.width/2,map.height/2,o=>objects.push(o));
   const flowers=objects.filter(o=>o.userData.meadowVegetation);if(flowers.length!==1||flowers[0].count!==points.length)throw new Error('Meadow batch mismatch');
   const mesh=flowers[0],before=Array.from(mesh.instanceMatrix.array),view=new THREE.Matrix4().lookAt(new THREE.Vector3(...CAMERA_VIEW_DIRECTION),new THREE.Vector3(),new THREE.Vector3(0,1,0));
   let maxRoll=0;
   for(let i=0;i<points.length;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);if(Math.abs(m.elements[13]-groundHeight(points[i].x,points[i].z))>1e-6)throw new Error('Meadow contact mismatch');const up=new THREE.Vector3(0,1,0).transformDirection(m).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(view).invert());maxRoll=Math.max(maxRoll,Math.abs(Math.atan2(-up.x,up.y)*180/Math.PI));}
   if(maxRoll>.0001)throw new Error('Meadow roll mismatch');
   for(const slot of slots.values())setForestSpriteStock(slot,0);
   if(JSON.stringify(before)!==JSON.stringify(Array.from(mesh.instanceMatrix.array)))throw new Error('Forest clearing affected meadow');
   for(const slot of slots.values())setForestSpriteStock(slot,6);
   const excluded=[];for(const terrainBase of ['sand','snow','ice','lunar-soil','jungle-loam','salt-crust']){const candidate=[];addObstacleEnvironmentSprites({...map,terrainBase},map.width/2,map.height/2,o=>candidate.push(o));if(candidate.some(o=>o.userData.meadowVegetation))throw new Error('Meadow leaked: '+terrainBase);excluded.push(terrainBase);for(const o of candidate){o.geometry.dispose();o.material.dispose()}}
   const review=[];addObstacleEnvironmentSprites({...map,id:'meshy-resource-review'},map.width/2,map.height/2,o=>review.push(o));if(review.some(o=>o.userData.meadowVegetation))throw new Error('Meadow leaked to review');for(const o of review){o.geometry.dispose();o.material.dispose()}
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x859175);for(const o of createGroundSurfaces(map))scene.add(o);for(const o of objects)scene.add(o);
   for(let i=0;i<50&&scene.children.some(o=>o.material.map&&!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   if(scene.children.some(o=>o.material.map&&!o.material.map.image?.naturalWidth))throw new Error('Meadow texture failed');
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1200,800);const images={};
   for(const [name,span,target] of [['ordinary',14,[0,0,-16]],['strategic',44,[0,0,0]]]){const camera=new THREE.OrthographicCamera(-span*1.5,span*1.5,span,-span,.1,200);const t=new THREE.Vector3(...target);camera.position.set(...CAMERA_VIEW_DIRECTION).multiplyScalar(70).add(t);camera.lookAt(t);renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL('image/png')}
   if(JSON.stringify(map)!==original)throw new Error('Meadow changed map');
   scene.traverse(o=>{o.geometry?.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material?.dispose()});renderer.dispose();renderer.forceContextLoss();setActiveTerrain({width:24,height:24});
   return {map:map.id,plants:points.length,batches:1,forestClearingIndependent:true,maxScreenRollDegrees:maxRoll,groundContact:true,excluded,reviewExcluded:true,mapUnchanged:true,points,images};
  })()`);
  for(const [name,image] of Object.entries(result.images))await writeFile(out+'/meadow-'+name+'.png',Buffer.from(image.split(',')[1],'base64'));delete result.images;
  await writeFile(out+'/meadow-proof.json',JSON.stringify(result,null,2)+'\n');
 }
 if(gardenCapture){
  const gardenMap=JSON.parse(await readFile('maps/ellionar-channel-gardens.json','utf8'));
  const result=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const {addObstacleEnvironmentSprites,createGroundSurfaces,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const {gardenPlantPositions}=await import('/src/garden-vegetation.mjs');
   const {setActiveTerrain,groundHeight}=await import('/src/terrain-height.mjs');
   const map=${JSON.stringify(gardenMap)},original=JSON.stringify(map),points=gardenPlantPositions(map);
   setActiveTerrain(map);const objects=[];const slots=addObstacleEnvironmentSprites(map,map.width/2,map.height/2,o=>objects.push(o));
   const flowers=objects.filter(o=>o.userData.gardenVegetation);if(flowers.length!==1||flowers[0].count!==points.length)throw new Error('Garden batch mismatch');
   const mesh=flowers[0],before=Array.from(mesh.instanceMatrix.array),view=new THREE.Matrix4().lookAt(new THREE.Vector3(...CAMERA_VIEW_DIRECTION),new THREE.Vector3(),new THREE.Vector3(0,1,0));
   let maxRoll=0;
   for(let i=0;i<points.length;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);if(Math.abs(m.elements[13]-groundHeight(points[i].x,points[i].z))>1e-6)throw new Error('Garden contact mismatch');const up=new THREE.Vector3(0,1,0).transformDirection(m).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(view).invert());maxRoll=Math.max(maxRoll,Math.abs(Math.atan2(-up.x,up.y)*180/Math.PI));}
   if(maxRoll>.0001)throw new Error('Garden roll mismatch');
   for(const slot of slots.values())setForestSpriteStock(slot,0);
   if(JSON.stringify(before)!==JSON.stringify(Array.from(mesh.instanceMatrix.array)))throw new Error('Forest clearing affected garden');
   for(const slot of slots.values())setForestSpriteStock(slot,6);
   const excluded=[];for(const terrainBase of ['meadow','sand','snow','ice','lunar-soil','jungle-loam','salt-crust']){const candidate=[];addObstacleEnvironmentSprites({...map,terrainBase},map.width/2,map.height/2,o=>candidate.push(o));if(candidate.some(o=>o.userData.gardenVegetation))throw new Error('Garden leaked: '+terrainBase);excluded.push(terrainBase);for(const o of candidate){o.geometry.dispose();o.material.dispose()}}
   const review=[];addObstacleEnvironmentSprites({...map,id:'meshy-resource-review'},map.width/2,map.height/2,o=>review.push(o));if(review.some(o=>o.userData.gardenVegetation))throw new Error('Garden leaked to review');for(const o of review){o.geometry.dispose();o.material.dispose()}
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x859175);for(const o of createGroundSurfaces(map))scene.add(o);for(const o of objects)scene.add(o);
   for(let i=0;i<50&&scene.children.some(o=>o.material.map&&!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
   if(scene.children.some(o=>o.material.map&&!o.material.map.image?.naturalWidth))throw new Error('Garden texture failed');
   const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(1200,800);const images={};
   for(const [name,span,target] of [['ordinary',14,[0,0,29]],['strategic',44,[0,0,0]]]){const camera=new THREE.OrthographicCamera(-span*1.5,span*1.5,span,-span,.1,200);const t=new THREE.Vector3(...target);camera.position.set(...CAMERA_VIEW_DIRECTION).multiplyScalar(70).add(t);camera.lookAt(t);renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL('image/png')}
   if(JSON.stringify(map)!==original)throw new Error('Garden changed map');
   scene.traverse(o=>{o.geometry?.dispose();o.userData.ownedGroundTextures?.forEach(t=>t.dispose());o.material?.dispose()});renderer.dispose();renderer.forceContextLoss();setActiveTerrain({width:24,height:24});
   return {map:map.id,plants:points.length,batches:1,forestClearingIndependent:true,maxScreenRollDegrees:maxRoll,groundContact:true,excluded,reviewExcluded:true,mapUnchanged:true,points,images};
  })()`);
  for(const [name,image] of Object.entries(result.images))await writeFile(out+'/garden-'+name+'.png',Buffer.from(image.split(',')[1],'base64'));delete result.images;
  await writeFile(out+'/garden-proof.json',JSON.stringify(result,null,2)+'\n');
 }
 if(plantContractCapture){
  const result=await cdp.evaluate(`(async()=>{
   const {PLANT_ASSETS}=await import('/src/environment-plant-assets.mjs');
   const {addObstacleEnvironmentSprites,createEnvironmentSpriteInstances,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const seen=new Map();const lifecycle=new Map();
   const definitions=['meadow','sand','snow','ice','lunar-soil','forest-floor','scree','garden-loam','jungle-loam','tidal-mud','salt-crust'].map(terrainBase=>({terrainBase}));
   definitions.push({terrainBase:'jungle-loam',region:'ru-lora-fringe'});
   for(const d of definitions){
    const objects=[];
    const slots=addObstacleEnvironmentSprites({...d,width:32,height:32,terrainSeed:93007,obstacles:[{column:5,row:3,width:16,height:16,material:'forest'},{column:4,row:22,width:20,height:2,material:'stone',elevation:.72},{column:1,row:2,width:2,height:24,material:'water'}]},16,16,o=>objects.push(o));
    for(const slot of slots.values()){
     const plant=slot.understory;if(!plant)continue;
     const read=()=>Array.from(plant.mesh.instanceMatrix.array.slice(plant.index*16,plant.index*16+16));
     const initial=read();for(const stock of [4,2]){setForestSpriteStock(slot,stock);if(JSON.stringify(read())!==JSON.stringify(initial))throw new Error('Partial stock moved plant');}
     setForestSpriteStock(slot,0);const cleared=read();if([0,1,2,4,5,6,8,9,10].some(i=>cleared[i]!==0))throw new Error('Cleared plant still visible');
     setForestSpriteStock(slot,6);if(JSON.stringify(read())!==JSON.stringify(initial))throw new Error('Plant reset drift');
     const id=plant.mesh.userData.plantAsset.id;lifecycle.set(id,(lifecycle.get(id)||0)+1);
    }
    for(const mesh of objects){
     const spec=mesh.userData.plantAsset;if(!spec)continue;
     const expected=PLANT_ASSETS[spec.id];mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
     const height=expected.worldHeight??expected.worldDepth;
     if(Math.abs(b.max.x-b.min.x-expected.worldWidth)>1e-6||Math.abs(b.max.y-b.min.y-height)>1e-6)throw new Error('Plant geometry dimensions mismatch: '+spec.id);
     const water=expected.kind==='decorative-water-decal';
     if(water?Math.abs(b.min.y+height/2)>1e-6:Math.abs(b.min.y)>1e-6)throw new Error('Plant geometry pivot mismatch: '+spec.id);
     seen.set(spec.id,{id:spec.id,kind:spec.kind,width:b.max.x-b.min.x,vertical:b.max.y-b.min.y,pivot:spec.pivot,instances:mesh.count});
    }
    for(const o of objects){o.geometry.dispose();o.material.dispose()}
   }
   if(Object.keys(PLANT_ASSETS).some(id=>!seen.has(id)))throw new Error('Missing runtime plant: '+Object.keys(PLANT_ASSETS).filter(id=>!seen.has(id)).join(','));
   for(const [id,spec] of Object.entries(PLANT_ASSETS))if(spec.kind==='decorative-forest-understory'&&!lifecycle.has(id))throw new Error('Missing companion lifecycle: '+id);
   let rejected=0;for(const [id,spec] of Object.entries(PLANT_ASSETS)){
    try{createEnvironmentSpriteInstances(id,spec.worldWidth*1.2,(spec.worldHeight??spec.worldDepth)*1.2,[{x:0,z:0}]);}catch(e){if(!e.message.includes('registered contract'))throw e;rejected++;}
   }
   if(rejected!==seen.size)throw new Error('Runtime mismatch rejection failed');
   return {checked:seen.size,rejected,companionLifecycle:Object.fromEntries(lifecycle),plants:[...seen.values()]};
  })()`);
  await writeFile(out+'/plant-contract-proof.json',JSON.stringify(result,null,2)+'\n');
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
 if(!proof[0].files.includes('bellweather-lifecycle-atlas.webp')||!proof[0].files.includes('bellweather-hedgerow-lifecycle-atlas.webp')||proof[1].files.some(f=>f.startsWith('bellweather')))throw new Error('Vegetation palette binding mismatch');
 if(!proof[2].files.includes('veyrholds-suncrest.webp')||proof.some((r,i)=>i!==2&&r.files.includes('veyrholds-suncrest.webp')))throw new Error('Suncrest region binding mismatch');
 if(!proof[5].files.includes('ellionar-garden-vine.webp')||proof.some((r,i)=>i!==5&&r.files.includes('ellionar-garden-vine.webp')))throw new Error('Garden vine region binding mismatch');
 if(!proof[0].files.includes('bellweather-meadow-clover.webp')||proof.some((r,i)=>i!==0&&r.files.includes('bellweather-meadow-clover.webp')))throw new Error('Meadow clover binding mismatch');
 if(!proof[2].files.includes('veyrholds-lifecycle-atlas.webp')||!proof[2].files.includes('veyrholds-ironlichen-outcrop.webp')||proof.slice(0,2).some(r=>r.files.some(f=>f.startsWith('veyrholds'))))throw new Error('Veyrholds palette binding mismatch');
 if(!proof[3].files.includes('underbough-lifecycle-atlas.webp')||!proof[3].files.includes('underbough-bramble-lifecycle-atlas.webp')||proof[3].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,3).some(r=>r.files.some(f=>f.startsWith('underbough'))))throw new Error('Underbough forest mix mismatch');
 if(!['sereward-lifecycle-atlas.webp','sereward-acacia-lifecycle-atlas.webp','sereward-scrub-lifecycle-atlas.webp'].every(f=>proof[4].files.includes(f))||proof[4].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,4).some(r=>r.files.some(f=>f.startsWith('sereward'))))throw new Error('Sereward forest mix mismatch');
 if(!['ellionar-lifecycle-atlas.webp','ellionar-hedge-lifecycle-atlas.webp'].every(f=>proof[5].files.includes(f))||proof[5].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f))||proof.slice(0,5).some(r=>r.files.some(f=>f.startsWith('ellionar'))))throw new Error('Ellionar garden mix mismatch');
 for(const i of [1,6])if(!proof[i].files.includes('pale-meridian-lifecycle-atlas.webp')||proof[i].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Pale Meridian forest mix mismatch');
 if(!proof[7].files.includes('siltmouths-lifecycle-atlas.webp')||proof[7].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Siltmouths forest mix mismatch');
 if(!proof[8].files.includes('vesperra-lifecycle-atlas.webp')||proof[8].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Vesperra forest mix mismatch');
 for(const i of [1,6])if(!proof[i].files.includes('pale-meridian-frostberry.webp'))throw new Error('Frostberry cold binding missing');
 if(proof.some((r,i)=>![1,6].includes(i)&&r.files.includes('pale-meridian-frostberry.webp')))throw new Error('Frostberry leaked');
 for(const i of [1,6])if(!proof[i].files.includes('pale-meridian-silver-moss.webp'))throw new Error('Cold moss binding missing');
 if(proof.some((r,i)=>![1,6].includes(i)&&r.files.includes('pale-meridian-silver-moss.webp')))throw new Error('Cold moss leaked into another region');
 for(const i of [1,6])if(!proof[i].files.includes('pale-meridian-violet-lichen.webp'))throw new Error('Lichen cold binding missing');
 if(proof.some((r,i)=>![1,6].includes(i)&&r.files.includes('pale-meridian-violet-lichen.webp')))throw new Error('Lichen leaked to another base');
 if(!proof[7].files.includes('siltmouths-marsh-tuber.webp')||proof.some((r,i)=>i!==7&&r.files.includes('siltmouths-marsh-tuber.webp')))throw new Error('Marsh tuber binding mismatch');
 if(!proof[7].files.includes('siltmouths-silver-reed.webp')||proof.some((r,i)=>i!==7&&r.files.includes('siltmouths-silver-reed.webp')))throw new Error('Silver reed region binding mismatch');
 for(const file of ['sereward-succulent.webp','sereward-succulent-02.webp'])if(!proof[4].files.includes(file)||proof.some((r,i)=>i!==4&&r.files.includes(file)))throw new Error('Desert understory region binding mismatch: '+file);
 for(const file of ['underbough-rootward-fungus.webp','underbough-rootward-fungus-02.webp'])if(!proof[3].files.includes(file)||proof.some((r,i)=>i!==3&&r.files.includes(file)))throw new Error('Fungus region binding mismatch: '+file);
 for(const file of ['vesperra-shade-fern.webp','vesperra-shade-fern-02.webp'])if(!proof[8].files.includes(file)||proof.some((r,i)=>i!==8&&r.files.includes(file)))throw new Error('Understory region binding mismatch: '+file);
 if(!proof[0].files.includes('bellweather-meadow-herbs.webp')||proof.some((r,i)=>i!==0&&r.files.includes('bellweather-meadow-herbs.webp')))throw new Error('Meadow herbs region binding mismatch');
 if(!proof[4].files.includes('sereward-succulent.webp')||proof.some((r,i)=>i!==4&&r.files.includes('sereward-succulent.webp')))throw new Error('Succulent region binding mismatch');
 if(!proof[5].files.includes('ellionar-sunbloom.webp')||proof.some((r,i)=>i!==5&&r.files.includes('ellionar-sunbloom.webp')))throw new Error('Sunbloom region binding mismatch');
 if(!proof[2].files.includes('veyrholds-ridgegrass.webp')||proof.some((r,i)=>i!==2&&r.files.includes('veyrholds-ridgegrass.webp')))throw new Error('Ridgegrass region binding mismatch');
 if(!proof[3].files.includes('underbough-rootward-fungus.webp')||proof.some((r,i)=>i!==3&&r.files.includes('underbough-rootward-fungus.webp')))throw new Error('Rootward fungus region binding mismatch');
 if(!proof[9].files.includes('sombral-mere-noctilune.webp')||proof.some((r,i)=>i!==9&&r.files.includes('sombral-mere-noctilune.webp')))throw new Error('Noctilune region binding mismatch');
 if(!proof[9].files.includes('sombral-mere-lunewort.webp')||proof.some((r,i)=>i!==9&&r.files.includes('sombral-mere-lunewort.webp')))throw new Error('Lunewort region binding mismatch');
 if(!proof[9].files.includes('sombral-mere-lifecycle-atlas.webp')||proof[9].files.some(f=>/^(?:field-maple|hazel-thicket|silver-birch|pine|oak(?:-01)?)\.webp$/.test(f)))throw new Error('Sombral Mere forest mix mismatch');
 if(!['ru-lora-fiendwood.webp','ru-lora-stone-fern.webp','ru-lora-broken-trunk.webp','ru-lora-god-bone.webp'].every(f=>proof[10].files.includes(f))||proof.slice(0,10).some(r=>r.files.some(f=>f.startsWith('ru-lora-'))))throw new Error('Ru Lora stone scenery binding mismatch');
 if(region==='ru-lora'||lichenCapture){
  const placement=await cdp.evaluate(`(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {CAMERA_VIEW_DIRECTION}=await import('/src/camera-controls.mjs');
   const {addObstacleEnvironmentSprites}=await import('/src/environment-art.mjs');
   const {setActiveTerrain,groundHeight}=await import('/src/terrain-height.mjs');
   setActiveTerrain({width:32,height:32,elevationPatches:[{column:0,row:0,width:32,height:32,level:2}]});
   const up=new THREE.Vector3(0,1,0);const normal=new THREE.Vector3(...CAMERA_VIEW_DIRECTION).normalize();const screenRight=new THREE.Vector3().crossVectors(up,normal).normalize();
   const result=[];
   for(const elevation of [0.72,1.12,2])for(const id of ['ru-lora-placement-proof','meshy-resource-review']){
    const objects=[];addObstacleEnvironmentSprites({id,width:32,height:32,terrainBase:${JSON.stringify(lichenCapture?'snow':'salt-crust')},obstacles:[{column:3,row:8,width:25,height:1,material:'stone',elevation},{column:3,row:18,width:25,height:1,material:'stone',elevation}]},16,16,o=>objects.push(o));
    for(let i=0;i<50&&objects.some(o=>!o.material.map.image?.complete);i++)await new Promise(r=>setTimeout(r,100));
    if(objects.some(o=>!o.material.map.image?.naturalWidth))throw new Error('Stone placement texture failed to load');
    const files=objects.map(o=>o.material.map.image.src.split('/').pop());
    if(id==='meshy-resource-review'&&files.some(f=>(f?.startsWith('ru-lora-')||f==='pale-meridian-violet-lichen.webp')))throw new Error('Regional props leaked into review map');
    if(elevation>=1&&files.includes(${JSON.stringify(lichenCapture?'pale-meridian-violet-lichen.webp':'ru-lora-god-bone.webp')}))throw new Error('Bone replaced tall barrier');
    if(elevation<1&&id!=='meshy-resource-review'&&!files.includes(${JSON.stringify(lichenCapture?'pale-meridian-violet-lichen.webp':'ru-lora-god-bone.webp')}))throw new Error('Bone placement fixture missing specimen');
    const positions=[];let maxRoll=0;
    for(const mesh of objects){
     const matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);positions.push([matrix.elements[12],matrix.elements[13],matrix.elements[14]]);
      if(Math.abs(matrix.elements[13]-groundHeight(matrix.elements[12],matrix.elements[14]))>1e-6)throw new Error('Stone raised ground contact failed');
      const spriteUp=new THREE.Vector3().setFromMatrixColumn(matrix,1).normalize();maxRoll=Math.max(maxRoll,Math.abs(spriteUp.dot(screenRight)));
     }
     mesh.geometry.dispose();mesh.material.dispose();
    }
    positions.sort((a,b)=>a[0]-b[0]||a[2]-b[2]);result.push({id,elevation,files,positions,maxScreenRollComponent:maxRoll,raisedGroundContact:true});
   }
   for(let i=0;i<result.length;i+=2)if(JSON.stringify(result[i].positions)!==JSON.stringify(result[i+1].positions))throw new Error('Regional stone positions changed');
   for(let i=2;i<result.length;i+=2)if(JSON.stringify(result[i].files)!==JSON.stringify(result[i+1].files))throw new Error('Tall regional barrier bindings changed');
   setActiveTerrain({width:32,height:32});
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
 if(lifecycle&&(bellHedgeCapture||['bellweather','sereward','pale-meridian','siltmouths','vesperra','sombral-mere','underbough','veyrholds','ellionar','bellweather'].includes(region))){
  const cold=region==='pale-meridian';
  const harvestCell=bellHedgeCapture||scrubCapture?769:acaciaCapture?770:region==='veyrholds'?810:brambleCapture||hedgeCapture?769:768;
  const map={id:region+'-harvest-check',name:region.toUpperCase()+' HARVEST CHECK',summary:'Observe one regional tree through harvest and reset.',width:40,height:40,terrainBase:region==='ellionar'?'garden-loam':region==='veyrholds'?'scree':region==='underbough'?'forest-floor':region==='sombral-mere'?'lunar-soil':region==='vesperra'?'jungle-loam':region==='siltmouths'?'tidal-mud':cold?'snow':region==='bellweather'?'meadow':'sand',startingArmySize:8,startingResources:{wood:0},fogOfWar:true,spawnPoints:[{team:0,x:-14,z:0},{team:1,x:14,z:0}],obstacles:[{column:harvestCell%40,row:Math.floor(harvestCell/40),width:1,height:1,material:'forest'}],resourceNodes:[],triggers:[],scenarioEvents:[]};
  if(fringeCapture){map.region='ru-lora-fringe';map.id='ru-lora-fringe-harvest-check';map.name='RU LORA FRINGE HARVEST CHECK';}
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
  await writeFile(out+'/live-harvest-proof.json',JSON.stringify({mapId:map.id,targetCell:harvestCell,family:bellHedgeCapture?'bellweather-hedgerow':acaciaCapture?'sereward-acacia':scrubCapture?'sereward-scrub':hedgeCapture?'ellionar-garden-hedge':region==='ellionar'?'ellionar-cultivated-palm':region==='veyrholds'?'veyrholds-highpine':brambleCapture?'underbough-bramble':region==='underbough'?'underbough-copperleaf':region==='sombral-mere'?'sombral-mere-merebloom':fringeCapture?'ru-lora-fringe-canopy':region==='vesperra'?'vesperra-mistbark':region==='siltmouths'?'siltmouths-tidal-tree':cold?'pale-meridian-conifer':region==='bellweather'?'bellweather-field-maple':'sereward-palm',observed,reset:true},null,2)+'\n');
 }
 if(atlasCapture){
  cdp.on('Fetch.requestPaused',e=>{void cdp.call('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:404,responseHeaders:[{name:'content-type',value:'application/json'}],body:Buffer.from('{}').toString('base64')})});
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*-lifecycle-atlas.json',requestStage:'Request'}]});
  await cdp.call('Page.reload',{ignoreCache:true});await sleep(3500);
  const fallback=await cdp.evaluate(`(async()=>{
   const {addObstacleEnvironmentSprites,setForestSpriteStock}=await import('/src/environment-art.mjs');
   const result=[];
   for(const [base,family,region] of [['meadow','bellweather-field-maple'],['sand','sereward-palm'],['snow','pale-meridian-conifer'],['tidal-mud','siltmouths-tidal-tree'],['jungle-loam','vesperra-mistbark'],['lunar-soil','sombral-mere-merebloom'],['forest-floor','underbough-copperleaf'],['forest-floor','underbough-bramble'],['scree','veyrholds-highpine'],['garden-loam','ellionar-cultivated-palm'],['garden-loam','ellionar-garden-hedge'],['sand','sereward-acacia'],['sand','sereward-scrub'],['meadow','bellweather-hedgerow'],['jungle-loam','ru-lora-fringe-canopy','ru-lora-fringe']]){
    const objects=[];const slots=addObstacleEnvironmentSprites({region,width:24,height:24,terrainBase:base,obstacles:[{row:3,column:3,width:16,height:16,material:'forest'}]},12,12,o=>objects.push(o));
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
