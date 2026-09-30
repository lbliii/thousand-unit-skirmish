import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateRollingGround, smoothGround, compressGroundLevels } from '../src/terrain-authoring.mjs';
import { terrainHeightField } from '../src/terrain-height.mjs';
import { buildElevationGrid, findUnreachableResourceNode, findUnreachableCaptureZone } from '../src/map-utils.mjs';
import { townCenterFootprintCells } from '../src/town-center-spawn.mjs';
for(const id of ['bellweather-millrace','underbough-rootways']) {
  const map=JSON.parse(await readFile(`maps/${id}.json`));
  const {width,height}=map;
  for(const seed of [0,1,93000,0xffffffff]) {
    const levels=generateRollingGround(map,seed);
    assert.deepEqual(levels,generateRollingGround(map,seed));
    assert.ok(levels.some(l=>l===1));
    for(let row=0;row<height;row++) for(let col=0;col<width;col++) assert.equal(levels[row*width+col],levels[row*width+width-1-col]);
    const blocked=new Uint8Array(width*height);
    for(const o of map.obstacles) for(let y=o.row;y<o.row+o.height;y++) for(let x=o.column;x<o.column+o.width;x++) blocked[y*width+x]=1;
    for(let team=0;team<2;team++) for(const cell of townCenterFootprintCells(map.spawnPoints,team,width,height)) {assert.equal(levels[cell],0);blocked[cell]=1;}
    assert.equal(findUnreachableResourceNode(width,height,blocked,map.spawnPoints,map.resourceNodes,levels),null);
    assert.equal(findUnreachableCaptureZone(width,height,blocked,map.spawnPoints,map.triggers,levels),null);
    assert.deepEqual(buildElevationGrid(width,height,compressGroundLevels(levels,width,height)),levels);
  }
}
assert.throws(()=>generateRollingGround({width:16,height:16},-1),/seed/);
const raised=Uint8Array.from([0,0,0,0,2,0,0,0,0]);
assert.equal(smoothGround(raised,3,3,[4])[4],0);
assert.equal(raised[4],2,'smoothing does not mutate the input during a brush stroke');
const field=terrainHeightField({width:4,height:4,elevationPatches:[{column:2,row:0,width:2,height:4,level:2}]});
assert.equal(field.sample(-.001,0),0,'low side of a cliff stays low');
assert.ok(Math.abs(field.sample(.001,0)-1.6)<1e-6,'high side stays raised');
const slope=terrainHeightField({width:4,height:4,elevationPatches:[{column:2,row:0,width:2,height:4,level:1}]});
assert.ok(slope.sample(-.5,0)<slope.sample(.5,0));
assert.ok(Math.abs(slope.sample(-.001,0)-slope.sample(.001,0))<.001,'one-level slopes join continuously');
assert.equal(terrainHeightField({width:16,height:16}).sample(0,0),0);
console.log('Seeded terrain: reproducible/mirrored hills, flat Town Center pads, both-seat reachability, smooth brush, height interpolation and cliffs passed.');
