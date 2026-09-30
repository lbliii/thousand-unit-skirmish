import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../assets/audio/vaelora-zones-v1/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
const expected = ['bellweather','underbough','sereward','ellionar','veyrholds','pale-meridian','siltmouths','vesperra','sombral-mere','ru-lora-fringe','ru-lora-interior'];
assert.deepEqual(catalog.zones.map(z => z.id), expected);
assert.equal(new Set(catalog.zones.map(z => z.zoneId)).size, 10);
assert.equal(catalog.sources.length, 44);
assert.equal(new Set(catalog.sources.map(s => s.id)).size, 44);
assert.equal(new Set(catalog.sources.map(s => s.file)).size, 44);
const sources = new Map(catalog.sources.map(s => [s.id, s]));
let bytes = 0;
const hashes = new Set();
for (const zone of catalog.zones) {
  assert.equal(zone.sources.length, 4);
  assert.deepEqual(zone.sources.map(id => sources.get(id)?.family), ['music','terrain','contrast','signature']);
  for (const id of zone.sources) assert.equal(sources.get(id).zone, zone.id);
}
for (const source of catalog.sources) {
  assert.equal(source.status, 'downloaded', `${source.id} is missing`);
  assert.match(source.file, /^sources\/tus_[a-z0-9-]+_(music|terrain|contrast|signature)_0[12]_v001\.mp3$/);
  assert.ok(source.prompt && source.nodeId && source.provider === 'ElevenLabs');
  assert.ok(source.actualDurationSeconds > 0 && source.actualDurationSeconds <= 35);
  assert.ok([44100,48000].includes(source.sampleRate));
  assert.equal(source.channels, 2);
  assert.equal(source.loop, ['terrain','contrast'].includes(source.family));
  const data = await readFile(new URL(source.file, root));
  assert.equal(data.length, source.bytes);
  const hash = createHash('sha256').update(data).digest('hex');
  assert.equal(hash, source.sha256, `Changed original ${source.id}`);
  assert.ok(!hashes.has(hash), `Duplicate regional recording ${source.id}`);
  hashes.add(hash); bytes += data.length;
}
assert.ok(bytes < 64 * 1024 * 1024, 'Complete source pack exceeds Audio Studio limit');
console.log(`Zone audio validated: 10 zones, 11 palettes, 44 unique originals, ${bytes} bytes; hashes and coverage passed.`);
