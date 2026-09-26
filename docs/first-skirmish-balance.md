# First 1v1 skirmish balance ledger

Status: early tuning; no unit-stat or cost change is justified by this
evidence. An earlier 170 HP outlier in the contested split did not recur on
latest main. On 26 September 2026, combat parity and the Forked Vale production
opening were rerun on local `main` at
`30d5dc353c49387bacdd05ef6afb1500c9519555`; the equal-cost group counter was
rerun on later merged `main` at
`c931e692f000d9567de4ff459595605190f9d020`. The contested worker-diversion
probe ran on exact main source `a3426c1271eabb4b8d8c2097d6ae7659d9972951`.
Main later advanced to `6a4dc00`; `server.mjs` and Forked Vale's map are
unchanged since the tested commit. The intervening map-utils change only adds
optional elevation helpers; existing flat-map path functions are unchanged.
All runs used Node `v24.9.0` on macOS arm64. Scripted checks are not human
match evidence and do not establish that the skirmish is balanced. Scope
follows the working Game Bible and RTS Feature Coverage Inventory, maintained
by the product team: one complete invite-first 1v1 scenario with a small
roster. Large armies remain a separate stress workload.

## Baseline found in the prototype

| Rule | Original value when this ledger began | Design implication |
| --- | ---: | --- |
| Default start | 1,000 total, 500 per team | Opening economy and production have little leverage. |
| Initial workers | 4 per team | There are 496 starting infantry per team at the default size. |
| Starting resources on shipped maps | 0 food, 0 wood | Players must gather before placing either production building. |
| Worker | 100 HP, 10 damage / 0.85 s, range 1.28; 50 food, 25 s | Original unit combat numbers matched infantry. Worker protection had little incentive. |
| Infantry | 100 HP, 10 damage / 0.85 s, range 1.28; 50 food, 12 s | Fast food-only frontline and building attacker. |
| Archer | 70 HP, 7 damage / 1 s, range 4.5; 25 food + 45 wood, 7 s | Ranged support needs space or a frontline; wood gates mass production. |
| Barracks / Archery Range | 175 / 150 wood, 20 s construction | First building is a real wood allocation if starting wood is limited. |
| Gathering | 1 resource/s, 10 carried per trip | Travel and drop-off time lower the effective income rate. |
| Three Crowns | 6 / 6 / 8 units, 8 / 8 / 10 s capture; no hold | A large starting army can take objectives before production matters. |

Numbers above record the original rules from `server.mjs`, `src/main.js`,
and `maps/three-crowns.json`. Archers' range suggests a positioning role;
it does not prove they are cost-effective.

## First focused change

Maps may now set `startingArmySize` to an even **total** from 8 to 2,000.
Startup, map selection, and map publication use that map value. Omission keeps
the old 1,000-unit default. A host's explicit army-size selection remains a
stress control, and rematch preserves the selected size.

The first authored scenario should try **24 total units**: 4 workers and
8 infantry per team, with **150 food and 250 wood per team**. This makes two
immediate production plans possible after one building completes:

| Opening | Initial spending after building | First reinforcement | Remaining stock before gathering |
| --- | --- | --- | --- |
| Barracks | 175 wood + 50 food per infantry | ~32 s after construction starts with one builder | 100 food, 75 wood after one infantry |
| Archery Range | 150 wood + 25 food + 45 wood per archer | ~27 s after construction starts with one builder | 125 food, 55 wood after one archer |

These are rule-clock estimates: 20 s construction plus 12 s or 7 s training.
Walking, placement, congestion, and command time add delay. The resource
allocation permits three infantry or two archers from the opening stock, before
gathering. It does not establish that the two plans are equally strong.

Construction progress adds once per nearby worker each tick. Committing all
four starting workers can reduce the nominal build clock from 20 s to 5 s:
the first infantry then appears about 17 s after arrival at the site, or the
first archer about 12 s after arrival. This sacrifices early gathering while
speeding a 5+5 **military** split between Forked Vale's two signal fords.
Workers also count toward capture, so a player can split the starting roster
earlier by exposing the economy units. Record builder count and worker presence
at objectives in opening playtests; the one-worker times above are not
universal.

## Measurable hypotheses for playtests

1. **Opening clarity:** In at least 8 first-time 1v1 player seats, 6 can
   assign workers within 45 s and start a production building within 90 s
   without coaching. Record rejected orders and the reason players give.
