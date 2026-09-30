# RTS feature coverage

[Documentation index](../README.md) · [Game bible](../game-bible.md) · [Openage study](openage-study.md)

This maps the current project to the feature families raised by the original
RTS study. Use it as a loose roadmap and living capability inventory: identify
systems worth matching, adapting or improving beyond the references. It does
not require reproducing every feature or following the reference games' order.
The [original 0.95 ledger](../archive/2026-09/feature-coverage-inventory.md) retains
fine-grained observations and pinned research sources.

## Current project coverage

| Area | Implemented scope | Remaining decision/evidence |
| --- | --- | --- |
| Sessions | Invite rooms, assigned seats, spectators, reconnects, checkpoints. | Complete current-build human join/recovery session. Accounts/matchmaking remain later. |
| World/visibility | Authored terrain, elevation, fog, minimap, cuttable forest cells. | Readable slopes, forest changes, and larger-map routes in play. |
| Economy | Finite food/wood, carrying/depositing, costs, queues, population reservations. | Contested economy and pacing; trade/regrowth remain proposals. |
| Units/technology | Worker, Infantry, Archer, Spearman, Scout, Rider, Siege Engine; bounded tier, weapon, armor and siege progression. | Integrated late-game decisions and role balance; broader factions remain later. |
| Selection/orders | Single/box/class/double-click/groups, formations, attack move, waypoints, Stop/Hold and persistent Patrol/friendly Follow. | Discoverability and crowded-match control. |
| Movement | Authoritative pathfinding, shared routes, separation, elevation costs, repair after occupancy changes. | Measured long-order/choke behavior on intended hardware. |
| Combat | Unit/building attacks, ranged roles, simultaneous damage, visibility checks. | Human counterplay and parity beyond isolated fixtures. Heroes/spells/naval systems remain candidates. |
| Buildings | Town Center, House, Storehouse, Barracks, Range, Stable, Watchtower, Workshop; expansion, rally, production/research, repair and cancellation. | Placement/blocked-exit usability; garrison/walls remain absent. |
| Scenarios | Capture dependencies, any/all/hold/deadline victory, supply/repeat/event chains, named-region entry and registered construction/research completion. | Complete authored matches and understandable triggers. |
| Editor | Painting, resizing, elevation, resources, objectives/events, graphical regions, typed completion forms, bounded region/event undo/redo, import/export/publish. | Unassisted authoring and current deployed round trip. |
| Reliability | Isolated workers, bounded transport, seat reclaim, checkpoints, guarded release. | Hosted latency/loss, restore rehearsal, and measured capacity. |
| UI/audio | Compact HUD, contextual actions, help, synthesized fallback, local sampled audio profiles, Audio Studio/composer, captions and mix settings. | Unit lifecycle/execution hooks and shared pack delivery remain incomplete. |
| AI/content | Seeded deterministic PvE; bounded optional fake-provider experiment. | Solo-play feedback. Campaign/public mod ecosystem are outside the first slice. |

## How to use references

The user's direction, confirmed 30 September 2026, is to use AoE, openage and
Warcraft as a broad inventory for engine maturity while art direction develops
independently. Feature parity is a useful comparison; better player and author
outcomes are the objective.

For each selected capability, record its current coverage, the player or author
need, the intended improvement over the reference where relevant, and a concrete
acceptance check. Choose slices for strategic value, usability, reliability,
authoring power and reuse. Preserve explicit later/out-of-scope decisions until
a concrete proposal changes them. A missing reference feature alone does not
establish priority, and exceeding a reference means a demonstrated improvement,
not a larger feature count.

Openage material mixes reverse-engineered game behavior, architecture, and idea
pages. Keep those evidence types distinct. Borrow a principle only when it solves
a project need and can be tested against the current engine.

Use [roadmap milestones](../roadmap.md) and [QA acceptance](../qa-vertical-slice.md)
for product proof; do not duplicate their checklists here. Update this summary
when a feature boundary changes, with a link to the owning contract or experiment.

The custom-skirmish wave is integrated in main `eecc2d0`; [combined evidence](../qa-custom-skirmish.md) records shared shipped audio, execution feedback, orders, authoring, recovery and scale limits. The following assessment retains its pre-wave source snapshot; use the current table above for implementation coverage.

