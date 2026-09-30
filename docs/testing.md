# Testing and validation

[Documentation index](README.md) · [QA protocol](qa-vertical-slice.md)

## Repository checks

```sh
npm ci
npm test
```

[`scripts/ci.mjs`](../scripts/ci.mjs) is the exact suite list. It checks JavaScript
syntax and runs focused logic, gameplay, map, PvE, visibility, recovery, asset
contract, room, and release scenarios. CI uses Node 24. Browser/GPU appearance
captures and sustained performance runs are separate.

GitHub runs three independent jobs with `npm test -- --shard=1/3` (and `2/3`,
`3/3`). Each registered check runs exactly once across those jobs; release
packaging runs in job 1. Local `npm test` still runs the complete suite in order.
`node scripts/ci.mjs --list` prints the registry without starting fixtures, and
accepts the same shard option for coverage inspection.

Use checks proportionate to a change, then run required repository checks.
For client import/module changes, include
`node scripts/client-asset-allowlist-scenario.mjs`; the packed release scenario
also traverses the served static import graph. The hosted Railway smoke uses
the same `scripts/check-client-imports.mjs` audit; focused fixtures cover missing
transitive dependencies, cycles, incorrect MIME, and origin boundaries. See the
[client-loading incident](qa-client-boot-recovery-2026-09-27.md).
Use disposable rooms and directories: many scenarios publish maps, reset armies,
restart workers, or deliberately disconnect clients.

## Documentation checks

```sh
npm run docs:check
```

This offline check verifies local Markdown paths and heading anchors across guides,
archives, and asset READMEs. It runs in `npm test`; external URLs are not fetched.

## Focused checks that start their own fixture

Run from the repository root:

| Area | Command |
| --- | --- |
| Map logic / elevation | `node scripts/map-utils-scenario.mjs` / `node scripts/elevation-scenario.mjs` |
| Default map geometry | `node scripts/forked-vale-layout.mjs` |
| Fortified Crossing foundation | `node scripts/fortified-crossing-layout.mjs` and `node scripts/fortified-crossing-economy.mjs`; [evidence and scale runner](qa-custom-skirmish.md) |
| Larger map geometry | `node scripts/frontier-160-layout.mjs` |
| Highland Grove definition | `node scripts/generate-highland-grove.mjs --check` |
| Complete Forked Vale scenario, each winner | `node scripts/forked-vale-scenario.mjs 0` and `node scripts/forked-vale-scenario.mjs 1` |
| Mirrored combat | `node scripts/infantry-seat-combat-scenario.mjs --expect-parity` |
| Building attacks across disconnected terrain | `node scripts/ranged-building-attack-scenario.mjs` |
| In-range building attacks during construction repair | `node scripts/ranged-building-attack-scenario.mjs --edge-range-repair` |
| Archer firing positions across gaps | `node scripts/archer-firing-approach-scenario.mjs` |
| Cliff pursuit and attack-move alternatives | `node scripts/cliff-pursuit-scenario.mjs --direct` and without `--direct` |
| Construction on disconnected terrain / route protection | `node scripts/construction-connectivity-scenario.mjs` |
| Mirrored construction | `node scripts/opening-production-scenario.mjs --expect-builder-parity` |
| Producer destruction, replacement builders, and population caps | `node scripts/production-lifecycle-scenario.mjs` |
| Forest clearing | `node scripts/harvestable-woodland-scenario.mjs` |
| Forest route repair / exact deposits | `node scripts/worker-cargo-return-scenario.mjs` and `node scripts/worker-cargo-return-scenario.mjs frontier-160` |
| Patrol / Follow intent and replanning bounds | `node --test scripts/persistent-command.test.mjs` |
| Both-seat Patrol / Follow combat, recovery, interruptions and obstruction | `node scripts/persistent-command-scenario.mjs` |
| Patrol / Follow actual browser controls and large selections | `node scripts/persistent-command-browser.mjs` (installed Chrome; owner-run headless smoke) |
| Queued routes and checkpoint recovery | `node scripts/queued-waypoint-scenario.mjs` |
| Queue HUD metadata under backpressure | `node --test scripts/waypoint-backpressure.test.mjs` |
| Route repair after construction | `node scripts/live-attack-move-repair-scenario.mjs` |
| Research and rewards | `node scripts/research-scenario.mjs` |
| Map persistence / timed events | `node scripts/map-persistence-scenario.mjs` / `node scripts/timed-event-scenario.mjs` |
| Deadline victory | `node scripts/timed-victory-scenario.mjs` |
| Seats and reconnects | `node scripts/resume-session-scenario.mjs` |
| Delayed transport and interrupted orders, both seats | `node scripts/impaired-connection-scenario.mjs` |
| Client rematch roster and stale sockets | `node --test scripts/client-rematch-recovery.test.mjs` |
| Rooms and worker restart | `node scripts/room-supervisor-scenario.mjs` |
| Checkpoint write failure and recovery | `node scripts/checkpoint-storage-recovery-scenario.mjs` (unprivileged POSIX user) |
| Worker signal exits and forced shutdown | `node --test scripts/worker-shutdown.test.mjs` |
| Invite expiry during joins and worker startup | `node scripts/room-expiry-scenario.mjs` |
| PvE policy / launch lifecycle | `node scripts/pve-opponent-scenario.mjs` / `node scripts/pve-room-launch-scenario.mjs` |
| PvE tactics during gather retries | `node scripts/pve-decision-fairness-scenario.mjs` |
| PvE stranded reinforcement recovery | `node scripts/pve-reinforcement-recovery-scenario.mjs` |
| PvE stalled-army retry policy / server reproduction | `node scripts/pve-tactical-retry-scenario.mjs` / `node scripts/pve-tactical-stall-runtime-scenario.mjs` |
| PvE production budgets | `node scripts/pve-production-scenario.mjs` |
| PvE destroyed producer replacement | `node scripts/pve-barracks-recovery-scenario.mjs` |
| PvE objective retake after losses | `node scripts/pve-objective-recovery-runtime-scenario.mjs TEAM SEED` (teams `0`, `1`; CI seed `20260925`, additional audited seed `4294967295`) |
| Contested seeded PvE match | `node scripts/pve-contested-match-scenario.mjs 300 20260925 4294967295` |
| PvE live construction / reinforcements on both maps | `node scripts/pve-production-runtime-scenario.mjs forked-vale` and `woodland-expanse` |
| Compact HUD | `node --test scripts/hud-layout.test.mjs scripts/selection-context.test.mjs scripts/objective-summary.test.mjs` |
| Audio policy | `node scripts/audio-policy-scenario.mjs` |

