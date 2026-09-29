import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFrameUnclipped } from './sprite-pixel-bounds.mjs';
function fixture() {
  const image = {width:16,height:16,pixels:new Uint8Array(16*16*4)};
  for (let y=4;y<12;y++) for(let x=5;x<10;x++) image.pixels[(y*16+x)*4+3]=255;
  const frame = {id:'pose',fallbackRectPx:{rectPx:{x:0,y:0,width:16,height:16}},
    alphaBoundsPx:{x:5,y:4,width:5,height:8},groundPivotPx:{x:8,y:12}};
  return {image,frame};
}
test('complete pixels and a shared ground baseline pass',()=>{
  const {image,frame}=fixture(); assert.deepEqual(assertFrameUnclipped(image,frame),frame.alphaBoundsPx);
});
test('cell-valid metadata cannot conceal edge-cut pixels',()=>{
  const {image,frame}=fixture(); image.pixels[(8*16)*4+3]=255;
  assert.throws(()=>assertFrameUnclipped(image,frame),/edge-cut/);
});
test('invented full-cell alpha bounds fail decoded measurement',()=>{
  const {image,frame}=fixture(); frame.alphaBoundsPx={x:0,y:0,width:16,height:16};
  assert.throws(()=>assertFrameUnclipped(image,frame),/disagree/);
});
test('feet below a copied pivot fail even with safe atlas margins',()=>{
  const {image,frame}=fixture(); frame.groundPivotPx.y=9;
  assert.throws(()=>assertFrameUnclipped(image,frame),/terrain/);
});
