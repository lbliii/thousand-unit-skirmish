// Agent-operated author-to-invite proof; never claims unassisted human usability.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFortifiedFixture} from './fortified-crossing-fixture.mjs';
import {createFortifiedBrowser} from './fortified-browser-fixture.mjs';
const map=JSON.parse(await readFile(new URL('../maps/fortified-crossing.json',import.meta.url)));
const remote=process.env.FORTIFIED_STAGING_ORIGIN;
const headers=remote?{authorization:'Basic '+Buffer.from(`${process.env.RTS_ACCESS_USER||'players'}:${process.env.RTS_ACCESS_PASSWORD||''}`).toString('base64')}:{};
if(remote){assert.equal(new URL(remote).protocol,'https:');assert.ok(process.env.RTS_ACCESS_PASSWORD,'staging credentials required');}
const fixture=remote?null:await createFortifiedFixture({supervisor:true});
let browser,stage='startup',proofPages=[];
const capture=`(() => {
  const Native=WebSocket;window.WebSocket=class extends Native {constructor(...args){super(...args);window.__fortifiedSocket=this;this.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='welcome'){window.__fortifiedTeam=m.player.team;window.__fortifiedState=m.state;}if(m.type==='mapChange')window.__fortifiedState=m.state;if(m.type==='state')window.__fortifiedState=m;});}};
  const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='application/json')blob.text().then(text=>window.__fortifiedExport=text);return create(blob);};
  const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){try{const c=JSON.parse(data);if(c.type==='publishMap')window.__fortifiedPublished=c.map;}catch{}return send.call(this,data);};
  window.__fortifiedAudioStarts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__fortifiedAudioStarts++;return start.apply(this,args);};
})();`;
try {
  await fixture?.start();browser=await createFortifiedBrowser();
  const origin=remote??`http://127.0.0.1:${fixture.port}`;
  const response=await fetch(origin+'/api/rooms',{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,201);
  const room=await response.json(),url=origin+'/?room='+room.roomId;
  const host=await browser.page(url,{beforeScript:capture,headers});proofPages.push(host);
  await host.wait("document.documentElement.dataset.boot==='ready'&&!document.querySelector('#map-studio-open').disabled",'host boot');
  async function field(id,value){return host.cdp.evaluate(`(() => {const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error('Missing form field');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return e.value;})()`);}
  async function click(selector){return host.cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
  stage='select shipped terrain before authoring';await field('map-select',map.id);
  await host.wait(`window.__fortifiedState?.mapId===${JSON.stringify(map.id)}`,'shipped Fortified Crossing selected');
  stage='author regions and completion chain through forms';await click('#map-studio-open');
  await host.wait("document.querySelector('#map-studio').open",'Map Studio open');
  await field('studio-id','fortified-crossing-browser-proof');await field('studio-name','Fortified Crossing Browser Proof');
  while(await host.cdp.evaluate("document.querySelectorAll('#studio-event-list button').length>0")){await click('#studio-event-list button');await click('#studio-remove-event');}
  while(await host.cdp.evaluate("document.querySelector('#studio-region-list').options.length>1")){
    const id=await host.cdp.evaluate("document.querySelector('#studio-region-list').options[1].value");await field('studio-region-list',id);await click('#studio-region-delete');
  }
  await click('[data-map-tool="region-draw"]');await click('#studio-grid-zoom-fit');
  const bounds=await host.cdp.evaluate("(() => {const r=document.querySelector('#studio-grid').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()");
  const point=(column,row)=>({x:bounds.x+(column+.5)*bounds.w/map.width,y:bounds.y+(row+.5)*bounds.h/map.height});
  const a=point(33,28),b=point(46,35);
  await host.cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...a});
  await host.cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,...b});
  await host.cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...b});
  await host.wait("document.querySelector('#studio-region-list').value",'drawn region');
  const regionId=await host.cdp.evaluate("document.querySelector('#studio-region-list').value");
  await field('studio-region-name','Central Crossing');
  // Geometry fields verify exact rectangle after the pointer gesture.
  for(const [k,v] of Object.entries({column:33,row:28,width:14,height:8}))await field('studio-region-'+k,v);
  await click('#studio-scenario-undo');await click('#studio-scenario-redo');
  const authoredIds=new Map();
  for(const event of map.scenarioEvents){
    await click('#studio-add-event');await field('studio-event-name',event.name);
    await field('studio-event-trigger',event.trigger?.type??'clock');
    if(event.trigger?.type==='region-entry'){
      await field('studio-event-region',regionId);await field('studio-event-region-team',event.trigger.team);await field('studio-event-region-minimum',event.trigger.minimumUnits);
    }else if(['construction-complete','research-complete'].includes(event.trigger?.type)){
      await field('studio-event-completion-team',event.trigger.team);await field('studio-event-completion-id',event.trigger.buildingType??event.trigger.technologyId);
    }else if(event.trigger?.type==='event'){
      const ids=event.trigger.eventIds.map(id=>authoredIds.get(id));assert.ok(ids.every(Boolean));
      await host.cdp.evaluate(`(() => {const wanted=${JSON.stringify(ids)};const available=[...document.querySelectorAll('#studio-event-sources input')].map(e=>e.value);for(const value of available){const e=[...document.querySelectorAll('#studio-event-sources input')].find(e=>e.value===value);if(e && wanted.includes(value)!==e.checked)e.click();}})()`);
    }
    await field('studio-event-after',event.afterSeconds);await field('studio-event-team',event.team);
    await field('studio-event-food',event.foodReward??0);await field('studio-event-wood',event.woodReward??0);
    await field('studio-event-unit-count',event.unitCount??0);await field('studio-event-unit-kind',event.unitKind??'infantry');await field('studio-event-message',event.message);
    // Export after each addition reads the assigned ID without touching the draft JSON.
    await click('#studio-download');
    const exported=await host.wait(`window.__fortifiedExport && JSON.parse(window.__fortifiedExport).scenarioEvents.some(e=>e.name===${JSON.stringify(event.name)}) && window.__fortifiedExport`,'event export');
    const definition=JSON.parse(exported);authoredIds.set(event.id,definition.scenarioEvents.find(e=>e.name===event.name).id);
  }
  stage='assigned shipped profile and export/import';
  await host.wait("[...document.querySelector('#studio-audio-pack').options].some(o=>o.value==='rts-feedback-test')",'shipped pack option');
  await field('studio-audio-pack',map.audio.packId);await field('studio-audio-profile',map.audio.profileId);
  await click('#studio-download');const exported=await host.wait("window.__fortifiedExport && JSON.parse(window.__fortifiedExport).audio?.version==='v1' && window.__fortifiedExport",'versioned audio export');
  const authored=JSON.parse(exported);assert.equal(authored.startingArmySize,map.startingArmySize);assert.deepEqual(authored.resourceNodes,map.resourceNodes);assert.deepEqual(authored.triggers,map.triggers);assert.equal(authored.width,map.width);assert.equal(authored.height,map.height);assert.deepEqual(authored.audio,map.audio);assert.equal(authored.scenarioEvents.length,map.scenarioEvents.length);assert.deepEqual(authored.regions[0].zone,map.regions[0].zone);
  for(const original of map.scenarioEvents){const actual=authored.scenarioEvents.find(e=>e.name===original.name);assert.ok(actual);assert.equal(actual.afterSeconds,original.afterSeconds);assert.equal(actual.team,original.team);if(original.trigger?.type==='event')assert.deepEqual(actual.trigger.eventIds?.slice().sort(),original.trigger.eventIds.map(id=>authoredIds.get(id)).sort());else if(original.trigger)assert.deepEqual(actual.trigger,{...original.trigger,...(original.trigger.regionId?{regionId}:{})});}
  await host.cdp.evaluate(`(() => {const file=new File([window.__fortifiedExport],'fortified-crossing.json',{type:'application/json'});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('#studio-import-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await host.wait("document.querySelector('#studio-message').textContent.startsWith('Loaded fortified-crossing.json')",'import complete');
  await click('#map-studio-close');
  await host.cdp.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await click('#map-studio-open');
  if(await host.cdp.evaluate("!document.querySelector('#studio-draft-recovery').hidden"))await click('#studio-draft-restore');
  await host.wait("document.querySelector('#studio-name').value==='Fortified Crossing Browser Proof'",'reopened draft');
  stage='publish and fresh guest automatic delivery';await click('#studio-publish');
  await host.wait(`!document.querySelector('#map-studio').open&&window.__fortifiedState?.mapId===${JSON.stringify(authored.id)}`,'published map applied');
  const guest=await browser.page(url,{beforeScript:capture,headers});proofPages.push(guest);
  await guest.wait(`document.documentElement.dataset.boot==='ready'&&window.__fortifiedState?.mapId===${JSON.stringify(authored.id)}`,'fresh guest boot on authored map');
  for(const [seat,page] of [['host',host],['fresh-guest',guest]]){
    await page.wait("document.querySelector('#audio-pack-status').textContent.toLowerCase().includes('ready')",`${seat} auto pack ready`);
    const packs=await page.cdp.evaluate("(async () => {const {createAudioLibraryStore}=await import('./src/audio-library-store.mjs');return (await createAudioLibraryStore().listPacks()).length;})()");assert.equal(packs,0,'no imported pack');
    await page.cdp.evaluate("document.querySelector('#audio-inspector-refresh').click()");
    const inspector=await page.cdp.evaluate("JSON.parse(document.querySelector('#audio-inspector-output').textContent)");
    assert.ok(inspector.bindings.length>0);assert.ok(inspector.bindings.every(b=>b.sources.every(s=>s.available)));
    assert.equal(page.errors.length,0,`${seat} browser exceptions`);
  }
  stage='native work playback, muted effects, stop and same-size reset';
  for(const page of [host,guest]){
    await page.cdp.call('Page.bringToFront');
    await page.cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:20,y:20,button:'left',buttons:1,clickCount:1});
    await page.cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:20,button:'left',clickCount:1});await page.cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:350});
    await page.cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:350,deltaX:0,deltaY:-600});
    await page.cdp.evaluate("document.querySelector('#camera-home-base').click()");
    await page.cdp.evaluate(`(() => {const team=window.__fortifiedTeam,workers=window.__fortifiedState.units.filter(u=>u[1]===team&&u[5]==='worker');const nodes=${JSON.stringify(map.resourceNodes)};for(const [index,type] of ['food','wood'].entries()){const node=nodes.find(n=>n.type===type&&(team?n.x>20:n.x< -20));window.__fortifiedSocket.send(JSON.stringify({type:'gather',ids:[workers[index+2][0]],nodeId:node.id}));}})()`);
    const inspector="(() => {document.querySelector('#audio-inspector-refresh').click();return JSON.parse(document.querySelector('#audio-inspector-output').textContent);})()";
    await page.wait(`(${inspector}).decisions.some(d=>d.cue==='work'&&d.outcome==='sample scheduled')&&window.__fortifiedAudioStarts>0`,'authoritative work sample playback',30000);
    await page.cdp.evaluate("(() => {const e=document.querySelector('#audio-effects-level');e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    assert.equal((await page.cdp.evaluate(inspector)).activeWork,0,'muted effects stop sampled work');
    const beforeResume=await page.cdp.evaluate('window.__fortifiedAudioStarts');
    await page.cdp.evaluate("(() => {const e=document.querySelector('#audio-effects-level');e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await page.wait(`window.__fortifiedAudioStarts>${beforeResume}&&(${inspector}).decisions.some(d=>d.cue==='work'&&d.outcome==='sample scheduled')`,'resumed native sampled work',30000);
    await page.cdp.evaluate("window.__fortifiedSocket.send(JSON.stringify({type:'stop',ids:window.__fortifiedState.units.filter(u=>u[1]===window.__fortifiedTeam&&u[5]==='worker').map(u=>u[0])}))");
    await page.wait(`window.__fortifiedState.units.filter(u=>u[1]===window.__fortifiedTeam&&u[5]==='worker').every(u=>!u[14])&&(${inspector}).activeWork===0`,'stopped execution silent');
  }
  const elapsed=await host.cdp.evaluate('window.__fortifiedState.matchElapsedSeconds');
  await click('#reset-army');
  for(const page of [host,guest])await page.wait(`window.__fortifiedState.matchElapsedSeconds<${elapsed}&&window.__fortifiedState.scenarioEvents.every(e=>!e.fired)&&(() => {document.querySelector('#audio-inspector-refresh').click();return JSON.parse(document.querySelector('#audio-inspector-output').textContent).activeWork===0;})()`,'same-size reset stops work and rearms events');
  console.log(JSON.stringify({map:authored.id,events:authored.scenarioEvents.length,region:authored.regions[0],invite:true,freshGuestPack:true,browser:browser.version.product,checks:['visual draw','typed event forms','undo/redo','export/import','reopen','publish','fresh invite guest','no imported audio pack','native execution playback','effects mute/resume','stop silence','same-size reset audio baseline'],limitations:['scripted authoring; no unassisted human discoverability or listening claim','does not replace combined authoritative match test']}));
}catch(error){for(const page of proofPages)console.error(JSON.stringify(await page.cdp.evaluate("(() => {document.querySelector('#audio-inspector-refresh')?.click();return {hidden:document.hidden,team:window.__fortifiedTeam,elapsed:window.__fortifiedState?.matchElapsedSeconds,workers:window.__fortifiedState?.units.filter(u=>u[1]===window.__fortifiedTeam&&u[5]==='worker'),starts:window.__fortifiedAudioStarts,inspector:JSON.parse(document.querySelector('#audio-inspector-output')?.textContent||'{}').decisions,notice:document.querySelector('#order-status')?.textContent};})()").catch(()=>null)));throw new Error(`${stage}: ${error.message}`,{cause:error});}
finally{await browser?.dispose();await fixture?.dispose();}
