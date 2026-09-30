# Frontier environment pack v1

Original environment art generated for Thousand Unit Skirmish on 25 September 2026 with Codex ImageGen. No external reference images or third-party game assets were supplied. These PNGs are source sprites and textures for evaluation in the browser prototype. The generated image identifiers and SHA-256 hashes below bind the delivered files to their source outputs.

The original ground rows below are historical and were superseded on 29 September 2026; prop rows remain current.

| File | Generated image | SHA-256 |
| --- | --- | --- |
| `oak.png` | `exec-9188de90-03cc-40cf-a684-91d8b70287e1.png` | `e99f1c70c28cedd8406dea44b72186f25a40ef88c1a3f72d7690298f5e584753` |
| `pine.png` | `exec-7851d3ec-891a-4bb0-a707-bce02ac0cb42.png` | `b6bb0453e1537eb3f82637518cf02764c4d615d14e1257a575324c583d17bacf` |
| `berries.png` | `exec-dd127de7-f4a1-4d8c-b565-9c2c6c56357c.png` | `3ca2f8162316e1babcda9357cb51856fa56ce1ff7706d03ef8d95bbcb0a04787` |
| `basalt-ridge.png` | `exec-af22d893-4e85-4b41-a6bd-2f906789753b.png` | `2f119bbe75f891229e5f8779b2ba5b400ab11d8c545186c87e915b97648ce16a` |
| `seamstone.png` | `exec-32bbdcce-895a-4ba4-8f9c-225bce04548f.png` | `c2c3588efe69ed636b1fb861dab0dcc4eeae1a5ae9e4e926aa92093c92b08a64` |
| `meadow.png` | `exec-addd5cc2-a03d-4419-ad12-29605e403978.png` | `9268abaa3304196ca0cd774c8ae137f2c57612d57ef8cff0f46e234432af6689` |
| `cinder.png` | `exec-5f4d4837-9628-4e9d-b241-da937b3297b8.png` | `c8bfcf36f98d66d4bd07d4ae5a77fe05bd61e650854ff1ef5a926df49d7da67a` |
| `short-grass.png` | `exec-98199c5e-302e-43f4-a4e9-c1c93ab958b6.png` | `e10a2bd76c8733c6037f743345c7a189686b78faa85a4affac9aaa2298955a2a` |
| `long-grass.png` | `exec-f9166259-a969-46bb-a850-05784fd5a28e.png` | `b43fa5c95c2c00d0452eaca03b406429fb941d3f71be8895bac09d17b73b8de3` |
| `forest-floor.png` | `exec-f350bdbe-e15e-4332-a2a8-02f247521708.png` | `e091cea3db9dd870e7b1c39b67504cd8daf798d9e87d75bb2bad32d4ce187a70` |
| `dirt.png` | `exec-7ffb3c1e-d6ce-4546-9b2b-471449b76780.png` | `f442a560c029c431a61f5bdc358b550ecff3425ee6984053a33124c32e71b1dd` |
| `sand.png` | `exec-98b2f839-b3cb-43b0-aff3-1a78e1f86675.png` | `e8a7e948f8ceb869b9a0fef00797f265559f1af3ddfdfa7a35c4f43805db1493` |
| `scree.png` | `exec-cc494509-7f80-49f9-85fa-7388f3b273fe.png` | `4b9bab49e6d03c85256c2a9d8cf2ad32ba5600c4701558425894e342d560c5b7` |
| `rock-outcrop.png` | `exec-8efb83ae-0eb9-475a-95e5-51dadc6c4b07.png` | `363f67ed00cee0a8eab0fed27dc38fe9ad8b80af48d2b5f2cb1aea1f1481664a` |
| `cliff.png` | `exec-5d9fbb4c-ad08-4e74-8623-8c955c057f63.png` | `0df4bb2e35d44d1a074c99a50305a66eb278fb898c4471dfebbad8b2b12f4478` |

The matching `.webp` files are quality-86 runtime encodes of these PNG sources. The browser loads WebP; PNGs remain editable source art. Ground textures repeat with mirrored wrapping and use global map coordinates, so a material's pattern continues across separate painted regions.

## Rock module addition — 26 September 2026

