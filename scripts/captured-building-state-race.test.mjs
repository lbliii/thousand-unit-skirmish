import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createCapturedBuildingSprite,updateCapturedBuildingSprite,disposeCapturedBuildingSprite} from '../src/captured-building-art.mjs';

test('a late Complete image cannot cover construction fallback, and repair can restore it', async()=>{
 const previous={fetch:globalThis.fetch,Image:globalThis.Image,document:globalThis.document,warn:console.warn};
 const bytes=Buffer.from('controlled-renderer-test-image');
 const manifest={schema:'thousand-unit-skirmish.building-lifecycle-reference.v1',asset:'house',
  camera:{azimuthDegrees:[0],framePixels:[1024,1024],pixelsPerWorldUnit:128,anchorPixelFromTopLeft:[512,647]},
  stateOrder:['complete'],completeState:{views:[{index:0,path:'complete.png',sha256:createHash('sha256').update(bytes).digest('hex')}]}};
 let startDecode,finishDecode;
 const decoding=new Promise(resolve=>{startDecode=resolve;});
 const decoded=new Promise(resolve=>{finishDecode=resolve;});
 globalThis.fetch=async url=>new Response(String(url).endsWith('.json')?JSON.stringify(manifest):bytes);
 globalThis.Image=class {constructor(){this.width=this.naturalWidth=1024;this.height=this.naturalHeight=1024;}decode(){startDecode();return decoded;}};
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {drawImage(){}};}};}};
 console.warn=()=>{};
 const sprite=createCapturedBuildingSprite({manifestUrl:'https://capture-test.invalid/house-race.json'});
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,10,10);
 try{
  updateCapturedBuildingSprite(sprite,camera,{complete:true,hp:100,maxHp:100});
  await decoding;
  updateCapturedBuildingSprite(sprite,camera,{complete:false,progress:0.5});
  assert.equal(sprite.visible,false);
  finishDecode();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sprite.visible,false,'late Complete result must not replace construction');
  assert.equal(sprite.material.map,null);
  updateCapturedBuildingSprite(sprite,camera,{complete:true,hp:100,maxHp:100});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sprite.visible,true,'completed repair can reuse the verified image');
  assert.ok(sprite.material.map);
  updateCapturedBuildingSprite(sprite,camera,{complete:true,hp:20,maxHp:100});
  assert.equal(sprite.visible,false,'Critical with no authored frame yields to fallback');
 }finally{
  disposeCapturedBuildingSprite(sprite);
  globalThis.fetch=previous.fetch;globalThis.Image=previous.Image;globalThis.document=previous.document;console.warn=previous.warn;
 }
});
