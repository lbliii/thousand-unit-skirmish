import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = (...args) => JSON.parse(execFileSync(process.execPath,
  ['scripts/ci.mjs', '--list', ...args], { cwd: root, encoding: 'utf8' }));
const key = (check) => JSON.stringify(check);

test('three CI jobs cover every default check exactly once', () => {
  const all = list();
  assert.ok(all.length > 100, 'real syntax and scenario registry was loaded');
  const shards = [1, 2, 3].map((n) => list(`--shard=${n}/3`));
  const combined = shards.flat().map(key);
  assert.equal(new Set(combined).size, combined.length, 'no duplicate checks across jobs');
  assert.deepEqual(combined.sort(), all.map(key).sort(), 'no default check omitted');
  for (const shard of shards) {
    const indices = shard.map((check) => all.findIndex((candidate) => key(candidate) === key(check)));
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b), 'relative execution order is retained');
  }
  assert.deepEqual(list('--shard=1/1'), all);
});

test('invalid shard requests fail instead of silently passing an empty suite', () => {
  for (const option of ['--shard=0/3', '--shard=4/3', '--shard=1/0', '--shard=1/17', '--shard=bad', '--unknown']) {
    const result = spawnSync(process.execPath, ['scripts/ci.mjs', '--list', option], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0, option);
    assert.match(result.stderr, /Usage:/);
  }
});