Two original transparent rock modules add a low boulder scatter and tapered medium-ridge end cap. The output identifiers and SHA-256 hashes bind the source PNGs to the generated outputs; [`rock-manifest.json`](rock-manifest.json) records source/runtime dimensions, world size, pivot, alpha mode, role, and deterministic variation range. [`ROCK-PROMPTS.md`](ROCK-PROMPTS.md) keeps the art brief for each source. Pillow 12.3.0 resized the RGBA sources to a 1024-pixel maximum edge and encoded quality-86 WebPs with alpha retained.

| Source | ImageGen output | SHA-256 |
| --- | --- | --- |
| `rock-boulder-cluster.png` | `exec-3d0deef4-b10f-41cf-b794-41781ba3862e.png` | `df16e1b829b75b61cae2c4c92d57530c5497d20800e8532c38844190a7e3b035` |
| `basalt-ridge-cap.png` | `exec-d1b4a6a6-8300-48e1-aefd-628c9660477f.png` | `dc1966fc1e7f07ad710cc3b6af9c4993be30249cb7a5b9becacba6e35a6ef734` |
| `cliff-end-cap.png` | `exec-9721362a-531f-4a06-ae0d-dd07d754054f.png` | `b6cc8d096ce3113dc4aade59eb01d77135aedf391e6e19d927101b354c0c1b10` |

The tall cliff endpoint closes each authored cliff barrier with a tapered rubble edge facing outward and a sheer face oriented into the barrier. Its runtime WebP uses the same Pillow 12.3.0 RGBA resize and quality-86 encode settings; the versioned rock manifest records both file hashes and the 4.2 × 4.6 world size.

## Vegetation addition — 26 September 2026

Three original forest cutouts extend the existing oak and pine silhouettes. Source PNG masters and their optimized runtime WebPs are listed with hashes, dimensions, world size, pivot, and scale range in [`vegetation-manifest.json`](vegetation-manifest.json). Exact prompts are in [`VEGETATION-PROMPTS.md`](VEGETATION-PROMPTS.md). The PNG masters are editable raster sources; WebPs were encoded with Pillow 12.3.0 at quality 86 after resizing to a 1024-pixel maximum edge. All three use actual transparent alpha and contain no external reference imagery.

| Source | ImageGen output | SHA-256 |
| --- | --- | --- |
| `silver-birch.png` | `exec-1cbfa37d-1e3d-4798-9493-fe87798ca21a.png` | `9ffb93a6c18feea2e68269b749fd4ff0010202dd93c1bc41b565e0cad6703fe2` |
| `field-maple.png` | `exec-dcfce9e6-96dd-4fa2-b5a6-159640d5e836.png` | `345fb61f06c97948501a830a684fa95d4e90375c6c37817deb339c8f6099fea2` |
| `hazel-thicket.png` | `exec-05e50d97-58a1-441c-b707-114129b084a1.png` | `a4ba3fc6a1c5c3913fab1eec03366623e3472fc6c2f78d8a426df929434baa47` |

## Exact generation prompts

### oak.png

> Use case: game asset. Asset type: transparent-background 2D environment sprite for an original oblique orthographic RTS. One single mature frontier oak tree only, whole tree visible from roots to crown, centered with generous transparent margin. Strong broad asymmetrical canopy silhouette in muted olive and moss green, weathered twisted trunk, small warm ochre leaf accents, subtly hand-painted sculptural 3D appearance, readable at small in-game size, modest detail, front three-quarter elevated game camera, neutral daylight. Actual transparent alpha background, no ground plane, no cast shadow beyond a subtle contact shadow in the asset, no text, no border, no other objects, no franchise resemblance.

### pine.png

> Use case: game asset. Asset type: transparent-background 2D environment sprite for an original oblique orthographic RTS. One single tall dark frontier pine tree only, whole tree visible from roots to tip, centered with generous transparent margin. Distinct narrow tiered silhouette with deep pine-green needles, sparse bronze dead branches, weathered trunk, hand-painted sculptural 3D appearance, readable at small in-game size, modest detail, front three-quarter elevated game camera, neutral daylight. Actual transparent alpha background, no ground plane, no cast shadow beyond a subtle contact shadow, no text, no border, no other objects, no franchise resemblance.

### berries.png

