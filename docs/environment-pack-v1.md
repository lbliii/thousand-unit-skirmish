# Frontier environment art

## Sombral Mere merebloom · 30 September 2026

The [merebloom source sample](../assets/environment/frontier-v1/sombral-mere-lifecycle-manifest.json)
uses the approved key's slender pearl trunk, lavender willow-like foliage and
deep teal shadows. The [exact prompts](../assets/environment/frontier-v1/SOMBRAL-MERE-LIFECYCLE-PROMPTS.json)
record built-in ImageGen authoring against the ecology key and existing painted
finish. Lunar-soil base maps now use merebloom forests with four stock stages
in one atlas and individual-texture fallback. The [focused local evidence](qa-evidence/vaelora-sombral-mere-atlas-2026-09-30/README.md)
covers camera alignment, live harvesting/reset, fallback and packaging. Its colours are painted into ordinary matte
surfaces, with no baked glow, water or reflections. This vegetation sample does
not settle the region's open questions about moon-elf survival or lunar rites.

The worked master is one pixel narrower than the intact master, outside their
shared crop. Its manifest records the actual source canvas and reviewed exception;
the export applies no resize or translation to compensate. The frame helper's
explicit `--allow-outside-crop-edge-difference` option admits at most one pixel
per dimension only when the entire shared crop fits both canvases. Larger or
crop-intersecting differences still fail.

## Vesperra mistbark · 30 September 2026

The [mistbark source sample](../assets/environment/frontier-v1/vesperra-lifecycle-manifest.json)
uses Vesperra's pale bark, petrol-green canopy and restrained violet hanging
growth. The [exact prompts](../assets/environment/frontier-v1/VESPERRA-LIFECYCLE-PROMPTS.json)
record built-in ImageGen authoring against the approved ecology key and the
existing maple's painted finish. Jungle-loam base maps now use this family,
with four stock stages in one registered atlas and individual-texture fallback.
The [focused local evidence](qa-evidence/vaelora-vesperra-atlas-2026-09-30/README.md)
covers camera alignment, live harvesting/reset, fallback and packaging.
The pale trunk needs a darker, natural wood cut to keep partial harvest readable.

`python3 scripts/package-environment-lifecycle-frame.py MANIFEST STAGE PNG`
packages later states against the manifest's intact-frame canvas and crop. It
rejects different canvas dimensions, copies the generated master unchanged,
encodes RGBA WebP and checks alpha preservation. It does not repair differences
inside a generated frame; root registration and perspective still need review.

## Siltmouths tidal tree · 30 September 2026

The [tidal-tree sample](../assets/environment/frontier-v1/siltmouths-lifecycle-manifest.json)
adapts the approved Siltmouths ecology key's exposed roots, silver bark and
sea-green/lilac foliage into the existing painted RTS finish. Original generated
PNG and deterministic RGBA WebP exports are retained, with
[exact authoring prompts](../assets/environment/frontier-v1/SILTMOUTHS-LIFECYCLE-PROMPTS.json).
Tidal-mud base maps now use this family for forest cells. Intact, worked, low
and depleted states share one atlas and registered crop, with individual-texture
fallback. The [focused local evidence](qa-evidence/vaelora-siltmouths-atlas-2026-09-30/README.md)
covers camera alignment, live harvesting/reset, fallback and packaging.
The camera angles in the prompt guide perspective; they do not prove measured
image calibration. Root openings remain transparent and no ground/water is
baked into the sprite.

## Pale Meridian conifer · 30 September 2026

The [conifer source manifest](../assets/environment/frontier-v1/pale-meridian-lifecycle-manifest.json)
records a cold blue/silver/violet tree derived from the approved Pale Meridian
ecology key. Generated PNG masters retain their original alpha. Runtime exports
use a shared crop and logical canvas so harvest edits keep ground registration.
The [exact prompts](../assets/environment/frontier-v1/PALE-MERIDIAN-LIFECYCLE-PROMPTS.json)
record built-in ImageGen authoring and refinement.

