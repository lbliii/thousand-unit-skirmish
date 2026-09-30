# QA and external playtests

[Documentation index](README.md) · [Testing commands](testing.md) · [Roadmap](roadmap.md)

## Evidence standard

Record the source commit or deployed build, map, seats/seeds, environment,
steps, expected result, actual result, and evidence location. Keep credentials
out of reports. A local scenario pass does not establish browser behavior,
hosted capacity, or player comprehension.

`P0` blocks the first external playtest; `P1` blocks declaring the slice complete.
The matrix defines acceptance, while dated records below describe actual runs.
Recheck a relevant gate after changes rather than carrying forward a blanket pass.

## Match evidence to the claim

| Claim | Minimum supporting record |
| --- | --- |
| A rule is implemented | Source revision and a focused reproduction or regression result. |
| An asset is integrated | Loader and packaged paths, plus the relevant state selection check. |
| A build works when hosted | Deployment identity and direct readiness, asset, WebSocket, and seat observations. |
| A player understands the match | Uncoached session, interventions, result, and the player's explanation. |
| A large match meets a budget | Named hardware/network, fixed conditions, measurement method, agreed limits, and both-seat results. |

Use “not observed” when evidence is missing. Carry a historical result forward
only as a regression reference. P0/P1 classify playtest and slice acceptance;
ordinary PRs use checks proportionate to their changes under
[repository working rules](../AGENTS.md).

## Acceptance matrix

| Priority | Gate | Required observation |
| --- | --- | --- |
| P0 | Invite and isolation | Two players enter the same room, claim opposite seats, and share state; another room stays independent. |
| P0 | First glance | A newcomer identifies team, objective, route, selection, and move controls within two minutes without coaching. |
| P0 | Complete match | Both seats gather, build, train, contest objectives, and reach the same winner/reason. |
| P0 | Fair construction | Mirrored two-worker Barracks/Range openings complete within two seconds of each other. |
| P0 | Combat authority | Mirrored equal-force fights pass the established seat/command-order bounds. |
| P0 | Result and rematch | Host sees a usable rematch action, guest understands the wait, and reset restores neutral objectives and usable commands. |
| P0 | Recovery | Each seat survives reload, temporary disconnect, and worker recovery; the other retains control. |
| P0 | Authoring | Host saves, exports, reloads, and plays a custom scenario; invalid maps name a fix. |
| P0 | Release | Mounted storage, access control, readiness, game assets, and HTTPS WebSockets work on the identified release. |
| P1 | Impaired network | A measured latency/loss profile causes no silent orders, divergent results, or unrecoverable seat loss. |
| P1 | Large match | 2,000 units meet agreed server, browser, bandwidth, and order-latency budgets on intended hardware. |
| P1 | Readability | Teams, roles, selection, health, resources, and objectives remain distinguishable at required zooms. |
| P1 | Audio recognition | Fresh players identify the five cue categories with caption/mix settings recorded. |
| P1 | Strategic understanding | Players explain one consequential decision and one alternative after a match. |

## Known findings and historical evidence

[Native browser match observation](qa-live-browser-2026-09-29.md) records the
owner-operated solo control loop and two-seat Forked Vale checks on staging
`28415d9`. It does not establish novice-player comprehension.

[Hosted scale collector verification](qa-hosted-scale-profile-2026-09-29.md)
records repeated 250/2,000-unit windows with tagged per-seat order intervals.
This verifies measurement tooling, not supported-scale performance.

[Core tranche readiness, 29 September](qa-core-tranche-2026-09-29.md) records
current-main hosted seat recovery, elimination/rematch, browser authoring/reload,
and opening captures at `12646d6`. Human play and supported-scale proof remain open.

[Mixed-role health readability](qa-unit-health-2026-09-27.md) records both-seat
prepared browser captures at ordinary and strategic zoom, including the missing
damaged-unit indicator and its fix. It does not establish human comprehension.

[In-flight browser recovery](qa-inflight-recovery-2026-09-27.md) preserves local
Ember production/research reconnect, accelerated terminal deadline, and rematch
screenshots from a prepared fixture. Research completion was not observed.

[Client-loading incident and hosted recovery](qa-client-boot-recovery-2026-09-27.md)
records the missing formatter module, its fix, and both-seat browser/authoring
verification on staging `469b97a`.

[Waypoint transport recovery](qa-waypoint-backpressure-2026-09-27.md) records
separate coalescing for owner queue metadata so a slow reader retains current
counts after snapshot and roster changes.


