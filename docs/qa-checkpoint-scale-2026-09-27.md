# Local checkpointed combat sample — 27 September 2026

[Testing guide](testing.md#performance-measurements) · [QA plan](qa-vertical-slice.md)

## Source and conditions

Captured 13:43:46–13:44:23 UTC on clean source `e47a1aa302c075516e8890bf8980bfdc4ac74e0d`.
Its server implementation matches main `e5efc50`; the intervening branch adds
only delayed-connection coverage. Later forest-route and PvE recovery fixes
are outside this sample.

Apple M2, 24 GB RAM, macOS 26.6.2 (25G83), Node 24.9.0, AC power, battery
charged. Load averages were 4.07/4.02/4.66 before and 6.38/4.54/4.78 after.
The active gameplay test fixtures finished before this sample; their owners
held new runtime tests until completion. Other desktop/background processes
remained present. This was not an isolated hosting machine.

Workload: two connected teams, 1,000 units each, box attack-move, Open Field
64×64 with close spawns and no fog, three 12-second windows, one-second
checkpointing. Each reported tick sample covers the latest 300 ticks/10 seconds.
Existing limits were unchanged: 33.333 ms tick/start-lag p95 and 100 ms maxima.

## Adapter-reported result

| Window | Tick p95 | Tick maximum | Start-lag p95 | Start-lag maximum | Damaged units |
| --- | --- | --- | --- | --- | --- |
| 1 | 12.701 ms | 14.789 ms | 1.251 ms | 2.499 ms | 317 |
| 2 | 11.353 ms | 14.004 ms | 1.225 ms | 2.475 ms | 316 |
| 3 | 11.696 ms | 14.128 ms | 1.022 ms | 5.591 ms | 374 |

All 2,000 units moved in each window. Checkpoint failures and skipped tick slots
were zero. Checkpoint serialization took 7.983–9.438 ms and atomic writes
18.373–19.747 ms; serialized snapshots were 1,885,286–1,892,743 bytes.
The scenario exited successfully with its existing correctness and timing checks.

## Preserved evidence and reproduction

The [sealed run directory](qa-evidence/run_1790516626662_809b4fc1d5734cb185fea52de732c26c/run.json)
contains the capture, original output, plan, and hashes. `game-dev capture verify`
passed both before and after copying it into the repository. Manifest SHA-256:
`bbd1855c9782f2262609e35a2b363ecd1ff9c463cd6ea10f3a03377d21e3793f`.

```sh
game-dev scenario run checkpoint-attack-move-2000 --project . --confirm --allow-performance --jsonl
game-dev capture verify RUN_PATH --json
game-dev performance summarize RUN_PATH --json
```

The harness validates process completion, capture schema, and artifact hashes;
it reports `hardwarePerformanceEvidenceAdmitted: false`. Timing values are
adapter measurements, not independently established hardware performance.
There is no browser/GPU, network impairment, hosted capacity, or sustained
human-match result here. No causal comparison with the September 25 sample is
claimed: that bundle was unavailable in the current capture store, and the
source and host conditions differ. Preserve its earlier failed result as history.
