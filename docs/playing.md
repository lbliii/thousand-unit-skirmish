# Player guide

[Documentation index](README.md) · [Local setup](getting-started.md)

## Start a match

Choose **Play vs AI** for a solo match, or create a **New room** and share the
invite link for 1v1. Azure is the host and controls map changes and rematches.
Ember is the second player. Further connections watch as spectators.

When you take a player seat, the camera starts at your Town Center. Use **Fit
map** for an overview. Reconnecting to the same seat keeps your current view.

The default PvP scenario is [Forked Vale](forked-vale-scenario.md). Each team
starts with four workers, eight infantry, 150 food, and 250 wood. Own both
Signals to unlock Vale Watch, then hold all three objectives for 20 seconds.
At 15 minutes, the Watch owner wins; an unclaimed Watch means a draw.

Select workers and send them to food or wood. Build a Barracks or Archery Range,
train reinforcements, and choose which route to contest. Sending workers to an
objective can help capture it, but leaves fewer gathering and exposes them to combat.

## Select and organize

| Action | Input |
| --- | --- |
| Select a friendly unit or building | Left-click. |
| Add/remove a friendly unit | Shift-click. |
| Select units inside a box | Drag left to right. |
| Select units whose visible footprint crosses a box | Drag right to left. |
| Add a box selection | Hold Shift while dragging. |
| Select visible friendlies of one kind | Double-click one; hold Shift to add. |
| Cycle overlapping units | Pause after a click, then click the same point again within 1.2 seconds. |
| Select all units | `A` or the selection control. |
| Select workers, infantry, archers, military, or idle workers | Use the labeled quick-select controls. Military excludes workers. |
| Assign a control group | Ctrl/⌘ + `1`–`0`. |
| Add selection to a group | Shift + `1`–`0`. |
| Recall / center a group | Press its number / double-tap its number. |
| Cancel an interaction or clear selection | Escape; close the active panel/targeting mode first. |

Groups retain living friendly units and are cleared when the map, army size, or
assigned team changes.

## Issue orders

| Order | Input |
| --- | --- |
| Move | Right-click ground with units selected. |
| Queue a waypoint | Shift + right-click ground; up to eight per unit. |
| Attack move | Press `M` or choose Attack move, then right-click ground. The mode resets after the order. |
| Attack a unit | Right-click a visible enemy. Repeated clicks can cycle overlapping targets. |
| Attack a production building | Right-click it with military selected; workers cannot attack structures. |
| Gather | Right-click a food/wood node or harvestable forest cell with workers selected. |
| Construct | Choose Build barracks/range, then left-click a valid site. |
| Resume construction | Select the unfinished site and use Resume construction. |
| Set a rally | Select a friendly Barracks or Range, then right-click ground. |

Choose Box, Line, or Column before a move or attack-move order. Line and Column
face the destination. A plain ground order replaces queued waypoints. The order
feedback reports sending, planning, applied, rejected, or interrupted state.

## Economy and production

Workers gather finite resources, carry up to 10, return to base, and repeat.
Forest cells currently yield six wood each; exhaustion clears their movement
and sight block. Berry brushwood and regrowth are future experiments.

| Action | Cost | Time / condition |
| --- | --- | --- |
| Train Worker at Town Center | 50 food | 25 seconds. |
| Build Barracks | 175 wood | Workers construct a valid level 3 × 3 site. |
| Build Archery Range | 150 wood | Workers construct a valid level 3 × 3 site. |
| Train Infantry at Barracks | 50 food | 12 seconds. |
| Train Archer at Range | 25 food + 45 wood | 7 seconds. |
| Infantry Forging | 100 food + 75 wood | 25 seconds at a completed Barracks. |
| Archer Fletching | 125 food + 125 wood | 25 seconds at a completed Range. |

Production queues hold five units and reserve population. Blocked exits pause
spawning until space opens. Each attack upgrade adds 20% damage to its unit type;
only one research job runs per team at a time. Destroying a production building
loses its queue and active research.

## Camera, HUD, and sound

Scroll to zoom. Pan at a battlefield edge, with middle-drag, or with Space + drag.
Use the tactical map to move the camera; its focused arrow-key controls also pan.
Camera settings and help expose the available navigation controls.

The compact objective summary keeps active victory/deadline countdowns visible.
Open Objectives for prerequisites, rewards, live cards, and recent notices.
Selection controls expose the relevant production or unit actions. Hints can be
hidden and reopened; placement and targeting still show cancellation guidance.

Audio settings control effects, ambience, volume, and optional critical captions.
The Audio check lets you audition and identify cues. Settings persist locally.

## Winning and reconnecting

Capture rules depend on the map: any marked zone, all marked zones, an optional
continuous hold, or a deadline. Without marked victory zones, elimination checks
living units, queues, and affordable production reserves. Results freeze the
match until Azure starts another match or changes maps.

A lost connection retries automatically. Return through the same tab/session to
reclaim your seat within the configured grace window. See [local setup](getting-started.md)
if you join as a spectator or cannot connect.

If the connection drops while a building request is waiting for confirmation,
the placement preview closes. After reconnecting, check whether the building
appeared before placing another: the server may already have accepted the request.
