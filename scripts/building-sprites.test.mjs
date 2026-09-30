import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { attachBuildingSprite, buildingSpriteUrl } from '../src/building-sprites.mjs';
import { barracksModelVisualState } from '../src/building-visual-state.mjs';

test('available team and lifecycle frames resolve to real files', () => {
  for (const type of ['barracks', 'archery-range']) for (const team of [0, 1]) {
    for (const state of [
      { progress: 0.05 }, { progress: 0.5 }, { progress: 1 },
      { complete: true, hp: 100, maxHp: 100 },
      { complete: true, hp: 50, maxHp: 100 },
      { complete: true, hp: 20, maxHp: 100 },
    ]) assert.ok(existsSync(new URL(`../${buildingSpriteUrl({ type, team, ...state })}`, import.meta.url)));
  }
  assert.match(buildingSpriteUrl({ type: 'town-center' }), /view-01.webp$/);
  assert.equal(buildingSpriteUrl({ type: 'unknown' }), null);
});

test('sprite loading preserves fog, indicators, fallback and latest state', async () => {
  const group = new THREE.Group();
  const model = new THREE.Mesh();
  const indicator = new THREE.Group();
  group.add(model, indicator);
  const requests = [];
  const load = (url) => {
    const entry = { texture: new THREE.Texture(), url };
    entry.ready = new Promise(resolve => { entry.resolve = resolve; });
    requests.push(entry);
    return entry;
  };
  const controller = attachBuildingSprite(group, [model], { type: 'barracks', team: 0, progress: 0 }, undefined, load);
  const fallback = model.parent;
  const sprite = group.children.find(child => child.isSprite);
  group.visible = false;
  controller.update({ type: 'barracks', team: 0, complete: true });
  requests[0].resolve(true); await Promise.resolve();
  assert.equal(sprite.visible, false);
  requests[1].resolve(true); await Promise.resolve();
  assert.equal(sprite.visible, true);
  assert.equal(fallback.visible, false);
  assert.equal(group.visible, false, 'loading must not reveal fog-hidden buildings');
  assert.equal(indicator.parent, group);
  assert.equal(indicator.visible, true);
  controller.update({ type: 'barracks', team: 0, complete: true, hp: 1, maxHp: 100 });
  requests[2].resolve(false); await Promise.resolve();
  assert.equal(sprite.visible, false);
  assert.equal(fallback.visible, true);
  controller.update({ type: 'barracks', team: 1, complete: true });
  controller.dispose();
  requests[3].resolve(true); await Promise.resolve();
  assert.equal(sprite.visible, false, 'disposed visuals must ignore late loads');
});

test('live Barracks updates advance the sprite through construction and damage for both teams', async () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const updateSource = source.slice(source.indexOf('function updateBarracksVisual('),
    source.indexOf('\nfunction reconcileBuildings('));
  const context = vm.createContext({ THREE, barracksModelVisualState, groundHeight: () => .8,
    updateBuildingProductionCue() {}, updateBuildingHealthIndicator() {},
  });
  vm.runInContext(updateSource, context);
  for (const team of [0, 1]) {
    const group = new THREE.Group();
    const frame = new THREE.Group();
    const ridge = new THREE.Group();
    group.add(frame, ridge);
    const first = { type: 'barracks', team, progress: 0, x: 4, z: 8 };
    const load = (url) => ({ ready: Promise.resolve(true), texture: { url } });
    const authoredSprite = attachBuildingSprite(group, [frame, ridge], first, undefined, load);
    const visual = { group, frame, ridge, walls: [], roofPanels: [], finishPieces: [], authoredSprite };
    const sprite = group.children.find(child => child.isSprite);
    for (const state of [
      { progress: 0.1 }, { progress: 0.5 }, { progress: 1, complete: true },
      { progress: 1, complete: true, hp: 900, maxHp: 1800 },
      { progress: 1, complete: true, hp: 300, maxHp: 1800 },
    ]) {
      const building = { ...first, ...state };
      context.updateBarracksVisual(visual, building);
      await Promise.resolve();
      assert.equal(sprite.material.map.url, buildingSpriteUrl(building));
      assert.equal(sprite.visible, true);
      assert.equal(group.position.y, .8, 'building group follows its terrain height');
    }
  }
});
