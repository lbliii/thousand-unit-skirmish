# Opening camera — 27 September 2026

## Observation and change

On Forked Vale at baseline `20d076b` with client recovery change `e18ee30`,
a new Azure player started with its small base near the upper-left HUD while
most of the battlefield was unexplored. The first construction check required
Home base before inspecting nearby units and sites.

When a welcome message assigns a new player seat, the client now uses its
existing default camera zoom and centers that team's Town Center in the space
available between HUD controls. A same-seat reconnect does not change the view.
Spectators retain the map-centered view and Fit map remains available to players.

## Browser evidence

Checked the change against `d7f9862` in the local in-app browser:

- Azure and Ember each started with their own base centered at 1280 × 720.
- Azure's opening also remained centered in the narrow 524-pixel browser panel.
- Ember selected Fit map, the disposable server was terminated and restored
  from its checkpoint, and the client visibly returned to ROOM LIVE as Ember
  with MATCH RESTORED feedback and the same map overview.
- A third connection was a spectator and retained its overview.

Existing camera controls and navigation-settings checks, client syntax,
documentation links, and whitespace checks passed. This is local browser
orientation/recovery evidence, not a novice comprehension or production claim.

## Review follow-up: waiting to reclaim a seat

Independent review at `8b6bcbb` found an intermediate reconnect state missing
from the direct restart check: the old connection can still hold the seat, so
the new connection temporarily receives `team: null, resumePending: true`.
When the old connection closes, the resumed player's welcome incorrectly looked
like a new seat and reset the camera.

Camera ownership now survives this temporary spectator state. Actual command
ownership still follows the server's current team assignment. A new seat or a
seat gained after an ordinary spectator state still centers normally.

The actual socket-handler regression fails for both seats before the fix and
passes afterward. It covers direct and pending-seat reclaim, changed seats,
ordinary spectators, genuine new ownership, and ignored stale socket messages.
