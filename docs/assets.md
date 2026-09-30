# Asset guide

[Documentation index](README.md) · [Art direction](art-direction-contract-v1.md)

## Choose the right path

| Work | Guide / contract |
| --- | --- |
| Shared palette, scale, team identity, readability | [Art direction](art-direction-contract-v1.md) |
| Who owns an asset outcome | [Art production lanes](art-production-lanes.md) |
| Match state → rendering | [Renderer contract](renderer-state-contract.md) |
| New building concepts → models → captured views | [Preferred building pipeline](building-asset-production-pipeline.md) |
| Direct 2D building frames | [Sprite production workflow](building-sprite-production-workflow.md) |
| Sprite pages, layers, pivots, masks, and clips | [Sprite-atlas contract](sprite-atlas-contract-v1.md) |
| Unit roles and building silhouettes | [Unit/building kit](unit-building-art.md) |
| Ground, rocks, vegetation, and terrain review | [Environment pack](environment-pack-v1.md) |
| Resource depletion and construction ground | [Environment states](environment-state-pack-v1.md) |
| Native cursors and HUD icons | [UI asset contract](ui-cursor-icon-contract.md) |

## Know what is actually in game

Current runtime defaults:

- Bellweather woody hedgerows on meadow maps use the [hedgerow lifecycle atlas](environment-pack-v1.md#bellweather-hedgerow-lifecycle--30-september-2026), with matching cleared cut stems alongside the field maple lifecycle.
- Sereward thorn acacias on sand maps use the [acacia lifecycle atlas](environment-pack-v1.md#sereward-thorn-acacia-lifecycle--30-september-2026), alongside palms. The [woody scrub companion](environment-pack-v1.md#sereward-woody-scrub-lifecycle--30-september-2026) has clipped, cut-back and cleared root-crown states.
- Ellionar cultivated palms on garden-loam maps use the [palm lifecycle atlas](environment-pack-v1.md#ellionar-cultivated-palm-lifecycle--30-september-2026), including matching diamond-bark stumps. The [garden hedge companion](environment-pack-v1.md#ellionar-garden-hedge-lifecycle--30-september-2026) has clipped, cut-back and cleared wood states.
- Veyrholds highpine slots on scree maps use the [highpine lifecycle atlas](environment-pack-v1.md#veyrholds-highpine-lifecycle--30-september-2026), including matching depletion roots. Their existing share of the forest mix stays unchanged.

- Underbough forest-floor maps use the [Copperleaf lifecycle atlas](environment-pack-v1.md#underbough-copperleaf-lifecycle--30-september-2026) for their Copperleaf forest slots, including matching depletion roots and stump. The [woody bramble companion](environment-pack-v1.md#underbough-woody-bramble-lifecycle--30-september-2026) has its own clipped-stem and cleared root-tangle states.

- Ru’Lora salt-crust maps use the [petrified Fiendwood sample](environment-pack-v1.md#rulora-petrified-fiendwood--30-september-2026) and [stone fern companion](environment-pack-v1.md#rulora-stone-fern-companion--30-september-2026) with a [broken trunk silhouette](environment-pack-v1.md#rulora-broken-trunk-silhouette--30-september-2026) for low stone scenery. They preserve stone collision and are not wood or mineral resources.

- Oak, pine, and full berry resource sprites use the captured Meshy pack by
  default. `?meshyResources=0` restores the older art for comparison. Worked,
  low, and depleted resource states still use the interactive state pack; their
  Meshy replacements remain unfinished. Other tree species retain their art.
- Workers use the eight-direction Meshy Worker v3 sprite atlas by default.
  Infantry and Archers retain procedural geometry unless a sprite preview is
  selected. All supported unit sprite manifests, runtime atlases, and team masks
  are included in the Docker image; source atlases are excluded.
- The human/orc/elf/troll cast packs are review candidates only. They load only
  with `?castPreview=1`, are assigned by visible unit slot for comparison, and
  do not change the default roster or establish faction gameplay.
- Town Centers use the eight-view captured lifecycle pack, with procedural
  fallback. Gameplay supplies only their Complete landmark state.
- Barracks and Archery Ranges load their direct WebP sprites by default through
  `src/building-sprites.mjs`, with procedural loading/error fallback. Construction
  uses 20%/90% transitions; completed health uses 66%/33% transitions. Their
  separate construction-atlas packs remain candidates.
  Both building types refresh their sprite on authoritative state updates;
  see the [Barracks lifecycle regression](qa-barracks-lifecycle-2026-09-27.md).
- Town Center footprints block movement and building placement. Captured image
  bounds do not define collision; `src/town-center-spawn.mjs` owns the footprint.
- The 40 px Meshy cursor PNGs are integrated. Older 32 px SVGs remain source history.

A file under `runtime/` means an export intended for loading; it does not prove
that the game loads it. Check the loader and pack README before claiming adoption.

## Review locally

Start the game and use **Terrain Art Pilot** (`/environment-review.html`) for the
directional cliff/depth experiment, or choose **Frontier Materials** for ground
and obstacle heights. The [Vaelora ground pass](environment-pack-v1.md#vaelora-painted-ground--29-september-2026) replaces the eight original grounds and adds five regional Map Studio materials. The [variety follow-up](terrain-variety.md) extends the catalog to sixteen with three companion grounds, randomized sampling, and an optional mist study.

The source includes **Building Variant Atlas**, but the current game server's
allowlist does not serve `building-map.html`, its CSS/JS, or all of its comparison
assets. To inspect that static page, start a separate loopback preview from the
repository root:

```sh
python3 -m http.server 4180 --bind 127.0.0.1
```

Open [the local building atlas](http://127.0.0.1:4180/building-map.html).
This server is for static review; run the game through `npm start`.
The pack READMEs describe current integration; older captions on the review page
may describe its original review-only state.

The Dockerfile includes the active Barracks, Range, and Town Center runtime
packs. It still omits the atlas page. Release packaging checks file delivery;
a capture of the identified deployed build establishes hosted appearance.

Review pages and contact sheets explain an asset. In-game screenshots establish
runtime appearance only when the actual files and state are identified.

## Validate a package

Run the validator that matches its manifest:

```sh
node scripts/validate-visual-pack.mjs assets/environment/frontier-interactive-v1/manifest.json
node scripts/validate-sprite-atlas.mjs assets/buildings/archery-range-construction-v1/sprite-atlas-pack-v1.json
npm run validate:painted-material-atlas
```

`source/authoring-manifest.json` in the GLB samples is not a renderer v1 manifest.
Do not pass it to the runtime validator. Read the sample's own inspection commands.

## Keep the package reviewable

Each pack README should state purpose, maturity, contents, build/validation
commands, integration status, and known limits. Manifests own dimensions, anchors,
state thresholds, paths, and hashes. Provenance owns source lineage, exact prompts,
provider IDs, and recorded spend. Preserve these factual records when editing prose.

Keep source, runtime-candidate, integrated, and visually reviewed statuses distinct.
Update hash records when their covered documentation changes. Use ordinary and
strategic game views for readability; reserve measured performance claims for a
comparable run on the integrated renderer.

By user direction on 29 September 2026, the cast human/orc/elf/troll review atlases supply stable mixed Worker appearances by default. `?castPreview=0` restores Worker v3. Infantry and Archer keep their prior defaults. The cast packs remain exploratory runtime candidates.

Vesperra jungle-loam forests also carry sparse decorative shade fern companions; see the [understory manifest](../assets/environment/frontier-v1/vesperra-understory-manifest.json) and [environment guide](environment-pack-v1.md). They clear with their parent forest cell, without introducing a new resource.

Siltmouths tidal-mud forests include sparse silver reed companions that clear with their parent forest cells. The [understory manifest](../assets/environment/frontier-v1/siltmouths-understory-manifest.json) records source/runtime files and dimensions; see the [environment guide](environment-pack-v1.md) for placement and remaining scope.

Pale Meridian snow/ice forests include sparse silver cushion moss companions, clearing with their parent forest cells. See the [manifest](../assets/environment/frontier-v1/pale-meridian-understory-manifest.json) and [environment guide](environment-pack-v1.md) for sources, placement and remaining scope.

Sombral Mere lunar-soil forests include small Lunewort flower companions that clear with their parent forest cells. See the [understory manifest](../assets/environment/frontier-v1/sombral-mere-understory-manifest.json) and [environment guide](environment-pack-v1.md) for source/runtime details and remaining scope.

Underbough forest-floor maps include sparse Rootward fungus companions beneath Copperleaf/bramble, clearing with their parent forest cells. See the [manifest](../assets/environment/frontier-v1/underbough-understory-manifest.json) and [environment guide](environment-pack-v1.md) for source/runtime details and scope.

Veyrholds scree-map forests include sparse ridgegrass companions clearing with their parent forest cells. See the [manifest](../assets/environment/frontier-v1/veyrholds-understory-manifest.json) and [environment guide](environment-pack-v1.md) for source/runtime details and scope.

Ellionar garden-loam maps include sparse Sunbloom companions beneath palms and hedges, clearing with parent forest cells. See the [manifest](../assets/environment/frontier-v1/ellionar-understory-manifest.json) and [environment guide](environment-pack-v1.md) for source/runtime details and scope.

Sereward sand-map forests include sparse turquoise/coral succulent companions that clear with their parent forest cells. See the [manifest](../assets/environment/frontier-v1/sereward-understory-manifest.json) and [environment guide](environment-pack-v1.md) for source/runtime details and scope.

Vesperra shade ferns now mix two terrain-seeded silhouettes within the existing companion selection. The [variation manifest](../assets/environment/frontier-v1/vesperra-fern-variation-manifest.json) records the second source/runtime sprite. Both clear and reset with their parent forest cells.