> Use case: game asset. Asset type: transparent-background 2D harvestable food resource sprite for an original oblique orthographic RTS. One compact berry thicket only, whole patch visible, centered with generous transparent margin. A cluster of low rounded dark-green shrubs with a few conspicuous warm rust-red berries, strong readable silhouette at small in-game size, weathered mossy frontier art direction, subtly hand-painted sculptural 3D appearance, front three-quarter elevated game camera, neutral daylight. Actual transparent alpha background, no ground plane, no labels, no ring, no text, no border, no other objects, no franchise resemblance.

### basalt-ridge.png

> Use case: game asset. Asset type: transparent-background 2D environment sprite for an original oblique orthographic RTS. One short modular outcrop of dark weathered basalt ridge, roughly twice as wide as tall, whole object centered with transparent padding. Faceted rock faces with moss on top and muted ochre grass at the base, natural irregular silhouette, stable flat-ish bottom edge for joining adjacent ridge segments. Grounded painterly sculptural 3D appearance, moderate details designed to read at gameplay zoom, elevated three-quarter game camera matching a top-down RTS. Actual transparent alpha background, no sky, no landscape, no text, no other objects, no oversized glow, no franchise resemblance.

### seamstone.png

> Use case: game asset. Asset type: transparent-background 2D neutral objective landmark sprite for an original oblique orthographic RTS. A pair of tall split dark-stone monolith slabs rising from one low circular weathered foundation, subtle thin warm amber light visible only in the split and a few mineral seams; moss, lichen and a little ochre grass. Clear distinctive silhouette and compact footprint, readable from far overhead, ancient landscape feature with no civilization symbols. Painterly sculptural 3D appearance, restrained fantasy, elevated three-quarter RTS game camera, neutral daylight. Actual transparent alpha background, no environment, no text, no rings, no UI, no other objects, no franchise resemblance.

### meadow.png

> Use case: game asset. Asset type: tileable environment ground texture for a stylized 3D oblique RTS. Perfectly seamless square TOP-DOWN orthographic flat albedo texture of weathered mossy meadow soil, muted olive grass, tiny tan dry grass flecks and sparse dark earth patches, no individual objects or stones bigger than a few pixels, even lighting and consistent value everywhere, no directional shadows, no vignette, no horizon, no perspective, no border. Painterly natural material, restrained color variation, low contrast so hundreds of blue and terracotta units remain legible. Full-bleed opaque square texture.

### cinder.png

> Use case: game asset. Asset type: tileable environment ground texture for a stylized 3D oblique RTS. Perfectly seamless square TOP-DOWN orthographic flat albedo texture of cinder upland soil: muted charcoal brown earth, scattered tiny basalt fragments, straw-ochre dry grasses and sparse moss, the same restrained brightness and fine texture scale as a meadow terrain swatch. Even lighting and consistent value everywhere, no individual objects larger than a few pixels, no directional shadows, no vignette, no horizon, no perspective, no border. Painterly natural material, low contrast so many blue and terracotta units remain legible. Full-bleed opaque square texture.

### short-grass.png

> Use case: game asset. Seamless top-down orthographic square albedo texture for an original oblique RTS terrain brush. SHORT MEADOW GRASS: compact olive-green fine grass with muted yellow-green variation and tiny sparse soil flecks. Flat material only, no identifiable objects, no horizon or perspective, no cast shadows, no large marks or vignette. Even color and value edge-to-edge, perfectly tileable infinite pattern. Grounded painterly natural material, restrained detail, low contrast under hundreds of units. Full bleed opaque square.

### long-grass.png

> Use case: game asset. Seamless top-down orthographic square albedo texture for an original oblique RTS terrain brush. LONG WILD GRASS: muted sage and olive blades with scattered straw-ochre tufts, slightly rougher and lighter than short meadow grass but still quiet at strategic zoom. Flat material only, no objects, no horizon or perspective, no cast shadows, no large motifs or vignette. Even color and value edge-to-edge, perfectly tileable infinite pattern. Painterly natural material, low contrast under hundreds of units. Full bleed opaque square.

### forest-floor.png

> Seamless tileable square top-down opaque forest floor albedo texture for a painterly strategy game: fine moss, muted leaf litter, tiny pine needles and earthy specks, deep olive and dark warm brown, understated contrast, no directional light, shadows, trees, objects, horizon, vignette or border. Full bleed, evenly patterned, game-ready material.

### dirt.png

