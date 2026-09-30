import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const packs=['frontier-civilization-scale-pilot-v1','frontier-civilization-models-v1'];
test('all six Complete renderer manifests preserve captured pixels, scale and registration',async()=>{
 let count=0;
 for(const pack of packs){
  const root=new URL(`../assets/buildings/${pack}/`,import.meta.url);
  const records=JSON.parse(await readFile(new URL('captures/capture-manifest.json',root))).records;
  for(const asset of new Set(records.map(r=>r.asset))){
   const m=JSON.parse(await readFile(new URL(`${asset}-complete-renderer.json`,root)));
   assert.equal(m.asset,asset);assert.deepEqual(m.stateOrder,['complete']);assert.equal(m.camera.pixelsPerWorldUnit,128);
   assert.deepEqual(m.camera.framePixels,[1024,1024]);assert.equal(m.completeState.views.length,8);
   for(const view of m.completeState.views){const source=records.find(r=>r.asset===asset&&r.viewIndex===view.index);assert.ok(source);assert.equal(view.azimuthDegrees,source.camera.azimuthDegrees);assert.deepEqual(m.camera.anchorPixelFromTopLeft,records.find(r=>r.asset===asset).camera.groundOriginPixelFromTopLeft);assert.equal(createHash('sha256').update(await readFile(new URL(view.path,root))).digest('hex'),source.sha256);}
   count++;
  }
 }
 assert.equal(count,6);
});


import {validateCaptureFamily} from './build-frontier-complete-manifests.mjs';
test('capture admission rejects drift and duplicate directions before generating renderer metadata',async()=>{
 const root=new URL('../assets/buildings/frontier-civilization-scale-pilot-v1/captures/capture-manifest.json',import.meta.url);
 const records=JSON.parse(await readFile(root)).records.filter(r=>r.asset==='house');
 assert.doesNotThrow(()=>validateCaptureFamily(records));
 for(const mutate of [
  rows=>{rows[1].viewIndex=rows[0].viewIndex;},
  rows=>{rows[1].camera.pixelsPerWorldUnit=256;},
  rows=>{rows[1].camera.groundOriginPixelFromTopLeft[0]+=1;},
  rows=>{rows[1].uniformScale*=2;},
  rows=>{rows[1].lighting.keyIntensity+=1;},
  rows=>{rows[1].file='../source.glb';},
 ]){const rows=structuredClone(records);mutate(rows);assert.throws(()=>validateCaptureFamily(rows));}
});
