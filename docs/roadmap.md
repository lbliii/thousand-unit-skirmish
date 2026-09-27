# Roadmap

[Documentation index](README.md) · [Game bible](game-bible.md) · [QA plan](qa-vertical-slice.md)

## Current priority

Prove a dependable RTS core in solo and human 1v1 matches. Prefer concrete
problems in orders, movement, combat, economy, scenario rules, visibility,
results, recovery, and large-match behavior. Maps and art should help expose and
explain those systems.

The working loop is: play, record the build/map and decisive or confusing moment,
reproduce the largest problem, ship a focused improvement, and play again.
Scripted scenarios protect known rules; human matches establish whether those
rules create understandable choices.

## Next priorities

Choose the first unresolved item that the current evidence supports. Independent
art, map, and infrastructure slices can progress alongside these outcomes.

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
   appearance still needs a named-build observation.
3. **Test decisions on representative maps.** Use Forked Vale for opening and
   objective play, then Frontier Reach/Highland Grove for routes, forest access,
   and elevation. Record the decision a player made and the alternative they saw
   before adding more map mechanics or changing balance.
4. **Establish the supported scale.** Agree on the device, hosting, network, and
   player-facing budgets, then measure both seats at increasing loads through
   2,000 total units. Keep simulation, rendering, bandwidth, and order delay as
   separate measurements.

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
| Audio | Check recognition of move, attack, victory, defeat, and draw cues. | Ten-trial results with mix/caption settings. |
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
