# Vaelora regional environment kits v2

New source production in response to the 30 September player observation about
clashing palettes, homogeneous forests and missing rotated asset views.
[Production plan](../../../docs/regional-environment-kits.md).

`underbough/palette-study.png` is an unmodified built-in ImageGen direction board
derived from the selected Underbough ecology key and the existing copperleaf
sprite. It proposes four distinct canopy forms, complementary shrubs and fungi,
and six compatible ground roles. Board swatches are not seamless runtime tiles.

Three ground masters (`clearing-grass-01`, `worn-dirt-01`, `root-soil-01`) have
RGB WebP exports under `frontier-v1/underbough-*-v2.webp`. The local regional
loader and map/minimap/Studio colours use them for Underbough's matching paint
roles. Paired browser review and cache-isolation proof pass; staging integration
is pending. Hashes, sizes and encodings are in `underbough/source-manifest.json`.

`underbough/root-oak-full-000.png` is a new transparent intact Root Oak source.
This dark moss/olive species complements the copperleaf; it is not a recolour of
the existing runtime tree. Its designated orientation is 0° relative to the fixed
oblique camera. This is authored painted artwork, not a measured model capture.
Further directions remain outstanding. Its registered harvest states now have
a consuming runtime atlas loader; see the first runtime family record below.

`underbough/moss-hornbeam-full-000.png` adds a narrower airy crown, ascending
branches and lighter warm bark. Its four registered fixed-view harvest states
now have a local runtime proof; model/directional views remain outstanding.

`underbough/old-plum-full-000.png` adds a compact burgundy crown with low
spreading branches and a short crooked trunk. This third new species source has
a registered four-state runtime; measured model views remain outstanding.

`underbough/root-oak-view-090-rejected.png` retains an unsuccessful directional
attempt for provenance. It changes branches and silhouette but does not verify
a quarter-turn of the same tree. It must not enter an atlas or count as an
accepted 90° view. Only the designated 0° intact source is presently supplied.

Original generated files retain their pixels and alpha. Later atlas packaging
must measure crop/root registration and preserve source images. Rights and
provenance: project-owned generated artwork; built-in ImageGen; only existing
project-owned selected keys and sprite references. Exact prompts are recorded
beside the source assets. Generation does not prove view consistency, gameplay
readability or a complete kit.

## Root Oak lifecycle sources — 1 October 2026 UTC

Four fixed-view source states now exist: full, worked, low and depleted.
Unmodified 1254 × 1254 RGBA canvases and exact prompts remain alongside the
source manifest. The [registration review](underbough/root-oak-registration-review.json)
records visible bounds and lower-root silhouette overlap (0.925–0.938). This
supports a shared registration candidate; it does not prove runtime scale,
harvesting, reset or directional coverage. Reduced frames retain faint
low-alpha generated remnants in their original masters. Do not silently
repaint or discard source pixels. That source review preceded the runtime packaging and renderer proof below.

## Root Oak first runtime family

Root Oak now joins Copperleaf and woody bramble through the existing forest
lifecycle atlas loader in `src/environment-art.mjs`. Its four states use one
reviewed shared crop `[40,37,1230,1218]` and a fixed root-bottom anchor; runtime
frames preserve the cropped alpha after LANCZOS max1024 conversion and quality86
WebP encoding. Masters remain untouched. The atlas is 2304 × 2288 with 64px
transparent gutters and the existing bounded mip contract.

[Browser evidence](../../../docs/qa-evidence/underbough-root-oak-2026-10-01/underbough-rootways-renderer-proof.json)
records all 1026 original wood slots, 460 Root Oaks, 483 Copperleaf trees and 83
brambles, matching root positions and all four atlas selections plus reset.
This checks the renderer state interface, not a newly observed live worker
harvest. Hornbeam/Plum runtime integration, four-species coverage and measured
directional captures remain outstanding.

## Moss Hornbeam harvest family

The four original Moss Hornbeam canvases and exact prompts are now retained.
[Registration review](underbough/moss-hornbeam-registration-review.json) records
the common `[125,0,1138,1245]` crop and the depleted root-detail difference.
Reproduce the encoding into a fresh runtime destination with
`python3 scripts/package-regional-tree-family.py --source assets/environment/vaelora-region-kits-v2/underbough --prefix moss-hornbeam --family underbough-moss-hornbeam --crop 125 0 1138 1245 --height 3.6`,
then `python3 scripts/build-environment-lifecycle-atlases.py --region underbough-moss-hornbeam`.
The encoder refuses to overwrite existing runtime frames. Original source
pixels and alpha remain untouched; shared crop and conversion preserve
registration. Fixed-view states do not supply directional coverage.

[Mixed woodland browser proof](../../../docs/qa-evidence/underbough-hornbeam-2026-10-01/underbough-rootways-renderer-proof.json)
records 391 Root Oaks, 311 Hornbeams, 241 Copperleaf trees and 83 brambles across
the original 1026 wood cells. Roots, four-state atlas selections and reset
transforms pass. A separate [live worker proof](../../../docs/qa-evidence/underbough-root-oak-live-2026-10-01/live-harvest-proof.json)
observes Root Oak harvesting at its prior runtime commit. Hornbeam live harvesting
and directional views remain outstanding.

## Four tree forms in the first Underbough runtime

Old Plum now adds the compact burgundy form beside broad Root Oak, airy Moss
Hornbeam and Copperleaf. Four original 1290 × 1219 canvases share
`[55,55,1275,1190]` registration; visible root bottoms differ by three logical
pixels. Encode with `scripts/package-regional-tree-family.py --source assets/environment/vaelora-region-kits-v2/underbough --prefix old-plum --family underbough-old-plum --crop 55 55 1275 1190 --height 2.85`,
then pack `scripts/build-environment-lifecycle-atlases.py --region underbough-old-plum`.

[Current woodland proof](../../../docs/qa-evidence/underbough-four-trees-2026-10-01/underbough-rootways-renderer-proof.json)
records 314 Root Oaks, 230 Hornbeams, 207 Plums, 192 Copperleaf and 83 brambles
in the original 1026 wood cells. All four harvest states and reset retain roots.
Normal, strategic and closer views show the actual ground and canopy mixture;
Vesperra is the unchanged control. This first species mix does not complete the
remaining texture roles, shrub variety, other zones or directional views.

Docker now explicitly includes all 18 forest atlas metadata files. The release
scenario requests every renderer-declared metadata file and atlas from the
packed HTTP runtime, checks Docker context entries and verifies atlas hashes.
This fixes the new Root Oak/Hornbeam omissions and an existing Ru’Lora fringe
omission before claiming staged atlas integration.

[Current live worker checks](../../../docs/qa-evidence/underbough-family-harvest-2026-10-01/summary.json)
verify renderer-selected Root Oak, Hornbeam and Plum targets through actual
gathering, depletion and reset. Each run retains full/worked/low/depleted/reset
images and the atlas state lineup. No browser or asset errors occurred.
