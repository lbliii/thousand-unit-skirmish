import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteAnimationTime, spriteClipDuration } from '../src/unit-sprite-runtime.mjs';

test('walking and work use elapsed milliseconds, not procedural phase', () => {
  const unit = { motionPhase: 300 };
  assert.equal(spriteAnimationTime(unit, 'walk', 1000), 0);
  unit.motionPhase += 14;
  assert.equal(spriteAnimationTime(unit, 'walk', 2067), 1067);
  assert.equal(spriteAnimationTime(unit, 'gather', 2200), 0);
  assert.equal(spriteAnimationTime(unit, 'gather', 5033), 2833);
});
test('one-shot transitions use event timestamps and restart resumed walking', () => {
  const unit = { attackStartedAt: 500, defeatStartedAt: 3000 };
  spriteAnimationTime(unit, 'walk', 100);
  assert.equal(spriteAnimationTime(unit, 'attack', 600), 100);
  assert.equal(spriteAnimationTime(unit, 'walk', 1000), 0);
  assert.equal(spriteAnimationTime(unit, 'defeat', 6533), 3533);
});
test('clip duration preserves variable endpoint frame durations', () => {
  assert.equal(spriteClipDuration({sequence:[{durationMs:62},{durationMs:63},{durationMs:1}]}),126);
  assert.equal(spriteClipDuration(null),0);
});

test('ground depth correction preserves screen position and clears dipping feet', async () => {
  const THREE = await import('three');
  const { spriteGroundDepthBias } = await import('../src/unit-sprite-runtime.mjs');
  const camera = new THREE.OrthographicCamera(-4,4,4,-4,0.1,100);
  camera.position.set(8,10,8); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
  const up = new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const toward = new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion);
  const bottom = new THREE.Vector3(0,0.018,0).addScaledVector(up,-0.2);
  const before = bottom.clone().project(camera);
  const bias = spriteGroundDepthBias({y:10,height:110},{y:100},0.01,up.y,toward.y);
  bottom.addScaledVector(toward,bias);
  const after = bottom.clone().project(camera);
  assert.ok(bottom.y >= 0.017999, 'lowest opaque pixel remains above terrain');
  assert.ok(Math.abs(before.x-after.x)<1e-12 && Math.abs(before.y-after.y)<1e-12,
    'correction must not move the sprite on screen');
  assert.equal(spriteGroundDepthBias({y:10,height:70},{y:100},0.01,up.y,toward.y),0);
});
