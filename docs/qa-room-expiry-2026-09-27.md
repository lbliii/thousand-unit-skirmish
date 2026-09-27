# Invite idle-expiry boundary — 27 September 2026

## Reproduction and result

Base: `20d076b1b8254f877e6c27a28fe1d3fae1818883`. Local Node 24.9.0,
loopback supervisor and isolated worker processes; default Forked Vale startup.
No browser or deployed-match claim is made.

`node scripts/room-expiry-scenario.mjs` seeds two saved invite directories with
an idle deadline four seconds ahead and a sentinel custom-map file. It starts a
WebSocket join before expiry, pauses that worker with SIGSTOP before readiness,
and looks up the invite after the saved deadline. On the base build this returns
404: the supervisor deletes the room directory while its worker is starting.
The worker can subsequently become ready with an invite no longer in the index.
Separately, a direct WebSocket join used to skip expiry and could revive an idle
room that HTTP lookup would delete.

With the fix, the pending join retains its room and map file, returns 101 after
SIGCONT, and the independently expired invite returns 404 without launching a
worker. Room count falls to one. HTTP lookup, direct joins, and periodic cleanup
share the same expiry predicate; pending admissions protect asynchronous startup.
The idle timestamp advances when admission begins and ends.

The test uses real processes, sockets, persistence, and the production minimum
60-second TTL. Old saved timestamps make the boundary test short. SIGSTOP/SIGCONT
make this a Unix integration scenario, matching the existing macOS/Linux tooling.

## Open-source reference and decision

Inspected OpenRA `OpenRA.Game/Server/Server.cs` at commit
[`9ea513cb117d3f453952efe2d5d31cf37c4bf431`](https://github.com/OpenRA/OpenRA/blob/9ea513cb117d3f453952efe2d5d31cf37c4bf431/OpenRA.Game/Server/Server.cs),
particularly `AcceptConnection` and `DropClient` (lines 421–479 and 1207–1274).
OpenRA checks server lifecycle state before accepting a connection, and performs
connection removal and empty-server notification inside its lobby lock. This
supports treating admission and expiry as one lifecycle decision here. Our Node
supervisor reserves synchronously before its first startup await and releases in
`finally`; no OpenRA code was copied. OpenRA's GPL-3.0-or-later source is a design
reference, not a dependency. Its lockstep/disconnect rules are not adopted as our
checkpoint-and-resume protocol.
