import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadShippedAudio } from '../src/audio-shipped-loader.mjs';
import { SHIPPED_AUDIO_REFERENCES } from '../src/audio-shipped-catalog.mjs';
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const directory = await mkdtemp(path.join(os.tmpdir(), 'rts-audio-serve-'));
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), RTS_HOST: '127.0.0.1', RTS_CUSTOM_MAP_DIRECTORY: directory, RTS_MODE: 'pvp', RTS_ARMY_SIZE: '24' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', b => output = (output + b).slice(-8000)); child.stderr.on('data', b => output = (output + b).slice(-8000));
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(output);
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, output);
  const loaded = await loadShippedAudio(SHIPPED_AUDIO_REFERENCES[0], { fetch: (url, options) => fetch(new URL(url, base), options) });
  assert.equal(Object.keys(loaded.sourceBlobs).length, 4);
  for (const module of ['audio-shipped-loader.mjs', 'audio-shipped-catalog.mjs']) {
    const response = await fetch(`${base}/src/${module}`); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/);
  }
  assert.notEqual((await fetch(`${base}/assets/audio/runtime/unapproved/v1/manifest.json`)).status, 200);
  console.log('Authoritative server serves verified shipped manifest, four originals and loader modules.');
} finally {
  child.kill('SIGINT');
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
  await rm(directory, { recursive: true, force: true });
}
