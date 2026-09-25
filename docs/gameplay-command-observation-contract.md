# Gameplay command and observation contract

Reviewed against merged `main` at `f1d6482` on 25 September 2026. This records the existing server contract and the v1 boundary for a deterministic PvE client. It does not change the WebSocket schema or gameplay rules.

## Seat and command authority

- A match has two player seats. A new session claims the first free team (`0`, then `1`); a resumed session keeps its assigned team. The server reports the assignment in `welcome.player.team`, with `welcome.player.isHost` true only for team `0`. A full room receives `team: null` and is a spectator; it must not issue player orders.
- The bot uses the ordinary authenticated room WebSocket. It takes its team only from `welcome.player.team`; a command must not contain a caller-selected team or seat. The session token is only for reconnecting and must not enter policy input or logs.
- Commands pass through the same decoded-message queue and `handleCommand(player, command)` path as human orders. The server derives ownership from the peer's assigned `player.team` and validates unit/building ownership, visibility, reachable destinations, prerequisites, resources, population, and command limits before changing the match.
- A bot adapter may call the validator internally only with a server-created peer/seat capability. No client-supplied object may stand in for `player` or choose its team.

### Ordinary gameplay commands

Commands are JSON objects with a `type` and the same arguments used by the current client:

| `type` | Arguments |
| --- | --- |
| `move`, `attackMove` | `ids`, `x`, `z`; optional `unitGenerations` aligned with `ids`, `formation` (`box`, `line`, or `column`), and `queue: true` |
| `attack` | `ids`, `targetId`; optional `unitGenerations` and `targetGeneration` |
| `attackBuilding` | `ids`, `buildingId`; optional `unitGenerations` |
| `gather` | `ids`, `nodeId`; optional `unitGenerations` |
| `build` | New site: `ids`, `buildingType` (`barracks` or `archery-range`), `x`, `z`. Resume construction: `ids`, `buildingId`. Either form may include `unitGenerations`. |
| `train` | `buildingId` (infantry) |
| `trainArcher` | `buildingId` |
| `trainWorker` | no extra arguments |
| `researchUpgrade` | `buildingId`, `upgrade` (`infantry-attack` or `archer-attack`) |
| `setRallyPoint` | `buildingId`, `x`, `z`; use `clear: true` to remove it |

Map selection/publication, army-size changes, and match reset are host controls, not bot strategy commands. `clientOrderToken` may be a positive integer to correlate a plain-text `notice`; notices are not a structured acceptance API. Treat subsequent authoritative state as the result of an order.

## PvE observation v1

Policy code receives an explicit allow-listed observation, built from the peer's latest `state` message and the assigned team. It does not receive the raw `welcome`, `mapChange`, `map`, or `maps` object. Decisions run at most once per second with a separate integer policy seed; each input is a complete latest snapshot, and the server may coalesce snapshots under backpressure, so consumers must tolerate skipped ticks.

The v1 observation contains:

- Its exact top-level allow-list is `{ schemaVersion, team, tick, map, fogOfWar, visibility, resources, units, buildings, workerProduction, research, resourceNodes, objectives }`, where `schemaVersion` is `1`, `team` comes only from `welcome.player.team`, and `map` is only `{ id, width, height }`.
- `units` and `buildings` each split into `friendly` and `visibleEnemies`; enemy entries only come from the assigned peer's fog-filtered snapshot.
- `resources` contains only the assigned team's `food` and `wood` numbers. `workerProduction` and `research` are only that team's state, projected out of the peer snapshot's team arrays.
- Objective locations, IDs, current owners, and prerequisite-owner state are public in fog-of-war matches. `objectives` therefore includes every objective's public fields: `id`, its public `zone` rectangle (`column`, `row`, `width`, `height`), `owner`, `victory`, `requires`, `requiredOwner`, and `requiresAll` / `requiredOwners` where present. `unitCounts` count only friendly units and currently visible enemies inside the zone; hidden enemies never contribute to the observer's counts. These are observed counts, not totals: `[0,0]` means no units inside that zone are individually visible and does not rule out hidden units. `progressTeam` and `progress` reveal capture activity only while every cell in the zone is currently visible to that observer. The human snapshot uses `-1` and `0` sentinels for hidden capture progress. The PvE DTO must derive `unitCounts` from its friendly and visible-enemy lists rather than copy private totals, and omit `progressTeam` / `progress` until the full zone is visible.
- `resourceNodes` contains only entries present in the assigned peer's visible `state.resourceNodes`. Since each state row has `id`, `type`, and current `stock` but no coordinates or `maxStock`, an adapter may look up only those IDs in the static `resourceNodes` list for `x`/`z`, then recheck the current visibility mask before emitting them. `type` and `stock` come from the peer snapshot. `type` is `wood` or `food`; nodes are finite and reset restores their initial stock.
- The deterministic integer policy seed is separate configuration; it is not a DTO field, a team selector, or a command argument.

