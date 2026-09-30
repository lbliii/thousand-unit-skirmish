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

## Roster production options

Barracks produces Infantry and Spearman through the same persisted FIFO.
Contextual production choices and Map Studio unit selectors are generated from
registry entries; selection and group summaries count every registered kind.
Spearman currently reuses the procedural melee placeholder with a distinct tint.
The bounded AI adds Spearmen toward one per three Infantry when reserves permit.
Its mounted counter and the Stable arrive with F3 combat classes.

## Population capacity

`src/population.mjs` derives used and reserved population from live units, FIFO
product IDs and Town Center worker queues. Only completed friendly capacity
buildings contribute; House destruction never mutates units or paid queues.
Commands validate a new reservation before deducting resources. Owner/spectator
snapshots expose capacity; the opponent DTO projects only its own record.
Rules revision 6 deliberately adopts the population economy and migrates
compatible revision-5 saves while preserving existing queues and overcapacity
armies. Explicit stress fixtures retain their opening capacity.

### Resolved gameplay identity and action availability

The shared registry validates stable content and compact unit wire IDs, faction
roster references, production products, technology upgrade keys and prerequisite
cycles (including a research building requiring its own technology). Its canonical
SHA-256 revision excludes labels and presentation bindings; gameplay values and
ordered product lists participate. Snapshots carry the revision, default faction
and unit wire mapping. A browser with a different revision asks for a reload
before applying the state.

Checkpoint schema 13 pins this identity. Schema 11 saves migrate to the current
compatible opening roster; an unknown pinned revision is rejected and the exact
save is renamed to a `.rejected-*` file before a fresh match starts. Future roster
changes must supply and test an explicit compatible migration rather than silently
reinterpreting paid queues or saved entities.

`src/production-actions.mjs` derives product availability, prerequisites and
rejection reasons from authoritative resources, reservations and safety limits.
Commands repeat these checks before spending. Own-seat options are projected to
the HUD and AI; no-fog broadcast caching shares the public roster but masks enemy
product names and population. Building construction and persisted geometry use
registered odd footprints (one to nine cells wide). Unit and building presentation
profiles bind supported procedural roles independently of gameplay identity;
they do not claim a skeletal animation backend.

### Base lifecycle commands

`src/base-lifecycle.mjs` defines bounded proportional refunds and paid repair
steps from validated lifecycle policy. Cancellation commands verify seat ownership
and unfinished state before removing a foundation, queue entry or active research.
Queue cancellation resets a replacement head's timer and releases precisely the
removed reservation. Legacy Town Center Worker queues retain their compatibility
command while using the same refund calculation.

Worker `repairing` state shares construction access/routing and is optional in
older saves. Schema 12's known Storehouse revision migrates to schema 13; unknown
content remains rejected. Repair pays for each HP increment, waits with an active
order when wood is exhausted, and stops at registered max HP. Normal Worker orders
clear the repair mode. Renderer action mapping reuses the construction capability.
The deterministic policy can repair observed damaged friendly buildings with a
wood reserve and bounded retries; it suppresses competing gather orders for the
chosen repairer.

### Starting and expansion Town Centers

Registered `town-center` expansions use generic construction, FIFO production,
population, repair and drop-off routing. Starting centers are separate
`homeTownCenters` snapshot records with reserved entity IDs from 1,000,000,000;
their production accessors preserve the compatibility `workerProduction` queue
without counting reservations twice. Clients and filtered AI observations combine
these records with constructed buildings. Destruction removes collision, vision
and production while retaining a dead home record in checkpoints. Cargo only
banks at a reachable living completed friendly drop-off; a destroyed home is
never a permanent deposit marker. Schema 14 explicitly migrates the known schema
13 ruleset, and preserves unknown pinned revisions for diagnosis.

### Stationary defenses

Optional validated building `combat` and `sight` definitions drive Watchtower.
Its scans use rotating enemy spatial buckets with a 64-visit budget and stable
ID ties. Unit visibility gates targets, and tower hits accumulate before shared
unit/building damage resolution, preserving lethal same-tick trades. Quarter-second
idle backoff avoids scanning empty areas every tick. Saved cooldowns prevent
restart from granting a free shot; schema 15 migrates the known Town Center
revision without changing existing HP or queues. Vision coverage caches separate
radii per source cell, so a tower can expand previously processed unit sight.
Enemy shot destinations are masked under fog like unit attack coordinates.

### Shared damage and supported effects

`src/combat-rules.mjs` resolves unit and stationary-defense damage from validated
content. Attack classes/tags, numeric armor, target eligibility and multipliers
are data; gathering, building, repair and structure-attack permissions use explicit
supported capabilities. Technology effects support damage multipliers and additive
armor by declared class; unsupported effect operations fail validation. Completion
state determines effects for both existing and newly produced entities. Cached
resolved effects invalidate when that state changes, including rematch, and use a
stable content-ID order. Numeric ranges are bounded at 16 cells. Schema 16
explicitly migrates the known defense revision without rewriting entity HP/queues.

Technology availability is derived by `src/research-actions.mjs` for authoritative
commands, building option snapshots, HUD and the filtered opponent adapter. Stable
technology IDs map to registry upgrade keys; fresh completion records enumerate
all definitions. Schema 18 migrates the known mounted revision by filling new keys
with false while retaining old completions and active research. Active home Town
Center research validates against its reserved ID, matching team, surviving HP and
Town Center research type. Enemy legal research options are masked alongside paid
product queues, including no-fog shared snapshots. Presentation reads completion
state and legal choices without mutating combat stats.

Siege Engine exercises registered ranged structure approach cells, siege damage
class and tag modifiers without adding a combat branch or projectile subsystem.
Workshop and the engine use registered prerequisites and generic legal production.
Schema 19 explicitly migrates the known progression revision, filling the new
technology key while retaining completions and active projects. The opponent's
siege assault lane reads only filtered building observations: two engines and at
most 64 visible defense candidates, with generation-aware assignment, observed
progress and a ten-second stalled-order retry. It excludes assigned engines from
ordinary army orders and releases them when the target leaves the observation.
