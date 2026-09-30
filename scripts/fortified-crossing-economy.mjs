// Real paid economy/production on the combined map; no checkpoint state injection.
import assert from 'node:assert/strict';
import { createFortifiedFixture } from './fortified-crossing-fixture.mjs';
const fixture = await createFortifiedFixture();
try {
  await fixture.start();
  const clients = [await fixture.connect(0), await fixture.connect(1)];
  const tokens = clients.map(c => c.welcome.player.sessionToken);
  const barracks = [];
  for (const [team, client] of clients.entries()) {
    const workers = client.latest.units.filter(u => u[1] === team && u[5] === 'worker');
    client.send({ type: 'build', ids: workers.slice(0, 2).map(u => u[0]), buildingType: 'barracks', x: team ? 18.5 : -18.5, z: -3.5 });
    const built = await client.state(s => s.buildings.some(b => b.team === team && b.type === 'barracks' && b.complete), `team ${team} Barracks`);
    barracks[team] = built.buildings.find(b => b.team === team && b.type === 'barracks');
    client.send({ type: 'trainUnit', kind: 'infantry', buildingId: barracks[team].id });
    client.send({ type: 'researchUpgrade', buildingId: barracks[team].id, upgrade: 'infantry-attack' });
  }
  const active = await fixture.checkpoint(s => s.state.teamResearch.every(r => r?.type === 'infantry-attack'));
  assert.ok(active.state.teamFood.every(n => n < 350));
  assert.ok(active.state.teamWood.every(n => n < 600));
  await fixture.stop(); await fixture.start();
  const recovered = [await fixture.connect(0, tokens[0]), await fixture.connect(1, tokens[1])];
  const complete = await fixture.checkpoint(s => s.state.teamUpgrades.every(u => u.infantryAttack));
  assert.ok(complete.state.buildings.every(b => b.complete));
  for (const [team, client] of recovered.entries()) {
    await client.state(s => s.teamResearch[team].infantryAttack && s.units.filter(u => u[1] === team && u[5] === 'infantry').length === 9, `team ${team} research and trained infantry`);
  }
  console.log(JSON.stringify({ map: recovered[0].latest.mapId, bothSeatConstruction: true, paidTraining: true, paidResearch: true, activeResearchRestart: true, food: complete.state.teamFood, wood: complete.state.teamWood }));
} finally { await fixture.dispose(); }
