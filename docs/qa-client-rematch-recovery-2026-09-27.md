# Client roster recovery across rematch — 27 September 2026

## Reproduction

Base `440ec87`; Node 24.9.0, controlled execution of the actual client socket,
seat, result, roster, and snapshot handlers. Forked Vale-shaped snapshots use
24 starting units, fog-filtered own-team rows, and one trained worker at ID 24.
This is a client-state regression, not hosted or browser appearance evidence.

1. Train an additional unit, select it, and assign it to a control group.
2. Finish the match, then reset with the same starting army size.
3. Deliver the opening roster either as a live state or a reconnect welcome.

Before the fix, unit 24 remains alive in `units`, its team render slots, selection,
and control group despite being absent from the authoritative opening roster.
If the other team later produces ID 24, the client rejects that row because it
still associates the ID with the old team. All four both-seat/live-or-reconnect
variants failed at the leftover-unit assertion.

## Change and evidence

The existing terminal-to-live or clock-rewind match boundary now rebuilds the
local roster before applying the snapshot, even when starting army size is
unchanged. The existing roster rebuild clears render slots, selection, groups,
and transient unit effects. Same-match reconnects preserve their roster and
selection. The server's winner and unit rows remain authoritative.

`node --test scripts/client-rematch-recovery.test.mjs` covers both seats:

- Remove prior production and shrink render slots on live and reconnected rematches.
- Clear selected/grouped prior-match IDs and accept subsequent opposite-team ID reuse.
- Preserve victory, defeat, and draw on terminal reconnect until an actual rematch.
- Ignore obsolete socket state, welcome, and close events after new ownership.
- Rebuild after an unseen rematch when the authoritative clock rewinds.
- Retain production and selection on an ordinary same-match reconnect.

All nine cases pass. The existing five build-recovery and three camera-recovery
checks also pass. Rendering/DOM dependencies are controlled; real handlers perform
roster mutation and socket filtering. This does not exercise GPU drawing or loss
profiles on a hosted connection.

## Source reference

Revisited OpenRA's pinned
[`OpenRA.Game/Server/Server.cs`](https://github.com/OpenRA/OpenRA/blob/9ea513cb117d3f453952efe2d5d31cf37c4bf431/OpenRA.Game/Server/Server.cs),
`EndGame` (186–193) and `StartGame` (1342 onward). It makes game-lifecycle changes
explicit, ending recorder state and initializing match/player tracking at start.
The applicable principle is to clear state owned by a completed match at its
boundary. Our implementation uses existing authoritative snapshot boundaries;
it does not adopt OpenRA's lockstep protocol. No GPL source was copied.