2. **Two meaningful responses:** A barracks-first frontline and a
   range-first ranged-support plan are both chosen and can contest the main
   objective in mirrored Azure/Ember tests. After at least 20 paired games,
   neither opening should exceed 70% wins; treat this as a tuning trigger,
   not a statistical proof.
3. **Role clarity:** Players can describe infantry as the close frontline,
   archers as ranged support, and workers as economy after one match. In a
   controlled duel, infantry should beat a worker from either team seat while
   taking some damage. In a later group test, 4 workers should not be an
   efficient replacement for 4 infantry.
4. **Pacing:** In contested games, first combat should occur by 2 min,
   first objective ownership by 3 min, and the median game should last
   6–10 min. At least 90% should finish within 15 min. Record both seats'
   builder count, first building, first reinforcement, first contest,
   decisive objective, and match-end times.
5. **Victory incentive:** Players should move to contest objectives by
   4 min, and be able to explain why the final objective ended the game.
   A quiet base standoff beyond 4 min or a surprise victory is a scenario
   rule/UI failure to investigate before adding more units or technology.

All time and win-rate bands are hypotheses. The scenario designer owns objective
geometry and timing; gameplay engineering owns reliable commands and pathing;
QA will collect mirrored matches and player explanations. Revisit the bands
after the first outside playtest rather than treating them as ship criteria by
themselves.

## Evidence for this pass

- `node scripts/starting-army-scenario.mjs` passed locally: a 24-unit
  published map yielded 4 workers and 8 infantry in both player seats with
  150 food and 250 wood each; rematch retained 24; manual 250-unit stress
  selection and its rematch worked;
  selecting a map without the field restored 1,000; reselecting the authored
  map restored 24; five invalid sizes were rejected.
- This verifies map publication, selection, reset, and validation through
  the local command protocol. It is not a two-human balance playtest or
  hosted-network measurement.

## Second isolated change: worker combat role

A two-seat direct-attack duel with 100 HP on both unit types measured the
original parity. The Azure worker defeated an Ember infantry unit with 10 HP
left. With sides reversed, Azure infantry defeated an Ember worker with 10 HP
left. Team assignment and attack order, rather than unit role, decided the
matchup.

Worker damage against units is now **4 per 0.85 s**, versus infantry's
**10 per 0.85 s**. Worker HP remains 100, so existing unit health presentation
is unchanged. An earlier post-change run had Ember infantry at 60 HP and
Azure infantry at 64 HP. The merged-baseline retest below records the current
result. The worker can still hurt an attacker but loses the equal-cost fight.
`node scripts/worker-combat-scenario.mjs` records and asserts the outcomes.
This is controlled combat evidence, not a claim about raids, worker survival
in a full match, or player understanding.

## Forked Vale scripted objective-path checks

The scenario designer's mirrored two-client playthroughs reported these
wall-clock checkpoints. The scenario runner's `elapsedSeconds` is measured
with `Date.now()` from test-process start, including startup and waits; it is
not the in-game clock or match duration.

| Checkpoint | Azure wins | Ember wins |
| --- | ---: | ---: |
| Both teams deposited food and wood | 18.3 s | 18.4 s |
| Both completed a Barracks and trained one infantry | 51.4 s | 51.5 s |
| The two signals had opposing owners | 75.7 s | 75.8 s |
| The central Watch was verified locked | 86.5 s | 86.2 s |
| Winner recaptured the second signal | 100.5 s | 100.6 s |
| Hold victory | Before the 139.7 s stress checkpoint | 138.8 s |

The Ember win also verified that the victory result attributes the central
Watch after the 20-second hold. In the Azure run, a later 2,000-unit reset
showed 820 Azure and 1,000 Ember units moving more than 0.5 units toward
separate fords in the observed state.

These are cooperative scripted rules playthroughs: one team deliberately
withdraws so the other can win, and there is no contested combat. They
support the opening, objective-order, and both-seat checks but cannot
establish the intended 6–10-minute contested match length, opening win
rates, human comprehension, or 2,000-unit sustained performance. Outside
player sessions remain to be measured.

### Brief and rematch-reset follow-up on map PR #28 (`bbfdc81`; merged as `8d5858f`)