> Use case: game asset. Seamless top-down orthographic square albedo texture for an original oblique RTS terrain brush. WORN EARTH: medium warm umber and desaturated brown compacted soil, tiny mineral grains, faint foot-worn irregularities, almost no vegetation. Flat material only, no objects, no horizon or perspective, no cast shadows, no large cracks or vignette. Even color and value edge-to-edge, perfectly tileable infinite pattern. Painterly grounded frontier material, low contrast. Full bleed opaque square.

### sand.png

> Use case: game asset. Seamless top-down orthographic square albedo texture for an original oblique RTS terrain brush. WINDWORN SAND: desaturated tan and dusty ochre mineral grains, subtle small ripples no more than a few pixels, sparse dark flecks. Flat material only, no dunes, objects, horizon, perspective, directional shadows, large motifs, or vignette. Even color and value edge-to-edge, perfectly tileable infinite pattern. Painterly grounded fantasy frontier material, low contrast under blue and rust unit colors. Full bleed opaque square.

### scree.png

> Use case: game asset. Seamless top-down orthographic square albedo texture for an original oblique RTS terrain brush. BASALT SCREE: small dark slate and gray-green stone chips in compact earth, weathered surfaces, a hint of ochre dust and sparse lichen. Flat material only, no boulders, objects, horizon, perspective, directional shadows, large motifs, or vignette. Even color and value edge-to-edge, perfectly tileable infinite pattern. Painterly natural material, low contrast under large armies. Full bleed opaque square.

### cliff.png

> Use case: game asset. Transparent-background 2D environment sprite for an original oblique orthographic RTS. A single imposing weathered dark basalt CLIFF FACE segment, approximately twice as wide as tall, flat-ish joining edges and grounded irregular base, taller and more vertical than a low rocky outcrop. Moss in crevices, sparse ochre grasses, strong legible fractured silhouette, hand-painted sculptural appearance at strategic zoom, three-quarter elevated RTS camera. Transparent alpha background, no rectangular ground tile, no sky, no text, no border, no other objects, no franchise resemblance.

### rock-outcrop.png

> Use case: game asset. Transparent-background 2D environment sprite for an original oblique orthographic RTS. A low irregular ROCK OUTCROP cluster of three weathered dark slate stones, broad ground-hugging silhouette, roughly twice as wide as tall, tiny moss patches and ochre dry grass around its base, no tall cliff face. Strong readable shape at strategic zoom, painterly sculptural 3D appearance from a three-quarter elevated RTS camera. Actual transparent alpha background, no square ground plane or backdrop, no sky, no text, no border, no other objects, no franchise resemblance.

## Vaelora ground replacement · 29 September 2026

Eight legacy grounds were replaced and five regional grounds added using the
project’s [approved Vaelora concept direction](../../../docs/art-direction/vaelora-v1/README.md).
Generated with OpenAI built-in image_gen, with no third-party reference image input.
[Exact prompts](VAELORA-GROUND-PROMPTS.json) and the
[current source/runtime hash manifest](vaelora-ground-manifest.json) supersede the
historical ground hashes above. Source PNGs are preserved; runtime WebPs use
Pillow 12.3.0, RGB, 1024-square LANCZOS resize, quality 86. The
[contact sheet](vaelora-ground-preview.png) assembles mirrored repeats without
repainting source pixels. Props and their provenance are unchanged.

## Vaelora regional companions · 29 September 2026

`dry-grass`, `garden-loam`, and `salt-crust` were generated using the approved
meadow, dirt, and cinder PNGs as project-owned style references. The thirteen
checkpointed source/runtime grounds retain their hashes. The
[companion manifest](vaelora-ground-variety-manifest.json) binds exact prompts,
reference hashes, source output identifiers, and six delivered PNG/WebP files.
The [preview](vaelora-ground-variety-preview.png) is a source contact sheet.
No third-party imagery was supplied. Encoding follows the existing RGB,
1024-square LANCZOS, WebP quality-86 runtime path.

## Bellweather vegetation extension — 30 September 2026

The field-maple and hedgerow additions derive from the project-authored
Bellweather ecology key. [Exact initial/refinement prompts](BELLWEATHER-VEGETATION-PROMPTS.json)
and [manifest](bellweather-vegetation-manifest.json) record the final generated
outputs, file hashes, crop bounds and encoding. Original generated PNGs are
retained unchanged; runtime WebPs preserve alpha. Earlier source art and its
manifests remain historical records. No third-party imagery was used.