Snow and ice base maps now use this conifer for their forest cells, with
full/worked/low/depleted clips in one instanced atlas. Missing atlas metadata
falls back to the four individual textures. Cell addresses and wood rules remain
unchanged. The [focused local evidence](qa-evidence/vaelora-pale-meridian-atlas-2026-09-30/README.md)
covers renderer states, both cold terrain bindings, and fallback loading. The camera brief specifies 45° azimuth, 45.4359° elevation,
world Y up and zero roll; generated image perspective remains a visual estimate
until reviewed through the actual renderer. No measured perspective calibration
or additional camera views are claimed.

[Documentation index](README.md) · [Asset guide](assets.md)

## Runtime approach

Sixteen opaque ground textures repeat in world coordinates with mirrored tiling
with seeded randomized placements to suppress reflected repeats,
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
| Regional companions | `dry-grass` (Bellweather), `garden-loam` (Ellionar), `salt-crust` (Ru’Lora): approved-style palette extensions. |
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

## Bellweather vegetation · 30 September 2026

Meadow, short-grass, long-grass and dry-grass base maps now use a Bellweather
field maple and hedgerow for the existing maple/thicket forest slots. The broad
sage and butter canopy shapes follow the approved Bellweather ecology key.
This is a first regional pair, not a complete replacement forest: oak, pine and
birch remain the existing assets, and other base palettes retain the earlier
maple/hazel. A painted patch does not select a separate vegetation palette.

[Preview](../assets/environment/frontier-v1/bellweather-vegetation-preview.png),
[manifest](../assets/environment/frontier-v1/bellweather-vegetation-manifest.json)
and [exact prompts](../assets/environment/frontier-v1/BELLWEATHER-VEGETATION-PROMPTS.json)
record the generated PNG masters and alpha-preserving WebP encodings. Runtime
packaging crops to visible content bounds for ground contact; no pixels were
repainted by packaging. Forest stock, cell identity, deterministic placement,
instanced batching and clearing retain their existing contract. This hedgerow
is harvestable forest, not a decorative walk-through shrub or food resource.

[Local browser evidence](qa-evidence/vaelora-vegetation-2026-09-30/README.md)
checks loading, camera scales and exact forest-slot parity. These two fixed-view
cutouts do not provide seasonal, damaged or additional directional views.

## Veyrholds pine and ironlichen · 30 September 2026

