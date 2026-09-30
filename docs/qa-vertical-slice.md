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

### 2026-09-29 — Paid AI siege acquisition and slot reservation

`siege-ai-runtime-scenario.mjs` uses a 64×64 no-fog, 24-unit map with 3,000
food/wood per seat. Ordinary build commands pay for initial Barracks/towers;
checkpoint fixtures finish those foundations and hold ordinary armies stationary
to isolate AI acquisition and siege targeting. The filtered production policy
buys Tier II, constructs one Stable and Workshop, completes armor and engineering,
builds a House, and trains a Scout, two engines and a Rider. Weapon research also
completes. The tactical policy issues the engines' defense assault orders.

Final checks passed at ticks 6,870 (Azure) and 6,780 (Ember). Both engines retained
90 HP while the full-health opposing tower was demolished. The checkpoint food
and wood balances exactly matched registered costs for completed technology,
new buildings and new units. Both-seat regressions first reproduced ordinary
recruits consuming the last counter slots during pending engineering; reserving
two slots and planning for three-population engines fixes that failure. Fourteen
focused population/reconnaissance/siege tests, production budgets, tactical retry,
decision fairness, reinforcement and Barracks recovery passed. These are component
interaction proofs; representative full AI matches and staged gameplay checks
remain required for the complete foundation claim.

Staging deployment `9317fd73-3dae-425b-a6df-65a7a0bb9d15` succeeded at commit
`a2b57741e8c3866afad9709674b3d69dee7008d2`. The Railway smoke passed readiness,
authentication rejection/acceptance, client import delivery including shared
definitions/research and terrain blending, and authenticated WebSocket upgrade.
This proves packaging and transport; staged gameplay and rendered appearance
remain separate checks. Research PR #245, siege #246 and reconnaissance #247
are merged after all three CI shards passed for their respective heads.

### 2026-09-29 — Integrated AI match and contextual roster usability

On AI counter build `8c00a6a`, the full policies contested the unmodified fogged
Forked Vale map (24 units, 150 food / 250 wood per seat), seeds 20260925 and
4294967295. Azure won by objective hold after 161 seconds. Both seats built a
Barracks, trained reinforcements, fought and lost units; Ember added a Storehouse
and Azure began a Stable. Identical shadow policies reproduced every command
from the same observation trace. This is an integrated opening-to-victory proof;
the match ended before mounted/siege progression and does not prove those roles
in that particular match.

A native Firefox view of a fresh staging room exposed roster-wide disabled
training buttons in the empty-selection command bar. The contextual roster fix
keeps that bar specific to the selected producer and retains the full catalog in
Build & train. Local in-app browser checks at 1280×720 and 740×800 confirmed an
uncluttered empty selection, Town Center Worker/research controls and the complete
catalog with population readout. Flattening the nested building grid and giving
unit catalog buttons a minimum column width removed narrow-layout text overlap.
DOM inspection confirmed scrollable production content; eleven focused roster,
selection and HUD tests passed. CI and deployed verification of this fix remain.

### 2026-09-30 — Latest foundation staging deployment recovery

PRs #248 and #250 merged after all three CI shards passed for their respective
heads. Railway initially kept the older AI merge while removing the newer HUD
deployment. An explicit staging-only redeploy from source succeeded as
`fcc377e8-d3a5-40af-a878-437db4f5408c` at
`abce6567631a8658aa72798ccde7fe5949dd75b6`, which includes both foundation merges
and the subsequent forest-art merge #251. The Railway smoke passed readiness,
authentication, all discovered browser imports and authenticated WebSocket upgrade.
This establishes current packaging and transport; rendered appearance and staged
gameplay verification remain separate evidence.

The staged gameplay smoke also passed on that deployment using authored map
`qa-staging-muo04ti8` and a 250-unit fixture: invite creation, both human seats,
both-seat reconnect, authored-map save/reload, elimination victory and synchronized
rematch reset. This fixture validates integration and recovery rather than AI
expansion or a balanced combined-arms match.

### 2026-09-30 — Live deterministic AI expansion

The corrected expansion runtime scenario passed at `83b82ed`, completing both
seats' Town Centers by tick 4560. Each policy purchased its Barracks, remote
Storehouse and exactly one expansion through ordinary authoritative commands;
construction completed at full registered HP. Shadow policies reproduced every
command from identical team observations. The authored 80×64 map starts with
24 units and 2,000 food/wood per seat, disables fog and holds military stationary
to isolate production. This is not a competitive full-match or fog scouting
claim. PR #252 adds this scenario to CI; its broad checks remain in progress.

### 2026-09-30 — Deployed contextual roster observation

Native Firefox opened isolated staging room
`RmVxHIa4g67QYk1IjB7gm8rZu8jXgy4S` as Ember. The empty-selection bar showed
only Idle workers, Army, Production and Groups. Build & train showed registered
House, Barracks, Range, Workshop, Stable, Watchtower, Town Center and Storehouse
choices, their costs and unavailable reasons, plus 12 used / 0 queued / 15
population. The building grid had no nested-column text overlap in this desktop
view; earlier local 740×800 evidence remains the narrow-layout proof.

