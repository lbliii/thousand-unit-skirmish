# Stop and Hold Position evidence — September 30, 2026

[QA index](qa-vertical-slice.md) · [Game bible](game-bible.md#stationary-army-orders)

Source: `codex/command-foundations`, based on main `fa7e6bc`. Local Node 24.9.0
on macOS, Open Field, two WebSocket human seats, 250-unit roster. This is
server/command-function evidence, not a fresh hosted appearance or scale claim.

## Observed checks

- `node scripts/stationary-command-scenario.mjs`: both seats interrupt move and
  queued attack-move with Hold, remain at exact checkpoint positions, and reject
  other-seat/stale-generation orders. Hold survives graceful checkpoint recovery
  and seat reclaim; Stop and ordinary movement replace it; rematch clears it.
- Immediate 125-unit move/Stop pairs from both seats leave no applied paths,
  pending planning flags or queued waypoints.
- Both seats interrupt berry gathering with Hold; node, forest and gather-phase
  state clear. Focused task tests verify cargo survives and active build/repair
  targets clear while the revision invalidates previously captured planner work.
- The scenario seeds an ordinary melee engagement plus a siege target six cells
  away, beyond attack-move's 4.8-cell acquisition radius. Both held units deal
  damage without moving. Targets then receive retreat orders; the holders stay
  fixed, and damage ceases once targets leave weapon range.
- `node --test scripts/stationary-command.test.mjs`: six checks cover cargo/work
  interruption, tracked orders from both seats, observer/result gating, and
  keyboard/context wiring and immediate selection availability. Existing HUD, selection, rematch, waypoint
  backpressure and CI-shard tests pass (25 checks). Existing queued-waypoint
  checkpoint/migration/1,000-unit queue and live attack-move route-repair scenarios
  also pass.

A local in-app browser observation caught disabled contextual Stop/Hold controls
following an Army selection. Availability now updates with selection changes;
the regression covers empty → army → building → army → empty transitions.
A fresh browser reload/Army selection then showed both controls enabled; clicking
Hold and Stop each produced an authoritative notice for the 496-unit selection.
The 1280 × 720 screenshot showed the contextual controls fully inside the viewport.

## Limits

Hold currently auto-acquires units only, using bounded candidate scans and the
existing fog and combat-target rules. Stop leaves units idle; it does not add an
aggressive stance. Patrol/Follow and persistent military-stance display remain
later capabilities. Dedicated command acknowledgement sounds are owned by the
parallel audio slice; this change uses the existing tracked-order audio path.