After adding explicit reset assertions and updating the map-picker brief, the
scenario owner reran `node scripts/forked-vale-scenario.mjs 0` and
`node scripts/forked-vale-scenario.mjs 1` on the map branch. Both winner
assignments passed, including a reset observed by both seats that restored
neutral objectives and the authored 24-unit opening army. PR #28 was later
squash-merged into `main` as `8d5858f`, now included in `322e68e`.

| Checkpoint | Azure wins | Ember wins |
| --- | ---: | ---: |
| Both teams deposited food and wood | 18.4 s | 18.3 s |
| Both completed Barracks and trained one infantry | 42.1 s | 41.9 s |
| Opposing Signal ownership | 66.5 s | 66.3 s |
| Watch remained locked through 15 snapshots | 77.4 s | 76.8 s |
| Winner recaptured the other Signal | 91.6 s | 91.4 s |
| All-zone hold victory | 130.5 s | 130.2 s |
| Independent QA rerun · all-zone hold victory | 129.9 s | 129.2 s |

The first pair is the map owner's run; the second is QA's independent rerun
of the same `bbfdc81` scenario branch. The wall-clock values varied by 0.6 s
for the Azure-winner path and 1.0 s for the Ember-winner path across runs.
This test did not include `--stress`. Both winner assignments passed the
objective sequence, 20-second hold, and two-seat reset. Since the logger
records harness wall-clock time, neither pair measures in-game pacing or
indicates a seat-speed advantage. The runs are cooperative paths without
contested combat and do not establish strategy balance.

## Combat-order fairness diagnostic

On merged `main` at `158578b`,
`node scripts/infantry-seat-combat-scenario.mjs` isolated an eight-infantry
attack-move fight on Forked Vale with workers parked away and fog disabled.
Across both spawn orientations and both command send orders, Azure had five
survivors when Ember first fell to three. Azure/Ember remaining HP was
340/260 with Azure spawning left and 370/300 with Azure spawning right.
An isolated control that reversed the server's first per-unit simulation
pass flipped one fixture to Azure 3/280 HP versus Ember 6/570 HP. This
implicates processing order but does not isolate damage application from
target acquisition or movement.

The script's default mode records all four outcomes; `--single` runs one
case quickly, and `--expect-parity` asserts at most one survivor and
100 HP difference in each case for post-fix regression checks. These are
controlled protocol fights, not player win rates. The original results
blocked roster tuning until the combat-order fix passed the mirrored check.

## Merged-baseline retest · `f1d6482`

The following two-seat protocol scenarios ran locally on macOS arm64 with
Node 24.9.0. They establish repeatable fixture outcomes; they are not human
match results or hosted-network evidence.

### Worker-versus-infantry counter

`node scripts/worker-combat-scenario.mjs` passed both team assignments from
100 HP starts. With Azure's worker facing Ember infantry, the infantry won
with 60 HP left; after swapping roles, Azure infantry also won with 60 HP
left. This confirms the intended direct-combat counter on both seats for this
fixture, without establishing worker survival or raid value in a full match.

### Combat parity

`node scripts/infantry-seat-combat-scenario.mjs --expect-parity` passed all
four 8v8 infantry attack-move cases. Each resolved at 12.3 seconds. The
small survivor/health edge followed spawn side and reversed with the sides;
reversing command send order did not change a result.

| Azure spawn side | Command order `[0,1]` | Command order `[1,0]` |
| --- | --- | --- |
| Left | Azure 3 survivors / 300 HP; Ember 4 / 350 HP | Azure 3 / 300 HP; Ember 4 / 350 HP |
| Right | Azure 4 survivors / 350 HP; Ember 3 / 300 HP | Azure 4 / 350 HP; Ember 3 / 300 HP |

The first combat implementation gave Azure 5 survivors versus Ember's 3 in
all four cases. The merged result removes that team-identity advantage in
this fixture; it does not establish balanced strategy or human win rates.

### Forked Vale production opening

Run:

```sh
RTS_OPENING_MAP=maps/forked-vale.json RTS_OPENING_BUILD_X=21.5 node scripts/opening-production-scenario.mjs --expect-builder-parity --verbose
```

