import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrderProbe, parseScaleProfile } from './hosted-scale-profile.mjs';

test('profile bounds prevent unsupported sizes and accidentally unbounded hosted work', () => {
  assert.deepEqual(parseScaleProfile(['--stress']), { counts: [2000], seconds: 10, waves: 1 });
  assert.deepEqual(parseScaleProfile(['--stress', '--stress-counts=250,500,1000,2000',
    '--stress-seconds=40', '--stress-waves=3']), { counts: [250, 500, 1000, 2000], seconds: 40, waves: 3 });
  for (const option of ['--stress-counts=250,250', '--stress-counts=42',
    '--stress-counts=', '--stress-seconds=41', '--stress-seconds=NaN', '--stress-waves=4']) {
    assert.throws(() => parseScaleProfile(['--stress', option]));
  }
  assert.throws(() => parseScaleProfile(['--stress-seconds=40']));
  assert.throws(() => parseScaleProfile(['--stress', '--stress-seconds']));
  assert.throws(() => parseScaleProfile(['--stress', '--stress-typo=40']));
  assert.throws(() => parseScaleProfile(['--stress', '--stress-waves=1', '--stress-waves=2']));
});

const unit = (x, generation = 7, hp = 100, id = 1) => [id, 0, x, 0, hp, 'infantry', 0, null, generation];
test('unrelated feedback, stale generations, dead units and subthreshold jitter cannot prove an order', () => {
  const probe = createOrderProbe({ token: 10, ids: [1], units: [unit(0)], startedAt: 100 });
  probe.observe({ type: 'notice', clientOrderToken: 9, message: 'MOVE ORDER · 1 UNITS' }, 120);
  probe.observe({ type: 'state', units: [unit(9, 8)] }, 130);
  probe.observe({ type: 'state', units: [unit(9, 7, 0)] }, 140);
  probe.observe({ type: 'state', units: [unit(0.01)] }, 150);
  assert.deepEqual(probe.report(), { selectedUnits: 1, baselineUnits: 1,
    acknowledgedMs: null, appliedMs: null, firstMovementMs: null, appliedUnits: null, finalNotice: null });
  probe.observe({ type: 'notice', clientOrderToken: 10, message: 'PLANNING MOVE ORDER · 1 UNITS' }, 160);
  probe.observe({ type: 'state', units: [unit(0.2)] }, 170);
  probe.observe({ type: 'notice', clientOrderToken: 10, message: 'MOVE ORDER · 1 UNITS' }, 180);
  assert.equal(probe.report().acknowledgedMs, 60);
  assert.equal(probe.report().firstMovementMs, 70);
  assert.equal(probe.report().appliedMs, 80);
});

test('rejection remains missing applied/movement evidence; late duplicates retain first timings', () => {
  const probe = createOrderProbe({ token: 10, ids: [1], units: [unit(0)], startedAt: 100 });
  probe.observe({ type: 'notice', clientOrderToken: 10, message: 'MOVE ORDER · 1 UNITS' }, 99);
  probe.observe({ type: 'notice', clientOrderToken: 10, message: 'ORDER CANCELLED · MATCH RESET' }, 110);
  assert.equal(probe.report().acknowledgedMs, 10);
  assert.equal(probe.report().appliedMs, null);
  assert.equal(probe.report().firstMovementMs, null);
  probe.observe({ type: 'notice', clientOrderToken: 10, message: 'MOVE ORDER · 1 UNITS' }, 120);
  probe.observe({ type: 'notice', clientOrderToken: 10, message: 'MOVE ORDER · 1 UNITS' }, 140);
  assert.equal(probe.report().appliedMs, 20);
});
