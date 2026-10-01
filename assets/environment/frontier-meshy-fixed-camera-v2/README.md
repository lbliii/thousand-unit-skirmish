# Existing resource models: fixed game camera

A source review pack, captured 1 October 2026 UTC. Oak, pine and berry bush each
have eight actual model headings at 45-degree intervals. This pack is not yet
registered in the game; the existing resource loader still consumes one v1 view.
It does not supply the missing perspectives of the painted Underbough families.

The orthographic camera stays at azimuth 45 degrees and elevation
45.4359024848 degrees, from the game's (.78, 1.12, .78) camera vector. The
normalized model rotates positively around world Y, at its centred ground pivot.
Lights remain fixed in world space. All frames share a conservative fit across
the eight headings, 640×640 pixels, a five-world-unit frame and ground anchor
(320, 480). The historical v1 camera-orbit frame indices have different semantics.

Source GLBs were copied without modification from the existing 26 September
Meshy pilot. Each family manifest retains its source hash and original provider
task IDs. No provider requests or paid generation occurred for this capture.
Local ignored copies are in `meshy_output/organic-perspective-pilot/`.

Reproduce with `scripts/render-resource-sprite-pack.py --capture-mode model-rotation`,
the manifest's model path, name, normalization width and task IDs, and a fresh
output directory. The script refuses to overwrite captured source frames.
Run `python3 scripts/validate-fixed-camera-resources.py` to verify 24 distinct,
nonempty, unclipped frames, source hashes when local GLBs are available, exact
RGBA preservation in lossless WebP, atlas rectangles and direction metadata.
The saved validation report was produced with all three source GLBs available.

Three initial captures using the former Chrome dump-DOM/SwiftShader launcher
ended in actual 300-second process timeouts without frames. Their cause is
unproven. The replacement CDP runner exposes page and HTTP failures; its first
attempt correctly reported a missing favicon, which is now excluded from asset
failures. All three subsequent native Chrome captures completed and were
visually inspected. Local failed-attempt files remain under ignored
`meshy_output/failed-fixed-camera-*` directories.
