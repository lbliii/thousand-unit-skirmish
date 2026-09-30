// Bounded two-player Chrome diagnostic; no supported hardware/network claim.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {createFortifiedFixture} from './fortified-crossing-fixture.mjs';
import {createFortifiedBrowser} from './fortified-browser-fixture.mjs';
const duration=Number(process.argv[2]??20),sizes=(process.argv[3]??'250,500,1000,2000').split(',').map(Number);
assert.ok(Number.isInteger(duration)&&duration>=10&&duration<=40);
assert.ok(sizes.length<=4&&sizes.every(n=>[250,500,1000,2000].includes(n)));
const map=JSON.parse(await readFile(new URL('../maps/fortified-crossing.json',import.meta.url)));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const quantiles=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {count:a.length,p50:a[Math.max(0,Math.ceil(a.length*.5)-1)]??null,p95:a[Math.max(0,Math.ceil(a.length*.95)-1)]??null,max:a.at(-1)??null};};
const instrumentation=`(() => {
  const probe=window.__fortifiedProbe={state:null,welcome:null,notices:[],frames:[],callbacks:[],longTasks:[],audioStarts:0,audioStops:0,measuring:false};
  const Native=WebSocket;window.WebSocket=class extends Native {constructor(...args){super(...args);probe.socket=this;this.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='welcome'){probe.welcome=m;probe.state=m.state;}if(m.type==='mapChange')probe.state=m.state;if(m.type==='state')probe.state=m;if(m.type==='notice'){probe.notices.push({token:m.clientOrderToken,message:m.message,receivedAt:performance.now()});if(probe.notices.length>64)probe.notices.shift();}});}};
  const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>raf(timestamp=>{const start=performance.now();try{return callback(timestamp);}finally{if(probe.measuring&&probe.callbacks.length<8192)probe.callbacks.push(performance.now()-start);}});
  let last=null;const frame=t=>{if(probe.measuring&&last!==null&&probe.frames.length<8192)probe.frames.push(t-last);last=probe.measuring?t:null;raf(frame);};raf(frame);
  probe.longTasksSupported=PerformanceObserver.supportedEntryTypes.includes('longtask');if(probe.longTasksSupported)new PerformanceObserver(list=>{if(probe.measuring)for(const e of list.getEntries())if(e.startTime>=probe.startAt&&probe.longTasks.length<256)probe.longTasks.push(e.duration);}).observe({type:'longtask'});
  for(const method of ['start','stop']){const native=AudioBufferSourceNode.prototype[method];AudioBufferSourceNode.prototype[method]=function(...args){if(probe.measuring)probe[method==='start'?'audioStarts':'audioStops']++;return native.apply(this,args);};}
  probe.begin=()=>{probe.frames=[];probe.callbacks=[];probe.longTasks=[];probe.audioStarts=0;probe.audioStops=0;probe.startAt=performance.now();probe.measuring=true;};
})();`;
const build=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const results=[];
for(const size of sizes){
  const fixture=await createFortifiedFixture({diagnostics:true,timeoutMs:120000});let browsers=[],pages=[],stage='startup',token=100000;
  try{
    await fixture.start();const origin=`http://127.0.0.1:${fixture.port}`;
    for(const team of [0,1]){const browser=await createFortifiedBrowser();browsers.push(browser);const page=await browser.page(origin,{beforeScript:instrumentation});pages.push(page);await page.wait(`window.__fortifiedProbe?.welcome?.player.team===${team}&&document.documentElement.dataset.boot==='ready'`,'player boot');await page.cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:20,y:20,button:'left',buttons:1,clickCount:1});await page.cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:20,button:'left',clickCount:1});await page.cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:350});}
    async function state(team){return pages[team].cdp.evaluate('window.__fortifiedProbe.state');}
    async function send(team,command,label=/ORDER/){const orderToken=token++;const issued=await pages[team].cdp.evaluate(`(() => {const at=performance.now();window.__fortifiedProbe.socket.send(JSON.stringify(${JSON.stringify({...command,clientOrderToken:orderToken})}));return at;})()`);const message=await pages[team].wait(`window.__fortifiedProbe.notices.find(n=>n.token===${orderToken}&&(new RegExp(${JSON.stringify(label.source)},${JSON.stringify(label.flags)}).test(n.message)||/REJECTED|FAILED|MATCH OVER/.test(n.message)))`,'applied order',120000);assert.ok(label.test(message.message),message.message);return message.receivedAt-issued;}
    const scaled=structuredClone(map);scaled.id=`fortified-browser-scale-${size}`;scaled.startingArmySize=size-4;
    await pages[0].cdp.evaluate(`window.__fortifiedProbe.socket.send(JSON.stringify({type:'publishMap',map:${JSON.stringify(scaled)}}))`);
    await Promise.all(pages.map(p=>p.wait(`window.__fortifiedProbe.state?.mapId===${JSON.stringify(scaled.id)}`,'scaled map')));
    for(const page of pages)await page.cdp.evaluate('window.__fortifiedProbe.begin()');
    stage='clear construction site with ordinary army movement';
    await Promise.all(pages.map(async(page,team)=>{
      const s=await state(team),army=s.units.filter(u=>u[1]===team&&u[4]>0&&u[5]==='infantry');
      await send(team,{type:'move',ids:army.map(u=>u[0]),unitGenerations:army.map(u=>u[8]),x:team?12.5:-12.5,z:10.5},/MOVE ORDER/);
      await sleep(3000);
      const clearing=(await state(team)).units.filter(u=>u[1]===team&&u[4]>0&&u[5]!=='worker'&&Math.abs(u[2]-(team?18.5:-18.5))<1.5&&Math.abs(u[3]+3.5)<1.5);
      if(clearing.length)await send(team,{type:'move',ids:clearing.map(u=>u[0]),unitGenerations:clearing.map(u=>u[8]),x:team?30.5:-30.5,z:-10.5},/MOVE ORDER/);
      await page.wait(`!window.__fortifiedProbe.state.units.some(u=>u[1]===${team}&&u[4]>0&&u[5]!=='worker'&&Math.abs(u[2]-(${team?18.5:-18.5}))<1.5&&Math.abs(u[3]+3.5)<1.5)`,'vacated Barracks site',120000);
    }));
    stage='economy, execution audio and completion warmup';
    await Promise.all(pages.map(async(page,team)=>{
      const s=await state(team),workers=s.units.filter(u=>u[1]===team&&u[5]==='worker');
      for(const [index,type] of ['food','wood'].entries()){const node=map.resourceNodes.find(n=>n.type===type&&(team?n.x>20:n.x< -20));await send(team,{type:'gather',ids:[workers[index+2][0]],nodeId:node.id},/GATHER ORDER/);}
      await send(team,{type:'build',ids:workers.slice(0,2).map(u=>u[0]),buildingType:'barracks',x:team?18.5:-18.5,z:-3.5},/BUILD ORDER/);
      const built=await page.wait(`window.__fortifiedProbe.state.buildings.find(b=>b.team===${team}&&b.type==='barracks'&&b.complete)`,'completed Barracks',120000);
      await page.cdp.evaluate(`window.__fortifiedProbe.socket.send(JSON.stringify({type:'researchUpgrade',buildingId:${built.id},upgrade:'infantry-attack'}))`);
      await page.wait(`window.__fortifiedProbe.state.teamResearch[${team}].active?.type==='infantry-attack'`,'active paid research');
      await page.wait(`window.__fortifiedProbe.state.scenarioEvents.find(e=>e.id==='research-relief-${team}')?.fired`,'research relief',120000);
      await page.wait("document.querySelector('#audio-pack-status').textContent.toLowerCase().includes('ready')",'shipped profile ready');
    }));
    stage='forward movement and completed supply-chain warmup';
    await Promise.all(pages.map(async(page,team)=>{const s=await state(team),army=s.units.filter(u=>u[1]===team&&u[4]>0&&u[5]==='infantry');await send(team,{type:'move',ids:army.map(u=>u[0]),unitGenerations:army.map(u=>u[8]),x:team?6.5:-6.5,z:.5},/MOVE ORDER/);await page.wait(`window.__fortifiedProbe.state.scenarioEvents.find(e=>e.id==='field-relief-${team}')?.fired`,'joined field relief',120000);}));
    const measuredTotal=(await state(0)).alive[0]+(await state(1)).alive[1];
    assert.equal(measuredTotal,size,'Scout and field relief produce exact measured total');
    for(const page of pages)await page.cdp.evaluate("document.querySelector('#camera-home-base').click()");
    for(const page of pages)await page.cdp.evaluate('window.__fortifiedProbe.begin()');
    const started=performance.now(),samples=[],orderDelays=[],inspectors=[[],[]];let next=0;
    stage='combined movement, combat, persistent intent and audio';
    while(performance.now()-started<duration*1000){
      const elapsed=performance.now()-started;
      if(elapsed>=next){const phase=Math.floor(next/5000)%4;
        await Promise.all(pages.map(async(page,team)=>{const s=await state(team),scout=s.units.find(u=>u[1]===team&&u[4]>0&&u[5]==='scout'),army=s.units.filter(u=>u[1]===team&&u[4]>0&&u[5]==='infantry');if(!army.length)return;
          const common={ids:army.map(u=>u[0]),unitGenerations:army.map(u=>u[8])};
          if(phase===0)orderDelays.push(await send(team,{type:'attackMove',...common,x:team?1.5:-1.5,z:.5},/ATTACK MOVE ORDER/));
          if(phase===1)orderDelays.push(await send(team,{type:'patrol',...common,x:team?16.5:-16.5,z:5.5},/PATROL ORDER/));
          if(phase===2&&scout){orderDelays.push(await send(team,{type:'follow',...common,targetId:scout[0],targetGeneration:scout[8]},/FOLLOW ORDER/));orderDelays.push(await send(team,{type:'move',ids:[scout[0]],unitGenerations:[scout[8]],x:team?5.5:-5.5,z:team?2.5:-2.5},/MOVE ORDER/));}
          if(phase===3)orderDelays.push(await send(team,{type:'move',...common,x:team?18.5:-18.5,z:.5},/MOVE ORDER/));
        }));next+=5000;
      }
      samples.push(await fixture.health());
      for(const [team,page] of pages.entries()){const inspector=await page.cdp.evaluate("(() => {document.querySelector('#audio-inspector-refresh').click();return JSON.parse(document.querySelector('#audio-inspector-output').textContent);})()");inspectors[team].push(inspector);}
      await sleep(500);
    }
    const render=[];for(const [team,page] of pages.entries()){
      const r=await page.cdp.evaluate('(() => {const p=window.__fortifiedProbe;p.measuring=false;return {frames:p.frames,callbacks:p.callbacks,longTasks:p.longTasks,longTasksSupported:p.longTasksSupported,audioStarts:p.audioStarts,audioStops:p.audioStops,alive:p.state.alive,armySize:p.state.armySize,visibleUnits:p.state.units.length};})()');
      const decisions=inspectors[team].flatMap(i=>i.decisions);assert.ok(decisions.some(d=>d.cue==='work'&&d.outcome==='sample scheduled'),`observed work feedback participates; decisions=${JSON.stringify(decisions.slice(-12))}`);assert.ok(r.audioStarts>0,'native buffer playback participates');assert.ok(r.frames.length>0);assert.equal(page.errors.length,0);
      render.push({team,frameIntervalMs:quantiles(r.frames),allRafCallbackCpuMs:quantiles(r.callbacks),longTasks:quantiles(r.longTasks),longTasksSupported:r.longTasksSupported,audioStarts:r.audioStarts,audioStops:r.audioStops,peakSamples:Math.max(...inspectors[team].map(i=>i.activeSamples)),peakWork:Math.max(...inspectors[team].map(i=>i.activeWork)),decodedBytes:Math.max(...inspectors[team].map(i=>i.decodedBytes)),workDecisionsObserved:true,alive:r.alive,armySize:r.armySize,visibleUnits:r.visibleUnits});
    }
    const survivors=render[0].alive[0]+render[1].alive[1];
    assert.ok(survivors<measuredTotal,'actual combat casualties participate in the measured workload');
    stage='browser seat recovery';const saved=await fixture.checkpoint();await fixture.stop();const restart=performance.now();await fixture.start();
    await Promise.all(pages.map((p,t)=>p.wait(`window.__fortifiedProbe.welcome?.recoveredFromCheckpoint===true&&window.__fortifiedProbe.welcome.player.team===${t}`,'browser seat recovery',30000)));
    const after=await fixture.checkpoint();assert.ok(after.state.matchElapsedSeconds>=saved.state.matchElapsedSeconds);
    results.push({size,measuredTotal,survivors,combatCasualties:measuredTotal-survivors,startingArmySize:scaled.startingArmySize,durationSeconds:duration,healthSamples:samples.length,appliedNoticeMs:quantiles(orderDelays),recoveryMs:performance.now()-restart,render,tickTiming:samples.at(-1).tickTiming,movePlanning:samples.at(-1).movePlanning,transport:samples.at(-1).transport,checkpoint:samples.at(-1).checkpoint,browser:browsers.map(b=>b.version.product)});
    if(process.env.FORTIFIED_SCALE_RECORD)await writeFile(process.env.FORTIFIED_SCALE_RECORD,JSON.stringify({build,recordedAt:new Date().toISOString(),results},null,2));
    console.error(`Combined browser scale ${size}: ${samples.length} health samples, two rendered seats, audio and recovery passed`);
  }catch(error){
    const failure={size,stage,error:error.message,health:await fixture.health().catch(()=>null),render:[]};
    for(const [team,page] of pages.entries())failure.render.push(await page.cdp.evaluate(`(() => {const p=window.__fortifiedProbe;p.measuring=false;return {team:${team},frames:p.frames,callbacks:p.callbacks,longTasks:p.longTasks,alive:p.state?.alive,visibleUnits:p.state?.units.length,audioStarts:p.audioStarts};})()`).catch(()=>null));
    if(process.env.FORTIFIED_SCALE_RECORD)await writeFile(process.env.FORTIFIED_SCALE_RECORD,JSON.stringify({build,recordedAt:new Date().toISOString(),results,failure},null,2));
    throw new Error(`${size} ${stage}: ${error.message}`,{cause:error});
  }
  finally{for(const browser of browsers)await browser.dispose();await fixture.dispose();}
}
console.log(JSON.stringify({recordedAt:new Date().toISOString(),build,node:process.version,cpu:os.cpus()[0]?.model,platform:process.platform,viewport:{width:1280,height:720,dpr:1},results,limitations:['headless two-process Chrome; no windowed GPU budget or human listening claim','loopback JSON transport; no real network impairment','short steady-state sample after paid economy/research warmup','frame/RAF and native audio scheduling instrumentation adds measurement overhead','inspector decision polls overlap; counts are not event rates','2,000 is a diagnostic ceiling, not a supported capacity claim']},null,2));