During the observation, staging deployed the art-only main `eed4dc8` as
`2854c50b-88c4-4682-9c2e-e60faf35828d` (SUCCESS). The page briefly reported
RECONNECTING, then returned to ROOM LIVE with MATCH RESTORED · RECENT CHECKPOINT
and retained its Ember resources, population and open production panel. This is
a concrete deployed checkpoint-recovery observation, not an assertion about all
network failure modes. Native screenshots were inspected in the task; no exported
screenshot file is claimed.

The completion audit reran 40 focused tests on the expansion branch: registry
validation, canonical revision/wire identity, presentation capabilities, combat
classes/modifiers, technology availability, private snapshots, selection, reachable
drop-offs and bounded AI base/progression decisions. All 40 passed. These complement
the runtime and staging proofs above; PR #252's full CI remains the integration gate.

### 2026-09-30 — Merged foundation integration

PR #252 merged as `496d387` after all three CI shards passed at `c8539cf`.
CI run 36707855800 includes the live both-seat expansion proof (tick 4560) and
release packaging. Exact staging deployment `d0707391-06ce-4e74-9972-d74e4301ea93`
succeeded at `496d387bcd7d8b3d2a720ca53aa167b36a04d292`. Packaging/transport smoke
and fresh authored room `qa-staging-muo1git3` (250-unit fixture) passed readiness,
authenticated assets, invite creation, both seats/reconnect, authored-map
save/reload, elimination victory and synchronized rematch. This resolves the
previous pending integration items for F1–F3 and early presentation binding.
Full F4 animation, variant and scale proofs remain separate.

## Named region scenario foundation — 2026-09-30

The `codex/scenario-region-triggers` slice adds named rectangular regions and
first qualifying-presence conditions to the existing declarative supply-event
system. `scripts/region-event-scenario.mjs` publishes a 64×64 Open Field derivative
with eight total units, orders an Azure and Ember worker into the central region,
checks independently attributed activation, stops/restarts with delayed rewards
pending, reconnects both sessions, checks exactly-once rewards, resets and repeats,
and rejects a missing region reference. The named region definition round trips
through the server map-change payload. `scripts/scenario-regions.test.mjs` covers
malformed bounds, duplicate IDs, bounded typed conditions, dead-unit and kind
filtering, half-open rectangle boundaries, and deterministic either-team ties.

These checks establish local server behavior, not a completed user-authored
scenario playtest or a performance budget. Region creation currently uses a
JSON field with a map outline preview; graphical region painting remains future
work. Events trigger on the first qualifying sampled presence, including initial
occupants; they do not detect a swept path through a rectangle between ticks.

The extended `scripts/map-studio-draft-scenario.mjs` browser check passed on
local macOS Chrome with software rendering after installing the locked Three.js
dependency in the isolated checkout. It preserves the named-region text through
close/reload/restore and saves a Worker-only Ember region event requiring three
units with its delay and conditions intact. Download JSON and Import JSON preserve
the region and all entry conditions. Autosave assertions wait for persisted state
rather than a fixed delay. This is browser form/draft/round-trip evidence;
it does not claim human authoring usability. The existing timed-event regression
passed after correcting its stale checkpoint schema assertion from 9 to the
current 19; this slice does not change the checkpoint schema version. Syntax,
client asset serving, shared-region tests, CI shard coverage, and documentation
link checks passed.

During PR CI, the Ember paid-AI siege fixture reported an 85-food discrepancy.
Its ledger counted spawned units and completed research but omitted purchases
still queued when the tower fell. The fixture now includes building/worker
production reservations and active research in the paid total while retaining
exact food/wood assertions. No gameplay costs or purchasing behavior change.

## Command foundations

[September 30 Stop/Hold evidence](qa-command-foundations-2026-09-30.md) records
both-seat interruption, worker cancellation, ranged/melee no-pursuit, checkpoint
recovery and rematch checks.

## Worker-combat snapshot race · 30 September 2026

Atlas PR #264 CI shard 1 failed at `worker-combat-scenario.mjs:120` with
`0 !== 1`. The same failure reproduced locally on main `8f148b1`. After map
publication, the test selected the newest ordinary `state` message even when
a newer `mapChange` had already supplied the new army snapshot. Unit 9 was
therefore read from the previous large army as Azure rather than the new
ten-unit map as Ember. This is a test snapshot-selection race, not evidence
that worker combat or sprite rendering changed.

The test now selects the newest state-bearing `state` or `mapChange` message.
The focused scenario passes both duels: Worker loses to Infantry for both
Azure and Ember. Game rules and protocol are unchanged. This fix-forward
record does not claim that the full CI workflow passed.
