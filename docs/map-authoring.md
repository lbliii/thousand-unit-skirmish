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

### Organic landscape composition

The 30 September player observation was that maps read as separate squares of
water, road and trees rather than natural places. More cells alone cannot solve
this: the regional generator explicitly authored rectangles. Keep the one-cell
simulation grid, but treat rectangles as a compact storage format for shaped
landscape regions, not as the design vocabulary.

`src/landscape-authoring.mjs` now compiles irregular outlines and wandering paths
to nonoverlapping row runs, merging identical runs vertically. The regional map
generator uses these shapes across twelve maps. Underbough and Vesperra connect
their corner and interior grove cores with sweeping woodland fringes, leaving
resource working clearings. Other regional groves remain discrete; cultivated
orchards and irrigation may appropriately retain some human geometry. Shapes
are deterministic and reflected between seats. Woodland additions change routes
and stock; they require the same reachability and match checks as other blockers.

Runtime trees now vary their root positions by up to 0.39 cell in each axis,
within their harvest cell. Water surfaces clip exposed convex corners by 0.45
cell and follow those diagonals with shallow shore bands. These are visual
changes; they do not make water walkable. The battlefield's eight-cell grid is
hidden by default; `?terrainGrid=1` restores it for debugging. Map Studio retains
its authoring grid. Saved maps need no new fields or partial-cell collision rules.

Underbough and Vesperra also graduate canopy size by distance from open ground:
the first forest-cell ring uses 68% of its family scale, the second 86%, and the
core retains full scale. Their understory is more frequent at the margin than
in the deep canopy. This uses the complete forest footprint, including internal
glades, rather than rectangle boundaries. Harvest roles, roots, stock and
depletion/reset ownership stay the same. `?forestHabitat=flat` restores uniform
family scales for paired developer review. Other regions retain their current
scale profiles pending habitat-specific visual review.

Bellweather Millrace and Underbough Rootways ground their starting settlements
with irregular worn-soil pads centered on the actual Town Center spawn position,
plus gently bowed working tracks towards nearby food/wood nodes. The pads follow
the hall's real footprint, not the army marker. This is ordinary ground paint;
all other map fields remain unchanged and new wear excludes blocked cells.
This starting-site pass does not add settlement structures, change placement
rules, or generate paths for buildings constructed during a match.

This is a first composition pass. Individual shore steps, reflected layouts,
repeated regional layout templates and sparse scenery are still visible. A
connected woodland is better than rounded isolated rectangles, but it does not
yet supply the full ecological detail or settlement composition we want.

#### Research and next implementation order

