# Custom-skirmish milestone evidence

[Milestone requirements](custom-skirmish-milestone-plan.md) · [QA evidence standard](qa-vertical-slice.md)

## Current acceptance audit

This record distinguishes the foundation from the final combined proof. It does
not declare the milestone complete. Each lane's focused implementation and
checks must be integrated before the combined scenario can establish its claims.

| Requirement | Current evidence | Remaining proof |
| --- | --- | --- |
| Fortified Crossing terrain and resources | `scripts/fortified-crossing-layout.mjs` passes on foundation commit `b42b50e`; mirrored routes to North Signal 31 cells, South Signal 30, Watch/crossing 20 from each seat, including home collision | Recheck final published map |
| Both-seat paid economy and active research recovery | `scripts/fortified-crossing-economy.mjs` passes on `b42b50e`; both Barracks complete, infantry trained, infantry attack research completes after worker restart with original seat tokens; final resources 200 food / 350 wood per seat | Combine with completion rewards, gathering, orders and combat |
| Persistent Patrol/Follow | Not observed on the integrated build | Lane A acceptance and combined mixed-speed, combat, recovery/rematch proof |
| Visual region/event authoring | Not observed on the integrated build | Lane B forms, geometry, undo/redo, export/import/reopen/publish proof |
| Completion triggers and diagnostic trace | Not observed on the integrated build | Both-seat construction/research chains, initial-state semantics and delayed delivery recovery |
| Automatic shipped audio and execution feedback | Not observed on the integrated build | Fresh guest, missing content fallback, accepted/rejected feedback, wood/food/repair task lifecycle and inspector |
| Combined result and rematch | Not observed | Finish Fortified Crossing and prove fresh event/order/audio baselines |
| Scale evidence | Runner being validated; no comparable measurements recorded | Server and browser/audio measurements at 250/500/1,000, diagnostic 2,000, with controlled conditions |
| Hosted observation | Not observed for this milestone | Identified staging deployment and fresh invite/guest observations |
| Unassisted author and human pair | Not observed | Actual people must establish discoverability; automation cannot supply this evidence |

## Reproduction commands

Run from the repository with Node 24 and local listening permitted:

```sh
node scripts/fortified-crossing-layout.mjs
node scripts/fortified-crossing-economy.mjs
node scripts/fortified-crossing-scale.mjs 20 250,500,1000,2000
```

The economy test uses real paid orders and never injects checkpoint state. Its
worker and save directory are disposable. The scale runner publishes a derived
map with a distinct ID and the selected starting roster; it retains the terrain,
fog, resource and capture/event rules. It alternates converging attack-move and
withdrawal, samples health and reclaims both seats after restarting the worker.
Its JSON output identifies build, timestamp, Node/platform/CPU, workload duration,
rolling tick timing, planning, transport, checkpoint and applied notice latency.

These are loopback server diagnostics. They do not measure rendered frames,
audio callbacks, real network latency, player comprehension or supported hosted
capacity. Overlapping health windows are reported as such. Performance claims
require separately recorded conditions and browser evidence; a smoke run under
other active development workloads validates the runner only.

## Runner smoke, 30 September 2026

The 10-second 250-unit run on `b42b50e` plus the uncommitted runner
collected 20 health samples and four successful applied notices, then reclaimed
both original seats after restart. The runner revision is committed with this
record. Other development work was active on the host; this run is validation
of the runner, not a comparable performance baseline. No rendered client or
audio callback was measured.
