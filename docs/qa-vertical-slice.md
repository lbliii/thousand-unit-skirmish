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