[Browser scale diagnostic](qa-browser-scale-2026-09-27.md) retains an 88 ms
long-task failure at `26eea9b` and the fixed-viewport attribution follow-up.
[Native opening-control checks](qa-opening-controls-2026-09-27.md) cover local
Azure gathering, placement, cancellation, and production in ordinary/narrow Firefox.

[Local checkpointed combat sample](qa-checkpoint-scale-2026-09-27.md) preserves
a verified bundle for three 2,000-unit attack-move windows. The adapter reports
passing existing local limits; hosted capacity and browser timing remain separate.

[Delayed connection evidence](qa-impaired-connection-2026-09-27.md) covers both
seats recovering accepted and undelivered orders through 40 ms one-way TCP
delays and forced resets. Packet loss and hosted congestion remain unmeasured.

[Hosted browser and Map Studio evidence](qa-staging-browser-2026-09-27.md) records
both-seat publishing/reload and captured host-editor/Ember-opening appearance at
`bcd5fec`. Full construction, zoom, and human comprehension checks remain.

[Integrated core staging evidence](qa-integrated-core-2026-09-27.md) records
authenticated assets, both-seat reconnect, map persistence, elimination, and
rematch on deployed source `8b6bcbb`. Human match and supported-scale proof
remain outstanding.

| ID | Finding | Recorded disposition |
| --- | --- | --- |
| QA-001 | Guest was told to reset despite lacking permission. | Fixed and observed on an earlier two-browser build; retain result/rematch regression. |
| QA-002 | Some 2,000-unit runs exceeded the 100 ms maximum-tick diagnostic ceiling. | Open measurement question; host contention prevents causal conclusions. |
| QA-003 | Mirrored builders completed about ten seconds apart. | Later mirrored fixtures passed; preserve both-seat construction checks. |
| QA-004 | Layout probe predicted a result-card overlap. | Did not reproduce in the recorded 1280 × 600 browser run; test actual layouts after HUD changes. |
| QA-005 | Combat update order favored Azure. | Simultaneous damage and later parity checks address the original defect; current bounds still permit a small spatial edge. |
| QA-006 | Minimap ownership depended too heavily on hue. | Shape markers were added; human recognition still needs observation. |
| QA-007 | WebSocket origin validation through the proxy. | Fix and no-state checks recorded; retain direct/proxy regressions. |

Detailed reproductions and original dispositions are in the
[archived QA ledger](archive/2026-09/qa-vertical-slice.md).
The [25 September](qa-checkpoint-2026-09-25.md) and
[26 September](qa-checkpoint-2026-09-26.md) checkpoints preserve deployment and
browser evidence. The [balance summary](first-skirmish-balance.md) and
[performance baseline](performance-reliability-baseline-2026-09-25.md) retain
measured limits. None is a live service-status page.

[In-range building attack evidence](qa-ranged-building-attack-2026-09-27.md)
records a paired-seat regression and pinned 0 A.D. source research.

[Construction connectivity evidence](qa-construction-connectivity-2026-09-27.md)
records island placement, route preservation, and Town Center occupancy checks.

[Archer approach evidence](qa-archer-firing-approach-2026-09-27.md) records
firing positions across water, navigation repair, and authority/visibility checks.

[Building range-boundary repair evidence](qa-building-range-repair-2026-09-27.md)
records both seats retaining valid attacks through unrelated construction.

[Production lifecycle evidence](qa-production-lifecycle-2026-09-27.md) records
producer/builder death and population reservation release at both seats’ caps.

[Contested solo-policy evidence](qa-pve-contested-2026-09-27.md) records two active
policies on unmodified Forked Vale with combat, losses and production.

## Repeatable run sheet

1. Identify the build, device, browser, server, map, roster, and network profile.
2. Run the relevant [repository scenarios](testing.md) and retain logs.
3. Use two browser profiles and a disposable invite room on HTTPS. Exercise both
   seats' orders, authoring, reload/reconnect, victory, and reset.
4. Repeat under a controlled network profile. The earlier plan proposed about
   80 ms RTT and 1% packet loss; record the actual impairment tool and measured
   conditions rather than assuming browser throttling simulates packet loss.
5. Record each failed order with seat, time/token, expected result, and response.
6. Mark a defect fixed after its original reproduction and paired-seat regression pass.

For deployed checks, inject service variables through `railway run`:

- `node scripts/qa-staging-smoke.mjs <HTTPS-origin>` creates an invite room by
  default. `--room-id=<closed-QA-room>` reuses a disposable room; `--stress` adds
  a bounded 2,000-unit workload.
