# Architecture

[Documentation index](README.md) · [Testing](testing.md)

## Runtime

The browser sends orders over a WebSocket. The room supervisor routes each room
to its own Node process. That worker validates commands, advances the simulation,
and sends visibility-filtered state back to each seat.

```text
Browser: index.html + style.css + src/main.js
                 │ HTTP / WebSocket
       room-supervisor.mjs
                 │ loopback routing
          server.mjs per room
                 │
       checkpoints and custom maps
```

The simulation targets 30 Hz and ordinarily sends snapshots every three ticks
(10 Hz). The browser smooths visual motion between snapshots. During overload,
the scheduler skips elapsed wall-clock slots and advances one simulation step
per callback; see [simulation timing](simulation-timing.md).

The server owns movement, collision, combat, resources, production, objectives,
visibility, and match results. The browser owns selection, camera, HUD, audio,
and visual interpolation. A renderer fallback cannot change gameplay occupancy
or reveal hidden state.

Building placement compares connectivity before and after its proposed footprint.
It preserves existing connections among bases, units, resources, and building
access, including Town Centers, without requiring separate authored islands to
connect. Footprint occupancy and active move-route checks apply independently;
see [construction evidence](qa-construction-connectivity-2026-09-27.md).

## Code map

| Files | Responsibility |
| --- | --- |
| `room-supervisor.mjs` | Room creation/join, public routing, worker lifecycle, shared access control, persistent room index. |
| `server.mjs` | Map validation, command handling, simulation, state filtering, WebSocket transport, checkpoints, static allowlist. |
| `origin-policy.mjs` | Browser-origin validation for direct and proxied requests. |
| `simulation-scheduler.mjs` | Fixed-step scheduling and overload accounting. |
| `src/main.js` | Browser integration, rendering, input, Map Studio, and snapshot reconciliation. |
| `src/map-utils.mjs`, `src/elevation.mjs`, `src/map-resize.mjs` | Shared map validation, connectivity, elevation costs, and editor resizing. |
| `src/formation-assignment.mjs`, `src/unit-selection.mjs` | Formation and selection logic used by focused scenarios. |
| `src/pve-*.mjs` | Seeded solo launch, filtered opponent observation, deterministic policy, optional fake-provider research helper. |
| `src/hud-layout.mjs`, `src/selection-context.mjs`, `src/objective-summary.mjs` | HUD geometry, selection actions, objectives, and notice history. |
| `src/*visual-state.mjs`, `src/environment-art.mjs`, `src/captured-building-art.mjs`, `src/building-sprites.mjs` | Snapshot-to-art mapping, environment batches, directional Town Center views, and Barracks/Range sprites. |
| `src/town-center-spawn.mjs` | Shared Town Center position and server collision footprint. |
| `src/audio.mjs`, `src/audio-policy.mjs` | Synthesized audio, mix settings, cue policy, and caption decisions. |
| `maps/`, `assets/`, `schemas/` | Authored content and versioned asset contracts. |
| `scripts/` | Regression scenarios, captures, authoring helpers, validators, and release tooling. |

## Commands and visibility

Seats are assigned by the server. Commands never choose their own team.
Ownership, generations, resources, population, visibility, and reachability are
checked before mutation. New orders supersede stale move plans; reset and map
changes cancel pending work.

Fog filters enemy units, structures, resource stock, and private intent. Objective
locations and ownership are public, but capture progress requires visibility of
the entire zone. The PvE policy receives a narrower allow-listed observation.
Read the [command and observation contract](gameplay-command-observation-contract.md)
before changing any of these boundaries.

## Persistence and transport

The supervisor persists invite metadata and gives workers separate map and
checkpoint paths. Workers capture authoritative state every 30 simulation ticks
and write atomically. Schema/rules validation decides whether a checkpoint can
be migrated, restored, or rejected.

Outbound state coalesces for slow readers; per-peer queues and inbound messages
are bounded. Resume tokens are room-scoped and persisted as hashes. The detailed
`/health` response exposes timing, queue, and checkpoint diagnostics.

## Where to make a change

Keep rule changes in the authoritative path and update their scenarios. Put
reusable data checks in the shared modules when both editor and server need them.
Keep asset bounds separate from collision footprints. Extract small modules from
the large client/server files when a concrete change benefits from it.

Deployment instructions belong in [deployment](deployment.md); numeric settings
belong in [configuration](configuration.md); asset format rules belong in their
[specific contracts](assets.md). Avoid copying those details into status reports.
