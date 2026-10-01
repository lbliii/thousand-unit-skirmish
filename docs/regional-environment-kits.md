# Regional environment kits

[Art lanes](art-production-lanes.md) · [Selected ecology keys](art-direction/vaelora-v1/README.md) · [Runtime status](environment-pack-v1.md)

## Player observation and outcome

On 30 September 2026 the player identified clashing ground and prop colours,
homogeneous forests and repeated asset perspectives. Organic boundaries alone
do not address these problems. Each zone needs a complete, compatible environment
kit, composed and reviewed as a landscape rather than a collection of isolated
asset previews. The selected ecology keys remain the direction source.

The following names are production proposals. They do not establish new lore,
resource types or mechanics. A species name denotes a different crown, trunk and
branch architecture, not a recoloured copy. Existing regional assets are starting
samples, not evidence that the full kit is implemented.

## Audit of the current renderer

The pre-kit `groundTexture(name)` cached one global texture per material name.
Thus a `dirt` patch used the same painted pixels in every zone. The first
Underbough runtime pass below replaces that binding for its implemented roles. Ground paints
also select vegetation indirectly through the base material rather than an
explicit regional kit. Shared source textures cannot cover every regional
combination coherently.

Bellweather mixes regional maple/hedgerow with generic oak, pine and birch.
Underbough has copperleaf and bramble; Vesperra, Sombral Mere, Siltmouths and
Pale Meridian generally repeat a single regional canopy family. Seeded scale,
mirroring and small yaw variations cannot supply missing species or viewpoints.

The inspected lifecycle atlases have four harvest states, each with one
`fixed-oblique` frame. These are **state captures, not four rotated views**.
The packing script explicitly writes `directionId: fixed-oblique`. The previous
source documentation acknowledges that additional measured camera views are
not supplied. Keep this distinction visible in manifests and acceptance records.

There is an important older exception: the [Meshy oak, pine and berry pilot](../assets/environment/frontier-meshy-sprites-v1/README.md)
already supplies eight actual camera-orbit captures per model. The current
environment loader nevertheless loads only `runtime/{family}-01.webp` for
these families. Those intact-state captures do not cover the newer regional
species, and their older depletion art is separate. Preserve this usable
capture pipeline and its source hashes; neither its camera convention nor its
lighting is interchangeable with a model-rotation bake under the fixed game
camera. The directional deficit is both asset coverage and loader selection.

## Kit roster

| Zone | Cohesive palette | Four woodland tree forms | Shrubs and ground vegetation |
| --- | --- | --- | --- |
| Bellweather | Sage and muted olive, butter highlights, warm cream bark, quiet ochre soil | Field maple, broad oak, pear, slender ash | Hedgerow, hazel, meadow herbs and barley-edge tufts |
| Underbough | Deep olive moss, warm umber wood, restrained copper and burgundy | Copperleaf, rooted oak, moss hornbeam, old plum | Thornberry bramble, low hazel, bracket fungi and rootward fungus |
| Sereward | Peach mineral soil, dusty coral, grey olive plants; turquoise concentrated at water | Oasis palm, acacia, tamarisk, drought fig | Thorn scrub, succulent clusters, sparse dry grass |
| Ellionar | Honey soil/stone, cultivated olive green, warm copper; lapis reserved for crafted accents | Cultivated palm, cypress, olive, terrace fruit tree | Garden hedge, herbs, irrigated grass margins |
| Veyrholds | Slate stone, alpine olive, subdued rusty copper | Highpine, wind fir, alpine birch, mountain rowan | Juniper, low mountain scrub, ridgegrass and ironlichen |
| Pale Meridian | Blue-grey shadows, silver/frost highlights, restrained violet | Silver conifer, frost larch, low birch, hardy willow | Winter heath, cushion scrub, moss and lichen |
| Siltmouths | Sea green foliage, silver wood, muted lilac, grey tidal soil | Tidal tree, mangrove form, salt willow, marsh alder | Salt shrub, reed beds, marsh tuber foliage |
| Vesperra | Petrol/olive green, pale bark, deep cool shadows, sparse violet accents | Mistbark, buttress elder, umbrella laurel, hanging fig | Shade shrubs, ferns, fungi, restrained vine clusters |
| Sombral Mere | Deep teal, pearl bark, soft lavender accents, cool neutral shores | Merebloom, pearl alder, lakeside willow, teal birch | Wetland shrub, lunewort, mirelily and sparse reeds |
| Ru’Lora | Charcoal, dusty violet, ivory and cold opal; emerald only at living fringe | Interior: petrified crown, hollow column, rooted spire, splintered trunk. Fringe: living canopy, buttress tree, narrow laurel, rooted fig | Interior stone fern/dead brush; living fringe broadleaf, fern and shade shrub |

