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
  ['scripts/client-asset-allowlist-scenario.mjs', 'Client static asset allowlist'],
  ['scripts/docker-ui-assets-context-scenario.mjs', 'Docker UI asset context'],
  ['scripts/origin-policy-scenario.mjs', 'Origin policy'],
  ['scripts/origin-proxy-scenario.mjs', 'Origin policy through room proxy'],
  ['scripts/audio-policy-scenario.mjs', 'Audio policy'],
  ['scripts/audio-recognition-check-scenario.mjs', 'Audio recognition check'],
  ['scripts/map-utils-scenario.mjs', 'Map utilities'],
  ['scripts/camera-controls-scenario.mjs', 'Camera controls'],
  ['scripts/objective-fog-visibility-scenario.mjs', 'Objective fog visibility'],
  ['scripts/unreachable-attack-scenario.mjs', 'Orders, 2k spawn clearance, and objective hold'],
  ['scripts/elimination-scenario.mjs', 'Terminal elimination and reconnect'],
  ['scripts/worker-combat-scenario.mjs', 'Worker combat across both seats'],
  ['scripts/infantry-seat-combat-scenario.mjs', 'Mirrored infantry combat parity', '--expect-parity'],
  ['scripts/opening-production-scenario.mjs', 'Mirrored construction and production', '--expect-builder-parity'],
  ['scripts/forked-vale-scenario.mjs', 'Forked Vale economy-to-victory (Team 0)', '0'],
  ['scripts/forked-vale-scenario.mjs', 'Forked Vale economy-to-victory (Team 1)', '1'],
  ['scripts/forked-vale-layout.mjs', 'Forked Vale layout'],
  ['scripts/three-crowns-layout.mjs', 'Three Crowns layout'],
  ['scripts/formation-assignment-scenario.mjs', 'Formation assignment'],
  ['scripts/unit-selection-scenario.mjs', 'Unit selection'],
  ['scripts/pve-opponent-scenario.mjs', 'PvE opponent seats'],
  ['scripts/visual-pack-path-safety-scenario.mjs', 'Visual pack path safety'],
  ['scripts/unit-lod-state-scenario.mjs', 'Unit LOD matrix updates'],
  ['scripts/unit-visual-state-scenario.mjs', 'Unit visual state'],
  ['scripts/resource-visual-state-scenario.mjs', 'Resource visual state'],
  ['scripts/room-supervisor-scenario.mjs', 'Room supervisor integration'],
  ['scripts/railway-release-scenario.mjs', 'Railway release integration'],
];

for (const [file, label, ...args] of scenarios) run([file, ...args], label);

process.stdout.write('\nCI checks passed.\n');
