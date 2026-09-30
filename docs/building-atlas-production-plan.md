# Building sprite-atlas production plan

[Art lanes](art-production-lanes.md) · [Model/capture pipeline](building-asset-production-pipeline.md) · [Sprite contract](sprite-atlas-contract-v1.md)

Proposal, 30 September 2026. Source inspection: local revision `d595708`.
This plans asset production; it does not change gameplay or claim new runtime art.

## Reference found and reviewed

The downloaded references are in `/Users/lb/Downloads`:

- `City_Builder_Village_Buildings_part_1/` and `City_Builder_Village_Buildings_part_2.zip`: 25 village designs including houses, village hall, longhouse, stable, granary, lumber shed, watchtower, windmill, watermill, farmhouse barn, forge and market stall.
- `castles_pack_part_1.zip`, `castles_pack_part_2.zip`, `castles_pack_part_3.zip`, and `castles_pack_extra.zip`: castle, palace, manor and fortress families. Inspected archive listings contain 75 named designs in parts 1–3 and 20 in extra.

Visually inspected the village timber-frame house rotation sheet, the Rajput palace rotation sheet from castle part 1, and our current Town Center eight-view contact sheet. The village pack's README identifies polyy.ai generation and specifies an 8 × 4 grid with 32 azimuth views, 11.25° apart, at 30° elevation. It offers nine grid resolutions, three lighting choices, palette variants, aligned normal/height maps and transparent backgrounds. The castle example also visibly contains 32 views; its precise camera/scale contract still needs confirmation before reuse.

The reference demonstrates reusable direction sheets and strong architecture families. Its `1x1` village labels normalize every design to one reference tile; they do not establish physical scale relative to our Workers or our 3/5-cell gameplay footprints. Our camera uses 46° elevation. Do a camera comparison before importing reference pixels. Preserve source/license provenance if any downloaded pixels enter a runtime pack.

A **sprite sheet** is the regular grid of views/states. A **texture atlas** is the packed runtime texture, possibly with differently sized rectangles. A **building sprite pack** includes those images, manifest, masks, pivots, source and previews. Plan one pack per building, with independently packable atlas pages; avoid one enormous sheet for the whole roster.

## Current roster and production queue

`src/gameplay-definitions.mjs` defines eight buildings. Footprint is square occupancy in world cells, not image canvas size. Existing direct sprites cover Barracks and Archery Range. Town Center uses captured directional lifecycle artwork through `src/captured-building-art.mjs`; `src/main.js` passes the live building state. Some pack READMEs still describe older static-center behavior, so use current code and expansion/repair rules when planning coverage.

| Order | Building | Current footprint | Gameplay identity | Art brief and useful reference |
| --- | --- | --- | --- | --- |
| 1 | Town Center | 5 × 5 | Workers, resource drop-off, population, Tier II research | Civic anchor: broad main hall, secondary wing or arcade, prominent entrance/plaza and raised central feature. Village hall/longhouse plus restrained manor/keep massing. Rework scale and silhouette first; existing five-state/eight-view captures are a baseline. |
| 1 | House | 3 × 3 | Population | Clearly smaller domestic cottage, one principal roof and chimney. Thatched cottage/timber-frame house. Produce alongside Town Center as the scale control. |
| 2 | Storehouse | 3 × 3 | Food and wood drop-off | Broad loading opening, covered bay, crates/logs and grain storage. Granary/lumber shed. Must read differently from House. |
| 2 | Stable | 3 × 3 | Scout/Rider production and mounted research | Open stalls, paddock cues, hay and tack; recognizable horse-scale entrances. Reference stable. |
| 2 | Workshop | 3 × 3 | Siege production and engineering | Wide assembly bay, beams, wheels and unfinished machinery. Forge/longhouse vocabulary; distinguish from a domestic smithy. |
| 2 | Watchtower | 3 × 3 | Ranged defense and sight | Narrow elevated platform with strong vertical silhouette. Reference watchtower; tall does not mean a broad civic base. |
| 3 | Barracks | 3 × 3 | Infantry/Spearman and military research | Military hall, weapon racks, training frontage and banners. Retain useful existing identity; bring camera/scale/directions into the shared contract. |
| 3 | Archery Range | 3 × 3 | Archers and fletching research | Open shooting lanes, targets and canopy. Retain current useful design; targets must survive strategic zoom. |

Complete designs for all eight before multiplying states. Produce each useful pack progressively; existing Barracks/Range art need not wait for a roster-wide replacement.

## Scale comes before state multiplication

User observation: the current Town Center looks too small and house-like. This is a player observation, not a measured in-match size diagnosis. Its contact sheet confirms a compact single-hall design. The current capture contract is 640 × 640 at 128 pixels/world unit: a five-unit canvas, with transparent margins. A five-unit canvas does not mean a five-unit visible building. The direct Barracks/Range renderer also uses a five-unit canvas despite three-cell occupancy.

First make a shared-scale comparison with a current Worker, House, Town Center, Barracks and Watchtower. Show occupancy outlines, ground anchors, doors and visible bases at normal and strategic game zoom, on flat ground and representative slopes. Keep camera, lighting and pixels/world unit identical; do not resize each object to independently fill the same square.

Proposed starting targets, subject to that review:

