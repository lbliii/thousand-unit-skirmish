import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const server = readFileSync(path.join(root, 'server.mjs'), 'utf8');
const environmentArt = readFileSync(path.join(root, 'src/environment-art.mjs'), 'utf8');
const clientAllowlist = server.match(/const publicClientAsset = \[([\s\S]*?)\]\.includes\(relative\);/);
assert.ok(clientAllowlist, 'server static client asset allowlist should be declared');
const allowed = new Set([...clientAllowlist[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));
const uiAllowlist = server.match(/const publicUiAsset = \[([\s\S]*?)\]\.includes\(relative\);/);
assert.ok(uiAllowlist, 'server UI asset allowlist should be declared');
const allowedUi = new Set([...uiAllowlist[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));
const environmentModule = server.match(/const publicEnvironmentModule = relative === '([^']+)'/)?.[1];
assert.ok(environmentModule, 'server should explicitly allow the environment renderer module');
const spriteNames = environmentArt.match(/const spriteNames = \[([\s\S]*?)\];/);
assert.ok(spriteNames, 'environment renderer should declare its environment sprite families');
const servedEnvironmentAssets = server.match(/const publicEnvironmentAsset = ([\s\S]*?);\n  const publicInteractiveEnvironmentAsset/);
assert.ok(servedEnvironmentAssets, 'server should explicitly allow environment sprites');
const allowedEnvironmentNames = new Set([...servedEnvironmentAssets[1].matchAll(/'([^']+)'/g)]
  .map((match) => match[1]));
const rendererSpriteNames = new Set([...spriteNames[1].matchAll(/'([^']+)'/g)]
  .map((match) => match[1]));
rendererSpriteNames.add('oak');
rendererSpriteNames.add('berries');
for (const name of rendererSpriteNames) {
  assert.ok(allowedEnvironmentNames.has(name), `environment sprite ${name} is loaded by the renderer but missing from the server asset allowlist`);
}

const entryModules = [...html.matchAll(/<script\s+type="module"\s+src="\.\/([^\"]+)"/g)]
  .map((match) => match[1]);
assert.ok(entryModules.length > 0, 'HTML should declare at least one client module entry point');

const visited = new Set();
const pending = [...entryModules];
const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g;
while (pending.length > 0) {
  const modulePath = path.posix.normalize(pending.pop());
  if (visited.has(modulePath)) continue;
  visited.add(modulePath);
  assert.ok(allowed.has(modulePath) || modulePath === environmentModule,
    `client module ${modulePath} is imported but missing from the server static allowlist`);
  const source = readFileSync(path.join(root, modulePath), 'utf8');
  for (const [, specifier] of source.matchAll(importPattern)) {
    if (!specifier.startsWith('.')) continue;
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(modulePath), specifier));
    assert.ok(dependency.startsWith('src/'), `unexpected client module path: ${dependency}`);
    assert.ok(statSync(path.join(root, dependency)).isFile(), `client import is missing: ${dependency}`);
    pending.push(dependency);
  }
}

for (const resource of ['index.html', 'style.css', 'vendor/three.module.js', 'vendor/three.core.js']) {
  assert.ok(allowed.has(resource), `required client resource is missing from the server static allowlist: ${resource}`);
}
for (const resource of [
  'assets/ui/preview.html', 'assets/ui/cursors/manifest.json',
  'assets/ui/cursors/select.png', 'assets/ui/cursors/box-select.png',
  'assets/ui/cursors/move.png', 'assets/ui/cursors/attack-move.png',
  'assets/ui/cursors/gather.png', 'assets/ui/cursors/build-valid.png',
  'assets/ui/cursors/build-blocked.png', 'assets/ui/icons/wood.svg',
  'assets/ui/icons/food.svg', 'assets/ui/icons/move.svg',
  'assets/ui/icons/attack.svg', 'assets/ui/icons/gather.svg', 'assets/ui/icons/build.svg',
]) {
  assert.ok(allowedUi.has(resource), `UI asset is missing from the server allowlist: ${resource}`);
}
assert.match(server, /'\.svg': 'image\/svg\+xml'/, 'SVG icons need the correct response MIME type');
for (const resource of allowedUi) {
  assert.ok(statSync(path.join(root, resource)).isFile(), `allowlisted UI asset is missing: ${resource}`);
}
const cursorManifest = JSON.parse(readFileSync(path.join(root, 'assets/ui/cursors/manifest.json'), 'utf8'));
const style = readFileSync(path.join(root, 'style.css'), 'utf8');
for (const [state, cursor] of Object.entries(cursorManifest.cursors)) {
  assert.ok(allowedUi.has(cursor.runtime), `runtime cursor is not allowlisted: ${cursor.runtime}`);
  const image = readFileSync(path.join(root, cursor.runtime));
  assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [32, 32],
    `runtime cursor must be 32 × 32: ${cursor.runtime}`);
  const [hotspotX, hotspotY] = cursor.hotspot;
  assert.ok(style.includes(`--cursor-${state}: url('/${cursor.runtime}') ${hotspotX} ${hotspotY}, ${cursor.fallback}`),
    `CSS cursor hotspot and fallback must match the manifest for ${state}`);
}
for (const icon of cursorManifest.icons.paths) {
  assert.ok(allowedUi.has(icon), `runtime icon is not allowlisted: ${icon}`);
}

process.stdout.write(`Client asset allowlist scenario passed: ${visited.size} imported client modules are served.\n`);
