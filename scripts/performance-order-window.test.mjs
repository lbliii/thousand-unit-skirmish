import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./performance-scenario.mjs', import.meta.url), 'utf8');
const watermark = source.match(/const previousMoveOrderId = ([^;]+);/)?.[1];
const select = source.match(/const plannedOrders = ([^;]+);/)?.[1];
assert.ok(watermark && select, 'actual scenario boundary expressions found');

test('completed planning jobs may arrive out of order across movement waves', () => {
  const context = { priorHealth: { movePlanning: [{ orderId: 2 }, { orderId: 1 }] },
    health: { movePlanning: [{ orderId: 2 }, { orderId: 1 }, { orderId: 4 }, { orderId: 3 }] } };
  const result = vm.runInNewContext(`const previousMoveOrderId = ${watermark}; ${select}`, context);
  assert.deepEqual(Array.from(result, (sample) => sample.orderId), [4, 3]);
});

test('first movement wave has no prior completed order', () => {
  const context = { priorHealth: { movePlanning: [] }, health: { movePlanning: [{ orderId: 1 }, { orderId: 2 }] } };
  const result = vm.runInNewContext(`const previousMoveOrderId = ${watermark}; ${select}`, context);
  assert.deepEqual(Array.from(result, (sample) => sample.orderId), [1, 2]);
});
