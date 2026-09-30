# Map catalog

[Documentation index](README.md) · [Map authoring](map-authoring.md)

## Vaelora default roster — 30 September 2026

**Bellweather · Millrace** is the default two-seat map. Seeded solo play chooses
Millrace or Underbough Rootways. The picker lists the regional roster first and
prefixes earlier shipped maps with **Lab**; their stable IDs and files remain
available for regression scenarios, stress runs and art review.

These are invented playable sites inspired by the [lore atlas](lore/README.md),
not surveyed locations or confirmation of unresolved inhabitants. Multiple maps
can share a region. Bellweather has a crossing map and an open orchard common;
Ru’Lora has distinct living-fringe and petrified-interior expeditions.

Every opening has 24 units, 150 food and 250 wood per seat, fog, mirrored resources,
clear Town Center footprints and three capture posts. Millrace and the remaining
roster require both outer posts to unlock the watch, then all three owned for
20 seconds. Rootways instead requires both outer clearings for 30 seconds;
its central Supply Grove pays food/wood without being a prerequisite. On every
map the central post's owner wins at 15 minutes; an unclaimed deadline draws.
Equal relief supplies arrive at two minutes.

Millrace now has orchard-side food/wood expansions and three broad ford approaches.
Rootways has paired copper woodland belts: gathering trees can open shorter routes
between clearings, while armies can use the existing longer passages. Both
flagships have seeded mirrored rolling ground and flat base, water and marker pads.
These are distinct tactical layouts rather than copies of the same regional skin.

| Map | Grid | Route character | Ground / asset palette |
| --- | --- | --- | --- |
| [Bellweather · Orchard Common](../maps/bellweather-common.json) | 96 × 72 | A wide common between paired orchards; outer harvests compete with the central market route. | `short-grass` |
| [Bellweather · Millrace](../maps/bellweather-millrace.json) | 80 × 72 | Three broad fords divide orchard banks. Secure both crossings, then the Mill Watch. | `meadow` |
| [Ellionar · Channel Gardens](../maps/ellionar-channel-gardens.json) | 80 × 72 | Irrigation channels divide cultivated gardens; wide maintenance crossings keep armies moving. | `garden-loam` |
| [Pale Meridian · Observation Road](../maps/pale-meridian-observation-road.json) | 80 × 72 | A snowbound observation route crosses low ridges; the exposed center rewards careful scouting. | `snow` |
| [Ru’Lora · Fringe Path](../maps/ru-lora-fringe-path.json) | 80 × 72 | Living vegetation meets salt and broken stone. Rival expeditions contest the approach, not a demon town. | `jungle-loam` |
| [Ru’Lora · Salt Hollows](../maps/ru-lora-salt-hollows.json) | 80 × 72 | Petrified remains divide quiet salt hollows. A sparse expedition scenario without invented hazard rules. | `salt-crust` |
| [Sereward · Cistern Road](../maps/sereward-cistern-road.json) | 80 × 72 | Two sheltered water basins flank an open caravan road; supplies sit beyond the home clearings. | `sand` |
| [Siltmouths · Reed Crossings](../maps/siltmouths-reed-crossings.json) | 80 × 72 | Staggered tidal channels leave three dry crossings. Reeds shelter the outer supply routes. | `tidal-mud` |
| [Sombral Mere · Shore Gardens](../maps/sombral-mere-shore-gardens.json) | 80 × 72 | Still pools and lunar gardens frame a dry causeway, with room to contest either shore. | `lunar-soil` |
| [Underbough · Rootways](../maps/underbough-rootways.json) | 96 × 72 | Copper woodland encloses three clearings. Cut new routes or defend the existing rootways. | `forest-floor` |
| [Vesperra · Pale Clearings](../maps/vesperra-pale-clearings.json) | 96 × 72 | Pale trunks enclose a living canopy; broad clearings connect the central and outer routes. | `jungle-loam` |
| [Veyrholds · Slate Saddle](../maps/veyrholds-slate-saddle.json) | 80 × 72 | Paired slate ridges shelter bases; a broad saddle and two exposed passes offer alternate approaches. | `scree` |

