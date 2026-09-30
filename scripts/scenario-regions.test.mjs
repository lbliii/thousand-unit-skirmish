import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScenarioRegions, validRegionEntryTrigger, regionEntryTeam } from '../src/scenario-regions.mjs';
const region = { id: 'pass', name: 'Pass', zone: { column: 8, row: 8, width: 4, height: 4 } };
const map = { width: 16, height: 16, regions: [region] };
test('bounded named regions reject duplicate IDs, malformed and cropped rectangles', () => {
  assert.deepEqual(validateScenarioRegions(map), [region]);
  for (const regions of [[region, region], [{ ...region, zone: { ...region.zone, width: 20 } }], [null], Array(33).fill(region)]) {
    assert.throws(() => validateScenarioRegions({ ...map, regions }));
  }
});
test('typed entry conditions reject missing regions, unknown kinds, invalid teams and unbounded counts', () => {
  const trigger = { type: 'region-entry', regionId: 'pass', team: 'either' };
  assert.ok(validRegionEntryTrigger(trigger, [region]));
  for (const patch of [{ regionId: 'missing' }, { team: 'both' }, { unitKind: 'dragon' }, { minimumUnits: 0 }, { minimumUnits: 1001 }, { script: 'anything' }]) {
    assert.equal(validRegionEntryTrigger({ ...trigger, ...patch }, [region]), false);
  }
});
test('living kind-filtered units use half-open region boundaries and deterministic team ties', () => {
  const trigger = { type: 'region-entry', regionId: 'pass', team: 'either', unitKind: 'worker', minimumUnits: 2 };
  const worker = { x: 0, z: 0, hp: 10, kind: 'worker', team: 0 };
  assert.equal(regionEntryTeam(trigger, [region], [worker, { ...worker, hp: 0 }, { ...worker, kind: 'infantry' }, { ...worker, x: 4 }], 16, 16), -1);
  const army = [worker, { ...worker, x: 3.99 }, { ...worker, team: 1 }, { ...worker, team: 1 }];
  assert.equal(regionEntryTeam(trigger, [region], army.reverse(), 16, 16), 0);
  assert.equal(regionEntryTeam({ ...trigger, team: '1' }, [region], army, 16, 16), 1);
});
