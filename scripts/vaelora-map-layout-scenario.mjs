import { buildElevationGrid } from '../src/map-utils.mjs';
import assert from 'node:assert/strict';
import { TERRAIN_COLORS } from '../src/terrain-materials.mjs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { townCenterFootprintCells } from '../src/town-center-spawn.mjs';
import { findUnreachableResourceNode, findUnreachableCaptureZone } from '../src/map-utils.mjs';
const files = (await readdir('maps')).filter(f=>/^(bellweather-|underbough-|sereward-|ellionar-|veyrholds-|pale-meridian-|siltmouths-|vesperra-|sombral-mere-|ru-lora-)/.test(f));
let panels = '';
for (const [i,file] of files.entries()) {
  const map = JSON.parse(await readFile(`maps/${file}`));
  const {width,height,spawnPoints,resourceNodes,triggers} = map;
  const blocked = new Uint8Array(width*height);
  const levels=buildElevationGrid(width,height,map.elevationPatches);
  for(const o of map.obstacles) for(let y=o.row;y<o.row+o.height;y++) for(let x=o.column;x<o.column+o.width;x++) { const cell=y*width+x; assert.equal(blocked[cell],0,`${file}: overlapping obstacles`); blocked[cell]=1; }
  for(let team=0;team<2;team++) for(const cell of townCenterFootprintCells(spawnPoints,team,width,height)) {assert.equal(blocked[cell],0,`${file}: obstructed Town Center`);blocked[cell]=1;}
  assert.equal(findUnreachableResourceNode(width,height,blocked,spawnPoints,resourceNodes,levels),null,`${file}: resource access with Town Centers`);
  assert.equal(findUnreachableCaptureZone(width,height,blocked,spawnPoints,triggers,levels),null,`${file}: objective access with Town Centers`);
  for (const spawn of spawnPoints) for (const type of ['food', 'wood']) assert.ok(resourceNodes.some(n => n.type === type && Math.hypot(n.x-spawn.x,n.z-spawn.z) <= 9), `${file}: visible home ${type} for seat ${spawn.team}`);
  assert.equal(map.startingArmySize,24);
  assert.ok(map.audio.version && map.audio.sha256);
  const x=(i%3)*330,y=Math.floor(i/3)*280,scale=3;
  panels+=`<g transform="translate(${x},${y})"><text x="8" y="20" font-size="12">${map.name}</text><rect x="8" y="30" width="${width*scale}" height="${height*scale}" fill="${TERRAIN_COLORS[map.terrainBase]}"/>`;
  for(const p of map.terrainPatches) panels+=`<rect x="${8+p.column*scale}" y="${30+p.row*scale}" width="${p.width*scale}" height="${p.height*scale}" fill="${TERRAIN_COLORS[p.material]}"/>`;
  for(const p of map.elevationPatches || []) panels+=`<rect x="${8+p.column*scale}" y="${30+p.row*scale}" width="${p.width*scale}" height="${p.height*scale}" fill="#fff4b5" opacity="${p.level*.22}"/>`;
  for(const o of map.obstacles) panels+=`<rect x="${8+o.column*scale}" y="${30+o.row*scale}" width="${o.width*scale}" height="${o.height*scale}" fill="${{water:'#558baf',forest:'#416249',stone:'#787580'}[o.material]}"/>`;
  for(const t of triggers) panels+=`<rect x="${8+t.zone.column*scale}" y="${30+t.zone.row*scale}" width="${t.zone.width*scale}" height="${t.zone.height*scale}" fill="none" stroke="#f9d766" stroke-width="2"/>`;
  for(const n of resourceNodes) panels+=`<circle cx="${8+(n.x+width/2)*scale}" cy="${30+(n.z+height/2)*scale}" r="3" fill="${n.type==='food'?'#ba572f':'#683c21'}"/>`;
  for(const p of spawnPoints) panels+=`<circle cx="${8+(p.x+width/2)*scale}" cy="${30+(p.z+height/2)*scale}" r="5" fill="${p.team?'#dc603c':'#319cdf'}"/>`;
  panels+='</g>';
}
await writeFile('docs/vaelora-map-layouts.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1120" viewBox="0 0 990 1120"><rect width="990" height="1120" fill="#ecebdc"/>${panels}</svg>`);
console.log(`${files.length} Vaelora maps: all resources/objectives reachable for both seats with Town Centers; no obstructed bases.`);