- `node scripts/qa-staging-browser.mjs <HTTPS-origin> <QA-room-id>` checks two
  browser seats. `--author` publishes and reloads a map in that room.

These scripts exercise live service state. Use an explicitly designated test room.
Screenshots/logs must retain the build and the script's scope.

## Lightweight external playtest protocol

Use two pairs of newcomers. Give each pair the URL, credentials, and room invite.
Observe without coaching except to recover a broken test; log any intervention.
Swap Azure/Ember for the second match.

| Moment | Record |
| --- | --- |
| First two minutes | Time to identify team, objective, route, selection, movement, and help; exact confusing wording. |
| Opening | First gather, completed building, trained unit, and resource stall. |
| Mid-game | First contest, response, misfires, unclear feedback, routes, and attempted plans. |
| Ending | Duration, winner/reason on both screens, explanation, and time to rematch. |
| Recovery | Reload one tab, then separately interrupt it for ten seconds; record reclaim time and both screens. |
| Exit | “What were you trying to do?”, “What decided the match?”, “What else could you try?”, “What was confusing?” |

A qualifying session includes a completed match, understood result, and rematch
without developer intervention. Record failures even when players eventually succeed.
Keep balance observations in the same record: timings, stock/cargo, losses,
production, routes, and player explanations. The balance owner can retrieve that
record without routine cross-task reports.

On Forked Vale, watch the five-infantry versus three-infantry/two-worker split.
Record what the defender does, whether both Signals fall, and the economic cost
of worker diversion. Scripted capture timings do not establish human strategy.

## Meshy forest checkpoint — 2026-09-26

On base `d27ce33`, `maps/meshy-resource-review.json` with `?meshyResources=1`
shows the captured oak, pine, and berries around a base clearing with 394 blocked
forest cells. The owner inspected the checkpoint in the browser at gameplay view;
no browser warnings/errors were reported. Default art remains behind the existing
path when the query flag is absent. The earlier local composition also included
Worker v3 from the separate character task; those assets are not in this checkpoint.

All 24 source frame hashes, transparent alpha ranges, atlas cells, and runtime WebP
images were checked. All runtime frames returned HTTP 200 with WebP MIME; manifest,
capture-page, and mismatched-family requests were denied. Client asset allowlist,
Railway release scenario, syntax, documentation links, and whitespace checks passed.
The standalone capture script's help/import path was checked; its extracted renderer
was used for the original captures, but a full GLB rebake was not repeated here.

This is an art review checkpoint. Harvesting still switches to the existing depleted
art. Unit readability, exact camera-elevation alignment, and resource lifecycle art
remain subsequent work. See the pack's `preview/README.md` for the startup command.

## Cast clipping recovery — 29 September 2026

Candidate on `codex/recover-complete-cast-poses`: all four v0.3 packs retain 264 complete original poses with zero held frames. Pixel bounds/contracts/input hashes pass; four extraction regressions pass. Project-owned capture `run_1790723343810_2e2444cbebc242cd9f6973389ef5c5d3` completed successfully: 1,056 pose configurations per species (4,224 total), eight headings, idle/walk/gather/defeat, both teams, zoom 1 and 0.48. Every species has visible opaque pixels in each configuration; no pose touches the diagnostic viewport edge and pose clocks agree across species. Ground compositing found zero clipped opaque pixels (maximum channel error 1.016). Sixteen decoded captures include Meadow/Cinder match views and representative action poses. This proves bounded appearance behavior in the offscreen renderer, not hardware performance or final art quality. The historical v0.2 hold fallback is superseded by extraction from the original directional sheets.

## Gameplay foundation local evidence — 2026-09-29

On `codex/foundation-storehouse` (base `08a77a6`, Storehouse slice `2ef0805`),
`storehouse-scenario.mjs` proved both-seat construction costs, nearest reachable
friendly drop-off selection after restart, food/wood deposits, destruction
rerouting and retained cargo. `worker-cargo-return-scenario.mjs` retained exact
six-wood deposits for both seats on Highland Grove. The full PvE WebSocket smoke
passed both bot seats. A 300-second bounded Forked Vale contested run on the subsequent lifecycle
working tree, before the AI repair policy addition, finished at 238 seconds
with Azure winning; both policies built a remote Storehouse and used
Infantry/Spearman production. This is local authoritative protocol evidence,
not a claim of human staging usability or final balance.