- House visible ground base: about 2–2.5 world units across, contained within its 3-cell occupancy.
- Ordinary production/drop-off buildings: about 2.5–3 units across; distinguish their yard/open-space allocation.
- Town Center visible ground base: about 4–4.5 units across within its 5-cell occupancy, roughly 1.7–2 times House width. Use wings and a civic entrance so enlargement also changes identity. Give its central mass more height than House, without requiring it to exceed Watchtower height.
- Watchtower base: about 1.5–2 units across, with height carrying recognition. Keep its full silhouette in a taller canvas if necessary.
- Calibrate doors and bays against the actual Worker/Rider art; do not establish a second incompatible human scale.

Measure visible alpha bounds and modeled ground dimensions separately. A projected image width includes height and perspective, so alpha width alone is not a ground-footprint measurement. If the enlarged Town Center needs a larger canvas, enlarge the canvas at the same pixels/world unit and update anchor metadata. Never grow collision implicitly from image bounds. Verify that decorative overhangs do not conceal accessible exits or neighboring occupancy. Scale correction may require model redesign/re-capture, not merely a sprite multiplier.

## Views, states and runtime packaging

Use the existing preferred model-to-capture workflow: complete concept → matched lifecycle concepts/models → shared orthographic capture → manifest and runtime images. Start with eight azimuths at 45° intervals and 46° elevation, matching the Town Center convention. Review view switching before choosing 16 or the reference pack's 32 views; additional directions multiply all states and masks.

For each of the eight implemented types, plan Foundation, Frame, Complete, Damaged and Critical: five states × eight directions = 40 color frames per type, 320 across the roster. Use aligned team masks for Azure/Ember rather than duplicating every color frame, where recoloring is visually reliable. Full-frame masks would add up to 320 mask frames. Exact atlas count follows cropping, resolution and memory measurements; 320 frames is coverage, not 320 separate required textures or generation calls.

Record actual simulation progress/HP mapping per pack; existing direct and captured paths use different thresholds. Derive all states from the same complete design and keep camera, scale and ground pivot registered. Ruins, fire loops, smoke, production animations and opening doors are later optional layers, tied to a supported gameplay cue. Do not invent destroyed-building persistence merely to use a ruins frame. Keep selection, health, rally and queue feedback in the renderer.

The current runtime largely loads individual frames; packed-atlas sampling and generalized directional selection for other building types require renderer work. Do not label a generated atlas as integrated until that path loads it. Keep flattened frame compatibility exports while introducing atlas pages. Use the existing sprite contract for bounds, pages, clips, pivots and provenance; document any additional building-view binding explicitly.

Keep lighting/palette alternatives as source experiments rather than multiplying the entire runtime family. Start with one coherent Frontier architectural kit and team accents; Vaelora regional architecture is a later variant outcome.

## Future buildings: separate design briefs

These are absent from the current building registry. Prepare reference boards or complete concepts when their gameplay roles are selected; defer full lifecycle atlases until footprints and states are known.

| Candidate | Proposed role to resolve | Reference/design direction |
| --- | --- | --- |
| Mill | Food processing/drop-off or economic upgrade; differentiate from Storehouse | Windmill/watermill. Animated machinery needs its own layer/clip, separate from camera directions. |
| Farm | Renewable food plot and Worker interaction | Crop plot plus modest shed/farmhouse; prioritize field visibility. Planting/growth/depletion require an agreed economy contract. |
| Lumber camp | Dedicated wood economy, if distinct from Storehouse | Lumber shed, log piles and covered cutting bay. |
| Blacksmith | Dedicated upgrade building, if research moves from producers | Forge, chimney and open work area. Current forging research does not imply a separate implemented smithy. |
| Market | Trade/economy function | Market stall/courtyard. |
| Castle/Keep | Major defensive or advanced-production role | Selected keep/castle family; substantially stronger fortified identity than civic Town Center. |
| Walls and Gatehouse | Connected defense and access control | Modular straight/corner/end/gate pieces; topology and open/closed states need their own contract. |
| Temple, dock and specialty buildings | Only after a gameplay role is selected | Chapel/shrine and waterside references; no full production queue yet. |

## Delivery sequence and review evidence

1. Build the Worker/House/Town Center scale comparison and select a civic silhouette at game size. Record measured ground bases, camera, pivots and the chosen ratios.
2. Finish Complete concepts for the other six types and a roster contact sheet. Confirm each function is recognizable without labels.
3. Deliver House and revised Town Center packs, then Storehouse, Stable, Workshop and Watchtower. Update renderer presentation bindings with each pack; preserve fallback behavior.
4. Bring Barracks/Range into the same directional convention, reusing existing useful states where they hold up.
5. For each delivery, check both teams, construction/damage/repair, view transitions, fog, nearby units, exit readability, terrain contact and both zoom levels. Record build, map and screenshots in QA; keep source-ready and runtime-observed status separate.
6. Measure decoded texture memory and draw calls on a representative mixed-building settlement before choosing shared atlas pages or larger direction counts. Do not copy every reference resolution/lighting variant into runtime.

Next concrete outcome: a scale-calibrated House/Town Center comparison and revised Complete Town Center design, before purchasing or generating the full roster's state families.
