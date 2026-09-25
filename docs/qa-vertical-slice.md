# First 1v1 vertical slice: QA and playtest plan

Updated 25 September 2026. This is a living acceptance record for the first invite-only deployed build. The [game bible](game-bible.md) defines the intended player experience. A passing local script is evidence for the behavior it checks; it does not prove a browser interaction, an internet connection, or an external player's understanding.

## Acceptance matrix

`P0` blocks the first external playtest; `P1` blocks calling the vertical slice complete. Record the build commit, environment, result, and evidence for every run. `Pending` means no qualifying evidence has been collected.

| Priority | Gate and observable pass condition | Coverage and current evidence | Status |
| --- | --- | --- | --- |
| P0 | Two invited players join the **same** room, claim Azure and Ember, see the same map and match state; another room remains isolated. | `npm test` covers room isolation. `qa-staging-smoke.mjs` passed both seats in a new HTTPS invite room. `qa-staging-browser.mjs` passed with separate Chrome profiles: both showed `ROOM LIVE`, `2 / 2 PLAYERS`, and Stone Pass; both WSS upgrades returned 101. | Local and staging browser pass |
| P0 | A new player can identify their team, the objective, a route, and the basic select/move controls within 2 minutes without coaching. | Silent first-glance task in the external protocol below; capture each player's words. | Pending external playtest |
| P0 | Both seats can gather, build, produce, issue army orders, contest the objective, and complete one authored scenario. Record first building, first contest, win time, starvation, and two distinct viable responses per seat. | Economy and Three Crowns scripts cover mechanics in isolation. A complete unassisted human match is still required. | Pending end-to-end playtest |
| P0 | Mirrored two-worker openings reach building work range and complete equivalent Barracks/Range builds within 2 seconds on both seats. | QA-003's pre-fix Forked Vale result was 20.5 s versus 11.1 s. On merged `f1d6482`, the 24-unit Forked Vale harness swapped Barracks/Range assignments; all four builds completed at 10.9 s, with first infantry at 23.0 s and first archer at 18.0 s. Both builders per team were in work range and contributing. | Merged-main local pass; deployed confirmation pending |
| P0 | Mirrored equal-force combat does not favor a seat because of simulation order. | The pre-fix fixture gave Azure 5 survivors and Ember 3 in all four cases. On merged `f1d6482`, all four 8v8 cases pass `--expect-parity`: each side has 3 or 4 survivors, the edge flips with spawn side, and command order does not change outcomes. | Merged-main local fixture pass; human contest pending |
| P0 | A match ends on both clients with the same winner and reason; the next match starts with neutral objectives, full rosters, and usable commands. Both players understand who can start it. | `scripts/three-crowns-scenario.mjs 0` and `1` passed victory followed by synchronized host reset. Staging protocol passed elimination victory and reset. On integrated main, a two-browser Stone Pass capture showed Azure's visible `Play again`, Ember's `WAITING FOR HOST TO RESET`, and both clients returning to neutral 500:500 after Azure reset. Human understanding and deployed visual confirmation remain open. | Protocol and local browser behavior pass; deployed/human pending |
| P0 | Either player can reconnect to their original seat and current match after tab reload, temporary disconnect, and worker restart. The other player retains control. | `npm test` covers worker recovery; expanded `scripts/resume-session-scenario.mjs` and staging smoke passed independent Azure/Ember reconnect. Browser reload and deployed worker restart remain pending. | Protocol pass; browser/restart pending |
| P0 | The host can author a valid map and scenario in Map Studio, validate it, export/save it, reload it, and invite a second player into it. Invalid or unreachable setups name a fix. | `qa-staging-browser.mjs --author` added a scenario event and starting food in the host editor, downloaded valid JSON, saved it, synced it to the guest, and reloaded both browser seats with the same map. The editor rejected an invalid ID with the allowed format and a divided map with the unreachable resource named. Browser draft recovery passed locally. | Scripted browser flow pass; human usability pending |
| P0 | The release image starts with a mounted persistent volume and access control; `/ready` is healthy, game assets load, and HTTPS WebSockets connect. | `npm test` release scenario passed. Staging deployment `860d7387` passed public `/ready`, authenticated assets, and WSS invite-room smoke. | Staging pass; production smoke pending |
| P1 | A deployed match tolerates a measured latency/loss profile without silent orders, divergent winner, unrecoverable disconnect, or unusable control. | Test both seats at baseline, then about 80 ms RTT and 1% packet loss using browser network emulation; record order acknowledgement p50/p95 and recovery time. Agree the final profile with the infrastructure owner before gating. | Pending deployed measurement |
| P1 | A 2,000-total-unit match has stable server ticks, snapshots, and browser interaction on intended hardware. | Fresh local server, browser, and network samples are below; two combined-load runs had single ticks over the 100 ms diagnostic ceiling (QA-002). A 10-second staging Dense Clash run delivered 100 snapshots to each seat; longer runs, browser input, server tick samples, and a bandwidth budget remain pending. | Local mixed; short staging protocol pass |
| P1 | Units, ownership, health, selection, and objective changes remain readable at the ordinary zoom with two full armies at a choke. | Observe both seats during the 2,000-unit playtest, capture screenshot/video and any misread calls. A supplemental cold AI browser review found resource nodes hard to spot among 500 units. Separately, a deployed layout probe confirmed result-card occlusion at a short desktop viewport (QA-004). | Open layout defect; human review pending |
| P1 | A new player can describe at least one consequential decision and one possible alternative after the match. | Exit interview in the external protocol. | Pending external playtest |