On the subsequent `codex/foundation-base-lifecycle` working tree,
`base-lifecycle-scenario.mjs` proved both-seat half-foundation refunds, missing-HP
repair spending, interrupted repair recovery, zero-wood pause/funded recovery,
active/pending military and Worker cancellation, canceled research, and persisted
remaining reservations. Unit/VM checks cover ownership, replay rejection, refund
fractions, focused contextual controls and AI repair deduplication. Full PR CI and
native staging checks remain the integration evidence to collect.

### 2026-09-29 — Town Center expansion owner checks

Local authoritative `town-center-audit` (64×64, no fog, 24 starting units,
1,000 food/wood per seat), `scripts/town-center-scenario.mjs`: both seats placed
five-cell expansions for exactly 100 food / 400 wood; completed expansions raised
capacity from 15 to 20. Home and expansion Worker queues reserved independently,
restarted and produced four total Workers without another debit. Enemy attacks
destroyed both homes; surviving armies/expansions retained the match and could
reserve replacement Workers. Own production options were withheld from the other
seat's no-fog snapshot. Both-seat AI cases cover bounded expansion, resuming its
foundation and replacing lost Workers at the surviving center.

Storehouse routing/runtime, production lifecycle, ruleset migration/preservation,
registry/profile validation, registry building menu, lifecycle UI and static
client module resolution also passed. These are focused local checks; staging
appearance, broader CI and defended-expansion balance remain separate evidence.

Expansion regression follow-up: terminal elimination exposed per-deposit rounding
that could change a depleted 50-food node's total by one millionth. Fractional
credits now retain their precision and collapse only floating-point noise near a
whole balance. The exact-stock elimination/reconnect scenario passed with 50
food, and all 132 pure/UI checks passed. The finite-node playthrough probe moved
outside immediate home deposit range so its existing intermediate-cargo check
can observe the return trip before banking; exact depletion/credit assertions
remain in place. Both-seat seeded PvE observation/economy/rematch smoke passed.

### 2026-09-29 — Watchtower defense owner checks

Local authoritative `watchtower-audit` (64×64, no fog, 24 units, 1,000 food/wood
per seat): both seats paid exactly 50 food / 150 wood; paused foundations did not
fire. Completed towers damaged only enemy units by eight per shot. Saved 0.8-second
cooldowns delayed the next attack by 24–25 ticks after restart. A one-HP tower and
an eight-HP Infantry attacking it both died from the same tick's lethal hits.

Focused targeting cases cover both-seat enemy selection, a 64-visit scan budget,
visibility filtering and inclusive seven-cell range. Sight cases cover expansion
from eight to ten cells, cache separation and opaque terrain blocking. Both-seat
AI cases build/resume one threatened-base tower and resume army production. All
137 pure/UI cases passed on the defense working tree before idle-scan backoff;
that small follow-up retains focused rerun and broader CI obligations. Siege
counter/balance and staging appearance proof remain part of subsequent evidence.

### 2026-09-29 — Shared combat owner checks

The shared formula preserved all existing unit-versus-unit damage and military
structure hits in registry cases. Focused cases exercised mounted-tag bonuses,
class-specific armor, the 0.5 minimum, ineligible targets, existing research scope,
stacking and cache invalidation. All 141 pure/UI checks passed on this working
slice. The authoritative 24-case lethal/cadence permutation test passed across
Worker/Infantry/Spearman/Archer and both seat/ID orders; Watchtower's exact damage,
saved cooldown and simultaneous unit/building trade also passed. Both-seat
ranged-building edge/placement repair retained continuous firing. Known-checkpoint
migration and incompatible-save preservation passed. Mounted production and
siege counter/progression proofs belong to the following F3 slices.

CI caught a unit-target pursuit eligibility regression in the shared-combat slice:
the attack-move replanner looked up a building definition for a unit. The check
now uses the unit's attack capability and target unit definition. Both-seat
`cliff-pursuit-scenario.mjs` passed in direct and attack-move modes, including
lateral pursuit, unreachable retreat and acquisition of a reachable alternative.

### 2026-09-29 — Stable and mounted owner checks

Local `roster-options-audit` (64×64, no fog, 20 starting units, 1,000 food/wood
per seat), `roster-options-scenario.mjs --mounted`: both seats built Stable and
queued Scout/Rider/Scout. Exact spending left 835 food and 715 wood per seat.
Paid mixed FIFO queues and enemy privacy survived restart, all three products
completed without another debit, trained Scouts survived a second restart, and
rematch reset the roster. Authored timed Scout reinforcements resolved for both
seats. Schema-17 ruleset pinning/migration and rejected-save preservation passed.

