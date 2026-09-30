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


test('worker combat uses attack sprites and then returns to its task', async () => {
  const { activeState } = await import('../src/unit-sprite-runtime.mjs');
  const worker = { kind: 'worker', hp: 100, task: 'gathering', attackStartedAt: 1000 };
  assert.equal(activeState(worker, 1200, 850), 'attack');
  assert.equal(activeState(worker, 1900, 850), 'gather');
  assert.equal(activeState({ ...worker, walking: true }, 1200, 850), 'walk');
  assert.equal(activeState({ ...worker, hp: 0, defeatStartedAt: 1100 }, 1200, 850), 'defeat');
});


test('worker repair has a distinct action state', async () => {
  const { activeState } = await import('../src/unit-sprite-runtime.mjs');
  assert.equal(activeState({kind:'worker', hp:100, task:'repairing'}, 2000), 'repair');
  assert.equal(activeState({kind:'worker', hp:100, task:'building'}, 2000), 'build');
});


test('gathering chooses resource-specific clips and repair falls back to construction', async () => {
  const { spriteActionClip } = await import('../src/unit-sprite-runtime.mjs');
  const food = { id: 'berry-picking' }, wood = { id: 'axe-swing' };
  const generic = { id: 'generic' }, build = { id: 'mallet' }, idle = { id: 'ready' };
  const clips = new Map([['gather-food|south-east', food], ['gather-wood|south-east', wood],
    ['gather|south-east', generic], ['build|south-east', build], ['idle|north', idle]]);
  assert.equal(spriteActionClip(clips, 'gather', 'south-east', 'food', 'human'), food);
  assert.equal(spriteActionClip(clips, 'gather', 'south-east', 'wood', 'human'), wood);
  assert.equal(spriteActionClip(clips, 'gather', 'south-east', null, 'human'), generic);
  assert.equal(spriteActionClip(clips, 'repair', 'south-east', null, 'human'), build);
  const repair = { id: 'kneeling-hammer' };
  clips.set('repair|south-east', repair);
  assert.equal(spriteActionClip(clips, 'repair', 'south-east', null, 'human'), repair);
  assert.equal(spriteActionClip(clips, 'gather', 'north', 'wood', 'human'), idle);
});


test('approximate roster reuses nearest authored action while exact lanes keep idle holds', async () => {
  const { spriteActionClip } = await import('../src/unit-sprite-runtime.mjs');
  const hold = { sequence: [{ frameId: 'idle-north-0' }] };
  const front = { sequence: [{ frameId: 'walk-north-east-0' }] };
  const rear = { sequence: [{ frameId: 'walk-south-west-0' }] };
  const wood = { sequence: [{ frameId: 'gather-wood-south-east-0' }] };
  const clips = new Map([['walk|north', hold], ['idle|north', hold],
    ['walk|north-east', front], ['walk|south-west', rear], ['gather-wood|south-east', wood]]);
  assert.equal(spriteActionClip(clips, 'walk', 'north', null, 'human'), hold);
  assert.equal(spriteActionClip(clips, 'walk', 'north', null, 'human', true), front);
  assert.equal(spriteActionClip(clips, 'walk', 'west', null, 'human', true), rear);
  assert.equal(spriteActionClip(clips, 'gather', 'north', 'wood', 'human', true), wood);
});


test('every available Human unit action and heading has first-pass graphics', async () => {
  const { readFile } = await import('node:fs/promises');
  const { UNIT_DEFINITIONS } = await import('../src/gameplay-definitions.mjs');
  const { spriteActionClip } = await import('../src/unit-sprite-runtime.mjs');
  const packs = { worker: 'cast-human-sprite-v3', infantry: 'infantry-sprite-v3',
    archer: 'archer-sprite-v2', spearman: 'spearman-sprite-v1', scout: 'scout-sprite-v1',
    rider: 'rider-sprite-v1', 'siege-engine': 'siege-engine-sprite-v1' };
  assert.deepEqual(Object.keys(packs).sort(), Object.keys(UNIT_DEFINITIONS).sort());
  for (const [role, directory] of Object.entries(packs)) {
    const pack = JSON.parse(await readFile(new URL(`../assets/units/${directory}/sprite-atlas-pack-v1.json`, import.meta.url), 'utf8'));
    const asset = pack.assets[0];
    const clips = new Map(asset.clips.map(c => [`${c.stateId}|${c.directionId}`, c]));
    const states = ['idle', 'walk', 'attack', 'defeat', ...(role === 'worker' ? ['gather', 'build', 'repair'] : [])];
    for (const direction of ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']) {
      for (const state of states) {
        for (const resource of state === 'gather' ? ['food', 'wood'] : [null]) {
          const clip = spriteActionClip(clips, state, direction, resource, role === 'worker' ? 'human' : role, true);
          assert.ok(clip?.sequence?.length, `${role}/${state}/${direction}`);
          if (state !== 'idle') assert.ok(clip.sequence.some(f => !f.frameId.startsWith('idle-')), `${role}/${state}/${direction} must have action graphics`);
        }
      }
    }
  }
});
