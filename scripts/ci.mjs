import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const options = process.argv.slice(2);
const shardOption = options.find((arg) => arg.startsWith('--shard='));
const shard = shardOption?.match(/^--shard=(\d+)\/(\d+)$/);
if (options.some((arg) => arg !== '--list' && arg !== shardOption)
  || (shardOption && (!shard || Number(shard[1]) < 1 || Number(shard[1]) > Number(shard[2])
    || Number(shard[2]) > 16))) {
  throw new Error('Usage: node scripts/ci.mjs [--shard=INDEX/COUNT] [--list] (1 <= INDEX <= COUNT <= 16)');
}
const shardIndex = shard ? Number(shard[1]) - 1 : 0;
const shardCount = shard ? Number(shard[2]) : 1;
const checks = [];

function filesUnder(directory, extensions) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(relativePath, extensions);
      return extensions.some((extension) => entry.name.endsWith(extension)) ? [relativePath] : [];
    });
}

function run(args, label) {
  checks.push({ args, label });
}

function execute({ args, label }) {
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

run(['--test', 'scripts/scenario-regions.test.mjs'], 'Named scenario regions');
run(['scripts/region-event-scenario.mjs'], 'Region event recovery and rematch');
run(['scripts/check-docs.mjs'], 'Documentation links');
run(['--test', 'scripts/hosted-scale-profile.test.mjs'], 'Hosted scale measurement integrity');
run(['--test', 'scripts/unit-sprite-clock.test.mjs'], 'Sprite animation clock');
run(['--test', 'scripts/sprite-pixel-bounds.test.mjs'], 'Sprite pixel clipping regressions');
run(['--test', 'scripts/building-sprites.test.mjs'], 'Default building sprites');
run(['--test', 'scripts/ci-sharding.test.mjs'], 'CI shard coverage');
run(['--test', 'scripts/pve-reconnaissance.test.mjs'], 'Bounded Scout reconnaissance');
run(['--test', 'scripts/browser-performance-instrumentation.test.mjs'], 'Browser timing attribution');
run(['--test', 'scripts/performance-order-window.test.mjs'], 'Performance planning wave boundaries');
run(['--test', 'scripts/stationary-command.test.mjs'], 'Stationary command tasks and controls');
run(['--test', 'scripts/waypoint-backpressure.test.mjs'], 'Waypoint metadata under backpressure');
run(['--test', 'scripts/worker-shutdown.test.mjs'], 'Signal-aware room worker shutdown');
run(['--test', 'scripts/check-client-imports.test.mjs'], 'Served client import graph');
run(['--test', 'scripts/snapshot-private-production.test.mjs'], 'Seat-private production snapshots');

run(['--test', 'scripts/battlefield-cursor.test.mjs'], 'Battlefield cursor states');
run(['--test', 'scripts/room-launch-options.test.mjs'], 'Room launch contract');
run(['--test', 'scripts/pve-entry.test.mjs'], 'PvE entry observer settling');
run(['--test', 'scripts/hud-layout.test.mjs'], 'Visible HUD layout');
run(['--test', 'scripts/objective-summary.test.mjs'], 'Compact objectives and notice history');
run(['--test', 'scripts/selection-context.test.mjs'], 'Contextual selection');
run(['--test', 'scripts/roster-production-ui.test.mjs'], 'Roster production choices');
run(['--test', 'scripts/population.test.mjs'], 'Population reservations and capacity');
run(['--test', 'scripts/population-ai.test.mjs'], 'AI capacity construction and recovery');
run(['--test', 'scripts/production-queue.test.mjs'], 'Mixed production queue authority');
run(['--test', 'scripts/resource-format.test.mjs'], 'Resource display and affordability');
run(['--test', 'scripts/gameplay-presentation.test.mjs'], 'Gameplay presentation bindings');
run(['--test', 'scripts/base-lifecycle-ui.test.mjs'], 'Contextual cancellation and repair controls');
run(['--test', 'scripts/research-ui.test.mjs'], 'Registered research choices');
run(['--test', 'scripts/research-actions.test.mjs'], 'Shared technology availability');
run(['--test', 'scripts/siege-ai.test.mjs'], 'Bounded siege acquisition and assault');
run(['--test', 'scripts/combat-rules.test.mjs'], 'Shared combat classes, counters and effect scope');
run(['--test', 'scripts/watchtower-targeting.test.mjs'], 'Bounded defense targeting and sight');
run(['--test', 'scripts/economy-ledger.test.mjs'], 'Fractional cargo conservation');
run(['--test', 'scripts/base-lifecycle.test.mjs'], 'Cancel refunds and proportional repair');
run(['--test', 'scripts/storehouse-routing.test.mjs'], 'Reachable drop-off route selection');
run(['--test', 'scripts/roster-building-ui.test.mjs'], 'Registry building options');
run(['--test', 'scripts/ruleset-revision.test.mjs'], 'Resolved ruleset identity and prerequisites');
run(['--test', 'scripts/gameplay-definitions.test.mjs'], 'Gameplay definition validation');
run(['--test', 'scripts/client-build-recovery.test.mjs'], 'Build placement connection recovery');
run(['--test', 'scripts/client-rematch-recovery.test.mjs'], 'Client roster and ownership after rematch');
run(['--test', 'scripts/client-camera-recovery.test.mjs'], 'Camera ownership through seat recovery');
run(['--test', 'scripts/unit-health-visual.test.mjs'], 'Visible damaged-unit health indicators');
run(['--test', 'scripts/navigation-settings.test.mjs'], 'Camera navigation settings and controls');

const scenarios = [
  ['scripts/building-production-cue-scenario.mjs', 'Building production cue'],
  ['scripts/client-asset-allowlist-scenario.mjs', 'Client static asset allowlist'],
  ['scripts/docker-ui-assets-context-scenario.mjs', 'Docker UI asset context'],
  ['scripts/origin-policy-scenario.mjs', 'Origin policy'],
  ['scripts/origin-proxy-scenario.mjs', 'Origin policy through room proxy'],
  ['scripts/audio-library.test.mjs', 'Audio library and portable originals'],
  ['scripts/audio-composer-scenario.mjs', 'Audio composer and WAV scheduling'],
  ['scripts/audio-runtime-scenario.mjs', 'Audio profile routing and settings migration'],
  ['scripts/audio-runtime-playback-scenario.mjs', 'Sampled audio playback and fallback'],
  ['scripts/audio-composition-player-scenario.mjs', 'Audio composition clock and cancellation'],
  ['scripts/audio-lifecycle-scenario.mjs', 'Unit audio lifecycle'],
  ['scripts/audio-policy-scenario.mjs', 'Audio policy'],
  ['scripts/audio-recognition-check-scenario.mjs', 'Audio recognition check'],
  ['scripts/map-utils-scenario.mjs', 'Map utilities'],
  ['scripts/elevation-scenario.mjs', 'Elevation pathing and sight'],
  ['scripts/camera-controls-scenario.mjs', 'Camera controls'],
  ['scripts/objective-fog-visibility-scenario.mjs', 'Objective fog visibility'],
  ['scripts/unreachable-attack-scenario.mjs', 'Orders, 2k spawn clearance, and objective hold'],
  ['scripts/ranged-building-attack-scenario.mjs', 'Building attacks across disconnected terrain'],
  ['scripts/ranged-building-attack-scenario.mjs', 'In-range building attacks survive construction repair', '--edge-range-repair'],
  ['scripts/archer-firing-approach-scenario.mjs', 'Archers approach firing positions across gaps'],
  ['scripts/cliff-pursuit-scenario.mjs', 'Direct pursuit after unreachable retreats', '--direct'],
  ['scripts/cliff-pursuit-scenario.mjs', 'Attack-move alternatives across elevation'],
  ['scripts/simultaneous-lethal-combat-scenario.mjs', 'Simultaneous lethal combat fairness'],
  ['scripts/construction-connectivity-scenario.mjs', 'Construction preserves existing terrain connections'],
  ['scripts/elimination-scenario.mjs', 'Terminal elimination and reconnect'],
  ['scripts/stationary-command-scenario.mjs', 'Stop and hold authority/recovery'],
  ['scripts/queued-waypoint-scenario.mjs', 'Queued waypoint checkpoint recovery'],
  ['scripts/hold-clock-recovery-scenario.mjs', 'Checkpoint hold clock recovery (Azure)'],
  ['scripts/hold-clock-recovery-scenario.mjs', 'Checkpoint hold clock recovery (Ember)', '1'],
  ['scripts/live-attack-move-repair-scenario.mjs', 'Live attack-move route repair'],
  ['scripts/worker-combat-scenario.mjs', 'Worker combat across both seats'],
  ['scripts/worker-production-spawn-scenario.mjs', 'Town Center worker exits across map orientations'],
  ['scripts/ruleset-checkpoint-scenario.mjs', 'Pinned ruleset checkpoint recovery'],
  ['scripts/siege-defense-scenario.mjs', 'Siege range and defended-position counter'],
  ['scripts/siege-ai-runtime-scenario.mjs', 'Paid AI siege acquisition and assault (Azure)', '0'],
  ['scripts/siege-ai-runtime-scenario.mjs', 'Paid AI siege acquisition and assault (Ember)', '1'],
  ['scripts/watchtower-scenario.mjs', 'Watchtower fire and simultaneous trade'],
  ['scripts/town-center-scenario.mjs', 'Town Center expansion and recovery'],
  ['scripts/expansion-ai-runtime-scenario.mjs', 'Paid live AI base expansion (both seats)'],
  ['scripts/base-lifecycle-scenario.mjs', 'Base cancel/refund and interrupted repair'],
  ['scripts/storehouse-scenario.mjs', 'Storehouse drop-off and cargo recovery'],
  ['scripts/population-scenario.mjs', 'House population lifecycle'],
  ['scripts/progression-scenario.mjs', 'Military tier and technology recovery'],
  ['scripts/roster-options-scenario.mjs', 'Roster production and persistence'],
  ['scripts/roster-options-scenario.mjs', 'Mounted mixed production and persistence', '--mounted'],
  ['scripts/roster-options-scenario.mjs', 'Siege unlock, production and recovery', '--siege'],
  ['scripts/production-lifecycle-scenario.mjs', 'Producer destruction and population reservations'],
  ['scripts/infantry-seat-combat-scenario.mjs', 'Mirrored infantry combat parity', '--expect-parity'],
  ['scripts/opening-production-scenario.mjs', 'Mirrored construction and production', '--expect-builder-parity'],
  ['scripts/forked-vale-scenario.mjs', 'Forked Vale economy-to-victory (Team 0)', '0'],
  ['scripts/forked-vale-scenario.mjs', 'Forked Vale economy-to-victory (Team 1)', '1'],
  ['scripts/forked-vale-layout.mjs', 'Forked Vale layout'],
  ['scripts/frontier-160-layout.mjs', 'Frontier 160 layout'],
  ['scripts/generate-highland-grove.mjs', 'Highland Grove playable layout', '--check'],
  ['scripts/three-crowns-layout.mjs', 'Three Crowns layout'],
  ['scripts/formation-assignment-scenario.mjs', 'Formation assignment'],
  ['scripts/unit-selection-scenario.mjs', 'Unit selection'],
  ['scripts/pve-opponent-scenario.mjs', 'PvE opponent seats'],
  ['scripts/field-roles-scenario.mjs', 'Forked Vale scouting and mounted counter response'],
  ['scripts/pve-decision-fairness-scenario.mjs', 'PvE tactical decisions during gather retries'],
  ['scripts/pve-tactical-retry-scenario.mjs', 'Bounded PvE tactical retries'],
  ['scripts/pve-reinforcement-recovery-scenario.mjs', 'Stranded PvE reinforcements retry independently'],
  ['scripts/pve-tactical-stall-runtime-scenario.mjs', 'PvE stalled-army recovery through the server'],
  ['scripts/pve-production-scenario.mjs', 'PvE production budgets and retry limits'],
  ['scripts/pve-barracks-recovery-scenario.mjs', 'PvE replacement after producer destruction'],
  ['scripts/pve-objective-recovery-runtime-scenario.mjs', 'PvE objective recovery (Azure)', '0', '20260925'],
  ['scripts/pve-objective-recovery-runtime-scenario.mjs', 'PvE objective recovery (Ember)', '1', '20260925'],
  ['scripts/pve-contested-match-scenario.mjs', 'Contested seeded PvE match', '300', '20260925', '4294967295'],
  ['scripts/pve-production-runtime-scenario.mjs', 'PvE production on Forked Vale', 'forked-vale'],
  ['scripts/pve-production-runtime-scenario.mjs', 'PvE production on Woodland Expanse', 'woodland-expanse'],
  ['scripts/visual-pack-path-safety-scenario.mjs', 'Visual pack path safety'],
  ['scripts/painted-material-atlas-scenario.mjs', 'Painted-material atlas manifest and file contract'],
  ['scripts/painted-material-atlas-uv-scenario.mjs', 'Painted-material atlas mirrored UV mapping'],
  ['scripts/sprite-atlas-handoff-scenario.mjs', 'Sprite-atlas handoff audit'],
  ['scripts/cast-sprite-atlas-scenario.mjs', 'Cast sprite-atlas candidates'],
  ['scripts/archery-range-sprite-atlas-scenario.mjs', 'Archery Range sprite-atlas handoff'],
  ['scripts/town-center-sprite-atlas-scenario.mjs', 'Town Center sprite-atlas handoff'],
  ['scripts/unit-lod-state-scenario.mjs', 'Unit LOD matrix updates'],
  ['scripts/unit-visual-state-scenario.mjs', 'Unit visual state'],
  ['scripts/resource-visual-state-scenario.mjs', 'Resource visual state'],
  ['scripts/terrain-atmosphere-scenario.mjs', 'Decorative ground mist coverage and foreground order'],
  ['scripts/terrain-blend-scenario.mjs', 'Soft terrain material masks and normalized joins'],
  ['scripts/water-surface-scenario.mjs', 'Batched water surface and shore geometry'],
  ['scripts/harvestable-woodland-scenario.mjs', 'Harvestable woodland gameplay'],
  ['scripts/worker-cargo-return-scenario.mjs', 'Highland Grove forest route repair and deposits'],
  ['scripts/worker-cargo-return-scenario.mjs', 'Frontier Reach forest route repair and deposits', 'frontier-160'],
  ['scripts/room-supervisor-scenario.mjs', 'Room supervisor integration'],
  ['scripts/checkpoint-storage-recovery-scenario.mjs', 'Checkpoint storage failure and recovery'],
  ['scripts/room-expiry-scenario.mjs', 'Invite expiry and pending reconnect protection'],
  ['scripts/impaired-connection-scenario.mjs', 'Delayed two-seat transport and interrupted-order recovery'],
  ['scripts/pve-room-launch-scenario.mjs', 'PvE room launch and rematch integration'],
  ['scripts/railway-release-scenario.mjs', 'Railway release integration'],
];

for (const [file, label, ...args] of scenarios) run([file, ...args], label);

const selected = checks.filter((_, index) => index % shardCount === shardIndex);
if (options.includes('--list')) process.stdout.write(`${JSON.stringify(selected)}\n`);
else {
  for (const check of selected) execute(check);
  process.stdout.write(`\nCI checks passed${shard ? ` (shard ${shardIndex + 1}/${shardCount})` : ''}.\n`);
}
