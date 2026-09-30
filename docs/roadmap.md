# Roadmap

[Documentation index](README.md) · [Game bible](game-bible.md) · [QA plan](qa-vertical-slice.md)

## Current priority

Build a reusable gameplay foundation and one complete faction. The
[gameplay foundation plan](gameplay-foundation-plan.md) defines the implementation
sequence and acceptance criteria. Existing solo/two-seat checks are the regression
floor; expansion of gameplay functionality is the next development outcome.
Art proceeds separately against stable presentation interfaces.

## Foundation milestones

| Milestone | Observable outcome |
| --- | --- |
| F1 — Extensible roster | Shared validated definitions drive existing rules; a Spearman and House exercise the complete runtime pipeline. |
| F2 — Base development | Population, drop-offs, expansion, defenses and lifecycle rules create dependable economic choices. |
| F3 — Composition and progression | Mounted/scouting and siege roles, counters and a small technology tree work for players and AI. |
| F4 — Presentation and variants | Two visual variants preserve identical simulation; a bounded gameplay variant and mixed-roster scale measurements prove the extension boundaries. |

Start with registry parity and a second Barracks production option. Define the
presentation binding in that slice; ship each addition through HUD, server,
persistence, AI and staging without waiting for final graphics.

The registry, base lifecycle, mounted roster, bounded research, siege and Scout
reconnaissance slices are integrated into main. AI counter-slot reservation is
a focused follow-up PR. Next evidence is integrated staged gameplay and full
AI matches on representative terrain; the current automated field-role and paid
siege-acquisition checks are recorded in [QA](qa-vertical-slice.md).

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

| Area | Useful next outcome | Record |
| --- | --- | --- |
| Gameplay | Fix a reproduced command, combat, economy, pathing, or recovery failure. | Build, reproduction, both-seat regression. |
| Balance | Observe contested openings without changing established baselines prematurely. | [Opening and combat evidence](first-skirmish-balance.md), timings, losses, stocks, player explanations. |
| Maps | Test Frontier Reach and Highland Grove routes, resources, elevation, and forest access in a match. | Layout/round-trip checks and actual route choices. |
| Interface | Make selection, production, objectives, and rematches discoverable in the compact HUD. | Viewport, interaction capture, novice observation. |
| Audio | Audio Studio v1 is implemented; import original material, audition an authored pack in Forked Vale, then check cue recognition. | [Audio Studio plan](audio-studio-implementation-plan.md), import/save/reload/play proof, and ten-trial results with mix/caption settings. |
| Renderer | Integrate useful asset states while preserving fog, batching, and camera readability. | Exact pack/revision, representative runtime frame, focused checks. |
| Art | Finish small independent unit, building, environment, vegetation, or material samples. | Source/runtime status, manifests, provenance, known limits. See [art lanes](art-production-lanes.md). |
| Unit characters | Review the default Worker/peasant sprite in a live match, then develop distinct Infantry and Archer sources through the fixed-camera pose-capture workflow. | See [unit sprite exploration](unit-sprite-exploration.md) and [Meshy-to-sprite pipeline](unit-character-meshy-pipeline.md); record runtime visibility, rights/provenance, and player readability separately. |
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
