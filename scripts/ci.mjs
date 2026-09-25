import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function filesUnder(directory, extensions) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(relativePath, extensions);
      return extensions.some((extension) => entry.name.endsWith(extension)) ? [relativePath] : [];
    });
}

function run(args, label) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

const syntaxFiles = [
  'server.mjs',
  'room-supervisor.mjs',
  'src/main.js',
  ...filesUnder('src', ['.mjs']),
  ...filesUnder('scripts', ['.mjs']),
];

for (const file of syntaxFiles) run(['--check', file], `Syntax: ${file}`);

const scenarios = [
  ['scripts/origin-policy-scenario.mjs', 'Origin policy'],
  ['scripts/origin-proxy-scenario.mjs', 'Origin policy through room proxy'],
  ['scripts/audio-policy-scenario.mjs', 'Audio policy'],
  ['scripts/map-utils-scenario.mjs', 'Map utilities'],
  ['scripts/forked-vale-layout.mjs', 'Forked Vale layout'],
  ['scripts/formation-assignment-scenario.mjs', 'Formation assignment'],
  ['scripts/unit-selection-scenario.mjs', 'Unit selection'],
  ['scripts/pve-opponent-scenario.mjs', 'PvE opponent seats'],
  ['scripts/room-supervisor-scenario.mjs', 'Room supervisor integration'],
  ['scripts/railway-release-scenario.mjs', 'Railway release integration'],
];

for (const [file, label] of scenarios) run([file], label);

process.stdout.write('\nCI checks passed.\n');
