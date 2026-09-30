# Frontier support-building models v1

Approved batch: Storehouse, Stable, Workshop and Watchtower, each using its existing Complete concept from the eight-building Frontier kit. Four textured image-to-3D jobs, maximum 30 credits each / 120 total. No paid reruns or remeshes are authorized. Original GLBs and provider snapshots remain ignored under `meshy_output/`; publish hashes and actual consumed credits rather than signed URLs.

Complete views share the Town Center/House pilot camera: 46° orthographic elevation, eight azimuths at 45° increments, 128 pixels/world unit, registered ground pivots. Target visible base widths are 2.8 world units for Storehouse, Stable and Workshop and 1.8 for Watchtower. Measure actual ground geometry before applying uniform scale. Source capture readiness does not imply runtime lifecycle/team readiness.

Use `scripts/building-scale-review.html` with `scripts/serve-building-scale-review.mjs` to load these sources and save calibrated Complete views. No active runtime assets change merely by generating the model source. Goal remains the full eight-building runtime set and reusable civilization baseline.


## Delivered evidence

All four jobs succeeded at 30 credits each: 120 total. [Provenance](model-provenance.json) records task IDs, charges and original model hashes; the original GLBs are ignored local capture sources. [Gallery](preview.html) and [capture manifest](captures/capture-manifest.json) contain 32 Complete frames with transforms, camera, pivots and hashes. All frames passed 1024-square RGBA, nonempty unclipped alpha and hash checks.

Reviewed front, rear and side silhouettes in the full gallery. Storehouse remains notably low at its 2.8-unit base and needs actual Worker/door clearance review before runtime acceptance. Stable uses 2.75 units rather than the initial 2.8 target to contain its measured base depth within three cells. Generated rear details and pennants require art review; the source milestone does not approve these as final team/lifecycle packs.

The desktop browser failed ImageBitmap decoding of one valid embedded color JPEG. The capture tool now uses Three.js DOM-image texture decoding; visual review confirmed restored original color without a paid rerun. Same-session model switching preserves native bounds after earlier models have been scaled.
