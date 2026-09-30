#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'assets/buildings/frontier-civilization-scale-pilot-v1/captures');
const port = Number(process.argv[2] || 8769);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/capture-building-view') {
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 20_000_000) throw new Error('Capture body too large'); }
      const data = JSON.parse(text);
      if (!['town-center', 'house'].includes(data.asset) || !Number.isInteger(data.view) || data.view < 0 || data.view > 7) throw new Error('Unsupported asset/view');
      if (!data.png?.startsWith('data:image/png;base64,') || !Number.isFinite(data.calibration?.uniformScale) || data.calibration.uniformScale <= 0) throw new Error('Missing PNG/calibration');
      const png = Buffer.from(data.png.slice(22), 'base64');
      if (png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(16) !== 1024 || png.readUInt32BE(20) !== 1024) throw new Error('Expected 1024px PNG capture');
      await mkdir(output, { recursive: true });
      const name = `${data.asset}-complete-view-${String(data.view).padStart(2, '0')}`;
      const file = path.join(output, `${name}.png`);
      await writeFile(file, png);
      await writeFile(path.join(output, `${name}.json`), JSON.stringify({ ...data.calibration, asset: data.asset, state: 'complete', viewIndex: data.view, file: `${name}.png`, sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length }, null, 2) + '\n');
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ saved: path.relative(root, file) })); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (relative.split('/').some(part => part.startsWith('.'))) throw new Error('Hidden files are not served');
    const file = path.resolve(root, relative || 'scripts/building-scale-review.html');
    if (!file.startsWith(root + path.sep)) throw new Error('Outside workspace');
    const bytes = await readFile(file); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end(error.message); }
}).listen(port, '127.0.0.1', () => console.log(`Building scale review: http://127.0.0.1:${port}/scripts/building-scale-review.html`));