## Veyrholds extension — 30 September 2026

The wind-shaped Highpine and ironlichen outcrop derive from the original
Vaelora Veyrholds ecology key. [Prompts](VEYRHOLDS-PROMPTS.json) and
[manifest](veyrholds-manifest.json) record reference/source identifiers,
checksums, dimensions and encoding. Source PNGs are unchanged generated
outputs. Runtime cropping/downscaling/encoding preserves alpha without
repainting. No third-party image inputs were used.

## Underbough rooted woodland — 30 September 2026

The Copperleaf and fruitless woody bramble derive from the approved Underbough
ecology key. [Prompts](UNDERBOUGH-PROMPTS.json) and
[manifest](underbough-manifest.json) preserve source output identifiers,
reference hash, dimensions and runtime encoding. Source PNG masters are
unmodified generated outputs. Packaging only crops to content bounds,
downscales and encodes RGBA WebP. No third-party image inputs were used.

## Sereward oasis woodland — 30 September 2026

The fruitless palm, pale thorn acacia and woody flowering scrub derive from
the approved Sereward ecology key. [Prompts](SEREWARD-PROMPTS.json) and
[manifest](sereward-manifest.json) record source identifiers, the reference
hash, dimensions and runtime packaging. PNG masters are unchanged generated
outputs. Cropping/downscaling/WebP encoding preserves alpha and does not
repaint the source. No third-party image inputs were used.

## Ellionar cultivated grove — 30 September 2026

The upright cultivated palm and woody garden hedge derive from the approved
Ellionar ecology key. [Prompts](ELLIONAR-PROMPTS.json) and
[manifest](ellionar-manifest.json) record original source output identifiers,
reference hash, dimensions and RGBA encoding. Generated PNG masters remain
unmodified; runtime packaging only crops/downscales/encodes. No third-party
image inputs were used. The hedge is a production adaptation of the key's
cascading garden vine, not a newly established canonical species.

## Bellweather maple lifecycle · 30 September 2026

Built-in ImageGen edited the project-authored Bellweather maple into worked, low
and matching stump states. No third-party image inputs. Unmodified PNG masters
and alpha-preserving WebP encodings are recorded in
[the lifecycle manifest](bellweather-lifecycle-manifest.json);
[exact prompts](BELLWEATHER-LIFECYCLE-PROMPTS.json) identify the edit invariants.
All frames retain the original 1254-square logical canvas and share the original
crop box [74,68,1197,1204], then LANCZOS max1024 and WebP quality86 method6.
Full source/runtime are reused without changes. No alpha/color repainting; the
contact sheet composites the runtime files over sage solely for inspection.
Single camera view, separate textures; neither atlas packing nor directional
selection is implemented by this pilot.

## Sereward palm lifecycle · 30 September 2026

Built-in ImageGen edited the original project-authored Sereward palm into worked,
low and depleted states. No third-party inputs. Unmodified PNG masters and
alpha-preserving runtime encodings are recorded in
[the manifest](sereward-lifecycle-manifest.json) and
[exact prompts](SEREWARD-LIFECYCLE-PROMPTS.json). All frames use the original
1145×1374 logical canvas and full-frame crop [23,24,1133,1356], LANCZOS max1024,
RGBA WebP quality86 method6. Full source/runtime reused byte-for-byte. No alpha
or color repainting; the preview composites runtime images over peach solely
for inspection. Single view, separate textures, no directional atlas yet.

## Regional lifecycle atlas packaging · 30 September 2026

The Bellweather and Sereward lifecycle atlas pages are deterministic packaging
of previously approved project-owned runtime sprites, not newly painted art.
`python3 scripts/build-environment-lifecycle-atlases.py` copies frame pixels
unchanged into PNG pages and adds transparent padding with copied edge RGB.
Quality86 WebP runtime pages preserve alpha; RGB is recompressed. Original
source PNGs and individual WebPs remain unchanged. Manifests conform to the
sprite-atlas v1 contract, including hashes, state/direction clips, canvas/pivot,
64px gutter and six-level mip cap. The `fixed-oblique` direction identifies the
existing view; it does not imply a turntable or newly generated perspectives.

## Ru’Lora Fiendwood · 30 September 2026