## Reproducible findings

### QA-001 · Result prompt gives Ember an unavailable reset action · P1

**Reproduce:** Start a fresh two-client room; Azure claims the first seat and Ember the second. Finish a capture or elimination victory. Inspect the result text on Ember, then open the match menu.

**Observed:** The result says `RESET TO PLAY AGAIN` on both seats. The reset button is in the match menu and is disabled for Ember; only Azure can send the reset command. The result does not explain that Ember must wait for Azure. This also leaves the host's reset action hidden behind the menu at the moment it is needed.

**Expected:** The host has an obvious rematch/reset action at the result. Ember sees a waiting-for-host state and receives a clear update when the new match starts. The server should give a specific response to a guest reset attempt.

**Evidence:** The original source built `RESET TO PLAY AGAIN` for both seats while only team 0 could reset. The Three Crowns regression verifies that a host reset restores both server states. An integrated-main two-browser local retest then showed Azure `MATCH COMPLETE`, `VICTORY`, `AZURE SECURED CONTROL THE PASS`, and `↻ Play again`; Ember showed `MATCH COMPLETE`, `DEFEAT`, `AZURE SECURED CONTROL THE PASS`, and `WAITING FOR HOST TO RESET`, without a reset button. Azure's reset returned both clients to neutral objectives and 500:500 rosters. A separate staging layout probe confirmed that a shorter viewport can hide Ember's wait text (QA-004).

**Routing:** Gameplay and interface changes have merged. The unavailable-action wording is fixed in the local two-browser retest; QA will verify staging after the integrated deployment and separately confirm the result-card layout with a screenshot.

### QA-002 · Intermittent 2,000-unit tick over 100 ms diagnostic ceiling · P1 investigation

**Reproduce:** On the local Apple M2 / Node 24.9 checkout, run `node scripts/browser-performance-scenario.mjs 10`. Also run `node scripts/network-snapshot-scenario.mjs 43987 10` against a fresh `PORT=43987 RTS_HOST=127.0.0.1 RTS_MAP=maps/open-field.json node server.mjs` instance. Each run uses two moving 1,000-unit teams; the browser harness adds a headless Chrome spectator.

**Observed:** The first combined Chrome/server run aborted on a 130.008 ms tick against its 99.999 ms maximum. Immediate repeat passed all three waves, with server tick maxima 25.725/16.157/38.994 ms. A separate network-snapshot run reported a 119.743 ms maximum and 86.479 ms maximum tick-start lag, despite 4.313 ms tick p95. An isolated checkpointed movement run passed at 5.9 ms p95 and 12.703 ms max. The local machine had other active work; cause is not yet established.

**Expected:** Repeatable 2,000-unit runs meet the agreed tick and network budgets on intended hosting hardware, including maximum spikes, while both clients receive usable snapshots.

**Routing:** Gameplay systems owner received commands, map, and measurements for tick-path profiling; infrastructure owner received the staging/network implications. Keep this gate open until a bounded staging run and server-hardware budget are recorded.