This ran two 24-unit rounds with 4 workers, 8 infantry, 150 food, and 250
wood per team. Round one assigned Azure a Barracks and Ember an Archery
Range; round two swapped those assignments. The earlier QA-003 measurement
was 20.5 s versus 11.1 s for mirrored Forked Vale builds. On `f1d6482`, each
of the four builds completed at 10.9 s. First infantry appeared at 23.0 s and
the first archer at 18.0 s, regardless of seat. At 10 s, both assigned
builders on each side were still building and construction progress was
0.915–0.918.

After the first unit, the Barracks opening had 100 food / 75 wood and the
Range opening had 125 food / 55 wood on either seat, matching the configured
costs. The five-second reinforcement timing difference follows the existing
12-second infantry and 7-second archer training rules. This scripted result
does not justify changing either unit's cost or training time; compare these
openings in contested human matches before tuning.

## Revalidation on merged main · `322e68e`

After PR #24's performance ledger and PR #28's map brief/reset change merged,
I reran the required combat and opening fixtures against a clean archive of
current `main` at `322e68e`. The changes since `f1d6482` are documentation,
Forked Vale map metadata, and authoring/scenario scripts; `server.mjs` is
unchanged. The production-opening runner is from this PR, pointed at the
current-main server and Forked Vale map.

- `node scripts/worker-combat-scenario.mjs` passed both role assignments:
  infantry beat workers with 60 HP remaining for the winner in either seat.
- `node scripts/infantry-seat-combat-scenario.mjs --expect-parity` passed all
  four 8v8 cases at 12.3 seconds. The 3/4-survivor and 300/350-HP edge still
  followed spawn side; reversing command order did not change outcomes.
- The `scripts/opening-production-scenario.mjs` runner from this PR passed
  with `RTS_SERVER_ROOT` and `RTS_OPENING_MAP` pointed at a clean archive of
  current `main` and its Forked Vale map, and `RTS_OPENING_BUILD_X=21.5`:

  ```sh
  node scripts/opening-production-scenario.mjs --expect-builder-parity --verbose
  ```

  All four swapped Barracks/Range builds completed at 10.9 seconds; first
  infantry appeared at 23.0 seconds, first archer at 18.0 seconds, and
  post-unit stocks were 100 food / 75 wood for Barracks and 125 food / 55 wood
  for Range on either seat.

These current-main local protocol checks confirm the merged map metadata did
not change the measured combat counter, seat parity, or opening economy. They
still do not measure contested human pacing or strategic win rates.

## Historical main snapshot recheck · `4930a81` (25 September 2026)

These ordinary local protocol checks ran from a clean checkout at
`4930a818f1b17bcb180882acd2ea5601a9d89738` with Node `v24.9.0` on macOS
arm64. The recorded process wall times are not in-game duration or performance
measurements. Main later advanced to `2871a43`; a post-#63 QA combat recheck
is recorded below. The intervening commits add
UI resource callouts, audio settings, PvE worker-gathering behavior, and the
finite-resource scenario harness. They do not change the core server combat or
economy rules or map files exercised here. These manual two-seat fixtures do
not evaluate the new PvE opponent behavior or the finite-resource reset flow.

### Combat seat parity

`node scripts/infantry-seat-combat-scenario.mjs --expect-parity` passed all
four 8v8 attack-move cases at 12.3 in-game seconds. With team 0 spawning left,
team 0 finished with 3 survivors / 300 HP and team 1 with 4 / 350 HP. With team
0 spawning right, the result reversed to team 0 with 4 / 350 HP and team 1 with
3 / 300 HP. Reversing command order changed neither result. The small edge
followed spawn side, not team identity.

The full output is retained as a task-local file at
`/private/tmp/rts-balance-seat-parity-4930a.log`, SHA-256
`e317187ac48e85b777edbf0be58146ce4daa1c431d77aa43033a18db0c911a6c`. The
log is not checked into this repository.

### Production opening

The run command was:

```sh
RTS_OPENING_MAP=maps/forked-vale.json RTS_OPENING_BUILD_X=21.5 node scripts/opening-production-scenario.mjs --expect-builder-parity --verbose
```

It passed two 24-unit rounds with 4 workers, 8 infantry, 150 food, and 250 wood
per team. Round one assigned team 0 a Barracks and team 1 an Archery Range;
round two swapped those assignments. All four builds completed at 10.9
seconds. The first infantry appeared at 23.0 seconds and the first archer at
18.0 seconds on either seat. After the first unit, Barracks stocks were 100
food / 75 wood and Range stocks were 125 food / 55 wood on either seat. At 10
seconds, both assigned builders per team remained at work, 0.5 units from the
building edge, with progress between 0.912 and 0.918.

