# Live browser match observation — September 29, 2026

This owner-operated staging pass exercises native Firefox controls. It is not
novice-player evidence or a controlled performance measurement.

## Provenance

- Origin: https://game-staging-21f9.up.railway.app
- Successful Railway deployment: `165e9fda-6352-47bf-acde-7920e24acb7e`.
- Server source: `28415d9fe87cbd33c73c11b918b5d897063b2859`, checked during the run.
- Native Firefox on the current Mac; screenshot dimensions 2800 × 1544 including browser chrome.
- Fresh Play vs AI room; Woodland Expanse.
- Map seed `3057621993`; policy seed `3521106671`.
- Human input supplied by the agent through computer-use controls. Ember uses the deterministic opponent.

## Observed sequence

1. Play vs AI created a fresh room and reached ROOM LIVE as Azure, with 12 units
   per side, 150 food and 250 wood. The map and both seeds were visible.
2. Home base centered the opening. Idle workers selected four workers.
3. Right-clicking the nearby food node produced GATHER ORDER · 4 WORKERS and
   GATHER FOOD · 4 WORKERS; selected cargo increased to 20 and then 39 food.
4. Build opened the construction panel. Barracks placement exposed the clear
   3 × 3 site hint and accepted a clear site near the Town Center. Wood fell
   from 250 to 75. Four workers constructed the building.
5. The completed Barracks enabled Queue infantry. Queuing infantry and a worker
   charged 100 food. A new infantry and worker appeared; Azure reached 14 units.
   Returning the workers to food was accepted and food deposits resumed.
6. Army selected eight infantry. Fit map showed the battlefield overview.
   Attack move followed by right-click toward North Signal produced ATTACK ORDER
   · 8 UNITS; movement was visible after reload. This does not establish a
   successful retake or a full combat-order matrix.
7. Objectives exposed zone thresholds, capture times, rewards, prerequisites,
   and Ember's all-zone hold countdown. The agent spent the opening checking
   economy controls; Ember took the objectives before Azure could contest them.
8. Reloading the page recovered Azure, ROOM LIVE, the same room/seeds, trained
   units, resources and completed Barracks. This was page-reload recovery, not
   a timed network-outage measurement.
9. Ember completed its 20-second hold. The summary said Ember wins; the result
   said DEFEAT and HELD ALL VICTORY ZONES FOR 20S.
10. Play again reset the same room to 12 units per side, 150 food, 250 wood,
    a 15:00 deadline and the same displayed seeds.

## Findings and limits

No completion, construction, production, page-reload recovery, result or rematch
blocker was reproduced. No gameplay change follows from this sample alone.
The in-app browser returned `net::ERR_BLOCKED_BY_CLIENT`; native Firefox loaded
staging successfully using its existing authentication.

This is a complete owner-operated solo control loop ending in defeat, not a
competitive balance result. It supplements the [core tranche checks](qa-core-tranche-2026-09-29.md)
and [hosted scale diagnostic](qa-hosted-scale-profile-2026-09-29.md). Actual
unassisted human matches, broader combat/recovery control coverage, narrow HUD
layouts and comparable supported-scale measurements remain separate proofs.

## Two-seat native Firefox pass

A fresh New room opened Forked Vale with four workers and eight infantry per
team. A separately opened tab joined Ember; session storage kept the seats
separate. Both were controlled by the agent, not two independent human players.

- Ember selected idle workers and right-clicked the nearby food node. After a
  reload, it showed RECONNECTED AS EMBER and ROOM LIVE; food rose from 150 to
  270, then 390 before the scheduled relief delivery. Gathering continued.
- Azure selected eight infantry. Fit map exposed the explored area. A right-click
  on a resource location returned SELECT WORKERS FIRST; a ground attack-move
  returned ATTACK MOVE ORDER · 8 UNITS and moved the army into the center.
- Ground moves into the northern and southern lanes captured the two Signals,
  paid their rewards, and changed the summary to Capture Vale Watch · 8 units.
  The map remained fogged outside explored areas. Ownership persisted after the
  army left a captured zone, as intended.
- Ember's match menu showed 2 / 2 PLAYERS and 2 / 2 ONLINE. Army size, map,
  Map Studio and reset were disabled with host-only explanations.
- Both teams received Relief Caravan at two minutes. Azure moved its eight
  infantry into the unlocked Watch. Objectives showed Azure control of all
  three zones and the 20-second hold countdown.

This pass deliberately leaves Ember's military at home so the objective/result
UI can be checked without a contested balance interpretation. It does not
replace the seeded contested scenario or the future human playtest.

- Azure's result showed VICTORY; Ember showed DEFEAT and WAITING FOR HOST TO
  RESET. Both named Azure and HELD ALL VICTORY ZONES FOR 20S.
- Azure clicked Play again. Both seats returned to 12 units, 150 food and 250
  wood. Ember selected four idle workers and issued another accepted food gather
  order. Objectives showed neutral Signals, locked Watch, a fresh deadline and
  rearmed Relief Caravan.
- The deployment/source remained unchanged when checked during this pass.

No blocker was reproduced in this bounded two-seat control/result pass.
