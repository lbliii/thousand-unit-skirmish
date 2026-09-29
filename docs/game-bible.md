# Game bible

[Documentation index](README.md) · [Roadmap](roadmap.md)

## Product promise

Build an original browser RTS where friends command large armies, fight over
readable terrain and objectives, and author their own scenarios. Solo play
against a deterministic opponent makes the same core easy to practice and test.
Desktop mouse and keyboard are the baseline.

The current development priority is a reusable gameplay foundation with one
complete faction: extensible unit/building definitions, base development, combat
roles, bounded technology progression, and interchangeable presentation. The
[foundation plan](gameplay-foundation-plan.md) defines the next tranche. Existing
match reliability remains the quality floor. Multiple finished civilizations,
campaign, ranked service and persistent progression remain later work.

## What the first slice must prove

A new player can start a solo match or join a friend, turn resources into an army,
make a consequential terrain or objective decision, understand the result, and
play again. The same rules must hold for both human seats and the solo opponent.

Use this test when choosing between features: does the change make that complete
match more dependable, legible, or strategically useful? Fix failures in that
loop first. Add content when it tests a specific weakness or creates a clear
choice with the existing rules. Generalize a system when a second concrete use
requires it.

## Design principles

| Principle | What players should experience |
| --- | --- |
| Command the crowd | One order gives a large formation a clear destination; selecting, grouping, and redirecting it is predictable. |
| Terrain creates decisions | Routes, resources, sight, and objectives offer visible reasons to split, defend, expand, or attack. |
| Every match can be authored | Map Studio produces valid, portable maps and scenarios without requiring engine knowledge. |
| Readability survives scale | Team, role, selection, health, commands, and ownership remain distinct in a crowded battle. |
| Online play earns trust | Orders receive specific feedback; disconnects, recovery, results, and rematches are understandable. |

## The match loop

1. Join a friend or start a solo match and understand the objective.
2. Gather resources, build infrastructure, and choose production.
3. Organize the army and choose routes through the map.
4. Contest objectives and react to the opposing plan and scenario events.
5. Reach a clear result, then rematch or try another authored scenario.

[Forked Vale](forked-vale-scenario.md) is the default small-opening scenario.
Larger maps test travel, resource regions, forest clearing, and elevation.
Match length and economy pacing must come from observed play.

Resource stocks and worker cargo display whole units rounded down; costs and
positive shortfalls round up. Affordability uses exact authoritative values, so
a display never rounds insufficient stock up to the purchase price.

## Implemented scope

- Azure and Ember seats, invite rooms, spectators, reconnects, and checkpoints.
- Workers, Infantry, and Archers; food/wood gathering, construction, queues,
  rally points, population reservations, and two attack upgrades.
- Box/Line/Column destinations, direct attacks, attack move, queued waypoints,
  control groups, class selection, and idle-worker selection.
- Capture prerequisites, any/all victories, continuous holds, deadlines, supply
  events, branching/joined event chains, and elimination.
- Fog, minimap, Map Studio, saved custom maps, elevation, and cut-to-clear forests.
- Seeded deterministic PvE through the same authoritative command rules.

Implementation is distinct from balance, readability, and external-playtest
proof. The [QA plan](qa-vertical-slice.md) defines those observations.

Attack-move pathfinding keeps its one-new-flow-field-per-tick budget. Requests
are scheduled separately from damage updates, with the oldest previous grant
first and physical position breaking initial ties. Seat labels and roster IDs
do not determine planning priority. This bounded service rule does not promise
mirrored armies will always draw; spatial tie-breaking can still matter. See
[the scheduling regression and limits](qa-attack-flow-scheduling-2026-09-27.md).

## Quality floor

- A first glance identifies the team, objective, route, and selection. The QA
  protocol measures this with a newcomer and a two-minute observation window.
- Every important action gives immediate, specific feedback; rejected actions
  explain what prevents them.
- Armies remain readable through chokes, combat, construction, and zoom changes.
  Visible damaged units show a health bar across sprite, mesh, and strategic-marker
  rendering; healthy, defeated, and fog-hidden units show no bar.
- Essential text and controls are comfortable at ordinary desktop sizes.
- Invalid map authoring names a fix before publication.
- Both players understand connection state, the winner, and who can rematch.
- Project-authored names, art, audio, maps, and writing establish an original
  identity. Record provenance and licensing for third-party dependencies and
  generated assets.

## World and presentation

The setting is an inviting medieval frontier: moss, worn earth, timber, slate,
weathered stone, and muted water. Use a painterly finish with clear silhouettes
and restrained effects. Azure is sky blue; Ember is rust/terracotta. Reinforce
team identity with shapes and labels.

Workers need a readable tool/pack; Infantry a spear/shield; Archers a bow/quiver.
Buildings need distinct rooflines and entrances. Art must work at normal and
strategic zoom. The [art direction](art-direction-contract-v1.md) and
[renderer contract](renderer-state-contract.md) define the shared rules.

The player is a commander, with personality expressed through strategy. There
is no fixed cast or campaign canon. Azure and Ember are team identities. Keep
announcements brief and specific, with a human, adventurous tone.

## Scope boundaries and open decisions

Campaigns, many asymmetric factions, a large technology tree, public accounts,
ranked matchmaking, naval combat, and general-purpose scripting remain outside
the first slice. Optional model-opponent research is isolated and default-off;
normal solo play uses no model provider.

| Open decision | Evidence needed before committing |
| --- | --- |
| Ordinary match length and economy pace | Completed Forked Vale matches with opening, contest, result, and player explanations recorded. |
| Supported device/network profile | Named browser/device and hosted two-seat measurements under recorded network conditions. |
| Routine army scale versus stress ceiling | Command/readability observations at increasing army sizes, alongside simulation and browser costs. |
| Fantasy or faction asymmetry | A bounded rule experiment that produces an understandable choice in the existing match loop. |

The [roadmap](roadmap.md) orders the work; the [QA plan](qa-vertical-slice.md)
defines the observations needed to claim success. Test [living-land](living-land-experiment.md)
and [larger-map](map-scale-density.md) ideas as bounded experiments before
expanding their scope.

## References

The [RTS coverage guide](references/feature-coverage-inventory.md),
[Openage study](references/openage-study.md), and
[Warcraft study](references/warcraft-rts-inventory.md) preserve design research.
For a new reference, record the source and date, concrete observation, project
decision it informs, and differences in scale or constraints. Reference research
does not add features to the roadmap automatically.