The full output is retained as a task-local file at
`/private/tmp/rts-balance-opening-production-4930a.log`, SHA-256
`bdc0a924b63008e2e045d7066041dea1152427b1495b8eafa2a31a62ac09eb1c`. The
log is not checked into this repository.

### Equal-cost worker counter

PR #50 added `scripts/worker-squad-combat-scenario.mjs`. Its exact candidate
`54463ecb7440e9cf4ba4ad4ad23a8bdca09bb971` ran against clean server baseline
`e3d3268b91724224be5ad38b5ba9ad7e25eea690`, using
`maps/forked-vale.json` with SHA-256
`8e0105cbf0b6dcda04781f6798fbcff92ade2421b6247f49eeaa8b4c6ac23c4a`.
All eight combinations of spawn side, worker seat, and command order passed.
Four workers were eliminated by four infantry, which finished with three
survivors and 280–284 HP. Both groups cost 200 food at 50 food per unit. This
supports the intended direct-combat counter in this fixture; it does not
measure raids, worker survival across a full match, or player win rates. The
run output was not retained as a file; QA was told to classify it as an owner
run, not an independent QA artifact. No combat-server or map files changed
between baseline `e3d3268` and current main `4930a81`.

### Post-#63 QA combat recheck · `fcc7bcac` (26 September 2026)

QA reran `node scripts/infantry-seat-combat-scenario.mjs --expect-parity`
on local main commit `fcc7bcac99bb3115e36e9a5cdf83545f35472c17`, using
Forked Vale with eight infantry per side, workers parked, and fog disabled.
All four fights resolved at 12.3 in-game seconds. With team 0 spawning at
`x=-7`, the left side finished with 3 survivors / 300 HP and the right side
with 4 / 350 HP. With team 0 spawning at `x=7`, the right side again finished
with 4 / 350 HP and the left side with 3 / 300 HP. Reversing command send
order changed neither result. The edge followed the +X/right side, not team
identity.

Each result remains within the fixture's `--expect-parity` bounds of at most
one survivor and 100 HP difference. Classify this as a repeatable,
within-threshold fairness signal, not a parity failure or a reason to tune
unit stats. The scenario output does not record first target acquisition,
first attack, or route-arrival timing; those would need test telemetry before
attributing the edge to a server mechanic. Same-tick combat damage is already
applied as a batch.

The handoff associates the result with the retained JSON at
`/private/tmp/rts-balance-seat-parity-4930a.log` (SHA-256
`e317187ac48e85b777edbf0be58146ce4daa1c431d77aa43033a18db0c911a6c`). The
JSON does not embed the source commit, so the run-to-commit association comes
from QA's report. Current `main` is `6a56cef`; the combat code, Forked Vale
map, and scenario are unchanged from `fcc7bcac`. The last production-opening
run remains `4930a81`; the tested map, runner, and relevant economy logic are
unchanged through `6a56cef`, but no post-#63 opening rerun is claimed here.

## Fresh owner rerun on merged main: `30d5dc3` (26 September 2026)

Both fixtures were run from a clean disposable checkout at
`30d5dc353c49387bacdd05ef6afb1500c9519555`, using Node `v24.9.0` on macOS
arm64.

### Combat seat parity

`node scripts/infantry-seat-combat-scenario.mjs --expect-parity` passed all
four 8v8 attack-move cases at 12.3 in-game seconds. Team 0 spawning left
finished with 3 survivors / 300 HP against team 1's 4 / 350 HP; swapping the
spawns reversed those results. Both command orders produced the same result.
The repeated edge follows the +X/right spawn and remains within the fixture's
limits of one survivor and 100 HP. This was an owner-run local reproduction,
not an independent QA run or a human contest.

### Forked Vale production opening

```sh
RTS_OPENING_MAP=maps/forked-vale.json RTS_OPENING_BUILD_X=21.5 \
  node scripts/opening-production-scenario.mjs --expect-builder-parity --verbose
```

