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

## Stationary army orders

Stop (`S`) abandons a unit's current task, attack, path planning and queued route.
It leaves the unit idle until another order; it preserves carried resources and
leaves shared construction in place. Hold Position (`H`) interrupts the same work,
then attacks visible enemy units already within its weapon range without chasing.
It does not automatically attack structures. Both commands apply to workers and
military units, are available in the Orders/context controls, and persist through
reconnect/checkpoint recovery. A new move, gather, build, repair, or attack order
replaces Hold; a rematch clears it. Held workers are excluded from idle-worker
selection.

Patrol (`P`) targets ground and repeatedly travels between each selected unit's
current cell and its assigned formation destination. It engages visible enemies
using the existing attack-move leash, then resumes the interrupted route. Follow
(`F`) targets a living friendly unit by ID and generation. Followers move towards
a two-cell offset when farther than four cells from their leader; this deadband
prevents continual oscillation around a stopped or slower leader. Follow does not
seek enemies. A lost, dead, replaced or no-longer-friendly leader ends Follow in
Stop. A disconnected route retains the order with a visible `BLOCKED` state and
retries every two seconds; reachable Follow updates at most once per second.
Persistent replanning admits at most 64 units each tick through the existing
sliced planner, so a large group can catch up over several ticks. Persistent
orders appear in selected-unit context, persist through recovery and are cleared
by Stop/Hold, replacing move/work/attack orders, or rematch. Shift waypoints cancel
persistent intent and retain the existing queued-route behavior. Held and
persistently ordered workers are excluded from idle-worker selection.

## The match loop

1. Join a friend or start a solo match and understand the objective.
2. Gather resources, build infrastructure, and choose production.
3. Organize the army and choose routes through the map.
4. Contest objectives and react to the opposing plan and scenario events.
5. Reach a clear result, then rematch or try another authored scenario.

[Bellweather · Millrace](maps.md) is the default regional two-seat scenario.
[Fortified Crossing](../maps/fortified-crossing.json) supplies a small-opening
custom skirmish with construction, research and crossing rewards.
[Forked Vale](forked-vale-scenario.md) remains a laboratory scenario.
Larger maps test travel, resource regions, forest clearing, and elevation.
Match length and economy pacing must come from observed play.

Resource stocks and worker cargo display whole units rounded down; costs and
positive shortfalls round up. Affordability uses exact authoritative values, so
a display never rounds insufficient stock up to the purchase price.

## Implemented scope

- Azure and Ember seats, invite rooms, spectators, reconnects, and checkpoints.
- Workers, Infantry, Archers, Spearmen, Scouts, Riders and Siege Engines; food/wood
  gathering, construction, queues, rally points, population reservations and bounded research.
- Box/Line/Column destinations, direct attacks, attack move, queued waypoints,
  control groups, class selection, idle-worker selection, Stop/Hold, Patrol and friendly Follow.
- Capture prerequisites, any/all victories, continuous holds, deadlines, supply
  events, branching/joined event chains, named-region entry, registered construction/research
  completion and elimination.
- Fog, minimap, Map Studio with graphical named regions and bounded region/event undo,
  saved custom maps, elevation and cut-to-clear forests.
- Versioned shipped audio delivery, authoritative applied-order feedback, unit ready/death
  hooks and bounded food/wood/repair execution samples using supplied placeholder content.
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

The working world name is **Vaelora**. Its visual identity combines warm, expressive everyday life with tangible remnants of immense lost power. The [art checkpoint](art-direction/vaelora-v1/README.md) defines ten regional palettes and ecology references, from Bellweather's farms and Ellionar's stepped gardens to the Pale Meridian's observatories and Ru’Lora's petrified jungle.

Regions define terrain and ecology; cultures define craft and architecture; factions define allegiance. Sun, moon and star elves, desert humans and explored bull/jackal peoples are worldbuilding directions, not new implemented rosters. Author-story continuity questions and working faction names remain explicit in the checkpoint.