Ru’Lora interior and living fringe are distinct sub-kits. Four living tree
species must not be scattered through its canonically petrified interior.
High saturation belongs to local accents, not every canopy and ground plane.
Team and command colours retain their separate gameplay meaning.

The kit also owns compatible water/shallows, banks, rocks/cliffs, fallen wood,
ordinary resource-node vegetation and environment landmarks. A regional forest
next to a generic wood-node oak still creates a visible mismatch. Buildings use
their culture's materials while sharing the scene's lighting and ground contact;
units, team accents and objective feedback keep their required readability.

## Ground coverage

Author six compatible ground roles per zone: open/clearing ground, dense ground
growth, woodland litter/root soil, worn path/base soil, exposed stone, and wet
bank/shore. Cold or sterile zones substitute appropriate snow, scree or mineral
cover for grass. Each role needs at least two independently painted tiles once
the kit's palette works in a repeated in-game swatch. Variants should differ in
quiet small-scale detail without introducing another palette or bright motifs.

Resolve an existing map material through its explicit region's kit. Preserve
semantic material names and the saved map schema: `dirt` may render differently
in Underbough and Sombral Mere without changing passability. A mixed biome needs
an authored sub-kit boundary rather than a random global texture selection.
Cache keys include the kit and material. Missing files use a recorded compatible
fallback; absence must never silently import an unrelated zone's new assets.

## Woodland composition

Use habitat and species patches: dominant canopy groups, secondary groups on
different soil/moisture, sparse minor species, young edge growth and open glades.
Do not pick all four species uniformly and independently for every cell. Start
with approximate 45/30/15/10 abundance, then tune each zone's ecology and camera
readability. Shrub and understory density respond to margins, shade and water.
Resource nodes, harvest-cell identity, depletion and reset remain authoritative.

Underbough is the first complete pilot. Its current repeated bright copperleaf
canopy needs darker olive crowns and different trunk architectures, plus quieter
clearing ground and locally matched dirt/stone. Prove the four forms together
at both camera distances before expanding the same pipeline across the roster.

## Directional production

Capture four actual asset azimuths (0°, 90°, 180°, 270°) at the existing fixed
camera elevation and orthographic scale. Give asymmetric trees, shrubs, roots
and rocks independent views. Flat seamless ground does not need camera views.
Eight azimuths can follow if four fail the rotated-camera comparison.

For model sources these must be render captures of the same asset. For painted
sources they are explicitly **authored directional drawings**, reviewed for
identity, branch structure, size and lighting continuity; do not call them
measured 3D captures. Mirroring one frame or rotating its billboard is not a
directional deliverable. Avoid baking cast shadows or a ground platform into
transparent sprites.

Pack species × harvest state × direction. A stable seeded world orientation
belongs to the tree slot; the selected frame follows its relative camera angle.
All states/directions share the root pivot and logical scale. Repeated view
changes must not make trees change species, drift, flip their lighting or lose
harvest feedback. Decorative shrubs retain their own nonblocking ownership.

## Acceptance and publication

1. Compare the complete palette beside the selected key, with 3×3 texture repeats
   and all proposed tree/shrub families in one contact sheet.