### QA-003 · Mirrored two-worker building time differs by about 10 seconds · P0

**Reproduce:** On the balance lead's mirrored 24-unit open-field setup, order two workers per team to build equivalent production buildings. Repeat on Forked Vale with symmetric Barracks/Range placements at ±21.5. Measure completion time and each worker's distance from the building edge.

**Observed before fix:** The balance lead reported roughly 20.0 s for Azure against 10.4 s for Ember on open field, and roughly 20.5 s against 11.1 s on Forked Vale. One Azure worker parked 1.5 units from the building edge, outside the 1.4 work threshold, while still marked as building. The difference persisted when Barracks and Range assignments were swapped.

**Expected:** Both workers reach work range and contribute. Equivalent mirrored builds finish within 2 seconds on both seats, with no worker stalled just outside the threshold.

**Merged-main retest:** Commit `e28907b` is included in `f1d6482`. Run:

```sh
RTS_OPENING_MAP=maps/forked-vale.json RTS_OPENING_BUILD_X=21.5 node scripts/opening-production-scenario.mjs --expect-builder-parity --verbose
```

With 24 total units, four workers and eight infantry per seat, Azure and Ember each completed both the Barracks and Range at 10.9 s when assignments were swapped. First infantry appeared at 23.0 s and first archer at 18.0 s for either seat. At 10 s, each pair of builders was still marked `building`; progress was 0.915–0.918 and measured distance to the building edge was 0.5. The first-unit stocks matched costs: Barracks 100 food/75 wood and Range 125 food/55 wood. This is a local scripted opening, not a contested human match or deployed retest.

### QA-004 · Result card action obscured by command dock in short desktop window · P1

**Reproduce:** On deployed staging, open a two-seat room in a 1280 × 600 desktop viewport and finish a match. Inspect Ember's `WAITING FOR HOST TO RESET` line and Azure's `Play again` button. A layout-only CDP probe reproduced the guest result DOM in the live page without declaring a server-side winner; the [probe screenshot](qa-evidence/result-card-1280x600.png) is therefore visual evidence only, not a completed-match claim.

**Observed:** The guest result card spans y=217–383, its waiting text spans y=348–362, and the command dock spans y=316–586. A hit test at the waiting text returns a dock button, so the instruction is fully covered. At 1280 × 720 the text remains visible, although the dock covers the card's bottom edge by about 7 px. The styles give `.match-result` z-index 5 and `.control-dock` z-index 6.

**Expected:** The complete result, including host rematch and guest waiting state, remains visible and actionable at supported desktop window sizes.

**Routing:** Interface owner has the screenshot and bounds. Retest both seats after the layout fix, including the real end-of-match transition.

### QA-005 · Equal infantry fight favors Azure due to combat update order · P0

**Reproduce:** Run `node scripts/infantry-seat-combat-scenario.mjs --expect-parity` on the merged baseline. The fixture reverses Azure's spawn side and both client command-send orders across four 8v8 infantry-only attack-move fights.

**Observed before fix:** On `158578b`, Azure had five survivors and Ember three in all four cases. Reversing the first per-unit simulation pass flipped the advantage; this was a balance-lead measurement.

**Merged-main retest:** On `f1d6482`, all four runs resolved at 12.3 s. With Azure spawning left, Azure had 3 survivors/300 HP and Ember 4/350 HP under both command orders. With Azure spawning right, Azure had 4/350 HP and Ember 3/300 HP under both orders. The fixture's one-survivor/50-HP edge tracks spawn side, not team identity or command order; `--expect-parity` passed.

**Expected:** Mirrored equal forces resolve without a consistent seat advantage caused by update order.

**Routing:** The simultaneous-damage and mirrored-cadence fix is in merged commit `f1d6482`. The local fixture now passes; this does not establish strategic balance or human opening win rates.

## Baseline record · 25 September 2026

