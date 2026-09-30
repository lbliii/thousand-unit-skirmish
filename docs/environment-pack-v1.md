# Frontier environment art

[Documentation index](README.md) · [Asset guide](assets.md)

## Runtime approach

Thirteen opaque ground textures repeat in world coordinates with mirrored tiling
and normalized soft material masks. Material weights blend across neighboring
cells with gently irregular edges and rounded corners; forest cover retains
its separate feathered overlay. Transparent painterly props face the oblique
camera and repeat through instanced batches. Map data owns collision, sight, and
walkable elevation; sprite height never substitutes for those rules.

## Asset roles

| Family | Files / role |
| --- | --- |
| Living ground | `meadow`, `short-grass`, `long-grass`: quiet field through coarse growth. |
| Woodland ground | `forest-floor`: leaf/needle cover below trees and in clearings. |
| Worn/dry ground | `dirt`, `sand`, `scree`, `cinder`: routes and distinct regions. |
| Regional ground | `snow`, `ice` (Pale Meridian), `tidal-mud` (Siltmouths), `jungle-loam` (Vesperra / living jungle fringe), `lunar-soil` (Sombral Mere). |
| Stone | `rock-outcrop`, `rock-boulder-cluster`, `basalt-ridge`, `basalt-ridge-cap`, `cliff`, `cliff-end-cap`. |
| Forest | `oak`, `pine`, `silver-birch`, `field-maple`, `hazel-thicket`; deterministic variants/scales. |
| Ordinary resource nodes | Oak for wood, berries for food, with stock-driven state art. |
| Objective landmark | `seamstone`; zone outline and ownership UI remain authoritative. |

Sources, exact prompts, hashes, and addition records are in
[Frontier provenance](../assets/environment/frontier-v1/PROVENANCE.md).
Vegetation/rock manifests record runtime paths and variant rules.
[Interactive states](environment-state-pack-v1.md) handle ordinary resource depletion.
Forest cells now support [cutting and clearing](harvestable-woodland-pilot.md).

## Vaelora painted ground · 29 September 2026

The [Vaelora maps and ecology keys](art-direction/vaelora-v1/README.md)
guide the replacement ground palette: Bellweather sage fields, Underbough copper
leaf cover, Ellionar honey loam, Sereward peach sand, Veyrholds slate scree,
and Ru’Lora dusty violet sterile earth. Five additional materials cover cold,
tidal, living jungle, and lunar regions. These are broad matte brush planes with
quieter values beneath armies; the existing prop families remain a separate pass.

[Exact prompts](../assets/environment/frontier-v1/VAELORA-GROUND-PROMPTS.json),
[current hashes](../assets/environment/frontier-v1/vaelora-ground-manifest.json),
and a [mirrored-repeat contact sheet](../assets/environment/frontier-v1/vaelora-ground-preview.png)
record the sources and 1024-square RGB WebP runtime encodings. A loader revision
query refreshes cached grounds. All thirteen materials are available as Map Studio
base grounds and brushes, and survive custom-map persistence.

The eight-material candidate atlas was rebuilt from the replacements; the five
additions use individual runtime textures and are outside that candidate atlas.
Paint controls appearance only: dark ice does not turn a water obstacle walkable,
and jungle loam represents living fringe rather than Ru’Lora’s sterile interior.

[Local battlefield evidence](qa-evidence/vaelora-ground-2026-09-29/README.md)
records the first integrated visual check. Mirrored repetition remains visible in
long grass, scree, and some large regional patches; this is a first usable ground
pass, not a finished set of ten zone-specific terrain kits.

## Review in game

1. Start with `npm start` and choose **Frontier Materials** in Match Controls.
2. Compare all thirteen grounds and three obstacle heights.
3. Inspect **Stone Pass**, **Cinder Ridge**, and **Frontier Reach** for regional
   palette, dense vegetation, water, and repeated modules.
4. In Map Studio, paint base/ground regions and obstacles, save, then reopen.
5. At ordinary/strategic zoom, check ground contrast, material boundaries,
   passability, resource visibility, landmarks, and both team colors.

Forest-floor rendering follows forest masks. Stone cutouts supply the visible
ridge shape while authoritative obstacle cells supply collision. Low-colored
water and shoreline geometry must preserve the same movement meaning.

## Painting organic regions

Ground painting already uses round stamps. Choose **Large · 7 cells** or
**Landscape · 11 cells** and drag overlapping strokes to shape meadows, banks,
and clearings; use smaller stamps for paths. Save & Play applies the blended
surfaces. The Map Studio grid and minimap remain schematic cell views.

The renderer mixes the final cell materials through two-samples-per-cell masks,
with a roughly two-cell transition band and shared low-amplitude seeded edge
variation. Conditional layer alpha preserves a normalized mix at three-way joins
instead of letting texture draw order dominate. A material's compressed rectangles
produce one continuous mask, so their internal boundaries cannot create seams.
Only used overlay materials allocate masks; map teardown disposes their textures.
Collision, water, elevation, and published map format retain their existing rules.

[Organic brush study and visual evidence](qa-evidence/vaelora-terrain-blend-2026-09-29/README.md)
show a winding dirt path and rounded woodland, sand, and lunar-soil patches.
Dedicated transition art can later add particular shore debris or grass tufts;
pairwise transition tiles are not needed for basic material mixing.

## Current limits

- Corners, curved rock joins, and broader regional variation remain content work.
- Fixed-view cutouts need additional views or geometry for other camera angles.
- Repetition, forest/resources, and transparent edges need game-zoom review.
- WebP download bytes do not establish decoded memory or device performance.

## Directional cliff pilot

**Match Controls → Terrain Art Pilot** opens `/environment-review.html`.
The [cliff package](../assets/environment/frontier-cliff-pilot-v1/README.md)
contains the model, eight color/depth views, scripts, and provenance. It is an
isolated review page; normal battlefield terrain does not use that pilot.