It passed both 24-unit rounds with 4 workers, 8 infantry, and 150 food / 250
wood per team. The Barracks and Range each completed at 10.9 seconds from
either seat. The first infantry appeared at 23 seconds and the first archer at
18 seconds, whichever seat received that building. Both assigned builders
remained in work range and contributed. Post-unit stocks were 100 food / 75
wood for Barracks and 125 food / 55 wood for Range on either seat.

This owner-run reproduction confirms the prior fixture results on current
main. It does not measure contested human pacing, route choices, or strategic
win rates.

## Equal-cost worker squad recheck on merged main: `c931e69` (26 September 2026)

The exact-source fixture was run from a clean checkout with:

```sh
RTS_BASELINE_COMMIT=c931e692f000d9567de4ff459595605190f9d020 \
  node scripts/worker-squad-combat-scenario.mjs
```

The harness and server source both matched `c931e69`; Node was `v24.9.0` on
macOS arm64.
It used the tracked Forked Vale map (SHA-256
`8e0105cbf0b6dcda04781f6798fbcff92ade2421b6247f49eeaa8b4c6ac23c4a`), a
24-unit roster, four workers against four infantry, and disabled fog. Both
groups cost 200 food at 50 food per unit.

All eight combinations of spawn orientation, worker seat, and command order
passed. The workers were eliminated in 15.6–16.4 in-game seconds; the infantry
finished with three survivors and 280–284 HP. The winner did not change with
seat assignment or command order. The 4 HP spread followed the right-hand
spawn; it is far below the 100 HP tolerance used by the 8v8 seat-parity
fixture. This confirms the direct infantry counter in this group fixture; it
does not measure worker raids, objective capture, or human match value.

## Contested worker diversion and build follow-up on main: `a3426c1` (26 September 2026)

The new exact-source harness is
[`scripts/balance-contested-worker-opening-scenario.mjs`](../scripts/balance-contested-worker-opening-scenario.mjs).
It ran against clean server commit
`a3426c1271eabb4b8d8c2097d6ae7659d9972951` with the tracked Forked Vale map
(SHA-256 `8e0105cbf0b6dcda04781f6798fbcff92ade2421b6247f49eeaa8b4c6ac23c4a`),
Node `v24.9.0`, macOS arm64, a 24-unit army, 150 food / 250 wood per team, and
fog disabled. The split sent five infantry north, three infantry and two
workers south, and one of its remaining workers to each resource. The response
sent five infantry on attack-move to the south and all four workers to gather.
The four-case matrix swapped split seat and command-send order. Commands were
sent in a burst before waiting for acknowledgements, avoiding the deliberate
tick-scale wait between commands that a serial-ack harness would introduce.

Reproduce from a clean harness checkout and a separate clean server checkout:

```sh
RTS_CONTEST_SECONDS=40 \
RTS_BASELINE_COMMIT=a3426c1271eabb4b8d8c2097d6ae7659d9972951 \
RTS_SERVER_ROOT=/private/tmp/rts-balance-server-a3426c1 \
  node scripts/balance-contested-worker-opening-scenario.mjs
```

The latest four-case matrix reproduced the same strategic outcome. The split
side captured North at 24.3–24.4 seconds; South remained neutral through 40
seconds. First damage appeared at 15.2–15.8 seconds and the first diverted
worker died at 17.5–19.8 seconds. All three southern split infantry and both
diverted workers died. On `a3426c1`, the response finished 4 / 310 HP and 3 /
300 HP on the right, and 3 / 230 HP in both left-side command orders. All four
cases are within the equal-force fixture's one-unit and 100 HP bounds. Two
earlier batched matrices on `6aa39fa` had one 2 / 130 HP left-side result
against the right's 3 / 300 HP; that 170 HP difference did not recur on
`a3426c1`. Treat it as unconfirmed run-to-run variation in this unequal-group
attack-move scenario, not a stable parity failure or unit-stat tuning result.
The fixture does not yet record per-unit target acquisition, first attack, or
route-arrival timing.

At 40 seconds, the split side's bank had risen by 95 food / 70 wood, of which
North's capture awarded 75 food / 50 wood. After subtracting that objective
award and adding cargo still held by workers, its two surviving gatherers had
harvested about 23 food and 22–23 wood. The response's four workers had
harvested about 45.3 of each resource. Both clients reported identical bank
values. This corrects for the capture bonus and for resources still in transit.

