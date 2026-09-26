import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && args[0] !== '--allow-dirty')) {
  throw new Error('Usage: node scripts/pack-railway-release.mjs [--allow-dirty]');
}
const allowDirty = args[0] === '--allow-dirty';

function git(...command) {
  const result = spawnSync('git', command, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${command.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

const revision = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
if (dirty && !allowDirty) {
  throw new Error('Release checkout has uncommitted changes. Commit and review them before packaging, or use --allow-dirty for a disposable test.');
}

// COPY sources are the runtime contract. Keep the package files for provenance,
// even when the current Dockerfile does not install npm dependencies.
const entries = new Set(['.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json']);
const dockerSources = new Map();
const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
async function expandDockerSource(source, line) {
  const relative = source.replace(/^\.\//, '').replace(/\/$/, '');
  if (!relative || path.isAbsolute(relative) || relative.split('/').includes('..')) {
    throw new Error(`Unsafe Docker COPY source: ${source}`);
  }
  if (!relative.includes('*')) {
    if (/["?\[\]]/.test(relative)) throw new Error(`Unsupported Docker COPY form: ${line.trim()}`);
    return [{ path: relative, pattern: relative }];
  }

  const suffix = '/*.webp';
  if (!relative.endsWith(suffix) || /[*?"\[\]]/.test(relative.slice(0, -suffix.length))) {
    throw new Error(`Unsupported Docker COPY form: ${line.trim()}`);
  }
  const directory = relative.slice(0, -suffix.length);
  if (!directory) throw new Error(`Unsafe Docker COPY source: ${source}`);
  const directoryPath = path.join(root, directory);
  const directoryInfo = await lstat(directoryPath);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new Error(`Docker COPY glob directory must be a real directory: ${directory}`);
  }
  const matches = (await readdir(directoryPath))
    .filter((name) => name.endsWith('.webp'))
    .sort();
  if (matches.length === 0) throw new Error(`Docker COPY pattern matched no files: ${source}`);
  return matches.map((name) => ({ path: `${directory}/${name}`, pattern: relative }));
}

for (const line of dockerfile.split(/\r?\n/)) {
  if (/^\s*ADD\s/i.test(line)) throw new Error('Use COPY instead of ADD so release sources can be audited');
  if (!/^\s*COPY\s/i.test(line)) continue;
  const tokens = line.trim().split(/\s+/).slice(1);
  while (tokens[0]?.startsWith('--')) {
    const option = tokens.shift();
    if (option.startsWith('--from=')) throw new Error('Multi-stage COPY needs an explicit release packer update');
  }
  if (tokens.length < 2 || /["'*?\[\]]/.test(tokens.at(-1))) {
    throw new Error(`Unsupported Docker COPY form: ${line.trim()}`);
  }
  for (const source of tokens.slice(0, -1)) {
    for (const resolved of await expandDockerSource(source, line)) {
      entries.add(resolved.path);
      dockerSources.set(resolved.path, resolved.pattern);
    }
  }
}
const ignoreRules = (await readFile(path.join(root, '.dockerignore'), 'utf8'))
  .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
if (ignoreRules[0] !== '*') {
  throw new Error('Release packer expects the Docker context to use an explicit allowlist');
}
for (const [source, pattern] of dockerSources) {
  if ((await lstat(path.join(root, source))).isFile()
    && !ignoreRules.includes(`!${source}`) && !ignoreRules.includes(`!${pattern}`)) {
    throw new Error(`Docker COPY source is excluded by .dockerignore: ${source}`);
  }
}
for (const runtimeSource of ['room-supervisor.mjs', 'server.mjs', 'origin-policy.mjs']) {
  if (!entries.has(runtimeSource)) {
    throw new Error(`Dockerfile COPY sources must include runtime source ${runtimeSource}`);
  }
}
try {
  await lstat(path.join(root, 'railway.json'));
  entries.add('railway.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const destination = await mkdtemp(path.join(os.tmpdir(), 'rts-release-'));
const copied = [];
async function copyEntry(relative) {
  const source = path.join(root, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Release source cannot be a symlink: ${relative}`);
  if (info.isDirectory()) {
    await mkdir(path.join(destination, relative), { recursive: true });
    for (const name of (await readdir(source)).sort()) await copyEntry(path.join(relative, name));
    return;
  }
  if (!info.isFile()) throw new Error(`Release source is not a regular file: ${relative}`);
  await mkdir(path.dirname(path.join(destination, relative)), { recursive: true });
  await copyFile(source, path.join(destination, relative));
  copied.push(relative);
}

for (const entry of [...entries].sort()) await copyEntry(entry);
if (!allowDirty && git('status', '--porcelain') !== '') {
  throw new Error('Release checkout changed during packaging; discard this directory and retry');
}

const digest = createHash('sha256');
for (const relative of copied.sort()) {
  digest.update(relative).update('\0').update(await readFile(path.join(destination, relative))).update('\0');
}
const manifest = {
  sourceRevision: revision,
  sourceDirty: dirty,
  digest: `sha256:${digest.digest('hex')}`,
  files: copied,
};
await writeFile(path.join(destination, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ directory: destination, ...manifest }));