[Layout contact sheet](vaelora-map-layouts.svg): blue/orange spawns, gold capture
posts, green harvestable forests, blue water, gray stone, brown/red resource nodes,
and translucent cream high ground.
These are layout schematics; the in-game renderer supplies the current regional art.

## Regional art and audio

Ground choice selects the existing regional vegetation and material family. As
that family gains lifecycle atlases, shrubs and textures, these maps inherit the
renderer improvements. The human Frontier building/unit kit remains the playable
roster across regions; regional architecture and inhabitants are not implemented.
Ru’Lora Fringe currently uses the Vesperra living-forest family alongside salt
paint; a dedicated fringe vegetation family is still needed. No toxic damage,
tides, bridges, active observatories or supernatural mechanics are implied.

Each map binds a hash-verified shipped regional **music and terrain ambience** profile, including
separate fringe/interior music. Both players load the same existing recording;
Audio Studio installation is unnecessary. The separate music and ambience layers respect their own levels,
master mute, alert ducking and tab lifecycle. Recordings remain creative candidates.
The authored repeat uses a quiet excerpt with two-second entrance and three-second
exit fades; its timeline BPM is a duration adapter, not a measured musical tempo.
Terrain recordings now repeat on the ambience bus, replacing synthesized wind
when available. Missing/undecodable ambience falls back to wind. Signatures and
contrasting settings remain in [Zone Audio](../audio-zones.html); spatial beds,
discovery/conflict scoring and seamless authored loop edits remain future work.

Map Studio's Regional Palette selector applies registered ground/audio defaults
while preserving local painted materials and layout. Maps retain a `region` ID,
with explicit `terrainBase` and audio overrides allowed. See
[pre-match elevation](map-authoring.md#pre-match-elevation).

## Production and acceptance

`node scripts/build-vaelora-maps.mjs` regenerates the authored JSON and the eleven
small v2 soundscape manifests from the existing source catalog, preserving source paths,
provenance and content hashes. It does not generate new media or duplicate MP3s.
`node scripts/vaelora-map-layout-scenario.mjs` checks paths with both Town Centers
present and refreshes the contact sheet. Run the [map balance audit](testing.md)
and `node scripts/audio-shipped-serving-scenario.mjs` for geometry and serving.

The first pass is technically validated, not match-balance or appearance approval.
Play both seats on Millrace and Rootways first: build a Barracks, gather the outer
supplies, contest opposite posts, clear a woodland route, and finish the map’s hold rule.
Then compare channels, basins and ridges. Record route congestion, build space,
forest cutting, command readability and music seams in [QA](qa-vertical-slice.md).

## Retained laboratory maps

## Which map to use

- **Fortified Crossing:** original 24-unit paired skirmish with 350 food/600 wood per seat. Secure North/South Signals, then capture and hold Vale Watch for 30 seconds. A named crossing, paid Barracks completion and infantry research join into delayed supplies. The versioned supplied feedback profile loads automatically. See the [map definition](../maps/fortified-crossing.json) and [combined acceptance and limits](qa-custom-skirmish.md).
- **Forked Vale:** retained laboratory PvP economy-to-victory scenario. See its [rules and layout](forked-vale-scenario.md).
- **Woodland Expanse:** larger solo-play alternative in the seeded PvE pool.
- **Frontier Reach:** 160 × 160 regional resources, forests, river, and crossings;
  see [scale and density](map-scale-density.md).
- **Highland Grove:** elevation and route-choice experiment with a food placeholder;
  see [living land](living-land-experiment.md).
- **Three Crowns:** larger opening with prerequisite-gated objectives;
  see [layout and checks](three-crowns-layout.md).
- **Stone Pass / Cinder Ridge:** compact terrain and choke references.
- **Open Field / Dense Clash:** diagnostic movement/combat fixtures.
- **Frontier Materials:** ground and obstacle art review.

Standalone Building Variant Atlas and Terrain Art Pilot pages are review tools,
separate from the shared map catalog. See [assets](assets.md).
