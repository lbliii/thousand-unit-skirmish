# Map authoring and schema

[Documentation index](README.md) · [Map catalog](maps.md)

## Author in Map Studio

1. Join as Azure and open Map Studio from Match Controls.
2. Set dimensions, base ground, both spawns, starting army/resources, and fog.
3. Paint terrain, obstacles, and elevation; place resources and objectives.
4. Set objective prerequisites, rewards, victory rules, and scenario events.
5. Validate, then **Save & Play Map** to publish it to the room. Both players switch.
6. **Download JSON** for a portable copy; import and reopen it to check the round trip.

Publishing resets the match. Use a disposable room when testing authoring.
Imported files must be under the editor's 900 KB limit. Saved IDs cannot overwrite
shipped maps; each room loads up to 16 custom maps. Remove a saved JSON and restart
the room to remove it from that catalog.

Shipped maps live in `maps/` and load on server startup. Custom-map storage is
room-scoped; see [configuration](configuration.md). `server.mjs` validates the
full definition, while `src/map-utils.mjs` shares reachability and dependency checks
with the editor. Existing shipped JSON is the best complete example.

## Coordinates and terrain

One world unit equals one cell. World `(0, 0)` is the map center; grid `column`
and `row` begin at the northwest corner. World positions use `x` and `z`.

