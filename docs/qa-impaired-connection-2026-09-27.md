# Delayed connection recovery — 27 September 2026

[QA plan](qa-vertical-slice.md) · [Testing](testing.md)

## Fixture and outcome

`node scripts/impaired-connection-scenario.mjs` starts a disposable authoritative
worker and two TCP relays against baseline `e5efc50`. Each relay delays ordered
bytes by 40 ms in each direction. The authored map has 24 starting units,
unobstructed mirrored bases, no gathering income, and 1,000 wood per seat.

Both seats passed these cases:

1. A move receives feedback with its original order token through both delays.
2. A Barracks request reaches the server, but its originating connection loses
   all subsequent feedback. The opposing seat observes acceptance before the
   connection is cut. Resume restores exactly one Barracks and 825 wood.
3. Another build request is cut off before delivery. Resume still shows one
   Barracks and 825 wood. The fixture does not replay an uncertain request.
4. A fresh move is accepted after recovery. Pending-seat recovery follows
   `resumeAvailable` before retrying the resume handshake.

The recorded final run delivered 110 delayed byte chunks. Measured relay delay
was 39.58 ms minimum and 41.63 ms p95. Move acknowledgements were 85.16 ms for
Azure and 86.06 ms for Ember. These are local fixture observations under the
current host load, not supported-hardware performance budgets.

## Research and interpretation

Pinned [OpenRA network connection source](https://github.com/OpenRA/OpenRA/blob/9ea513cb117d3f453952efe2d5d31cf37c4bf431/OpenRA.Game/Network/Connection.cs)
separates sent orders from acknowledgement and disconnect processing. Its
lockstep frame acknowledgements differ from our authoritative snapshots; the
useful testing principle is to distinguish sending an order from observing its
accepted result. No upstream code was copied. The earlier
[openage architecture comparison](references/build-placement-recovery.md#source-research)
also motivates keeping browser input cleanup separate from authoritative state.

This covers delayed WebSocket transport and abrupt connection loss. It does not
simulate IP packet loss, sustained congestion, a 2,000-unit network workload,
TLS/proxy deployment behavior, browser input, or human comprehension. No new
runtime defect was found. The existing client placement and camera regressions
cover local controls across the same recovery boundary separately.
