# Roadmap

[Documentation index](README.md) · [Game bible](game-bible.md) · [QA plan](qa-vertical-slice.md)

## Current priority

Build a reusable gameplay foundation and one complete faction. The
[gameplay foundation plan](gameplay-foundation-plan.md) defines the implementation
sequence and acceptance criteria. Existing solo/two-seat checks are the regression
floor; expansion of gameplay functionality is the next development outcome.
Art proceeds separately against stable presentation interfaces.

Use the [RTS capability inventory](references/feature-coverage-inventory.md) as
a loose roadmap for further maturity. AoE, openage and Warcraft identify systems
we may match, adapt or improve; prioritize dependable player control, useful
scenario tools and reusable content/feedback interfaces. Select concrete outcomes
from the inventory rather than treating comprehensive parity or its proposed
milestone sequence as a prerequisite for progress. Art direction and character
production can develop independently of these engine capabilities.

## Foundation milestones

The [authorized custom-skirmish milestone](custom-skirmish-milestone-plan.md)
is integrated in main `eecc2d0` through [PR #289](https://github.com/lbliii/thousand-unit-skirmish/pull/289):
Patrol/Follow, visual named-region and completion-trigger authoring, and versioned
shipped audio delivery with bounded execution feedback. Combined authoritative
matches prove economy, event chains, combat, recovery, victory and rematch;
the stable hosted author-to-friend browser proof also passes native audio
mute/Stop/reset checks. [Combined QA](qa-custom-skirmish.md) owns exact builds,
deployments, acceptance and limits.

The rendered combined workload passes at 250/500/1,000 units. The diagnostic
2,000 case cannot clear its construction site within the bounded attempt and
never reaches the full workload; crowded movement/placement is a concrete core
follow-up, not a supported capacity claim. Unassisted author and human-pair
observations are still needed for discoverability and listening. Art remains
independent. Authored entity placement/identity and death triggers remain later
candidates from the loose capability inventory.

### Parallel core workstreams — 30 September 2026

The user authorized a parallel implementation wave targeting `main`. Each owner
uses an isolated worktree, ships focused PRs and owns proportionate checks,
staging integration and fix-forward work. Art and audio production proceed in
their existing lanes. The workstreams below are starting outcomes, not claims
of implemented functionality or comprehensive reference parity.

| Workstream | First useful outcome | Primary edit boundary |
| --- | --- | --- |
| Army commands | Stop/Hold with predictable interruption, no Hold pursuit, HUD/hotkeys and persisted both-seat behavior. | Authoritative orders/movement/combat idle semantics; command input/HUD and command tests. |
| Scenario authoring | Graphical named regions with bounded undo/redo, region-entry and registered construction/research completion conditions, host diagnostics, validated import/export and checkpoint-safe execution. | Map/schema validation, scenario event simulation, editor and authoring tests. |
| Unit audio engineering | Supported lifecycle event catalog, ready/death/repair routing, food/wood context, bounded playback and recovery-safe deduplication. | Audio policies/runtime/library UI and narrow client audio emission sites. |

Keep edits to shared server/client files localized to these responsibilities;
prefer focused modules over broad rewrites. Read current `main` before dependent
work and contact only an affected owner for a concrete conflicting edit or shared
contract. A completed scoped slice may integrate independently; do not create a
central approval queue or wait for the whole wave. Later Patrol/Follow, broader
triggers and shared content delivery follow useful integrated outcomes.

| Milestone | Observable outcome |
| --- | --- |
| F1 — Extensible roster | Shared validated definitions drive existing rules; a Spearman and House exercise the complete runtime pipeline. |
| F2 — Base development | Population, drop-offs, expansion, defenses and lifecycle rules create dependable economic choices. |
| F3 — Composition and progression | Mounted/scouting and siege roles, counters and a small technology tree work for players and AI. |
| F4 — Presentation and variants | Two visual variants preserve identical simulation; a bounded gameplay variant and mixed-roster scale measurements prove the extension boundaries. |

Start with registry parity and a second Barracks production option. Define the
presentation binding in that slice; ship each addition through HUD, server,
persistence, AI and staging without waiting for final graphics.

The registry, base lifecycle, mounted roster, bounded research, siege, Scout
reconnaissance, AI counter-slot reservation and contextual HUD slices are
integrated into main. QA records include a full seeded Forked Vale AI match,
both-seat field-role and paid siege interactions, current staging gameplay and
deployed HUD/recovery observations. Live AI base expansion is integrated through PR #252, with all three CI shards
passing. Exact merge `496d387` deployed successfully to staging and passed fresh
packaging and 250-unit gameplay/recovery smoke. F1–F3 and early presentation
binding are complete; continue usability/balance iteration and F4 presentation,
variant and scale proofs. The evidence and its limits are recorded in
[QA](qa-vertical-slice.md).


## First-civilization building art

The [Frontier style kit](frontier-civilization-art-style.md) defines eight coherent Complete building concepts for the [architecture wiki](lore/frontier-architecture.md). Next: calibrate House/Town Center beside Workers, derive registered directions and lifecycle states, and integrate useful building packs progressively. Use the [atlas production plan](building-atlas-production-plan.md) for role coverage and scale targets. Source concepts do not claim runtime replacement.

## Match evidence and continuing checks

Use these observations to evaluate foundation additions. They are continuing
product proofs, not a substitute for implementing the foundation milestones.

1. **Complete and understand a match.** Run the Forked Vale loop in seeded solo
   play and human 1v1. Record the first order, production, objective, result, or
   recovery failure that prevents completion or requires coaching; fix and replay it.
   [Automated staging checks](qa-integrated-core-2026-09-27.md) now cover both-seat
   reconnect, elimination, and rematch at `8b6bcbb`; an unassisted human match
   remains the next product proof.
2. **Verify the integrated battlefield.** Main `eef9aa4` makes Barracks/Range
   sprites the default and adds Town Center collision. Check both teams through
   construction/damage, exits and nearby placement, fog, ordinary/strategic zoom,
   and narrow HUD layouts. Packaged assets are present; current deployed
   appearance now has a [host editor and Ember opening observation](qa-staging-browser-2026-09-27.md)
   at `bcd5fec`; construction/damage, zoom, and narrow-layout checks remain.
3. **Test decisions on representative maps.** Use Forked Vale for opening and
   objective play, then Frontier Reach/Highland Grove for routes, forest access,
   and elevation. Record the decision a player made and the alternative they saw
   before adding more map mechanics or changing balance.
4. **Establish the supported scale.** Agree on the device, hosting, network, and
   player-facing budgets, then measure both seats at increasing loads through
   2,000 total units. Keep simulation, rendering, bandwidth, and order delay as
   separate measurements.
   The [September 27 local combat sample](qa-checkpoint-scale-2026-09-27.md)
   passes its existing simulation/checkpoint limits; it does not establish the
   intended hosting or browser budget.

The current implementation provides these test surfaces. It does not by itself
prove M1–M4 complete. Use the [asset guide](assets.md) for loader status and
[QA records](qa-vertical-slice.md#known-findings-and-historical-evidence) for
observations at earlier builds.

## Milestones

These are product evidence targets. Scoped changes can ship before a whole
milestone is demonstrated. The linked QA records describe evidence at named
builds; they do not certify today's deployment.

| Milestone | Observable outcome | Next proof |
| --- | --- | --- |
| **M1 — Complete invite match** | Two people join Forked Vale, gather, build, produce, contest, agree on the result, reconnect, and rematch. Map Studio saves and reloads the scenario. | A complete unassisted two-seat session on one identified deployed build. |
| **M2 — Readable authored battlefield** | Players distinguish teams, unit roles, resources, objectives, construction, and depletion at normal and strategic zoom. | Representative mixed-role captures on Meadow/Cinder followed by fresh-player identification. |
| **M3 — Dependable large match** | A 2,000-total-unit match meets simulation, browser, network, and recovery budgets on intended hosting hardware. | Comparable hosted two-seat measurements with named hardware/network conditions and agreed limits. |
| **M4 — Useful external playtest** | Two novice pairs finish a match and explain a consequential decision, an alternative, and their main confusion. | The [external protocol](qa-vertical-slice.md#lightweight-external-playtest-protocol), followed by fixes for repeated failures. |

## Work areas

The [first lore wiki](lore/README.md) is delivered as a connected reference covering the ten regions, peoples, institutions, history and supernatural anchors. The user's current lore direction is to deepen and reconcile this reference; additional scenes and a scenario are optional later uses. The earlier [L1 foundation](lore-foundation-m1.md) remains a drafting record, separate from gameplay M1. Lore proposals do not alter the current gameplay priority.

| Area | Useful next outcome | Record |
| --- | --- | --- |
| Gameplay | Fix a reproduced command, combat, economy, pathing, or recovery failure. | Build, reproduction, both-seat regression. |
| Balance | Observe contested openings without changing established baselines prematurely. | [Opening and combat evidence](first-skirmish-balance.md), timings, losses, stocks, player explanations. |
| Maps | Test Frontier Reach and Highland Grove routes, resources, elevation, and forest access in a match. | Layout/round-trip checks and actual route choices. |
| Interface | Make selection, production, objectives, and rematches discoverable in the compact HUD. | Viewport, interaction capture, novice observation. |
| Audio | All-zone source milestone is implemented: 44 originals across ten zones and eleven palettes, a comparison player, and Audio Studio import. Next: creative audition, loop edits, discovery/conflict arrangements and in-match cue recognition. | [All-zone evidence](qa-zone-audio-2026-09-30.md), [source pack](../assets/audio/vaelora-zones-v1/README.md), and later ten-trial results with mix/caption settings. |
| Renderer | Integrate useful asset states while preserving fog, batching, and camera readability. | Exact pack/revision, representative runtime frame, focused checks. |
| Art | Finish small independent unit, building, environment, vegetation, or material samples. | Source/runtime status, manifests, provenance, known limits. See [art lanes](art-production-lanes.md). |
| Unit characters | Integrate the Human and Boughward first passes for Worker, Infantry, Spearman, Archer, Scout, Rider, and Siege Engine as the default opposing rosters, with approximate action coverage in every heading. Verify the default roster in a live match; refine directional animation and team accents afterward. | See [Human roster evidence](art-direction/human-roster-v1/README.md) and [unit sprite exploration](unit-sprite-exploration.md); record runtime visibility, rights/provenance, and player readability separately. Meshy is deferred for this pass. |
| Infrastructure | Keep staging healthy and measure hosted match/recovery behavior. | Deployment identity, ready/assets/WSS smoke, recovery and capacity evidence. |
| QA | Convert player failures into repeatable defects and current-build observations. | [QA protocol](qa-vertical-slice.md) and dated evidence. |
| PvE | Observe and improve the seeded opponent's opening, objective contest, and retake behavior. | Seeds, assigned seats, trace, solo-match observation. |
| Model research | Design an offline comparison with deterministic PvE. | Default-off fake-provider tests; paid provider use remains a separate decision. |

## Experiments

- [Living land](living-land-experiment.md): elevation is implemented; specialty
  crops and regrowth remain proposals. Highland Grove currently uses a food placeholder.
- [Map scale and density](map-scale-density.md): Frontier Reach and Woodland
  Expanse provide larger layouts; another size needs observed gameplay reasons.
- [Harvestable woodland](harvestable-woodland-pilot.md): forest-cell gathering and
  clearing are implemented; berry brushwood and organic forest-opening work remain follow-ups.

## How to choose and finish a slice

1. Start from current code and a concrete player observation or reproducible gap.
   Write the expected player outcome and the smallest check that can demonstrate it.
2. Own the useful outcome through integration and proportionate checks.
3. Use code, a focused PR, and a short decision note as shared state. Contact an
   affected owner only for a specific blocking interface or conflicting edit.
4. Record whether work is implemented, merged, observed on a deployment, or
   demonstrated by players. These are different claims.
5. Keep source samples moving with their limits stated. Ordinary appearance
   captures do not require quiet-host approval; comparable performance work does
   need controlled conditions.
6. Close with the source/build, relevant checks, observed outcome, and remaining
   limitation. Update the owning guide when behavior or a decision changed.
7. Follow [repository working rules](../AGENTS.md). Staging integration and
   production promotion remain separate decisions.

The previous task-by-task ledger is preserved in the
[September roadmap archive](archive/2026-09/roadmap.md). Use it to trace past
choices, rather than copying its dated statuses into new work.

## Army-command foundations

Stop and Hold Position establish explicit task/route interruption and stationary
in-range defense, with both-seat authority and checkpoint/rematch regressions.
Continue with Patrol/Follow only as bounded additions to these semantics; use
[the command evidence](qa-command-foundations-2026-09-30.md) as the regression floor.

## Regional map roster — 30 September 2026

Twelve Vaelora maps now provide playable destinations for the ten regional asset
families and eleven audio palettes. Next proof: both-seat economy-to-watch matches
on Bellweather Millrace and Underbough Rootways, then congestion/expansion comparison
on channel, basin and ridge layouts. The next regional slice supplies separate terrain ambience, registered regional
defaults, distinct flagship objectives/expansions and pre-match rolling-ground
authoring/rendering. Follow with human 1v1 observations, dedicated living-fringe
vegetation and slope/build-pad polish before adding independent corner sculpting.
See [roster and limitations](maps.md).