| Field | Contract |
| --- | --- |
| `id`, `name`, `summary` | Lowercase hyphenated ID; nonempty name up to 48 characters; optional brief up to 120 characters. |
| `width`, `height` | Integer dimensions, each 16–256. |
| `terrainSeed` | Deterministic visual seed. |
| `spawnPoints` | Exactly one `{team, x, z}` for each team 0 and 1, inside open terrain. |
| `startingArmySize` | Optional even total from 8–2,000. Omission uses the 1,000-total fallback. |
| `startingResources` | Optional shared `{food, wood}`; each integer 0–100,000, omitted values zero. |
| `fogOfWar` | Boolean, default false. |
| `terrainBase` | Any of the sixteen grounds in the [environment catalog](environment-pack-v1.md#asset-roles), including the regional companion grounds. |
| `terrainPatches` | Up to 4,096 nonoverlapping `{column, row, width, height, material}` rectangles. Ground paint does not block movement. |
| `obstacles` | Required array of up to 4,096 nonoverlapping rectangles; material is `stone`, `forest`, or `water`. Optional positive `elevation` is obstacle height. |
| `elevationPatches` | Optional nonoverlapping rectangles with integer `level` 0–2; at most 4,096. Omitted cells are level 0. |

Ground elevation and obstacle height have different meanings. A one-level ground
edge is traversable; a two-level edge is a cliff. Uphill route cost is 115 versus
100 normally. Elevated sources receive one extra cell of sight radius; there is
no elevation damage bonus. Building sites must be level. See [living land](living-land-experiment.md).

Resources and objective zones must be reachable from both spawns. Rectangles
must fit the map. Resizing clips terrain/zones and moves cropped markers to the
edge for review; always validate the result before publishing.

Town Centers now reserve collision cells around the position computed by
`src/town-center-spawn.mjs`. Keep nearby resources and exits outside that base;
check actual worker routes after moving a spawn. The terrain-only authoring
checks do not replace a played opening with the Town Center present.

## Resources and forests

`resourceNodes` contains up to 128 finite food or wood sites, each with an `id`,
`type`, world `x`/`z`, and positive finite `stock`. Map Studio can add, select, change stock, or remove
nodes. Obstacle painting over a node removes it.

Forest obstacles also have six wood per cell in the current simulation. They
use a separate cell address (`row * width + column`) and mutable stock table,
rather than consuming ordinary resource-node slots. Cutting a cell clears its
path/sight block; reset restores it. See [harvestable woodland](harvestable-woodland-pilot.md).

## Capture objectives

`triggers` supports up to 32 `capture-zone` entries:

| Field | Meaning |
| --- | --- |
| `id`, `name`, `zone` | Stable identity, display name, and grid rectangle. |
| `requiredUnits`, `captureSeconds` | Integer force of 1–1,000 and capture duration (0.5–60 seconds). A team must also outnumber its opponent. |
| `requires` | One prerequisite objective ID. |
| `requiresAll` | Two to 31 prerequisite IDs; use this or `requires`, never both. |
| `foodReward`, `woodReward` | Integer 0–10,000 reward per completed capture or recapture. |
| `unitCount`, `unitKind` | Optional 0–25 reinforcements; kind is `worker`, `infantry`, or `archer` (default infantry). |
| `victory` | Mark an objective as part of the map's capture victory rule. |
| `message` | Optional announcement, up to 120 characters. |

All prerequisites must belong to the capturing team. Missing references,
duplicates, self-references, and cycles are rejected. Capture messages support
`{team}`, `{objective}`, `{reward}` (food), `{wood}`, `{units}`, and `{kind}`.
Reinforcements use open cells near base, obey roster caps, and report actual delivery.

Capture completion on a tick is resolved before victory evaluation. Objective
locations and ownership are public under fog; progress is shown only when the
whole zone is visible to the viewer.

## Victory rules

- `victoryMode: "any"` (default): own a marked objective.
- `victoryMode: "all"`: own every marked objective simultaneously.
- `victoryHoldSeconds`: optional continuous hold of 0.5–3,600 seconds. Losing the
  condition resets that team's hold. Holds advance only with the match clock,
  including a partial first evaluation interval when the second seat joins.
  Checkpoint recovery preserves active progress. Omission keeps capture victory immediate.
- `timedVictory: {afterSeconds, objectiveId}`: at the deadline, that objective's
  current owner wins; an unclaimed objective draws. A contest without a completed
  capture does not change its owner.
- No marked victory objectives: elimination considers living units, queued units,
  and the ability to afford production from remaining buildings/resources.

Capture/hold/elimination results on the same evaluation take precedence over a
deadline. Due supply deliveries occur before a timed result. Final results stop
the simulation and pending events and survive reconnect until reset/map change.

## Named regions and region conditions

`regions` is an optional array of up to 32 `{id, name, zone}` rectangles. IDs are
unique lowercase hyphenated names; display names are 1–48 characters. Zones use
integer grid `column`, `row`, `width`, and `height`, fit the map, and may overlap.
They do not block movement or establish capture ownership.

Map Studio's **Named regions (JSON)** field edits these rectangles and previews
valid regions with purple outlines. Invalid in-progress text survives local draft
recovery; validation blocks publishing/export until it is corrected. Region
painting and drag handles are future authoring work. Shrinking a map requires
reviewing region bounds before validation.

Select **Region reached** on a scenario event, enter its region ID, entering
team (`"0"`, `"1"`, or `"either"`), optional unit kind, and minimum living units
(1–1,000). This creates a bounded declarative trigger:

```json
"trigger": {
  "type": "region-entry", "regionId": "pass", "team": "1",
  "unitKind": "worker", "minimumUnits": 3
}
```

The first qualifying presence starts the event delay once. Initial occupants
qualify when both seats start the match clock. Eligibility is sampled after
simulation updates; this is not a continuous swept-path detector. Either-team
ties choose Azure deterministically. Leaving the region does not cancel an armed
event. Dead units do not count. Recipients are configured independently using
Azure, Ember, or both; `"capturing"` remains exclusive to capture-rooted chains.
Existing reward/message fields are the actions, including food, wood,
reinforcements, and technology. Region events can repeat deliveries and lead
into ordinary event-completion chains. Activation, entering team, deadlines,
and delivery state survive checkpoints; reset rearms them.

## Scenario events

`scenarioEvents` supports up to 32 `timed-supply` entries. Each has an `id`, `name`,
`afterSeconds` (0.5–3,600), and recipient `team` (`"0"`, `"1"`, `"both"`, or,
for a capture-rooted chain, `"capturing"`).

| Trigger | Clock starts |
| --- | --- |
| Omitted | When both seats join. |
| `{type: "capture", objectiveId}` | First completed capture of that objective. |
| Capture trigger with `occurrence: "recapture"` | First later ownership flip; initial neutral capture does not qualify. |
| `{type: "event", eventId}` | After the source event's final delivery. |
| `{type: "event", eventIds: [...]}` | After all named source events finish, including repeats. |

Use one event source or an all-of list, never both. Chains may branch and join
but cannot contain cycles, duplicates, or missing references. A joined
`"capturing"` chain must have an unambiguous shared capture root.

`foodReward` is required, including an explicit zero for other-effect events.
Rewards can combine food/wood (0–10,000 each), reinforcements (0–25 per recipient),
and `technologyReward` (`infantry-attack` or `archer-attack`). A technology reward
completes a matching research job and has no extra effect if already owned.
An announcement can be the only effect; an otherwise empty zero-reward event is invalid.

Set `repeatCount` (1–20 additional deliveries) together with
`repeatEverySeconds` (5–3,600). The interval starts after each completed delivery.
Messages support `{event}`, `{reward}`, `{wood}`, `{team}`, `{units}`, `{kind}`,
and `{technology}`. Capture-rooted events can use a victory objective while an
all-objective match with multiple crowns continues, or during a nonzero victory hold.

Event activation, recipient attribution, repeats, deadlines, and completion are
checkpointed. Reset clears the state for the next match.

## Verify a map

Use [testing](testing.md) for layout, capture/event, persistence, and browser
round-trip commands. Test both seat assignments and the intended roster size.
Static equal distances are useful evidence, but playtests establish whether the
routes and economy create meaningful choices.
