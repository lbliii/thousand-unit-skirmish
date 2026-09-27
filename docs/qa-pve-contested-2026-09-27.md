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

These are bounded deterministic-policy pairings on a local server. They do not establish
seat parity, human win rates, hosted latency, strategic variety or player fun.
A full timed finish can be observed with a 930-second bound, beyond the map's
15-minute deadline. Preserve costs, rewards and unit statistics until paired
human observations support a specific tuning change.


## Reversed seeds and same-build control

The follow-up uses base `bcd5fec` and reverses the policy seeds. Since the server's
unit-pursuit behavior changed in #202 after the original measurement, the
original pairing is also rerun on this build rather than attributing all changes
to the seed swap.

```sh
node scripts/pve-contested-match-scenario.mjs 300 4294967295 20260925
node scripts/pve-contested-match-scenario.mjs 300 20260925 4294967295
```

Source inspection confirms that the policy seed selects gathering ties and
rotates candidate construction sites. The objective selector uses ownership,
prerequisites, distance and stable IDs; it does not randomly select objectives.
Reversing these seeds therefore tests economy/placement variation in the same
objective policy. The map seed, geometry, starting armies and combat rules stay
fixed within the paired rerun.

The pinned 0 A.D. source above separates attack-size variation, readiness and
target selection. That distinction is useful here: a seed-dependent economy
choice does not itself demonstrate a broken target or a stalled army. No new
random tactical behavior or balance adjustment is introduced.


The reversed pairing finished with an agreed Azure victory in **213 seconds**.
Azure captured South at tick 3318, North at 4332 and Watch at 5790, then held
all three for 20 seconds. Azure/Ember each completed one Barracks; observed new
Infantry totals were 10/8, military losses 8/11, and command totals 26/22.
First completed Barracks were observed at ticks 1140/1173 and first training
commands at 1260/1293. Both sides retained active production and valid objective
orders; all seeded replay, budget, combat and result assertions passed.


The same-build control finished with an agreed Azure victory in **245 seconds**.
Azure captured South/North/Watch at ticks 3477/4383/5583. Ember retook South at
6111, interrupting the hold; Azure retook it at 6741 and completed a new hold.
Azure/Ember observed new Infantry totals were 11/10, military losses 9/16, and
command totals 29/30. First completed Barracks were observed at 1230/1173 and
first training commands at 1350/1293. Both sides continued producing and
retargeting through the interrupted victory attempt; all diagnostic checks passed.

| Same-build pairing | Azure seed | Ember seed | Result | Wall seconds |
| --- | --- | --- | --- | --- |
| Reversed | 4294967295 | 20260925 | Azure capture/hold victory | 213 |
| Control | 20260925 | 4294967295 | Azure victory after South loss/retake | 245 |

Neither seed assignment caused a stopped army, failed production loop or an
invalid objective target in these traces. Azure won both same-build runs and
the earlier historical run; that repeated outcome deserves future seat/parity
observations but does not identify a causal seat advantage. There is one run per
seed order on this build, ordinary WebSocket scheduling and no statistical
sample of openings. The 144-second historical result is not a timing control
for the newer combat implementation. No policy or balance change was made.


The [seat, spawn and command-order audit](qa-pve-seat-fairness-2026-09-27.md)
then holds both policy seeds equal and independently reverses harness send order
and spawn ownership. It narrows the interpretation of these repeated Azure wins.