The primary references are [0 A.D.'s map-generation API](https://docs.wildfiregames.com/javascript/rmgen/)
(clumps, chains, paths, layered painters and placement constraints),
[Tiled's terrain authoring](https://doc.mapeditor.org/en/stable/manual/terrain/)
(terrain regions with transitions), and
[Red Blob's terrain and tree-placement guide](https://www.redblobgames.com/maps/terrain-from-noise/)
(broad habitat fields and irregularly spaced vegetation). These establish useful
techniques; they do not certify this implementation or imply copying their code.

1. **Compose one landscape before expanding the roster.** Develop Underbough
   Rootways with a readable clearing network, connected woodland masses, small
   bays and tongues in the tree line, and distinct foreground/background groups.
   Use protected base pads, resource access and objective approaches as design
   constraints. Start from a landscape sketch and route graph, then rasterize.
2. **Finish continuous shore contours.** The current diagonal clipping is a
   bounded improvement. A continuous contour mesh with bank material, shallows
   and habitat-specific reeds should remove the remaining staircase. Keep its
   maximum deviation from blocking cells explicit; test narrow channels, islands,
   map edges and ford widths. Do not conceal a blocked bank beneath apparent land.
3. **Graduate vegetation by habitat.** Keep dense harvestable cores, thinner
   margins, small satellite clusters, understory and deliberate clearings.
   Decorative fringes may use fractional world positions and irregular spacing;
   they need distinct ownership from harvestable cells and must not imply hidden
   collision or disappear inconsistently when a wood cell is cleared. Do not
   blanket the whole map with uniformly random props.
4. **Ground settlements in the landscape.** Preserve legal level footprints and
   production exits. Add visually shaped worn pads, approach paths, fences and
   small functional groupings oriented towards routes or water. Keep cultural
   differences: an orchard is cultivated, a forest is not a plantation. Building
   art and dressing can have free visual positions without fractional simulation
   footprints or silently rotating gameplay entrances.
5. **Expose landscape tools in Map Studio.** Add round falloff, connected grove,
   path and contour brushes with previews, undo and JSON round-trip checks. Use
   the same compiler for authored shapes and shipped maps. Round blocker strokes
   are implemented; higher-level grove/contour brushes and terrain undo remain.
6. **Polish materials after silhouette approval.** Use quiet texture families,
   habitat transitions and sparse decals. Existing stochastic ground sampling
   helps repetition; extra texture resolution cannot correct a square coastline.
   Increase visual mesh/mask resolution where captures expose a limit, and only
   increase simulation-grid resolution if gameplay needs it and measured costs
   justify it.

Map Studio's **Landscape shape** now defaults to **Round stroke** for Forest,
Water, Rocks, Ridge, Cliff and Erase. Choose 1/3/7/11-cell widths and drag a
connected shape; the grid previews exactly the cells to be changed. **Rectangle**
retains the previous drag-box behavior. Marker and ground/elevation tools keep
their separate placement rules. A blocker stroke removes resource nodes only
from painted cells, including when the curve encloses an unpainted corner.
Download and Save & Play use the existing compressed rectangle schema. The
current Undo Scenario Edit still covers regions/events, not terrain strokes;
terrain undo and more expressive grove/contour brushes remain follow-ups.

Review each slice in the actual renderer at ordinary and strategic zoom, with
units, buildings, selection and fog. Require recognizable landscape masses,
legible paths and truthful shore/forest boundaries, then replay both-seat
gather/build/capture/rematch behavior. Compare exact cameras against the previous
map, record forest stock and travel changes, and measure added rendering cost
separately from appearance. Human 1v1 and a visual review remain necessary before
claiming a beautiful, balanced finished landscape.

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

Map Studio provides **Draw Region**, **Select / Move**, and **Resize** tools. Drag
on the grid to create or move a rectangle; resize from its lower-right extent.
The region selector and typed name/bounds fields support exact edits and deletion.
Purple outlines show regions; the selected outline is heavier. Overlapping regions
select the most recently drawn. **Undo Scenario Edit / Redo** retain 64 region/event
edits; opening or resizing a map starts fresh history. Advanced JSON remains available.
Invalid drafts remain local; validation blocks publishing/export and cannot replace
the last valid published map. Shrinking clips regions within the new grid.

Select **Region reached** on a scenario event, choose a named region, entering
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

## Completion conditions and host diagnostics

Choose **Construction complete** or **Research complete**, then a registered
building/technology and team in the typed event form. JSON uses
`{type: "construction-complete", buildingType: "barracks", team: "0"}` or
`{type: "research-complete", technologyId: "infantry-attack", team: "1"}`.
Team may be `"either"`. The first qualifying completed state arms the existing
delay once, including completed initial state (the home Town Center qualifies).
Azure wins simultaneous either-team ties. Destroying the building or losing state
later does not cancel an armed event. Recipients remain Azure, Ember or both,
independently of the completing team. Repeats, rewards and ordinary event chains
remain supported. Activation and deliveries survive checkpoints; rematch rearms.

**Live host event diagnostics** in Map Studio shows at most 32 current event rows:
waiting, armed, delivered (repeating), or completed; activation reason/team/time,
delivery count and recipients. Only Azure, the room host, receives this diagnostic
payload, including on maps without fog. It derives from persisted event state, so
recovery needs no growing trace log. It is a current-state trace, not a match replay.


## Pre-match elevation

Choose Raise +1, Lower −1, Level 0/1/2 or Smooth under Ground Level, then drag on
the grid. Smooth averages the painted cells with their cardinal neighbors from
an immutable stroke snapshot. Save & Play renders slopes, terrain-following
sprites, objective ground and fog. Ground clicks raycast the rendered surface.

Enter an unsigned 32-bit Hill Seed and choose Generate mirrored rolling ground
to replace the draft's heights with deterministic hills. It preserves mirrored
flat pads around spawns, Town Centers, resource nodes, objectives and water.
Generation uses levels 0/1 so it introduces no impassable cliffs. Save/download
serializes the resulting elevation patches and seed; no randomness runs during
the match. Elevation edits use local draft recovery, but the scenario Undo button
still covers only named regions and events. Download first to retain an earlier
height layout.

Level 0 to 2 directly creates an impassable edge. Paint level 1 between them to
create a ramp. The existing authoritative rules remain: uphill steps cost 115
versus 100 on flat ground, high ground extends sight, and construction requires
an equal-level footprint. Validate paths and build space after sculpting.

The initial renderer derives corners from neighboring cell levels, with visible
vertical walls at cliffs. Exact independent corner sculpting and water on raised
terraces are unsupported; keep water at level 0. Optional decorative mist remains
a flat-map art study. This is pre-match authoring, with no in-match terraforming.
Regional Palette sets ground/audio defaults independently of named scenario regions.

### Underbough clearing ground

Underbough Rootways uses meadow as its authored base so clearings receive the
regional grass texture. Forest root masks add shaded soil under woods. The
renderer keeps Underbough vegetation tied to its region independently of that
base paint; minimap, Studio and exposed borders follow the actual base. Changing
the paint does not change terrain blockers, wood cells or routes.
