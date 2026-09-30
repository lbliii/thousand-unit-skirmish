// Bounded server-only diagnostic. Browser rendering/audio measurements are separate.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createFortifiedFixture } from './fortified-crossing-fixture.mjs';
const duration = Number(process.argv[2] ?? 20);
const sizes = (process.argv[3] ?? '250,500,1000,2000').split(',').map(Number);
assert.ok(Number.isInteger(duration) && duration >= 10 && duration <= 60);
assert.ok(sizes.length <= 4 && sizes.every(n => [250,500,1000,2000].includes(n)));
const base = JSON.parse(await readFile(new URL('../maps/fortified-crossing.json', import.meta.url)));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  return Object.fromEntries([['count', sorted.length], ...[['p50',.5],['p95',.95],['max',1]].map(([k,q]) => [k, sorted.length ? sorted[Math.max(0,Math.ceil(sorted.length*q)-1)] : null])]);
};
const results = [];
for (const size of sizes) {
  const map = structuredClone(base); map.startingArmySize = size; map.id = `${base.id}-scale-${size}`;
  const fixture = await createFortifiedFixture({ diagnostics: true });
  try {
    await fixture.start();
    const clients = [await fixture.connect(0), await fixture.connect(1)];
    clients[0].send({ type: 'publishMap', map });
    const published = await clients[0].wait(m => m.type === 'mapRejected' || (m.type === 'mapChange' && m.state.armySize === size), 'published scaled scenario');
    assert.notEqual(published.type, 'mapRejected', published.message);
    await clients[1].wait(m => m.type === 'mapChange' && m.state.armySize === size, 'guest scaled scenario');
    const tokens = clients.map(c => c.welcome.player.sessionToken);
    assert.equal((await fixture.health()).armySize, size);
    const samples = [], delays = []; let token = 1, nextOrderAt = 0;
    const started = performance.now();
    while (performance.now() - started < duration * 1000) {
      const elapsed = performance.now() - started;
      if (elapsed >= nextOrderAt) {
        // Alternate converging attack-move and withdrawal, retaining map event/capture rules.
        const inward = Math.floor(nextOrderAt / 6000) % 2 === 0;
        await Promise.all(clients.map(async (client, team) => {
          const units = client.latest.units.filter(u => u[1] === team && u[5] !== 'worker' && u[4] > 0);
          if (!units.length) return;
          const issued = performance.now();
          await client.command({type: inward ? 'attackMove' : 'move', ids: units.map(u => u[0]), unitGenerations: units.map(u => u[8]), x: inward ? (team ? 1.5 : -1.5) : (team ? 18.5 : -18.5), z: .5, clientOrderToken: token++}, /(?:ATTACK MOVE|MOVE) ORDER/);
          delays.push(performance.now() - issued);
        }));
        nextOrderAt += 6000;
      }
      samples.push(await fixture.health());
      await sleep(500);
    }
    const before = await fixture.checkpoint();
    await fixture.stop(); const restartStarted = performance.now(); await fixture.start();
    const recovered = [await fixture.connect(0,tokens[0]), await fixture.connect(1,tokens[1])];
    const recoveryMs = performance.now() - restartStarted;
    assert.equal(recovered[0].latest.mapId, map.id);
    const after = await fixture.checkpoint();
    assert.ok(after.state.matchElapsedSeconds >= before.state.matchElapsedSeconds, 'restart must preserve elapsed match time');
    const final = samples.at(-1);
    results.push({size, wallSeconds: (performance.now()-started)/1000, sampleCount: samples.length,
      appliedNoticeMs: quantiles(delays), recoveryMs,
      tickTiming: final.tickTiming, movePlanning: final.movePlanning,
      separationWork: final.separationWork, transport: final.transport, checkpoint: final.checkpoint,
      healthPollTickP95: quantiles(samples.map(s=>s.tickTiming?.p95Ms)),
      limitations: ['server-only loopback clients; no rendered browser or audio callback cost', 'short synthetic workload; no supported hardware/network claim', 'health rolling windows overlap; healthPollTickP95 describes reported window p95s']});
    console.error(`Fortified Crossing ${size}: ${samples.length} health samples; recovery ${Math.round(recoveryMs)}ms`);
  } finally { await fixture.dispose(); }
}
console.log(JSON.stringify({build: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), recordedAt: new Date().toISOString(), node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, durationSeconds: duration, map: base.id, results},null,2));
