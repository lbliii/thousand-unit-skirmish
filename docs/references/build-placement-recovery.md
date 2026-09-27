# Build placement recovery — 27 September 2026

## Reproduction and decision

At source baseline `20d076b`, submit a building request, then disconnect before
the rejection notice or new-building snapshot arrives. The socket close handler
clears the tracked order but leaves `buildPlacementPending` set. Reconnecting
to the same seat and map with no new building leaves construction buttons
disabled and placement clicks ignored until the player discovers Escape.
This is a client lifecycle reproduction; it does not require a particular map.

The close handler now exits pending placement silently. This releases the local
controls without claiming to cancel the authoritative request or resending it.
The reconnect snapshot remains the source of truth for whether construction
started. An unsent placement preview survives, and an obsolete socket cannot
clear the current connection's placement.

## Source research

Inspected on 27 September 2026:

- [OpenRA placement order generator, pinned source](https://github.com/OpenRA/OpenRA/blob/9ea513cb117d3f453952efe2d5d31cf37c4bf431/OpenRA.Mods.Common/Orders/PlaceBuildingOrderGenerator.cs):
  `Order` exits input mode after emitting a placement order; `Tick` also exits
  when the corresponding completed production item no longer exists. The
  useful principle is an explicit lifecycle for the local placement mode.
  OpenRA's production queue and networking differ from our server-acknowledged
  worker construction, so this change preserves our waiting mode while connected.
- [openage game entity architecture, pinned documentation](https://github.com/SFTtech/openage/blob/abfc45a2563656bd10bc14c25756cf26391612b5/doc/code/game_simulation/game_entity.md):
  entity data, systems, and event-driven activity state have separate ownership.
  Applied here as a boundary: clearing browser input state does not undo or
  infer authoritative building state. This document is architecture guidance,
  not evidence of network recovery behavior.

No upstream code or assets were copied.

## Validation

`node --test scripts/client-build-recovery.test.mjs` executes the real socket
handler and placement cleanup with controlled socket events and UI dependencies.
Four cases failed before the fix; all five pass after it. Coverage includes
pending/planning/applied feedback, unsent previews, and obsolete socket closes.
The test runs in the standard CI suite. It does not claim a browser visual check
or a complete human match.