- Checkout: `691c6d2` plus the role worktree's inherited edits and QA changes; macOS arm64 / Apple M2, Node 24.9, headless Chrome 153. `npm ci && npm test` passed after the pinned Three.js dependency was installed.
- Local gameplay: Three Crowns winner 0 and winner 1 each passed mirrored objective capture and both-seat reset. Map Studio draft recovery, saved-map restart, and independent Azure/Ember seat reclaim passed.
- Local 2,000 units: checkpointed box movement moved 1,998 units; tick p95/max 5.9/12.703 ms over 300 ticks. The successful 30-second Chrome run rendered 2,000 visible units, 16.7 ms frame p95, 1.6 ms animation-callback p95, and zero tasks over 50 ms. Its three server wave tick maxima were 25.725/16.157/38.994 ms; the previous attempt failed with QA-002.
- Local network snapshot: 9.8 snapshots/s per seat, about 119,802 JSON payload bytes per snapshot, and 307.68 KiB/s combined compressed WebSocket egress (frame bytes only; excludes TCP/IP and TLS). Tick max 119.743 ms is included in QA-002.
- Staging: [game-staging-21f9.up.railway.app](https://game-staging-21f9.up.railway.app), deployment `860d7387`. The disposable-room protocol smoke passed authenticated assets, both seats, both reconnects, custom-map save/reload, elimination victory, and synchronized reset. A reused closed QA room ran 2,000 units through Dense Clash for 10 seconds: each seat received 100 snapshots (10/s), 120,141-byte p95 JSON payloads, and 109 ms p95 receive interval; the largest gaps were 527 ms for Azure and 296 ms for Ember. Railway's one-hour metric summary showed no obvious sustained CPU saturation, but its 30-second samples cannot explain individual gaps. This was an automated client check, not a human browser playtest. Staging room creation hit the default four-room cap after repeated QA runs; reuse a closed QA room for further load checks.
- Deployed browser: two isolated headless Chrome profiles loaded the same saved QA room at 1440 × 900. Both reached `ROOM LIVE` and `2 / 2 PLAYERS`, rendered a canvas with Stone Pass, and logged WebSocket HTTP 101 without JS or asset-load errors. The host opened Map Studio; the guest's editor button was disabled. The editor rejected `Invalid Map ID!` with `Map ID must use lowercase letters, numbers, and hyphens.` It also rejected a wall that cut off a resource with `Resource node azure-berries must be reachable from both team spawns.` After importing a valid Stone Pass baseline, the host changed starting food, added a clock-triggered supply event, downloaded and parsed the JSON, saved the map, and both browsers saw it. After both tabs reloaded, each reclaimed its original seat and still saw the saved map. This confirms the scripted browser flow, not player comprehension.
- Balance lead's separate cooperative Forked Vale script reported deposits by 18.3 s, first Barracks and infantry by 51.4 s, opposing ford owners by 75.7 s, and one victory before 139.7 s. No contested combat occurred. Human match length and the 6–10 minute target remain unproven; watch whether workers make early five-unit ford captures too strong.
- Independent draft Forked Vale layout check on the scenario branch passed mirrored terrain and resources, equal cell-route distances to all three objectives (31/30/20 cells from either spawn), six wide crossing rows, and 1,000-unit starting footprints for both seats. This is geometric evidence; the local gameplay-plus-balance checkout also passed the QA-003 builder parity rerun. The draft scenario has not been deployed.
- The production integration task reported that a disposable combined preview with foundation, gameplay, balance, QA, Forked Vale, HUD, audio, and art passed `npm test`. Its local 2,000-unit browser performance runs still breached gates: one 56 ms long task, then a 194.279 ms server tick on an immediate repeat. This is second-hand preview evidence, not a clean integrated release measurement; QA-002 remains open.
- A cold AI browser review of the combined preview found team and objective immediately, worker selection by 0:45, right-click movement by 1:15, wood gathering by 1:45, and a route through the choke by 2:00. It completed a Barracks, food gathering, infantry production, victory, and host rematch. The reviewer had trouble seeing resource nodes among 500 units and tried four blocked Barracks sites before finding an open 3 × 3 area. These are usability leads for human confirmation, not external playtest results. On default Stone Pass, moving the starting 496 military through the choke ended the match before the economy mattered; use Forked Vale for the first contested economy playtest.
- A separate two-seat scripted Forked Vale probe on combined preview `7b26789` split Azure's starting force into five infantry north and three infantry plus two workers south. Unopposed, both signals were Azure-owned by 24.4 s with no worker loss. When Ember sent five infantry south, that signal stayed neutral through 78.4 s while Azure took north; diverting two Azure workers cost about 40 food and 40 wood of net gathering against Ember's four-worker economy. One deterministic run per condition, with Ember using move rather than attack-move, does not establish a human response or combat outcome.
- Staging release `0ab11d63` at source commit `8624887` passed the production coordinator's public smoke, two-seat protocol, 2,000-unit short stress, and two-browser Map Studio flow. QA independently reran `qa-staging-browser.mjs` in an existing room: both seats showed `ROOM LIVE` and `2 / 2 PLAYERS`, the same authored map and canvas; the host editor opened, guest editor remained disabled, both WSS upgrades returned HTTP 101, and there were no JS or asset-load errors. The staging room cap is now eight; seven records were in use after this run. This release does not yet include Forked Vale as the new-room default. The short-viewport visual probe found QA-004.

## Repeatable run sheet

1. Record commit SHA, deployed URL/build identifier, Node/browser versions, device, server hardware, and network profile. Never put room access credentials in the report.
2. Run `npm ci && npm test`. Then run Three Crowns with winner `0` and `1`, Map Studio draft/persistence, resume session, and the 2,000-unit scripts listed above. Keep raw JSON output or logs with the run record.
3. On deployed HTTPS, use two separate browser profiles and a fresh invite room. Repeat join, both-seat commands, reload/reconnect, Map Studio save/reload, victory, and reset. Confirm both screens after each transition.
4. Repeat the deployed match with controlled latency/loss. Record each failed, delayed, or duplicated order with client time, team, order token, expected result, and server response.
5. File each failure with build, environment, exact steps, expected/actual behavior, screenshot or log reference, frequency, and affected seat. Mark fixed only after the original reproduction and its paired-seat regression pass.

For staging protocol smoke, run `scripts/qa-staging-smoke.mjs` through `railway run` with the staging service variables injected; pass the staging HTTPS origin and optionally `--stress` for a bounded 10-second, 2,000-unit window. The script prints no access credentials. It creates an invite room by default; pass `--room-id=<existing closed QA room>` when the staging room cap is full.

For deployed browser coverage, run `scripts/qa-staging-browser.mjs <HTTPS origin> <saved QA room ID> --author` through `railway run` with the same staging service variables. It opens two isolated headless Chrome profiles, verifies both seats, downloads a new map into temporary storage, publishes it, and reloads both tabs. It modifies the chosen QA room's active map; use a disposable room. Omit `--author` for a join/access check without changing the map. It writes two screenshots to the operating system's temporary directory and prints no access credentials.

## Lightweight external playtest protocol

Use two pairs of people who have not worked on the game. Give them a URL, access credentials, and a room invite only. Run one pair per room; swap Azure and Ember for the second match. An observer watches without coaching except to recover a broken test. Ask participants to think aloud, and log prompts separately from spontaneous discoveries.

| Moment | Observer records |
| --- | --- |
| First 2 minutes | Time to identify team, objective, route, selection, move order, and where to get help; exact confusing words. |
| Opening | Time of first gather, first completed building, first trained unit; food/wood stocks when progress stalls; whether the player notices available production. |
| Mid-game | First objective contest, first opposing response, command misfires, unclear feedback, and whether each seat finds a distinct viable plan. |
| Ending | Match duration, winner/reason shown on both screens, whether each player can explain why it ended, time and prompts needed to start the next match. |
| Recovery | At an agreed point, reload one tab; later interrupt its connection for 10 seconds. Record seat reclaim time, state continuity, and what the other player sees. |
| Exit | Ask: “What were you trying to do?”, “What decided the match?”, “What else could you have tried?”, and “What was confusing?” Record verbatim answers. |

A qualifying external run has both players finish a match, understand the result, and complete a rematch without developer intervention. Record failures even if the pair eventually succeeds. Match length, economy pacing, and network bandwidth targets remain measured decisions with the balance and infrastructure owners.

## Balance measurement handoff

For every complete match, send the gameplay balance lead: map, seat assignment, match duration, first gather/build/training/contest timestamps, periods when resources blocked a desired action, the two plans attempted by each seat, and the players' own explanation of why one plan worked. Do not use scripted capture times as evidence of human pacing.

On Forked Vale, specifically watch whether one player sends five infantry to one signal and three infantry plus two workers to the other before production. Record whether both signals fall, what the opponent does to deny or punish the worker-heavy lane, worker losses, and the food/wood and build-time cost of the diversion.
