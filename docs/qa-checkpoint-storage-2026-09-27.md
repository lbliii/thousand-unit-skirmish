# Checkpoint storage failure and recovery — 2026-09-27

## Build and fixture

Source `a2498fc06cd6f2bd2b9ff1138528f4637093ecf9`, unchanged runtime.
Node 24.9.0 on macOS, unprivileged user, local Open Field server, two real
WebSocket seats. The map's default 1,000-unit roster was idle except for one
commanded unit per team; this is not a scale/performance measurement.

`scripts/checkpoint-storage-recovery-scenario.mjs` creates a disposable save
directory, waits for both seats to be checkpointed, removes directory write
permission, and waits for an actual EACCES checkpoint error. It restores
permissions before worker restart and cleanup. This test requires an
unprivileged POSIX account and is registered in the Linux CI suite.

## Observations

- The health endpoint stayed available and its checkpoint failure count rose.
- Both seats received accepted move notices with their command tokens, and both
  selected units moved more than one world unit while saving was unavailable.
- The last valid checkpoint remained byte-for-byte unchanged during the failure.
- Restoring write permission produced a newer checkpoint with both movements.
- A subsequent SIGKILL/restart restored the same match identity, both session
  tokens/teams, and movement saved after storage recovered.

The first run retained sequence 1, observed one failed write, and recovered at
sequence 3. Exact sequence numbers depend on scheduling; assertions require
monotonic recovery and preserved state, not these particular numbers.

## Limits

No production behavior change was required. This proves retry and preservation
for a temporary directory permission failure. It does not simulate a full disk,
loss of the volume, failed physical-media durability, or restoration from an
external backup. A crash while writes are unavailable can recover only the last
successful checkpoint, so save age remains relevant operational evidence.