Immediately after the 40-second contest, both teams ordered every surviving
worker to build a Barracks at mirrored sites. The split had two workers left;
the response had four. Both could pay the 175-wood cost. The two-worker build
completed 11.7 seconds after the checkpoint; the four-worker build completed
in 7.0 seconds, a 4.7-second gap including the workers' walk back from their
resource nodes. These are scripted post-contest times, not observed human
opening choices.

The first batched matrix used harness commit
`ded3923f8944587ee1764263ce90e5b967cd1b7c` and is retained at
`/private/tmp/rts-contested-opening-40s-batched.jsonl` (SHA-256
`1d5afbd642edd65fce331eadba8245f637aeed8dc8656370d07e97689cb1cd86`). The
second, with the Barracks follow-up, used harness commit
`7100feb3d643c86145a578ae540de51e2c08f37e` and is at
`/private/tmp/rts-contested-opening-build-40s.jsonl` (SHA-256
`82f4e28111665e1742d12f52b9644cc64b730dc31fbaf496f39bde7195005d5c`). The
latest-main rerun used harness commit `d0e61e9067816883eacef9c078794dd8aecfe30c`
and is retained at `/private/tmp/rts-contested-opening-build-40s-a3426c1.jsonl`
(SHA-256 `b9fc908070e11d2c96c3ca93ba9bcca7d54dd43ded80d6c0fbff8d9df9fe451e`).

## Current tuning decision

The direct equal-cost worker-counter fixture and the 8v8 combat-parity fixture
remain their own baselines. The current-main contested split supports a
measurable worker loss, objective reward, harvest gap, and post-contest build
delay. The earlier above-bound HP outlier did not recur on latest main; the
current 70–80 HP right-side edge is within the existing parity bound. First-
attack and arrival timing could explain that remaining gap. No human match has
established which opening wins or whether the objective reward compensates for
the long-term worker loss.

## Next tuning decisions

- The next Balance-lane proof is a contested two-seat human match on a current
  build, supporting M1 and M4. Record the build SHA, both seats' first gather, build,
  first reinforcement, first contest, and win times, plus the chosen openings
  and player explanations. Collect first-attack and arrival timing if the
  contested fixture's left-seat spread repeats; do not adjust unit stats from
  this uneven-group run alone.
- When the 160 × 160 Frontier pilot is playable, compare observed two-seat
  matches from both seats. Start with the [static map audit](map-scale-density.md#what-to-measure-while-building)
  for initial stock and path geometry. Then record first meaningful contact,
  first expansion, resource stock and use by region, objective travel from each
  spawn, and the routes players choose. Check whether each seat can still use two distinct
  viable routes to expand or contest. Use those match timings and outcomes to
  evaluate the existing 15-minute scenario deadline and other compact-map
  timers; change them only when observed pacing shows they no longer fit,
  rather than carrying compact-map timing over mechanically.
- When the Highland Grove pilot is playable, compare coffee-grove control
  with ordinary economy/objective openings from both seats. Record first
  control, harvest/exchange totals, route and protection choices, whether the
  first control snowballs, contest/win times, and player explanations. Treat the
  experiment's proposed trade values as hypotheses, not tuning commitments.
- Treat the elevation prototype's 15% one-level uphill edge cost as a trial
  value. Verify it changes clear routes as well as A* detours: current main
  returns an unobstructed Manhattan route before running A*, so weighted
  terrain must account for that shortcut. For sight, I recommend a fixed
  8.5-cell radius on elevated sources as the first small trial, with no
  per-level or per-unit stacking. Current 8-cell sight covers 197 grid cells;
  8.5 covers 225 (about 14% more), while 9 covers 253 (about 28% more), before
  blockers. Compare visibility and first contact from both seats; treat the
  values as experiment settings, not balance findings.
- In contested matches, record worker losses, raids, and the response that
  punished or protected the economy. Keep the equal-cost 4v4 fixture as a
  regression; change worker damage only if workers substitute for infantry or
  raiding erases the economy too easily in match evidence.
- Compare first reinforcement and income timing for Barracks and Range
  openings in contested human matches. The scripted builder fixture completes
  symmetrically; adjust one cost or time at a time only if match evidence
  supports it.
- If objectives resolve before armies and economy matter, adjust capture
  prerequisites, hold time, or map routes in the authored scenario. Preserve
  an understandable ending and a reason to leave the base.
