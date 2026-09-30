// Deterministic authored layouts; rerun when changing the roster or source audio.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateAudioPack } from '../src/audio-assets.mjs';
const catalog = JSON.parse(await readFile('assets/audio/vaelora-zones-v1/catalog.json'));
export const roster = [
  ['bellweather-millrace', 'Bellweather · Millrace', 'bellweather', 'meadow', 'river', 'Three broad fords divide orchard banks. Secure both crossings, then the Mill Watch.'],
  ['bellweather-common', 'Bellweather · Orchard Common', 'bellweather', 'short-grass', 'groves', 'A wide common between paired orchards; outer harvests compete with the central market route.'],
  ['underbough-rootways', 'Underbough · Rootways', 'underbough', 'forest-floor', 'groves', 'Copper woodland encloses three clearings. Cut new routes or defend the existing rootways.'],
  ['sereward-cistern-road', 'Sereward · Cistern Road', 'sereward', 'sand', 'basins', 'Two sheltered water basins flank an open caravan road; supplies sit beyond the home clearings.'],
  ['ellionar-channel-gardens', 'Ellionar · Channel Gardens', 'ellionar', 'garden-loam', 'river', 'Irrigation channels divide cultivated gardens; wide maintenance crossings keep armies moving.'],
  ['veyrholds-slate-saddle', 'Veyrholds · Slate Saddle', 'veyrholds', 'scree', 'ridges', 'Paired slate ridges shelter bases; a broad saddle and two exposed passes offer alternate approaches.'],
  ['pale-meridian-observation-road', 'Pale Meridian · Observation Road', 'pale-meridian', 'snow', 'ridges', 'A snowbound observation route crosses low ridges; the exposed center rewards careful scouting.'],
  ['siltmouths-reed-crossings', 'Siltmouths · Reed Crossings', 'siltmouths', 'tidal-mud', 'braid', 'Staggered tidal channels leave three dry crossings. Reeds shelter the outer supply routes.'],
  ['vesperra-pale-clearings', 'Vesperra · Pale Clearings', 'vesperra', 'jungle-loam', 'groves', 'Pale trunks enclose a living canopy; broad clearings connect the central and outer routes.'],
  ['sombral-mere-shore-gardens', 'Sombral Mere · Shore Gardens', 'sombral-mere', 'lunar-soil', 'basins', 'Still pools and lunar gardens frame a dry causeway, with room to contest either shore.'],
  ['ru-lora-fringe-path', 'Ru’Lora · Fringe Path', 'ru-lora-fringe', 'jungle-loam', 'ridges', 'Living vegetation meets salt and broken stone. Rival expeditions contest the approach, not a demon town.'],
  ['ru-lora-salt-hollows', 'Ru’Lora · Salt Hollows', 'ru-lora-interior', 'salt-crust', 'ridges', 'Petrified remains divide quiet salt hollows. A sparse expedition scenario without invented hazard rules.'],
];
const refs = [];
for (const palette of catalog.zones) {
  const source = catalog.sources.find(s => s.id === `${palette.id}-music`);
  if (!source || source.status !== 'downloaded') throw new Error(`Missing music for ${palette.id}`);
  const bytes = await readFile(`assets/audio/vaelora-zones-v1/${source.file}`);
  const duration = Math.min(40, source.actualDurationSeconds - 1);
  const packId = `vaelora-${palette.id}`;
  const pack = validateAudioPack({schemaVersion:1, id:packId, name:`${palette.name} regional music`,
    sources:[{id:source.id,name:`${palette.name} everyday candidate`,fileName:source.file.split('/').at(-1),mimeType:'audio/mpeg',tags:[palette.id,'candidate'],provenance:{provider:'ElevenLabs',prompt:source.prompt,createdAt:source.downloadedOn}}],
    profiles:[{id:'landscape',name:palette.name,bindings:{},music:{defaultCompositionId:'everyday'}}],
    compositions:[{schemaVersion:1,id:'everyday',name:'Everyday landscape',bpm:960/duration,beatsPerBar:4,lengthBars:4,tracks:[{id:'music',name:'Everyday music',gain:.35,clips:[{id:'take',sourceId:source.id,startBeat:0,durationBeats:16,fadeInSeconds:2,fadeOutSeconds:3}]}]}]});
  const manifest = JSON.stringify({version:'v1',pack,downloads:{[source.id]:{path:`/assets/audio/vaelora-zones-v1/${source.file}`,bytes:bytes.length,mimeType:'audio/mpeg',sha256:createHash('sha256').update(bytes).digest('hex')}}},null,2)+'\n';
  await mkdir(`assets/audio/runtime/${packId}/v1`,{recursive:true});
  await writeFile(`assets/audio/runtime/${packId}/v1/manifest.json`,manifest);
  refs.push({packId,profileId:'landscape',version:'v1',sha256:createHash('sha256').update(manifest).digest('hex')});
}
for (const [index,[id,name,palette,terrainBase,layout,summary]] of roster.entries()) {
  const width = layout === 'groves' ? 96 : 80, height = 72, center = width/2;
  const rect = (column,row,width,height,material) => ({column,row,width,height,material});
  const obstacles = [];
  const pair = (x,y,w,h,m) => obstacles.push(rect(x,y,w,h,m),rect(width-x-w,y,w,h,m));
  pair(8,4,8,8,'forest'); pair(8,60,8,8,'forest');
  if (layout === 'river') for (const [y,h] of [[0,12],[24,8],[40,8],[60,12]]) obstacles.push(rect(center-2,y,4,h,'water'));
  if (layout === 'braid') { pair(center-12,0,3,14,'water'); pair(center-12,25,3,6,'water'); pair(center-12,41,3,6,'water'); pair(center-12,58,3,14,'water'); }
  if (layout === 'groves') { pair(28,12,8,14,'forest'); pair(28,46,8,14,'forest'); }
  if (layout === 'basins') { pair(center-17,7,10,16,'water'); pair(center-17,49,10,16,'water'); }
  if (layout === 'ridges') { pair(center-19,8,7,17,'stone'); pair(center-19,47,7,17,'stone'); }
  const resourceNodes = [];
  for (const [team,sign] of [[0,-1],[1,1]]) for (const [i,[x,z,type,stock]] of [[width/2-18,7,'food',650],[width/2-18,-7,'wood',650],[width/2-20,22,'food',450],[width/2-20,-22,'wood',450]].entries()) resourceNodes.push({id:`s${team}-${i}`,type,x:sign*(x-.5),z:z+.5,stock});
  const posts = {river:['North Ford','South Ford','Crossing Watch'],groves:['North Clearing','South Clearing','Clearing Watch'],basins:['North Shore','South Shore','Causeway Watch'],ridges:['North Pass','South Pass','Saddle Watch'],braid:['North Landing','South Landing','Reed Watch']}[layout];
  const triggers = [[18,posts[0]],[54,posts[1]],[36,posts[2]]].map(([y,label],i)=>({id:`post-${i}`,name:label,type:'capture-zone',zone:rect(center-5,y-4,10,8),requiredUnits:i===2?8:5,captureSeconds:i===2?12:9,foodReward:i===2?0:75,woodReward:i===2?0:50,victory:true,...(i===2?{requiresAll:['post-0','post-1']}:{})}));
  const patches = [rect(0,32,width,8,'dirt')];
  if (terrainBase==='sand') { patches.push(rect(5,16,15,8,'dry-grass'),rect(width-20,16,15,8,'dry-grass')); }
  if (palette==='ru-lora-fringe') patches.push(rect(center-9,0,18,30,'salt-crust'),rect(center-9,42,18,30,'salt-crust'));
  const map = {id,name,summary,width,height,terrainSeed:93000+index,fogOfWar:true,terrainBase,terrainPatches:patches,spawnPoints:[{team:0,x:-width/2+14.5,z:.5},{team:1,x:width/2-14.5,z:.5}],startingArmySize:24,startingResources:{food:150,wood:250},obstacles,resourceNodes,triggers,victoryMode:'all',victoryHoldSeconds:20,timedVictory:{afterSeconds:900,objectiveId:'post-2'},scenarioEvents:[{id:'relief',name:'Traveling supplies',type:'timed-supply',afterSeconds:120,team:'both',foodReward:100,woodReward:75}],audio:refs.find(r=>r.packId===`vaelora-${palette}`)};
  await writeFile(`maps/${id}.json`,JSON.stringify(map,null,2)+'\n');
}
const prior = await readFile('src/audio-shipped-catalog.mjs','utf8');
const original = JSON.parse(prior.match(/Object.freeze\((\[.*\])\)/s)[1]).filter(r=>!r.packId.startsWith('vaelora-'));
await writeFile('src/audio-shipped-catalog.mjs',`// Hash-bound shipped recordings; regional sources remain creative candidates.\nexport const SHIPPED_AUDIO_REFERENCES = Object.freeze(${JSON.stringify([...original,...refs],null,2)});\n`);
console.log(`Authored ${roster.length} maps and ${refs.length} regional music packs.`);
