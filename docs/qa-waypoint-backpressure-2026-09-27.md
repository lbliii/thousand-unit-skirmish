# Waypoint counts under transport backpressure — 2026-09-27

## Reproduced failure

At baseline `efb5530`, maps without fog share full snapshots between seats and
send owner-only waypoint counts separately when those counts change. Both
messages used one replaceable pending-state slot. A slow reader could have its
only queue update overwritten by the next snapshot, leaving its queue HUD stale
until another queue change or reconnect.

A deterministic transport fixture executing the server's actual broadcaster,
coalescing method, drain callback, and bounded write functions reproduced the
loss: queue count `[7, 1]`, then snapshots 10 and 11, delivered only snapshot 11.
The initial regression failed before the fix. This is a controlled transport
reproduction, not a newly observed human match failure.

## Resulting behavior

Each peer now retains at most one pending full snapshot and one pending owner
waypoint-count message. On drain, the newest snapshot precedes the newest counts.
That ordering also handles army-size/rematch snapshots that recreate the client
roster. Map changes and disconnects clear both pending messages. Map changes also reset
the queue-count deduplication cache so the same count in a new match is sent again. The existing
outbound byte limit still applies when the two frames are written, and metadata
is still sent only to its owning seat.

Seven focused regressions cover interleaved snapshots, queue clearing, a drain
that immediately re-enters backpressure, map-change invalidation, memory bounds,
and owner-only delivery. The existing live queued-waypoint recovery and slow
reader map-change scenarios also passed for this change. Both-seat checkpoint hold-clock recovery
checks passed after integrating main, and are now registered in CI.

## Open-source reference

Reviewed OpenRA's [`Connection.cs` at `9ea513cb117d3f453952efe2d5d31cf37c4bf431`](https://github.com/OpenRA/OpenRA/blob/9ea513cb117d3f453952efe2d5d31cf37c4bf431/OpenRA.Game/Network/Connection.cs).
Its order, immediate-order, and synchronization paths retain distinct queues,
and its send path explicitly orders synchronization bookkeeping around packet
writes. The relevant design lesson is to preserve each message class's delivery
contract. This game's authoritative snapshots may replace older snapshots;
owner metadata omitted from them requires its own retained value and ordering.
OpenRA's lockstep protocol is different; no source code was copied.

## Scope

The focused fixture controls socket backpressure deterministically. The live
scenarios protect existing command/checkpoint and map-change behavior; neither
establishes hosted bandwidth, latency, or hardware capacity.