The adapter may read only `resourceNodes[].{id,x,z}` for IDs already present in the peer snapshot and `triggers[].{id,zone}` to provide public objective locations, count individually visible units, and decide whether capture progress is observable. Public objective zone rectangles may be included in `objectives`; these lookup fields are not sent to policy for any other purpose. Do not include the opponent's economy, research, production, hidden units/buildings/resources, hidden objective totals or capture progress, session token, connection count, aggregate roster totals, match clock, `scenarioClockStarted`, or winner fields. The `map` object itself contains only `map.id`, `map.width`, and `map.height`; outside it, the only static geometry sent is public objective zone rectangles and coordinates attached to currently visible resources. Do not send hidden resource entries, spawn points, raw terrain/map data, trigger conditions/rewards, or scenario-event definitions. Objective locations, ownership, and prerequisite-owner fields remain public under fog, matching the human snapshot and the shipped scenario rule.

The human-facing fog rule keeps `victoryHold.activeTeams` and `progressSeconds` public: current victory-hold progress depends only on public victory-objective ownership and the public scenario clock, not hidden unit presence. Scenario-event `fired` state is public for map-wide effects, and `triggeredByTeam` is public when the event chain starts from a public objective capture or public event. The v1 PvE/model allow-list still omits `victoryHold`, `scenarioEvents`, and winner fields. If a future event source depends on hidden presence, position, or other private state, omit its attribution until that source is visible.

## Authoritative visual-state fields

The renderer consumes existing server state; no new animation-only server field is required for this checkpoint.

| State field | Meaning |
| --- | --- |
| Unit row `[id, team, x, z, hp, kind, cargo, cargoType, generation, task, focusedBy, ...]` | `task` is worker work intent: `gathering`, `returning`, `building`, `attacking`, or `null`. There is no authoritative `idle`/`moving` task; derive those from successive positions. `generation` increments when a unit ID is reused for a new spawn. `hp` is authoritative for hit/death transitions. |
| Optional unit row tail `[lastAttackTick, lastAttackX, lastAttackZ]` | A recent server-reported attack cue. Under fog, target coordinates are `null` for an enemy attacker when that target is not team-visible. |
| Building object `progress`, `complete`, `hp`, `maxHp`, `attackers`, `queue`, `trainingRemaining`, `trainingProgress`, `productionBlocked`, `rallyCell` | Construction progress/completion, damage, and production state. `complete` is a stable boolean and its false-to-true transition can drive one construction-finished cue. Enemy rally points are hidden under fog (`rallyCell: -1`). |
| Resource node `{id, type, stock}` | Current authoritative finite stock. Compare it with that node's initial map-definition stock for depletion stages; there is no `maxStock` field in the state protocol. |

The worker `task` does not distinguish food gathering from wood gathering. Use the visible resource node's `type` for that distinction; `cargoType` is only the worker's carried resource.

## Evidence and ownership

The PvE owner implemented the versioned allow-list and both-seat fog/rematch smoke against a deliberately hidden resource fixture in PR #27. Under the gameplay rule, objective locations, ownership, and prerequisite-owner state remain public; capture progress and team stay hidden until the entire objective zone is currently visible, while unit counts include only individually visible units. Victory-hold progress remains public because it depends only on public objective ownership and the public scenario clock. Capture-attributed event teams remain public for public capture/event sources. Future event attribution from hidden or private sources must be visibility-gated. Gameplay owns the server's ordinary command authority and this contract; the renderer owns client-side animation mapping.