## 2026-09-30 — Engine breadth assessment (pre-wave snapshot)

Compared local source `b61e167` with the renewed [openage](openage-study.md) and
[Warcraft](warcraft-rts-inventory.md) research. Implemented means an inspected
code path, not finished balance, author usability or performance certification.
No reference engine was built or played in this audit.

**Conclusion:** no comprehensive feature parity. The project has an integrated
land-skirmish core, but only partial authoring/content/audio infrastructure.
Openage's documented target capabilities must be separated from its current
playability. Warcraft III provides the stronger authoring-tool benchmark.

| Feature family | Local coverage and concrete gap | Recommended disposition |
| --- | --- | --- |
| Standard orders | Move, attack, attack move, formations, queued destinations and groups. No explicit Stop/Hold/Patrol/Follow command suite. | Next core tranche: Stop/Hold first, Patrol/Follow afterward. |
| Economy and defense | Food/wood, cargo/drop-offs, expansion, population, repairs, towers and siege. No farm replenishment, extra resources, trade, walls/gates or garrison. | Keep current economy; walls/gates and replenishment are next candidates if longer matches demonstrate need. |
| Terrain and visibility | Elevation, fog, minimap, forests that clear when cut. No separate air/naval traversal or gameplay day/night. | Improve routes/readability; alternate traversal and day/night are later choices. |
| Map creation | Dimensions, terrain, elevation, obstacles, resources, starts, objectives, validation and JSON save/load/publish. No general preplaced entity roster, named regions, undo/redo or prefab library found in inspected authoring paths. | Add entity/region placement, undo/redo and non-destructive test iteration. |
| Scenario logic | Capture prerequisites, first capture/recapture, timers, rewards, repeat deliveries, branching/joined chains, holds and deadlines. Only capture-zone/timed-supply types validate. | General bounded event-condition-action runtime/editor. |
| Content editing | Validated code-authored unit/building/technology/faction registry. No map-local Object Editor or custom behavior runtime. | Editor for supported stats/costs/products/tech effects; explicit behavior capabilities. |
| Custom matches | Human two-seat invites, spectators, solo AI, host custom maps, results/recovery/rematch. No teams/FFA, configurable multi-seat lobby or public map catalog. | Package identity and ready/launch workflow first; more seats is a separate authoritative refactor. |
| AI authoring | Bounded deterministic strategy/reconnaissance/expansion/siege policies. No author-facing AI plan editor. | Presets for difficulty and scenario goals before a general AI editor. |
| Content distribution | Room-scoped map JSON, shipped assets, local audio archives. No unified map/rules/presentation/audio dependency package. | Versioned scenario package with pinned dependencies and client readiness checks. |
| Inspection and replay | Health diagnostics, checkpoints and automated fixtures. No player replay viewer, seekable command history or trigger-debug timeline. | Start with command/event recording and scenario trace; distinguish replay from checkpoint restore. |
| Abilities and neutral actors | Data-driven combat modifiers; no generic mana/cooldowns/status effects, heroes/items, neutral camps, shops or diplomacy. | Later concrete gameplay experiments; no speculative implementation. |
| Interface | Contextual HUD and camera preferences; no general user-configurable command hotkeys or HUD scale control found. | Core usability tranche. |