Scree-base maps now use a wind-shaped Highpine in the existing pine forest
slots and copper-lichen slate in the low rock-outcrop slots. The approved
[Veyrholds ecology key](art-direction/vaelora-v1/README.md#the-veyrholds)
guides their silhouette and material palette. This is a first regional pair;
other tree families, boulder clusters, tall ridges and cliffs retain their
existing art. Snow and ice do not select this alpine kit.

[Preview](../assets/environment/frontier-v1/veyrholds-preview.png),
[manifest](../assets/environment/frontier-v1/veyrholds-manifest.json) and
[exact prompts](../assets/environment/frontier-v1/VEYRHOLDS-PROMPTS.json)
record the original generated masters, reference hash and runtime packaging.
The Highpine uses the same forest stock/clearing slots; ironlichen is a stone
obstacle appearance, not a new mineable resource. Map collision and elevation
remain authoritative. A scree paint patch on a meadow-base map retains meadow
vegetation; this bounded binding is not a per-cell biome system.

[Local renderer evidence](qa-evidence/vaelora-veyrholds-2026-09-30/README.md)
records two camera scales and palette/forest-slot checks. Choose **Scree** as
Map Studio's base ground and paint forest/low stone obstacles to use this pair.
The Meshy resource review fixture retains its explicit comparison art.

## Underbough rooted woodland · 30 September 2026

Forest-floor-base maps now use a coherent Copperleaf/bramble mix: approximately
80% root-heavy copperleaf canopy and 20% low woody bramble, selected with the
existing deterministic cell hash. The
[Underbough ecology key](art-direction/vaelora-v1/README.md#the-underbough)
guides burgundy shadows, copper foliage, moss and exposed roots. Unlike the
first regional pairs, this woodland uses these two families for all forest
cells, keeping unrelated alpine/field silhouettes out of the Underbough.

[Preview](../assets/environment/frontier-v1/underbough-preview.png),
[manifest](../assets/environment/frontier-v1/underbough-manifest.json) and
[exact prompts](../assets/environment/frontier-v1/UNDERBOUGH-PROMPTS.json)
record sources, ecology reference hash and runtime encodings. The bramble is
fruitless cuttable wood: its appearance adds no food node, special resource,
regrowth or new obstruction. Root geometry is painted into the tree sprite;
clearing the cell removes the whole sprite through the existing slot contract.
Ordinary resource nodes retain their separate art and state pack.

Decorative sprite textures now load when a map actually uses their family and
remain cached for reuse. Resource-state fallbacks retain their earlier loading
path. This avoids downloading every regional kit for every match; it is not
cache eviction or a decoded-memory budget. **Forest floor** in Map Studio's
base selector activates the woodland mix. Painting forest-floor ground on a
meadow base does not change vegetation. The Meshy comparison map remains explicit.

[Browser evidence](qa-evidence/vaelora-underbough-2026-09-30/README.md)
records two-scale forest captures, cell parity and unused-family request checks.

## Sereward oasis woodland · 30 September 2026

Sand-base maps now use palms, pale thorn acacias and hardy woody scrub for all
forest cells: approximately 55/30/15 shares selected by the existing deterministic
cell hash. The [Sereward ecology key](art-direction/vaelora-v1/README.md#the-sereward)
guides turquoise/sage fronds, peach canopies, warm bark and sparse violet scrub
accents. Palm height, acacia spread and low scrub give the same harvestable mask
three readable height/silhouette families.

[Preview](../assets/environment/frontier-v1/sereward-preview.png),
[manifest](../assets/environment/frontier-v1/sereward-manifest.json) and
[exact prompts](../assets/environment/frontier-v1/SEREWARD-PROMPTS.json)
record original generated masters, ecology reference hash and alpha-preserving
runtime packaging. There is no visible fruit on these wood sprites. Dates,
water-storing succulents and desert food-node art remain later content; existing
ordinary oak/berry resource nodes retain their separate state pack.

**Sand** as Map Studio's base ground selects the mix. Ground patches do not
select independent vegetation; another base retains its own forest palette.
The Meshy resource comparison fixture stays explicit, and new cutouts use the
on-demand decorative loader.

The [oasis study](qa-evidence/vaelora-sereward-2026-09-30/README.md) contains an
importable map with organic water/forest spans, a green oasis margin and a
curving dirt trail around the bank. It is a composition and ground-contact
review, not a finished Sereward zone or balanced scenario. Local Map Studio
import/save/play and two-scale renderer evidence are recorded beside it.

## Ellionar cultivated grove and root cover · 30 September 2026

Garden-loam-base maps now use approximately 80% upright cultivated palms and
20% low woody garden hedges, derived from the
[Ellionar ecology key](art-direction/vaelora-v1/README.md#ellionar). Olive/honey
fronds and cream-flowered green hedges distinguish the tended grove from the
Sereward's leaning turquoise palms. The hedge adapts the key's garden vine into
a self-supporting woody form; it does not implement a medicinal plant or crop.
Both families retain the ordinary cuttable forest-cell contract, without fruit.

[Preview](../assets/environment/frontier-v1/ellionar-preview.png),
[manifest](../assets/environment/frontier-v1/ellionar-manifest.json) and
[exact prompts](../assets/environment/frontier-v1/ELLIONAR-PROMPTS.json)
record the generated masters, reference hash and runtime encodings. **Garden
loam** as Map Studio's base selects this grove; painted patches do not select a
separate vegetation kit. Architecture, cascading terrace plants, food dates and
solar grain remain later content, and ordinary resource-node art stays separate.

Forest root cover now uses a single seeded soft mask through the same surface
path as ground painting. Equivalent rectangles or row spans form one continuous
cover field without internal geometry seams. This replaces the older narrow
per-rectangle fringe geometry. Root-cover clone/mask textures use the existing
map-owned teardown; the on-demand source texture remains cached.

| Base palette | Root-cover ground |
| --- | --- |
| Sand | Dirt, for warm dry soil beneath oasis trees. |
| Garden loam | Garden loam, for cultivated groves. |
| Scree | Scree, for alpine rocky ground. |
| Snow / ice | Snow, for cold woodland. |
| Tidal mud / jungle loam / lunar soil | The matching regional ground. |
| Remaining bases | Forest floor, retaining the existing litter palette. |

This is appearance only. Forest blocks, stocks, water and saved terrain labels
are unchanged; cleared cells retain the authored soil cover. The new full-map
mask changes allocation/overdraw relative to local fringe geometry. Shader
sampling skips empty mask pixels, but GPU/memory cost is unmeasured. There is
no performance claim.

[Browser and mask evidence](qa-evidence/vaelora-ellionar-2026-09-30/README.md)
records garden captures, palette bindings, nine root-cover texture cases,
ownership checks, soft edges and equivalent-mask decomposition.

## Review in game

1. Start with `npm start` and choose **Frontier Materials** in Match Controls.
2. Compare all sixteen grounds and three obstacle heights.
3. Inspect **Stone Pass**, **Cinder Ridge**, and **Frontier Reach** for regional
   palette, dense vegetation, water, and repeated modules.
4. In Map Studio, paint base/ground regions and obstacles, save, then reopen.
5. At ordinary/strategic zoom, check ground contrast, material boundaries,
   passability, resource visibility, landmarks, and both team colors.

Forest-floor rendering follows forest masks. Stone cutouts supply the visible
ridge shape while authoritative obstacle cells supply collision. Low-colored
water and shoreline geometry must preserve the same movement meaning.

## Regional variety and atmosphere follow-up

The approved thirteen grounds retain their source pixels. Dry grass, garden
loam, and salt crust extend the same painted finish; their
[manifest](../assets/environment/frontier-v1/vaelora-ground-variety-manifest.json)
records exact prompts, hashes, and approved-source references. The shared
`terrain-materials.mjs` catalog keeps map validation, serving, editor colors, and
rendering aligned. Ground images load as used and are cached across maps.

[Terrain variety research](terrain-variety.md) describes the randomized sampling,
source studies, and regional enrichment plan. A restrained wet-ground mist study
is available with `?terrainAtmosphere=mist`; it is optional preview functionality,
not enabled on ordinary maps. It does not change fog of war, visibility or map
collision. [Paired visual evidence](qa-evidence/vaelora-terrain-variety-2026-09-29/README.md)
records the comparison, added palette, and study limits.

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

## Bellweather maple lifecycle · 30 September 2026

Bellweather field maples now have matching full, worked, low and depleted images.
A widening cream axe cut and chips communicate partial harvest without shrinking
the standing canopy; depletion leaves the same tree's rooted stump. The existing
full image is unchanged. This pilot covers only the maple family: other regional
trees and shrubs still need matching states and use the shared stump path.

[Preview](../assets/environment/frontier-v1/bellweather-lifecycle-preview.png),
[manifest](../assets/environment/frontier-v1/bellweather-lifecycle-manifest.json)
and [exact prompts](../assets/environment/frontier-v1/BELLWEATHER-LIFECYCLE-PROMPTS.json)
record the original generated edits and runtime encodings. All four frames use
the same source canvas and original full-frame crop, so the depleted frame keeps
transparent space above its roots. These are separate textures, not an integrated
atlas or multiple camera views. The documented
[production requirement](environment-state-pack-v1.md#regional-asset-production-requirement--30-september-2026)
sets the direction/state approach for subsequent families.

Forest stock changes now select the existing four-stage percentages, with six
wood per cell matching the server rule. Epoch reset restores partially worked
trees as well as depleted trees. Sparse snapshots preserve last-known hidden
stock. Matching-state slots are excluded from generic stump batches. Selection
uses three extra instanced meshes for this family and lazily loaded textures;
GPU residency and large-match cost remain unmeasured. Authored forest soil remains
after clearing. [Local checks](qa-evidence/vaelora-bellweather-lifecycle-2026-09-30/README.md)
record frame selection, loading, appearance and harvesting regression scope.

## Sereward palm lifecycle · 30 September 2026

Sand-base Sereward palms now use full/worked/low/depleted art through the same
forest-state path as Bellweather maples. Pale peach fibrous axe cuts contrast
with the honey trunk, while the intact turquoise/coral crown remains standing.
Depletion leaves a short palm stump with its triangular bark scales and roots.
Acacias and scrub retain their current full/depleted generic path; no fruit or
food resource rules are added.

[Preview](../assets/environment/frontier-v1/sereward-lifecycle-preview.png),
[manifest](../assets/environment/frontier-v1/sereward-lifecycle-manifest.json)
and [exact prompts](../assets/environment/frontier-v1/SEREWARD-LIFECYCLE-PROMPTS.json)
record original built-in ImageGen edits of our Sereward palm. Unmodified source
PNGs retain a 1145×1374 canvas; all encodings share the full frame's crop box
[23,24,1133,1356], with 853×1024 RGBA WebPs. The original intact source/runtime
are unchanged. These are single-view separate textures, not an atlas.

Matching-state slots avoid the generic stump batch. Three extra instanced
batches and lazily loaded textures appear only on maps using this palm;
residency/performance remain unmeasured.
[Local evidence](qa-evidence/vaelora-sereward-lifecycle-2026-09-30/README.md)
records the lineup and live worker harvesting/reset checks separately.

## Integrated lifecycle atlases · 30 September 2026

Bellweather maple and Sereward palm now use one instanced atlas batch per family
instead of four state meshes. Stock changes update a per-instance UV rectangle;
world transform, tree cell, scale, flip and ground pivot remain fixed through
depletion and reset. Other vegetation families retain their existing path.

[Maple atlas](../assets/environment/frontier-v1/bellweather-lifecycle-atlas.json)
and [palm atlas](../assets/environment/frontier-v1/sereward-lifecycle-atlas.json)
follow the sprite-atlas v1 schema with full/worked/low/depleted clips and an
explicit `fixed-oblique` direction. No extra camera perspectives are claimed.
`python3 scripts/build-environment-lifecycle-atlases.py` reproduces the pages
from decoded approved runtime files. PNG page frame pixels are exact copies;
WebP quality86 recompresses RGB while preserving alpha. Original generated
masters and individual runtime files remain unchanged.

Each frame has 64 pixels of transparent RGB edge-extension padding, half-texel
UV inset and linear mip sampling. The shader clamps derived texture LOD to six,
matching the declared padding limit. A linear-only prototype showed speckled
foliage and was replaced before adoption. Pages load lazily when their family
is used; the two small manifests load during module initialization. Missing or
unsupported metadata falls back to the individual state textures. The server
serves exact metadata names; Docker packaging admits both JSON manifests.

This reduces state batches from four to one, not a measured FPS improvement.
Padding increases estimated mipmapped RGBA page residency: maple about 26.7 MiB
and palm about 23.0 MiB, versus about 21.1/17.8 MiB for four individual images.
Encoded page sizes are 679,166 and 920,604 bytes, close to the earlier four-file
totals. Texture caching still lacks eviction; no large-match GPU budget is
claimed. [Maple evidence](qa-evidence/vaelora-bellweather-atlas-2026-09-30/README.md)
and [palm evidence](qa-evidence/vaelora-sereward-atlas-2026-09-30/README.md)
record appearance, UV state/reset selection and real palm harvesting.

## Camera calibration and upright sprites · 30 September 2026

The fixed camera direction is shared through `CAMERA_VIEW_DIRECTION` in
`src/camera-controls.mjs`: [0.78,1.12,0.78], giving 45° azimuth and
45.4359° elevation above ground. This is a steeper oblique view than true
isometric's 35.2644° elevation. The camera remains unchanged.

The old shortest-arc +Z-to-camera quaternion matched the viewing normal but
introduced about -19.677° of screen roll. Environment sprites now use the
camera's world-Y-up basis, removing that unintended sideways tilt. This covers
individual sprites, instanced forest/rocks, state atlases and the legacy cliff
comparison. Natural painted curves remain in the source art.

QA previews use the same shared direction and target rather than an approximate
[30,43,30] camera. Actual instance matrices are checked at all four stock stages
for zero screen roll; ordinary/strategic captures and live harvesting/reset were
repeated after integrating main `242d330` at `eb5cfac`. Camera-controls and
reconnect tests pass. Future painted-art briefs should state orthographic view,
45° azimuth, 45.4359° elevation, Y-up and zero screen roll; those prompt numbers
are guidance, not proof of an AI-painted image's intrinsic perspective. Exact
source-view calibration requires a reproducible 3D capture or a measured art
construction.

## Ru’Lora petrified Fiendwood · 30 September 2026

The [approved ecology key](art-direction/vaelora-v1/ru-lora-ecology.png) now has a first runtime petrified-interior specimen: [Fiendwood source](../assets/environment/frontier-v1/ru-lora-fiendwood.png), [manifest](../assets/environment/frontier-v1/ru-lora-manifest.json) and [exact prompt](../assets/environment/frontier-v1/RU-LORA-PROMPTS.json). Charcoal and dusty violet stone leaves carry ivory mineral seams and restrained cold opal accents. The master is unchanged built-in ImageGen output; runtime packaging crops and encodes with exact alpha.

`addObstacleEnvironmentSprites` selects Fiendwood for the existing low stone-outcrop batch on salt-crust bases, except `meshy-resource-review`. Boulder clusters, taller ridges and cliffs retain their existing art. Existing stone obstacle cells still govern collision. This specimen is scenery, not mineable mineral or harvestable wood; extraction practice remains an open lore question. Authored forest cells still use existing woodland sprites and rules, so they do not yet represent Ru’Lora’s petrified interior. The living fringe is a separate proposal.

One fixed oblique view and intact state are supplied. Mirroring provides silhouette variation, not another perspective. The 45° azimuth / 45.4359° elevation prompt guides the painting; it is not a measured source projection. The runtime uses the shared upright camera-facing basis. No destruction or harvesting animation is claimed for this nonharvestable prop.

[Owner-run appearance evidence](qa-evidence/vaelora-ru-lora-2026-09-30/README.md) covers ordinary/strategic renderer views, lazy loading, regional binding and preserved forest slots. Broader fauna, dense interior composition, mineral harvesting, staging and performance proofs remain unfinished.

## Ru’Lora stone fern companion · 30 September 2026

[Stone fern source](../assets/environment/frontier-v1/ru-lora-stone-fern.png) extends the [Ru’Lora manifest](../assets/environment/frontier-v1/ru-lora-manifest.json) to v1.1.0. Its low spreading fan uses the approved charcoal/violet/ivory palette and small opal traces. Generated PNG is unchanged; exact prompt and source ID are recorded with the Fiendwood sample. Runtime alpha is preserved through crop and WebP encoding.

On salt-crust maps, 65% of the existing low boulder-cluster placements deterministically select the fern, while remaining clusters retain boulders and existing outcrops retain Fiendwood. No new positions or collision cells are added. Other terrain bases, tall stone barriers, resource nodes and `meshy-resource-review` keep existing bindings. The renderer uses 2.511 × 1.65 world units, matching the cropped sprite aspect ratio; one intact fixed-oblique scenery view only.

[Mixed scenery evidence](qa-evidence/vaelora-ru-lora-ferns-2026-09-30/README.md) shows the lower silhouette beside Fiendwood, plus lazy loading and eleven-base binding checks. This adds composition variety; it does not finish a dense petrified jungle, its fauna or extraction rules.

## Ru’Lora interior composition study · 30 September 2026

The [64×64 importable study](qa-evidence/vaelora-ru-lora-interior-2026-09-30/ru-lora-interior-study.json) groups the integrated petrified trees, stone ferns and boulders into six irregular clusters. Salt-crust and cinder companion paint establish a continuous ground palette; clear spawn spaces and a winding corridor preserve navigation readability. It contains stone scenery, no harvestable forest or resource nodes, and is not a balanced economy scenario. Import with Map Studio → Import → Save & Play.

[Local game evidence](qa-evidence/vaelora-ru-lora-interior-2026-09-30/README.md) proves import/publish, sprite requests and close/whole-map appearance. A reproducible grid check confirms spawn connectivity and a nine-cell reserved corridor; actual unit travel and competitive balance remain unproven. Dense placement makes repeated crowns and similar lightness more visible: broken/crownless trunks and darker canopy silhouettes are the next composition need. The study remains editable source/evidence, outside the default shipped map catalog.

## Ru’Lora broken trunk silhouette · 30 September 2026

[Broken trunk source](../assets/environment/frontier-v1/ru-lora-broken-trunk.png) extends the [regional manifest](../assets/environment/frontier-v1/ru-lora-manifest.json) to v1.2.0. Built-in ImageGen derived it from the approved Fiendwood source: crownless charcoal/violet mineral faces, jagged fractured top, short branch stubs, ivory seams and restrained opal. It represents natural petrified scenery, not chopped wood or a resource depletion state. Original source is unchanged, with exact prompt, hashes, crop and alpha-preserving runtime encoding recorded.

35% of existing salt-crust low outcrop placements deterministically select the broken trunk, with remaining outcrops retaining leafy Fiendwood. The existing fern/boulder mix continues. No new positions, obstacle cells or gameplay rules; generic review and other terrain bases keep their bindings. Runtime size is 1.655 × 2.3 world units, matching the cropped aspect ratio. One intact fixed-oblique view, mirrored for variation; painted camera guidance remains approximate.

[Same-map appearance and placement evidence](qa-evidence/vaelora-ru-lora-broken-2026-09-30/README.md) compares the existing dense study before/after and checks equal ground positions and upright screen orientation. This addresses repeated crowns through a second silhouette, while additional leafy variants, fauna and a finished regional scenario remain ongoing work.

## Underbough Copperleaf lifecycle · 30 September 2026

The [Copperleaf lifecycle preview](../assets/environment/frontier-v1/underbough-lifecycle-preview.png), [source manifest](../assets/environment/frontier-v1/underbough-lifecycle-manifest.json) and [exact prompts](../assets/environment/frontier-v1/UNDERBOUGH-LIFECYCLE-PROMPTS.json) extend the approved tree with worked, low-stock and depleted states. Worked/low show progressively deeper pale cuts with the original copper/burgundy crown still standing. Depletion leaves a matching broad stump with exposed mossy roots, rather than a generic stump. Full source/runtime remain unchanged; generated edits retain the original 1312×1199 canvas and shared [10,12,1299,1183] crop. Runtime frames are all 1024×930 with generated alpha preserved.

[Lifecycle atlas](../assets/environment/frontier-v1/underbough-lifecycle-atlas.json) uses the shared four-clip contract, 64px gutter, half-texel UV inset and mip cap six. Forest-floor maps retain their existing approximately 80% Copperleaf / 20% woody bramble selection. Only Copperleaf gains these states; bramble still uses the existing clearing path. Resource stock maps to full at ≥67%, worked at ≥34%, low above zero and matching stump at zero. This is persistent stock feedback, not worker-action animation. Forest cells, wood yield and collision are unchanged.

[Owner-run evidence](qa-evidence/vaelora-underbough-atlas-2026-09-30/README.md) covers four-state renderer selection, upright runtime matrices, real worker harvesting/reset and individual-texture fallback. One fixed-oblique painted view; additional perspectives, bramble lifecycle and measured source-camera calibration remain unfinished.

## Underbough woody bramble lifecycle · 30 September 2026

[Woody bramble manifest](../assets/environment/frontier-v1/underbough-bramble-lifecycle-manifest.json) adds worked, low-stock and cleared root/stub frames to the approved fruitless bramble. Pale clipped ends progress from small side tips to cut-back upper growth, then a low mossy root tangle and short stems at zero stock. It remains an existing wood-bearing forest slot, not a berry food node. Copperleaf/bramble selection, wood yield, collision and clearing rules stay unchanged.

The [bramble atlas](../assets/environment/frontier-v1/underbough-bramble-lifecycle-atlas.json) is a separate lazily loaded page beside Copperleaf, using the same four-state/gutter/mip contract. Both Underbough families now have their own depletion silhouettes. Full source/runtime are reused unchanged; generated masters, shared original crop and exact prompts are recorded in [provenance](../assets/environment/frontier-v1/UNDERBOUGH-BRAMBLE-LIFECYCLE-PROMPTS.json). Single fixed-oblique view; action animation and extra perspectives remain unfinished.

[Local live-harvest and renderer evidence](qa-evidence/vaelora-underbough-bramble-atlas-2026-09-30/README.md) exercises a deterministic bramble slot separately from Copperleaf, including reset and metadata-failure fallback.

## Veyrholds highpine lifecycle · 30 September 2026

[Highpine lifecycle preview](../assets/environment/frontier-v1/veyrholds-lifecycle-preview.png), [manifest](../assets/environment/frontier-v1/veyrholds-lifecycle-manifest.json) and [exact prompts](../assets/environment/frontier-v1/VEYRHOLDS-LIFECYCLE-PROMPTS.json) add worked/low cuts and a matching weathered pine stump to the approved alpine-olive, slate and rust tree. Standing frames keep the wind-shaped crown; depletion leaves characteristic roots and pale cut wood. Full source/runtime are reused unchanged. Selected generated masters retain the exact 1159×1358 canvas and shared crop [72,48,1146,1325], producing four 861×1024 runtime frames.

[Atlas](../assets/environment/frontier-v1/veyrholds-lifecycle-atlas.json) uses the existing four-state, 64px-gutter, half-texel inset and mip-cap-six contract, with individual-frame fallback. Scree maps retain the existing approximately 20% highpine forest selection and other tree mix; this slice adds lifecycle feedback to that family, not a complete alpine forest palette. Decorative ironlichen outcrops remain nonmineable. Forest identities, stock/yield and collision rules are unchanged.

[Local evidence](qa-evidence/vaelora-veyrholds-atlas-2026-09-30/README.md) exercises deterministic highpine cell 810, real worker harvest/reset, four-state renderer selection, upright matrices and metadata failure fallback. One fixed-oblique painted view; camera guidance approximate. Broader regional tree coverage, fauna, worker action animation and extra perspectives remain unfinished.

## Ellionar cultivated palm lifecycle · 30 September 2026

[Lifecycle preview](../assets/environment/frontier-v1/ellionar-lifecycle-preview.png), [manifest](../assets/environment/frontier-v1/ellionar-lifecycle-manifest.json) and [exact prompts](../assets/environment/frontier-v1/ELLIONAR-LIFECYCLE-PROMPTS.json) extend the approved sun-elf garden palm with worked, low-stock and depleted states. Small and deep pale cuts retain the upright gold-green crown; depletion leaves a short matching diamond-bark stump. Full source/runtime remain unchanged. Edited masters use the original 1024×1536 canvas and shared [14,46,1010,1490] crop; all runtime frames are 706×1024 with preserved generated alpha.

[Atlas](../assets/environment/frontier-v1/ellionar-lifecycle-atlas.json) uses the four-state contract, 64px gutter, half-texel inset and mip cap six, with individual-frame fallback. Garden-loam maps retain their approximately 80% cultivated palm / 20% woody hedge mix. Forest identities, wood stock/yield and collision rules stay unchanged. Hedge lifecycle is still unfinished.

[Local evidence](qa-evidence/vaelora-ellionar-atlas-2026-09-30/README.md) records renderer selection, upright matrices, real worker harvest/reset and metadata-failure fallback. Single fixed-oblique painted view; camera prompts guide appearance but do not establish measured source-camera calibration. Additional perspectives, worker-action animation and regional fauna remain ongoing.