2. Inspect a representative clearing, dense woodland and wet margin at normal
   and strategic zoom. Record exact kit, renderer, map and capture perspective.
3. Show distinct species and four genuine authored/captured azimuths. A frame
   count alone does not prove identity or perspective consistency.
4. Check normal/full, worked, low, depleted and reset states at the same roots;
   exercise picking and a live harvest. Decorative ground art cannot change routes.
5. Package useful source/runtime slices progressively, recording missing roles
   and viewpoints. Do not describe a palette study as integrated runtime art.

The first Underbough board is an art-direction study; new production textures,
species, directional frames and regional loader bindings remain to be completed.
The first dark olive Root Oak intact source now exists at the designated 0°
orientation. Further verified views remain outstanding. Its pixels and alpha are
retained in the [source pack](../assets/environment/vaelora-region-kits-v2/README.md);
the first runtime family record below now documents its loader.

### First ground runtime — 1 October 2026 UTC

Three new Underbough sources now supply clearing grass, worn earth and mossy root
soil. `src/regional-ground-kits.mjs` resolves meadow/short/long grass, dirt and
forest-floor by explicit map region. The semantic paint fields stay unchanged.
The same profile supplies representative colours for the border, minimap and
Studio diagram. Other regions retain their existing bindings. `?regionalGrounds=legacy`
provides a paired review of the old materials.

The [local browser evidence](qa-evidence/underbough-ground-kit-2026-10-01/renderer-proof.json)
checks all three consuming renderer paths, switching to Bellweather without a
texture-cache leak, legacy comparison and an unchanged map definition. Captures
cover both maps at normal and strategic zoom with no console/asset errors.
The three RGB WebP encodings total 1,758,626 bytes, preserve the source dimensions,
and use no repaint, crop or resize. This is local runtime evidence, not a staging
deployment or GPU capacity measurement. Texture repetition is reviewed through
the existing mirrored/stochastic sampler, not claimed mathematically periodic.

The Root Oak, Moss Hornbeam, and Old Plum provide three additional distinct intact painted
tree sources. Root Oak now has a fixed-view harvest-state runtime; Hornbeam and Plum still
need harvest states and registration. All three need verified model/directional
views before the requested coverage is complete. This first ground pass
does not complete the four-species forest or the ten-zone kit matrix.

### First mixed Underbough canopy — 1 October 2026 UTC

Root Oak now supplies a broad dark olive form beside Copperleaf and woody
bramble. Seeded spatial groves vary its proportion across the forest while
every existing wood cell retains one harvest slot. All four fixed-view states
use registered atlas frames. [Current browser evidence](qa-evidence/underbough-root-oak-2026-10-01/underbough-rootways-renderer-proof.json)
records 1026 original cells, species counts, unchanged roots and atlas selection
through full/worked/low/depleted/reset. Vesperra is the unchanged control.
This is renderer interface evidence; a new actual worker-harvest observation
and the complete four-species directional kit remain outstanding.

### Root Oak live harvest — 1 October 2026 UTC

[Real worker evidence](qa-evidence/underbough-root-oak-live-2026-10-01/live-harvest-proof.json)
at source `5c9771e8` verifies Root Oak cell 646 through worked (3.900002), low
(1.900004), depleted (0) and reset. The renderer verifies the target family
before the gather order. The worker delivers six wood; captures include full,
worked, low, depleted and restored tree appearances. This closes the outstanding
live-harvest check for the first Root Oak runtime, not directional coverage.

### Three-tree woodland runtime — 1 October 2026 UTC

Moss Hornbeam adds a taller airy form with lighter grey bark.
[Renderer evidence](qa-evidence/underbough-hornbeam-2026-10-01/underbough-rootways-renderer-proof.json)
records 391 Root Oaks, 311 Hornbeams, 241 Copperleaf and 83 brambles in the
original 1026 cells. Four-state selection, roots and reset pass for every family;
Vesperra is the unchanged control. Plum and directional coverage remain unfinished.
The normal-scale capture also reveals that the map uses forest-floor soil in its
open clearings: the next composition correction is grass in clearings with
shaded root soil under woods. A cohesive texture collection alone does not
correct an unsuitable material-role assignment.

