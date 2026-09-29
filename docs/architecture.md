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

Archer building attacks use reachable cells within weapon range as approach
goals; Infantry use the building perimeter. Shared flow fields distinguish unit
kind and connected region. Construction repair preserves attacks already within
actual unit-to-building range before searching approach-cell centers.
See [Archer approach evidence](qa-archer-firing-approach-2026-09-27.md) and
[range-boundary repair evidence](qa-building-range-repair-2026-09-27.md).

## Shared gameplay definitions

`src/gameplay-definitions.mjs` owns validated production costs/times, current
building footprints, combat stats, research costs/times and stable presentation IDs. Server,
HUD and deterministic production policy consume this data. Existing command,
roster and checkpoint formats remain unchanged in the initial extraction.
Building production uses a FIFO list of unit IDs with registry costs and head-unit
training duration. The numeric queue count remains available to existing clients
and AI. Checkpoint schema 11 migrates schema-10 single-product queues; private
queue contents are visible only to their owner and spectators. HUD training uses
`trainUnit`; legacy training commands remain accepted.

`src/gameplay-presentation.mjs` binds unit presentation IDs to the current
procedural renderer’s detail and strategic-zoom roles and colors. Profiles are
immutable and validated; a gameplay kind can reuse a supported appearance.
Faction resolution and asset-backed profile loading remain follow-up slices in the [foundation plan](gameplay-foundation-plan.md).
A presentation ID is a binding identifier; it does not yet load an animation.

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
