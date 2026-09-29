# Core match tranche

[Roadmap](roadmap.md) · [QA protocol](qa-vertical-slice.md) · [Player guide](playing.md)

## Outcome

Prove the complete Forked Vale loop on an identified deployment, fix observed
failures, and use player decisions to choose subsequent gameplay work. Art
production remains a separate outcome. Automated checks establish readiness;
only unassisted human sessions establish comprehension.

## First session

Use a fresh invite room on staging, not a room used by destructive QA fixtures.
Record the deployment ID and source before and after the session. If the build
changes during play, retain the observations but repeat the affected proof.
Give players the URL, existing credentials, and invite. Do not include credentials
or seat reclaim tokens in recordings, reports, or shared links.

Run one solo opening with recorded map/policy seeds, then one human pair on
Forked Vale. Follow the [external protocol](qa-vertical-slice.md#lightweight-external-playtest-protocol).
The observer records interventions without teaching the controls. A recovery
intervention is useful defect evidence but prevents an unassisted completion claim.
Swap seats for the next match. Then expand to two newcomer pairs.

Copy this record for each match:

```text
Date / deployment / source:
Map / seeds (solo) / seat assignment:
Devices / browser versions / viewport / network:
First two minutes: team, objective, route, selection, move understood at:
First gather / building / trained unit / contact / objective / result times:
First confusing or failed action: expected / actual / exact feedback:
Interventions: time / reason / what the observer did:
Consequential decision / visible alternative / outcome:
Winner and reason on both screens:
Reload / ten-second disconnect / reclaim time / other-seat behavior:
Rematch: host action / guest feedback / time / usable orders after reset:
Player answers: intended plan / decisive moment / alternative / confusion:
Evidence paths / defect reproduction / replay result:
```

Prioritize the first completion blocker or coaching dependency. Reproduce it in
a disposable fixture, ship a focused fix, and repeat the relevant session step.
Keep costs and rewards unchanged until seat-swapped contested play motivates tuning.
Next map observations are Frontier Reach routes/expansion and Highland Grove
forest access/elevation; record the alternative players actually considered.

## Scale measurement profile — proposed

The following is a concrete starting profile, not an established support promise.
Confirm the minimum player device and acceptable order delay with the user before
claiming M3. Preserve failures and keep local diagnostics separate from hosted proof.

| Dimension | Proposed measurement |
| --- | --- |
| Player surface | Desktop mouse/keyboard, Chrome, 1280 × 720 CSS pixels at DPR 1; record exact version, hardware, power state, and actual canvas size for each seat. Include a windowed player run. |
| Hosting | Existing staging supervisor, one replica and persistent volume; record region, CPU/memory limits, deployment, active room count, and resource metrics. Do not infer dedicated CPU from the service plan. |
| Load ladder | 250, 500, 1,000, 2,000 total units, both seats connected. Record live unit count as combat proceeds. |
| Workloads | Movement, attack move/combat, checkpoint persistence, reload/reclaim, and post-result rematch. Use three 40-second windows per load for sustained measurements. |
| Simulation | Retain existing p95 tick/start-lag limits of 33.333 ms and 100 ms maximum tick/start-lag/planning-stage limits. Record each separately. |
| Browser | Retain existing p95 frame interval ≤33.333 ms, callback CPU ≤8 ms, and zero measured tasks above 50 ms; report startup tasks separately. Frame timing is not GPU completion. |
| Orders | Measure send → acknowledgment, send → applied feedback, and send → observed movement per seat. Propose p95 acknowledgment ≤250 ms and p95 applied feedback ≤500 ms under the recorded baseline network; compare added impairment separately. |
| Network | Record per-seat snapshot cadence/gaps, payload sizes, actual compressed server egress, and observed baseline RTT. Use the existing ≥5 snapshots/s smoke floor only as liveness, not a responsiveness target. Set an egress ceiling after measuring the intended host/network. |
| Recovery | Record seat reclaim duration and state continuity with pending orders, cargo, construction, and production; no silent order loss or divergent result. Propose ≤10 seconds to regain control after connectivity returns. |

Run one timed workload at a time under recorded host conditions. A passing
synthetic spectator run is diagnostic evidence, not the two-player support claim.
The historical browser spike remains an investigation target if it recurs; profile
the measured slow task before choosing an optimization.