### Grassy clearings and shaded woodland — 1 October 2026 UTC

Underbough Rootways now authors meadow as its base instead of forest-floor.
The existing regional kit supplies muted clearing grass; the forest mask still
adds mossy root soil beneath woodland. `groundBaseMaterial` drives the ground,
border, minimap and Studio default, while `environmentTheme` keeps Underbough
vegetation tied to the region when its base is grassy. Other map fields,
settlement wear, routes and resource rules are unchanged.

[Paired current evidence](qa-evidence/underbough-clearing-ground-2026-10-01/renderer-proof.json)
compares the previous soil base and grass base with the same current kit,
map and cameras. It verifies the actual base texture, shaded root-soil texture,
all existing regional families, cache isolation and unmutated render input.
Normal and strategic captures include Bellweather as an unchanged control.
The saved `legacy` layout images mean previous soil assignment using the same
kit; they do not mean global legacy textures in this capture mode.

### Four distinct Underbough tree forms — 1 October 2026 UTC

[Current four-tree evidence](qa-evidence/underbough-four-trees-2026-10-01/underbough-rootways-renderer-proof.json)
records Root Oak 314, Hornbeam 230, Old Plum 207, Copperleaf 192 and bramble 83,
with all 1026 original wood cells and root positions preserved through harvest
state selection and reset. Wider and closer captures use the clearing grass
and shaded root-soil treatment. Each form has full/worked/low/depleted art.
These four states still supply one fixed painted view, not directional coverage.
Additional shrubs, texture roles/variants, other zones and true perspectives
remain unfinished.

[Live worker proof for all three new families](qa-evidence/underbough-family-harvest-2026-10-01/summary.json)
uses renderer-selected visible targets and verifies each family before the gather
order. Root Oak, Hornbeam and Plum reach worked, low, depleted and reset, with
no console or asset errors. This extends the initial Root Oak observation to
the current four-tree distribution.

### Model-derived directional pilot — 1 October 2026 UTC

[The existing-model perspective pack](../assets/environment/frontier-meshy-fixed-camera-v2/README.md)
contains 24 verified views: oak, pine and berry bush, eight model headings each.
Camera, lighting, scale and pivot remain fixed. This is a source pack; runtime
selection and the painted regional families' directional coverage remain
unfinished. Source hashes, provider provenance and exact RGBA atlas/frame
validation are retained. No new paid provider generation was used.

### Existing-model heading selection — 1 October 2026 UTC

The renderer now buckets generic oak and pine instances into eight model-derived
headings using each original cell as the stable seed. Their sprite cards remain
camera-facing and unflipped. Regional painted families retain their own kits.
[Actual renderer evidence](qa-evidence/resource-directions-2026-10-01/renderer-proof.json)
records all 394 original review-map trees, eight headings per family and exact
instance-matrix restoration after depletion/reset. The fixture loads the real
renderer and assets in Chrome and saves its rendered grove. This is renderer
integration evidence; it does not prove a full-match worker observation or
regional painted-tree directional coverage. Berry headings remain source-only.

### Resource-node heading selection — 1 October 2026 UTC

Full berry and oak resource-node instances now select actual model headings
from their world positions. A per-instance atlas rectangle preserves existing
slot indices and stage updates. Harvest states still use their existing fixed
painted views; intact directional coverage does not claim rotated harvest art.
The renderer preserves its directional atlas when asynchronous lifecycle art
finishes loading. [Berry renderer evidence](qa-evidence/resource-node-directions-2026-10-01/renderer-proof.json)
records 32 instances spanning all eight headings, exact depletion/reset matrix
restoration and atlas survival after real lifecycle loading. A Chrome capture
checks the compiled instanced shader. Full-match worker and staging observations
remain separate unfinished evidence.