The author's stories deeply inspire the world's voice, naming, humor and material imagination; literal reuse of their histories is optional under the user's 30 September direction. The [lore wiki](lore/README.md) is the current reference for the world, regions, cultures, institutions, history and supernatural anchors. It distinguishes selected direction, working lore, in-world belief and open questions. The earlier [foundation package](lore-foundation-m1.md) remains a dated drafting record. New lore adds no gameplay requirements.
Author-confirmed lore, 30 September 2026: sun, moon and star elves hate one another. Develop their faction affiliations separately; the earlier Continuance lineup is a visual comparison, not a shared elven allegiance. Exact faction names and affiliations remain open.

**Aurians** is the accepted name for the people previously labeled angels in the art explorations. Their current anatomical reference has humanoid arms and separate feathered back wings, distinct from harpies' wing-arms. The name does not establish divine origin or a faction affiliation.

Workers need a readable tool/pack; Infantry a spear/shield; Archers a bow/quiver. Buildings need distinct rooflines and entrances. Art must work at normal and strategic zoom. The [art direction](art-direction-contract-v1.md) and [renderer contract](renderer-state-contract.md) retain shared gameplay rules. Azure and Ember remain sky-blue and rust/terracotta match identities, reinforced through shapes and labels.

The player is a commander, with personality expressed through strategy. There is no fixed cast or implemented campaign canon. Announcements remain brief and specific; world flavor can use practical observation and dry humor without obscuring gameplay information.

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

## Population and Houses

Ordinary 24-unit openings start with 15 population capacity per seat. Living
units and paid queues both consume capacity. A completed House adds eight
capacity for 75 wood; unfinished Houses add none. Destroying a House lowers
capacity without deleting units or canceling paid queues. Further training is
blocked until deaths or replacement capacity free enough space. Existing paid
queues still complete. The HUD explains used, queued and available capacity.

Large-army fixtures start with at least their opening population capacity,
clamped to the separate 1,000-unit-per-seat safety ceiling. Population is a
gameplay constraint; the safety ceiling remains a simulation boundary.

## Economy drop-offs

A Storehouse costs 100 wood, takes 20 seconds of Worker construction and has
1,200 HP. It accepts food and wood when complete. A Worker carrying resources
chooses the completed friendly drop-off with the shortest reachable route;
the existing Town Center remains a valid drop-off. Unfinished or enemy buildings
accept nothing. If the chosen drop-off is destroyed or navigation changes,
the Worker replans and retains its cargo. With no reachable drop-off it waits
with the cargo rather than banking it remotely. Storehouses provide no units or
population. Their current House-shaped procedural presentation is a placeholder.

## Cancellation and repair

Canceling unfinished construction refunds the unbuilt fraction of its food/wood
cost and removes the footprint. Canceling a pending training entry refunds its
full cost; canceling the active entry refunds its remaining training fraction.
A completed training timer blocked by the exit has no unfinished work to refund.
The next head begins with its full training duration. Canceling research refunds
its remaining time fraction and applies no upgrade. Refunds are credited once,
rounded to six decimal places; UI notices show whole resource amounts. Destroying
a building loses its queue and research without refund.

Workers may repair damaged completed friendly buildings. Each Worker restores
40 HP per second while in construction reach. Repairing an entire HP bar costs
30% of the building's wood price, with a minimum of ten wood, paid in proportion
to HP actually restored. Insufficient wood pauses the order; another move/gather/
attack order interrupts it, and another repair order can resume. Checkpoints
retain active repair targets. Finishing construction and repairing damaged HP
are separate jobs. No repair restores defeated buildings.

Town Center expansions cost 100 food and 400 wood, take 60 seconds to build,
have 2,400 HP, and add five population slots when complete. They train Workers
and accept food/wood cargo. Starting centers keep the initial population baseline
and their authored placement. Both kinds can rally, be repaired or destroyed;
losing a center does not eliminate surviving units or another usable producer.
Destroyed production loses its paid queues without refund.

Watchtower costs 50 food and 150 wood, takes 35 seconds, and has 1,200 HP.
Completed towers attack visible enemy units within seven cells for eight damage
once every 1.25 seconds; they provide ten-cell sight around their access perimeter
with the existing terrain occlusion/high-ground rules. They cannot produce units
or attack structures. F3 siege is the planned dedicated counter; these initial
numbers still need defended-assault balance evidence.