Built-in ImageGen generated this original stone scenery sprite from the project-owned Ru’Lora ecology key. [Exact prompt](RU-LORA-PROMPTS.json) and [manifest](ru-lora-manifest.json) record source output ID, hashes, dimensions and runtime crop. No third-party inputs, repainting or alpha repair. Original PNG is unchanged; RGBA WebP uses Pillow LANCZOS max1024, quality86 method6 and exact alpha. One intact fixed-oblique view only.

## Ru’Lora stone fern · 30 September 2026

Built-in ImageGen generated the stone fern from the project-owned ecology key, with no third-party inputs. The unchanged PNG and alpha-preserving WebP are recorded in [manifest v1.1.0](ru-lora-manifest.json) and [exact prompts](RU-LORA-PROMPTS.json). Runtime uses alpha>=21 bounding crop and LANCZOS max1024, WebP quality86 method6 exact alpha. Inspection over a colored background confirmed that the dark haze visible in the generated preview is transparent RGB, not an opaque backdrop. No pixel repainting or alpha repair.

## Ru’Lora naturally broken trunk · 30 September 2026

Built-in ImageGen edited the approved project-owned Fiendwood source into a darker crownless mineral scenery sibling. [Exact prompt](RU-LORA-PROMPTS.json) and [manifest v1.2.0](ru-lora-manifest.json) record the unchanged generated master, source ID, crop, dimensions and hashes. Runtime is LANCZOS max1024 RGBA WebP quality86 method6 exact alpha; no pixel repainting or alpha repair. One fixed-oblique intact scenery view; not a harvest state.

## Underbough Copperleaf lifecycle · 30 September 2026

Built-in ImageGen edited the original project-owned Copperleaf into worked, low and depleted states, retaining its exact 1312×1199 source canvas. [Manifest](underbough-lifecycle-manifest.json) and [exact prompts](UNDERBOUGH-LIFECYCLE-PROMPTS.json) record hashes, source IDs and the original shared crop. Unchanged generated masters; runtime LANCZOS max1024 WebP quality86 method6 with exact alpha. Atlas packaging copies decoded runtime frames without rescaling or repainting; one fixed-oblique view. Full source/runtime reused unchanged.

## Underbough woody bramble lifecycle · 30 September 2026

Built-in ImageGen edited the original project-owned fruitless woody bramble into worked, low and depleted frames. Full PNG/WebP remain unchanged. All selected edits retain the exact 1536×1024 canvas and shared crop [37,125,1519,913], with LANCZOS max1024 RGBA WebP quality86 method6 and exact alpha. [Manifest](underbough-bramble-lifecycle-manifest.json) records selected output IDs, hashes and dimensions; [exact prompts](UNDERBOUGH-BRAMBLE-LIFECYCLE-PROMPTS.json) also record two discarded depletion iterations. The final depletion was lowered and registration-corrected through ImageGen, not local pixel edits. Decoded runtime pixels are copied into the atlas without rescaling. One fixed-oblique view; no berries or new food resource.

## Veyrholds highpine lifecycle · 30 September 2026

Built-in ImageGen edited the project-owned approved highpine into worked, low and depleted frames. Original full PNG/WebP remain unchanged. Selected masters retain exact 1159×1358 canvas and share crop [72,48,1146,1325]. [Manifest](veyrholds-lifecycle-manifest.json) records source IDs, hashes and dimensions; [exact prompts](VEYRHOLDS-LIFECYCLE-PROMPTS.json) preserve edit instructions. LANCZOS max1024 RGBA WebP quality86 method6 with exact alpha; deterministic atlas copies decoded runtime pixels without repainting or rescaling. One fixed-oblique view, no third-party inputs or local pixel repairs.

## Ellionar cultivated palm lifecycle · 30 September 2026

Built-in ImageGen edited the approved project-owned palm into worked, low and depleted frames. Full PNG/WebP are unchanged. Selected masters retain exact 1024×1536 canvas and original shared crop [14,46,1010,1490]. [Manifest](ellionar-lifecycle-manifest.json) records hashes, dimensions and selected source IDs; [exact prompts](ELLIONAR-LIFECYCLE-PROMPTS.json) record edits and the discarded overly tall stump. Final stump height was corrected through ImageGen. Runtime LANCZOS max1024 RGBA WebP quality86 method6 preserves alpha; atlas copies decoded runtime pixels without rescaling or repainting. One fixed-oblique view, approximate painted camera guidance, no third-party inputs or local alpha repair.
