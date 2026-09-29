# Hosted scale collector verification — 29 September 2026

[Core measurement profile](core-playtest-tranche.md#scale-measurement-profile--proposed)
· [QA plan](qa-vertical-slice.md)

## Conditions and scope

Runner source `a755a67`, Node 24.9.0. Staging remained at successful deployment
`d270b467-4aa5-4eed-81cd-469e3da2f2c6`, source
`65fd4e2ecd299e7812c886339ae69b6dcc576981`, before and after the run. The runner
used injected service credentials and created a fresh disposable room. No
credentials or seat reclaim tokens are retained. Production was unchanged.

This verifies new collection options against the existing game. It is not a
controlled performance comparison: host allocation/load, baseline RTT, player
devices, and browser/GPU work were not measured. The existing readiness,
both-seat reconnect, authored-map save/reload, elimination/result, and rematch
checks passed before the scale windows.

```sh
node scripts/qa-staging-smoke.mjs https://game-staging-21f9.up.railway.app --stress --stress-counts=250,2000 --stress-waves=2
```

## Observations

All four ten-second Dense Clash windows passed the unchanged ≥5 snapshots/s
liveness floor and both-seat continuity. Observed cadence was 9.9–10.1 snapshots/s.
Each wave reset the roster before sending one tagged move order per seat.
All baselines contained the selected unit count; all final applied notices named
that count. No order observation was missing.

| Units | Wave | Seat | Acknowledgment | Applied feedback | First selected-unit movement |
| --- | --- | --- | --- | --- | --- |
| 2,000 | 1 | Azure | 92.901 ms | 358.194 ms | 151.981 ms |
| 2,000 | 1 | Ember | 126.808 ms | 182.722 ms | 182.656 ms |
| 2,000 | 2 | Azure | 117.872 ms | 151.181 ms | 151.156 ms |
| 2,000 | 2 | Ember | 82.525 ms | 115.731 ms | 115.410 ms |

First movement can precede the final applied notice because the server applies
planned groups incrementally. It does not mean every selected unit has moved.
Both timings include transport and client observation. Acknowledgment is not RTT.
Two trials per seat/load do not establish p95 responsiveness or a support promise.

The [raw report](qa-evidence/hosted-scale-profile-2026-09-29/report.json) retains
250-unit results, snapshot sizes/gaps, exact durations, and deployment identity.
[SHA-256](qa-evidence/hosted-scale-profile-2026-09-29/sha256.json) identifies it.
Focused tests reject unsupported/unbounded options and protect against unrelated
notices, stale roster generations, dead units, jitter, and missing/rejected orders
being mistaken for measured success.

## Remaining proof

The runner now executes the proposed movement ladder and preserves separate
per-seat order intervals. It does not measure windowed presentation, compressed
wire egress, server tick/checkpoint budgets, combat, or recovery under sustained
load. The 40-second/three-wave bounds have unit coverage; this hosted observation
used ten-second/two-wave windows. Supported-scale acceptance still needs the
named player/hosting/network profile and its complete measurements.