For AoE authoring specifically, the official
[AoE II editor update](https://www.ageofempires.com/news/aoe2de-update-42848/)
documents additional condition/effect types, variables and script-call support.
The separate [AoE III trigger guide](https://support.ageofempires.com/hc/en-us/articles/8476706379284-Scenario-Editor-Triggers)
shows condition/effect editing, objective state, win/loss and camera tracks.
These are distinct games; neither is evidence of openage implementation.

## Unit audio wiring audit

The current link is indirect:

```text
selection/order -> cue + unit kind + resource -> active map audio profile
               -> binding -> recording variant/source ID -> local audio blob
```

`src/main.js` emits selection cues and `sendTrackedOrder` sends the first selected
unit's kind plus food/wood context. `src/audio-event-profile.mjs` resolves specific
keys before generic fallbacks. Unit definitions have presentation IDs but no
separate sound-set ID; the active map profile decides the recording for each kind.

| Player interaction | Current coding support |
| --- | --- |
| Select Worker | Emits `unit.worker.select`; recording plays if a loaded profile binds it. Otherwise synthesized selection feedback. |
| Order chopping | Emits `unit.worker.gather.wood`, including cuttable forest orders. |
| Order berry gathering | Emits `unit.worker.gather.food`; food category, not a distinct berry-resource ID. |
| Move/build/attack | Kind-specific keys can resolve; generic cue fallback remains available. |
| Repair | No distinct repair cue; the contextual button sends the command directly without a dedicated acknowledgement audio event. |
| Work execution | No ongoing chopping/berry/repair sound lifecycle hook. Gather cue acknowledges the sent order. |
| Attack impact/hurt/death | Snapshot attack ticks, damage and defeat drive visual state; audio aggregates friendly damage into alerts. No dedicated per-unit impact/hurt/death event. |
| Spawn/training complete | Aggregate completion cues; no role-specific ready voice emitted by the inspected completion paths. |

`defeat` is a match-loss cue, not a unit-death sound. A syntactically valid
`unit.worker.death` binding alone cannot work: `playEvent` first checks the
finite supported cue list, which has no death entry, and the client never emits
one. Similarly, freely typed Audio Studio keys do not create new runtime hooks.

Existing support includes randomized variants avoiding immediate source repeats,
voice cooldown/priority, urgent interruption, voice/effects/music/ambience buses,
captions, decode/sample limits and synthesized fallback. Orders acknowledge
successful WebSocket send before authoritative acceptance; rejected commands may
therefore produce an acknowledgement followed by rejection feedback.

Audio sources live in browser IndexedDB. Map metadata supplies `packId/profileId`
only; the runtime explicitly tells other players to install their own pack copy.
There is no guarantee an invited player hears the host's authored recordings.

Engineering follow-up, independent of producing audio assets:

1. Define a complete supported event catalog, including select, accepted orders,
   repair, ready, work start/stop, attack execution/impact, hurt and death.
2. Bind per-kind or per-presentation sound sets with resource/task-specific
   overrides and explicit generic fallback.
3. Emit lifecycle events with entity ID, generation and simulation tick; suppress
   restoration duplicates and respect fog, audibility and grouped selection.
4. Bound voice/effect concurrency and work loops; one group acknowledgement must
   not become hundreds of simultaneous voices.
5. Deliver/pin packs through the same content manifest used by custom scenarios.
6. Expose missing/emitted/suppressed bindings in an audio inspector so producers
   can verify their work without changing gameplay code.

Fresh checks: `audio-runtime-scenario.mjs`, `audio-runtime-playback-scenario.mjs`
and `audio-policy-scenario.mjs` passed. Playback uses a fake AudioContext; these
are routing/fallback proofs, not listening or live-browser recognition evidence.

## 2026-09-30 — Proposed next milestone

**Authorable, dependable RTS sandbox.** This is a recommendation from research,
not a replacement of the accepted roadmap or a claim of implementation.

1. **Command completeness and event identity:** Stop/Hold, predictable order
   interruption, structured command/result and lifecycle events. Preserve
   authoritative validation and both-seat recovery.
2. **Scenario Studio:** named regions/entities; events for timer, region entry,
   entity death, construction/research completion and capture; typed conditions
   and bounded actions for spawn, orders, rewards, objectives, messages and
   win/loss. Include variables, trigger enable/disable, repeat bounds, trace and
   checkpoint-safe execution. Extend today's capture/supply semantics deliberately.
3. **Content and feedback contracts:** map-local supported definition overrides,
   complete unit audio bindings, presentation fallback and dependency manifests.
   Existing art/audio samples are sufficient to test the interfaces.
4. **Author-to-friend proof:** author, export/import and invite-play three original
   scenarios: an escort with region checks, a survival wave map, and a fortified
   skirmish with unlocks. Reload mid-trigger and verify no duplicated rewards,
   deaths or audio; rematch resets scenario state.
5. **Mixed-roster scale proof:** measure trigger execution, units, browser, network
   and persistence separately through the existing 250–2,000-total load ladder.

Use a bounded declarative trigger language first. Arbitrary scripts, multiplayer
teams/FFA, heroes/items, naval play, campaigns and public matchmaking remain
separate proposals. Replays/recorded traces follow once reproducible state and
event recording are established; they are not implied by deterministic AI.
