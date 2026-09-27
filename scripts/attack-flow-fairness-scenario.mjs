import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scenario = fileURLToPath(new URL('./pve-fixed-position-fairness-scenario.mjs', import.meta.url));
const outcomes = [];
for (const team of [0, 1]) for (const ids of ['left', 'right']) {
  const child = spawnSync(process.execPath, [scenario, String(team), ids], {
    encoding: 'utf8', timeout: 90_000, env: process.env,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message || child.stdout);
  const result = JSON.parse(child.stdout.trim());
  const surviving = result.results.filter(army => army.alive > 0);
  assert.ok(surviving.length < 2, 'bounded fixture must finish combat before comparing winners');
  outcomes.push({ leftTeam: team, lowIdsSide: ids, winner: surviving[0]?.side ?? 'draw', armies: result.results });
}
console.log(JSON.stringify(outcomes));
assert.equal(new Set(outcomes.map(result => result.winner)).size, 1,
  'changing only seats/IDs must not change the physical winner');
