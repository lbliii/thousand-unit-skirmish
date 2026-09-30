# Terrain variety and enrichment

[Environment pack](environment-pack-v1.md) · [Vaelora direction](art-direction/vaelora-v1/README.md)

## The wave pattern

The ground loader mirrors one source texture every 12 world units. Mirroring
turns its brush contours into reflected loops and repeats the complete image
every 24 units. Soft material boundaries solve cell-shaped region edges but do
not remove this interior repetition. Adding more detailed textures alone would
give the player more repeated motifs to notice.

## Sampling candidate

`terrain-texture-sampling.mjs` blends three seeded source placements on a triangle
lattice, with random offsets and quarter-turn rotations. Continuous weights
remove placement seams; explicit texture gradients prevent random-offset jumps
from selecting blurry mips at triangle boundaries. The source remains mirrored
to hide its own edge discontinuities, but each neighborhood samples a different
part and orientation. A single broad value field varies brightness by at most
five percent. No stacked fractal detail noise is added.

This follows the general approach of Deliot and Heitz’s
[Procedural Stochastic Textures by Tiling and Blending](https://eheitzresearch.wordpress.com/738-2/).
Our implementation is a lightweight prototype with sharpened blending weights;
it does not implement their histogram-preserving texture preprocessing. Some
contrast softening remains. Empty paint-mask pixels skip the three source reads;
explicit gradients are computed before that discard. Water, terrain alpha masks, elevation, and collision
do not use randomized coordinates. Sampling runs on base, painted, and forest
ground surfaces, preserving the material palette and region layout.

The candidate is active on this branch. `?terrainTiling=mirror` keeps the previous
sampling for paired review; default sampling is randomized. This is a developer
comparison parameter, not a published map rule. It uses three ground texture
fetches instead of one, without loading additional source images for the sampling itself. Three approved-style
companion grounds extend the runtime palette to sixteen; source images load on
demand through a shared renderer/editor/server catalog. GPU performance
has not been measured; low-end device cost remains unproven.

[Matched captures and repetition analysis](qa-evidence/vaelora-terrain-variety-2026-09-29/README.md)
show the same material map, organic study, and flat 128-unit fields before/after.

## Enrich in three scales

Keep most ground quiet. Give a biome a small family of bare, vegetated, worn, and
wet variants that share its palette. Paint those in broad habitat patches rather
than distribute them uniformly. Place sparse localized details as accents:
flowers near meadow banks, litter under trees, gravel beside routes, debris near
ruins. Large region shapes should come from authored map composition, not a
texture’s internal bands or repeating procedural noise.

The [three source studies](../assets/environment/vaelora-ground-studies-v1/README.md)
explore sparse meadow flora, roots/litter, and sterile salt/bone earth. They are
source candidates only. Three quiet companion variants—Bellweather dry grass, Ellionar garden loam, and
Ru’Lora salt crust—are admitted in this follow-up. Sparse flower/root/bone accents
remain source studies; the next detail slice should test a localized decal family
in one representative zone at close and strategic zoom.

| Region | Quiet ground variants | Sparse accents / placement |
| --- | --- | --- |
| Bellweather | Fresh meadow, dry grass, worn loam | Clover, ivory flowers, straw; banks and field margins. |
| Underbough | Bare dark loam, copper litter, root-rich soil | Root fragments and leaf clumps beneath trees. |
| Sereward | Peach sand, firm gravel, pale crust | Small stones and dry plant fragments near sheltered ground. |
| Ellionar | Honey garden loam, irrigated soil, limestone dust | Fallen leaves and ceramic chips near cultivated terraces. |
| Veyrholds | Slate scree, alpine soil, furnace dust | Sparse rock chips and lichens beside ridges. |
| Pale Meridian | Packed snow, exposed cold soil, dark ice | Wind-scoured clearings and sparse ice chips; keep major cracks authored. |
| Siltmouths | Silver silt, tidal mud, reed-root soil | Shells and reed litter on estuary banks. |
| Vesperra | Petrol loam, moss soil, dark litter | Pale leaves and fungi around suitable habitats. |
| Sombral Mere | Lavender shore loam, damp teal soil, pale silt | Lunar plant litter and occasional opal fragments near shores. |
| Ru’Lora | Charcoal sterile soil, dusty violet ash, salt crust | Bone splinters and petrified bark; living flora remains at the fringe. |

Avoid putting a hero root, skeleton, emblem, or obvious swirl into a repeating
base tile. Such features belong to separately placed landmarks or decals.

## Atmosphere as storytelling

A clear cold plateau, a damp estuary, and a still moonlit shore should feel
different even when their tactical rules are shared. Use localized atmospheric
accents to reinforce habitat and history: low mist over damp ground, wind-scoured
clearings in snow, suspended salt dust around sterile ruins. Keep their palette
and density controlled so units, resources, ground levels and routes read clearly.

The first mist study (`?terrainAtmosphere=mist`) uses a gently drifting ground
layer restricted to tidal mud, lunar soil, jungle loam and water. It draws before
transparent props and team sprites, with low maximum alpha. Dry painted clearings
override damp coverage. `terrainAtmosphereTime=12` freezes the phase for paired
captures. This thin ground haze is optional research, not volumetric fog, cloud
shadows, weather simulation, or a replacement for fog of war. Later authored zone
profiles should follow the atmosphere study rather than add global fog indiscriminately.
