# Contested deterministic Forked Vale — 2026-09-27

## Scope

Base `26eea9b`, local Node 24.9.0 authoritative server, unmodified Forked Vale,
ordinary WebSocket seats. Azure seed `20260925`; Ember seed `4294967295`.
Both policies control their complete starting armies and economies throughout.
No passive seat, removed army, checkpoint fixture, resource grant or map edit.

```sh
node scripts/pve-contested-match-scenario.mjs 300 20260925 4294967295
```

The first argument bounds wall-clock observation (60–930 seconds); the remaining
arguments are the seat policy seeds. The scenario stops at an agreed result or
the bound, and emits `finished` or `bounded-unresolved`. The latter does not
claim a stall. It samples every 30 seconds and records ownership transitions,
first construction/training/combat, observed military losses by ID/generation,
and commands. Each policy receives only its own peer-scoped observation.

Assertions protect one living producer, one queued Infantry, 12 military and
24 friendly units. A shadow policy with the same seed must produce identical
commands for the exact same observation trace. This checks policy determinism;
network scheduling can still change the simulation tick when an order arrives.
Both seats must fight, suffer losses and reach production. The script can be
used as a bounded diagnostic rather than requiring a particular winner.

## Observed result

The run finished with an agreed Azure victory after **144 wall-clock seconds**.
South Signal changed to Azure at tick 2301 (76.7 simulation seconds), North
Signal at tick 3087 (102.9 seconds), and Vale Watch at tick 3723 (124.1 seconds).
Azure then completed the existing 20-second continuous hold.

| Observation | Azure | Ember |
| --- | --- | --- |
| Policy seed | 20260925 | 4294967295 |
| First observed attack tick | 540 | 512 |
| Completed Barracks first observed | 1143 | 1173 |
| First training command | 1263 | 1293 |
| Military alive at 30 seconds | 4 | 0 |
| Military losses by last decision | 4 | 9 |
| New Infantry observed | 6 | 5 |
| Commands issued | 18 | 17 |

Both opened with two gather commands and an eight-Infantry attack-move toward
South Signal. Both issued their first build at tick 513. Ember lost its entire
starting army but resumed objective orders as new Infantry emerged. Its early
reinforcements advanced toward North, then retargeted South when Azure captured
it. At 120 seconds Azure had eight military units and both Signals; Ember had
three and was still producing. The source/observation checks found no stopped
policy, lost production loop or command spam in this run.

All diagnostic assertions passed, including same-observation seeded replay,
production/roster limits, combat and losses on both seats, and result agreement.
No policy or balance changes were warranted by this single finished match.

## Source research

Reviewed pinned 0 A.D.
[`attackPlan.js` at `61a3b9507d974084e6badb88a0826bd89a6d5b8b`](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/ai/petra/attackPlan.js).
Its `canStart` checks minimum force sizes, while target selection prioritizes
victory conditions and retargets after a target is captured or removed. These
are useful distinctions for interpreting a contested match: active but costly
reinforcement is different from a lost target or a stopped production policy.
No upstream code was copied. Force staging or balance adjustments require
separate evidence; this diagnostic introduces neither.

## Limits

This is one deterministic-policy pairing on a local server. It does not establish
seat parity, human win rates, hosted latency, strategic variety or player fun.
A full timed finish can be observed with a 930-second bound, beyond the map's
15-minute deadline. Preserve costs, rewards and unit statistics until paired
human observations support a specific tuning change.