Three Crowns also has both-seat scenarios: `node scripts/three-crowns-scenario.mjs 0`
and `1`. Add `--stress` to the Forked Vale scenario for its 2,000-unit path and combat check.

## Checks against an existing disposable server

Start a dedicated worker in one terminal:

```sh
RTS_HOST=127.0.0.1 PORT=4174 node server.mjs
```

In another terminal, wait for health, then run the relevant scenario:

```sh
curl -fsS http://127.0.0.1:4174/health
node scripts/building-economy-scenario.mjs 4174
node scripts/attack-move-scenario.mjs 4174
node scripts/trigger-scenario.mjs 4174
node scripts/fog-of-war-scenario.mjs 4174
node scripts/order-status-scenario.mjs 4174
```

These commands change the fixture. Run them sequentially, and use a fresh worker
when a scenario needs a specific initial state. For the hardening scenario,
start a separate worker with `RTS_MAX_PEERS=2` and run
`node scripts/server-hardening-scenario.mjs 4174`.

## Browser and art checks

Chrome/Chromium is required; use `CHROME_PATH` if discovery fails.

- `node scripts/map-studio-draft-scenario.mjs`: editor draft behavior.
- `node scripts/frontier-160-map-studio-roundtrip.mjs`: legacy, elevation, large-map,
  and Highland Grove authoring round trips.
- [Asset guide](assets.md): manifest validation, sprite previews, and appearance
  capture contracts. Inspect the resulting pixels before claiming a visual pass.
- [Deployment guide](deployment.md): guarded public release smoke.

Authoring generators such as `author-forked-vale.mjs` and `improve-three-crowns.mjs`
write map files. They are authoring tools, not read-only validation commands.

## Performance measurements

Run one timed profile at a time. Record commit, hardware, browser, map, roster,
workload duration, host load, and every budget override.

The [core tranche profile](core-playtest-tranche.md#scale-measurement-profile--proposed)
documents the bounded hosted movement ladder and per-seat tagged-order intervals.
Its success status asserts protocol liveness, not the broader scale budgets.

```sh
node scripts/checkpoint-performance-scenario.mjs 12
node scripts/checkpoint-performance-scenario.mjs 12 idle
node scripts/browser-performance-scenario.mjs 10
```

The browser profile runs three movement waves; `40` uses 40 seconds per wave for
a sustained sample. It uses an explicit 1280×720 CSS-pixel viewport at DPR 1 and
records actual viewport/canvas dimensions. Optional long-animation-frame
attribution identifies script/render phases and marks deferred startup entries;
tasks ending before the measurement starts are retained separately. Tasks
overlapping the measured window count against the long-task budget, regardless
of optional frame-attribution support.
Defaults are frame-interval p95 ≤33.333 ms, animate-callback
p95 ≤8 ms, and zero long tasks over 50 ms. Headless frame timing does not measure
windowed presentation latency or GPU completion.

To measure snapshots, start a disposable Open Field worker, then run:

```sh
node scripts/network-snapshot-scenario.mjs 4174 10
```

For Dense Clash, start the worker with `RTS_MAP=maps/dense-clash.json` and
`RTS_SEPARATION_DIAGNOSTICS=1`, then run
`node scripts/performance-scenario.mjs 4174 10 3 dense-clash`.

The optional game-dev adapter in `.game-dev/adapter.json` defines sealed scenarios
such as `checkpoint-move-2000` and `checkpoint-attack-move-2000`. Those profiles
use three 12-second windows, 33.333 ms p95 tick/start-lag budgets, and 100 ms
single-tick/start-lag/planning-stage ceilings. Preserve the run bundle when
comparing results. The [dated baseline](performance-reliability-baseline-2026-09-25.md)
includes reproduction commands and known limitations.

## Report the result

Separate logic, protocol, browser appearance, local performance, deployed
behavior, and human comprehension. A pass in one category does not establish
another. Keep raw measurements with their build; put current instructions here
and dated evidence in the [archive](archive/README.md).

Scenario authoring regressions: `node --test scripts/scenario-authoring.test.mjs`
checks bounded history/gestures and completion registry semantics;
`node scripts/completion-event-scenario.mjs` checks both-seat activation, initial
completed state, technology grants, pending restart, exact rewards, rematch,
and host-only diagnostics. `node scripts/progression-scenario.mjs` also observes
completion conditions during paid construction and research.
`node scripts/map-studio-draft-scenario.mjs` runs isolated headless Chrome for
region gestures, name/delete, undo/redo, typed conditions, local recovery and
JSON export/import. These are scripted checks, not unassisted human evidence.