Combat uses melee, pierce and siege attack classes with class-specific armor.
An eligible hit applies its unit or structure base damage, completed technology
multipliers and every matching target-tag multiplier, then subtracts target armor
and completed armor bonuses. Minimum damage is 0.5; an ineligible target takes
zero. Matching multipliers multiply and armor bonuses add. Hits resolve together
so a lethal counterattack still lands in the same tick. Existing role timings,
ranges and damage are preserved; Spearman's threefold mounted modifier becomes
player-visible when the mounted roster ships.

### Mounted foundation roster (2026-09-29)

The Frontier Stable offers a fragile, fast Scout with eleven-cell sight and a
heavier Rider that reserves two population. Rider armor reduces ordinary melee
and pierce hits; Spearman's threefold mounted modifier resolves before armor and
provides a direct counter. Initial full-health adjacent duels in both seats leave
Spearman at 55 HP after defeating Rider, Rider at 100 after defeating Worker,
and Worker at 52 after defeating Scout. Scout should use mobility and sight
rather than fight a stationary economy head-on. Match-level scouting and raid
balance still need evidence; these initial numbers are not a final balance claim.

### Military progression (2026-09-29)

Town Centers offer Military Tier II, opening armor research at Barracks and
mounted forging at Stable. Teams research one project at a time, paying when it
starts. Completed technologies affect current and future eligible units through
the shared damage formula; damage multipliers multiply and class armor adds.
Military armor excludes Workers. Destroying the research building cancels its
active project without refund; deliberate cancellation refunds the unfinished
fraction. Authored technology rewards remain explicit scenario grants and may
skip normal purchase prerequisites. Workshop and siege will use this same tier
and unlock boundary in their following slice.

### Siege foundation role (2026-09-29)

Workshop and siege engineering follow Military Tier II. The Siege Engine is a
slow, three-population ranged specialist with strong structure hits and a doubled
defense-tag bonus. It can outrange a Watchtower at a correct firing position;
inside the tower's range it loses the damage race. Mobile armies, including Rider,
can destroy it quickly, so an assault needs protection and positioning. Attacks
remain single-target and resolve through the shared damage accumulator; there is
no splash or friendly-fire exception. Workshop/engine geometry is placeholder
presentation, and match-level costs/terrain/composition balance remain provisional.
### Human graphics first pass

The normal game uses the Vaelora Human Worker, Infantry, Spearman and Archer sprite roster at the approved Human size/detail, plus initial Scout, Rider and Siege Engine cutouts. Mounted size and siege footprint remain provisional until live review. The latter three have distinct static idle, movement, attack and defeat poses reused across headings. First-pass action coverage takes priority over correct animation: missing headings temporarily reuse the nearest authored action sequence. Directional fidelity, smooth loops and team sash masks remain polish work. Explicit legacy preview flags still select their respective art lanes. `humanRosterPreview=0` restores the older default cast preview.

## Playable regional interpretation

The default roster uses multiple local battlefields inspired by Vaelora's regional
landscapes, with Bellweather Millrace as the first match. Region palettes determine
current ground, vegetation, everyday music and terrain ambience; the shared Frontier gameplay rules
remain usable throughout. A playable map does not settle unknown inhabitants,
exact atlas geography or divine histories. See the [map catalog](maps.md).


### Pre-match ground elevation

Map authors can raise, lower, level and smooth three ground levels, or generate
seeded mirrored rolling hills before a match. Terrain height is visible beneath
units, buildings and vegetation. One-step slopes are traversable with the existing
uphill movement cost and high-ground sight; two-step edges are cliffs requiring
an intermediate ramp. Building footprints still require one logical ground level.
Flat base and marker pads protect generated openings. This initial model derives
rendered corners from cell heights; independent RollerCoaster Tycoon style corner
sculpting, live terraforming, bridges and altered combat damage rules are later
work. It adds no new rules about regional inhabitants or hazards.
### Default rival presentation (2026-09-30)

Boughward is the selected initial rival civilization art family. Normal matches render team zero with the Human roster and team one with Boughward orcs/goblins, wolf Scouts, boar Riders and woodland ballistae. Both use the Frontier gameplay rules; civilization selection and asymmetric civilization rules remain unimplemented. See [Boughward roster sources and limits](art-direction/boughward-roster-v1/README.md).