The lethal/cadence permutation scenario passed 36 same-role cases including Scout
and armored Rider; six full-health mixed-role duels confirmed Spearman over Rider,
Rider over Worker, and Worker over Scout in both seats. All 150 pure/UI checks
passed, including weighted Stable population controls, mounted health indicators
and bounded observed-threat AI responses. Strategic LOD state checks passed.
Broader CI, real AI recovery, staging appearance, reconnaissance routes and mounted
raids across representative terrain remain separate integration evidence.

Mounted AI recovery follow-up: seeded Forked Vale loss recovery passed for Azure
(winner 0, tick 5,070, three builds, eight trained units) and Ember (winner 1,
tick 6,090, four builds, ten trained units), with one-Stable and existing per-role
construction bounds. Mounted CI also exposed a stale schema-16 assertion in the
legacy producer-destruction fixture; its expected migrated schema is now 17.

### 2026-09-29 — Bounded progression owner checks

Local `progression-audit` (64×64, no fog, 20 starting units, 1,000 food/wood each):
both seats built Barracks/Stable, rejected armor before Tier II without spending,
and researched Tier II at their home. Active Tier II survived a restart with its
remaining duration; completion enabled armor. A second simultaneous project was
rejected. Armor and mounted forging completed with exact final balances of 580
food / 275 wood per seat; all three completions survived another restart and reset
on rematch. Enemy legal research options stayed private on the no-fog map.

The first restart run exposed a validator that searched only constructed buildings
for active research. Validation now also accepts the matching surviving home and
the complete both-seat scenario passed. Ruleset migration/rejected-save preservation
passed. All 158 pure/UI cases passed, covering availability, scoped armor/weapon
effects, cached completion reset, focused registered HUD choices and reserve-aware
AI acquisition. A fresh local server served all 33 browser import dependencies,
including the shared research module. Full CI, staging and representative matches
remain integration evidence rather than inferred from these focused checks.

### 2026-09-29 — Workshop and siege owner checks

Local `roster-options-audit` (64×64, no fog, 12 starting units, 1,500 food/wood
per seat), `roster-options-scenario.mjs --siege`: both seats rejected Workshop
before Tier II, rejected engine production before siege engineering, completed
both projects and reserved three engines at three population each. Exact paid
balances were 910 food / 470 wood per seat. Queues survived restart, all engines
completed without another debit, completed units reloaded, rematch reset the
roster and authored siege reinforcements resolved for both seats.

Local `siege-defense-audit` (64×64, no fog, 24 units): engines placed at the
outer eight-cell structure firing edge dealt 48 per hit and demolished full-health
1,200-HP towers after 25 shots; engines retained 90 HP. Engines exposed six cells
from tower centers died before demolishing the towers. Forty-two same-role lethal/
cadence cases and eight full-health mixed-role trades passed; Rider defeated engine
in both seats with 112 HP left. All 165 pure/UI tests passed, together with strategic
LOD, generic selection composition and ruleset migration/rejected-save preservation.
AI cases cover one Workshop, unlock acquisition, two-engine bounds, visible-defense
assault, separation from ordinary army orders, stalled retry and release of lost
targets. Full CI, live AI defended-position/terrain interactions and staging visual
checks remain integration work rather than inferred from these focused cases.

### 2026-09-29 — Reconnaissance and mounted terrain interactions

Local `forked-vale-field-roles` on siege build `81bdd7c` plus the reconnaissance
slice retained Forked Vale's 80×64 terrain, resources, fog and objectives, with
24 starting units. Checkpoint fixtures isolated the roles; this is an automated
two-seat interaction check, not an unassisted human match. From both seats the
eleven-cell Scout revealed an enemy ten cells away that an ordinary eight-cell
Worker could not see. The Scout explored 490/488 additional cells, then retreated
when the other seat moved the visible enemy toward it. Three reconnaissance
orders were issued per seat and the Scout retained all 60 HP.

A Rider crossed the middle lane and damaged an enemy Worker. A timely Spearman
response killed the Rider while preserving the Worker at 45 HP and the Spearman
at 110 HP in both seats. `field-roles-scenario.mjs` passed. Focused policy checks
cover deterministic both-seat frontier selection, generation binding, exclusion
from ordinary army orders, retreat, bounded stalled retries and fully explored
fog. Room-supervisor recovery passed with owner-only research choices asserted
separately from public building state. CI, staging and live AI defended-position
evidence remain integration work.
