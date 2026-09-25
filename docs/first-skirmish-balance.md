# First 1v1 skirmish balance ledger

Status: early tuning; merged-baseline evidence retested at `f1d6482` on
25 September 2026. This is a test plan and evidence record, not a claim that
the skirmish is balanced. Scope follows the
working Game Bible and RTS Feature Coverage Inventory, maintained by the
product team: one complete invite-first 1v1 scenario with a small roster.
Large armies remain a separate stress workload.

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

## Next tuning decisions

- Measure worker losses and 4v4 worker-vs-infantry fights in the authored
  scenario; adjust damage again if workers remain a substitute for infantry
  or early raids erase the economy too easily.
- Compare first reinforcement and income timing for Barracks and Range
  openings in contested human matches. The scripted builder fixture now
  completes symmetrically; adjust one cost or time at a time only if match
  evidence supports it.
- If objectives resolve before armies and economy matter, adjust capture
  prerequisites, hold time, or map routes in the authored scenario. Preserve
  an understandable ending and a reason to leave the base.
