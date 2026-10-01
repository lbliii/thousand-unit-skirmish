# Sereward succulent fixed-camera review — 1 October 2026

[State comparison](states.png) captured in isolated local Chrome at 1400×850.
The review uses the actual `CAMERA_VIEW_DIRECTION` from camera-controls:
(0.78, 1.12, 0.78), 45° azimuth and 45.435902° elevation, Y up. Geometry is a
0.97338×0.75 world-unit bottom-pivoted plane with the same camera-facing
quaternion, sRGB, alpha-test 0.08, depth-write and unlit material as the renderer.
The actual atlas loads and displays all four frames. This is a standalone
renderer construction review, not an ordinary gameplay capture.

Observed: the full/worked/low/depleted stages retain a readable common identity.
Low and depleted have a small visible upward gap relative to their cyan pivot
rings. The shared crop and source canvas preserve pixel coordinates but do not
prove a common anatomical root anchor. Further source/pivot calibration is
needed before claiming harvest registration. No source image or runtime atlas
was altered during this review, and no gameplay resource rule was added.

Run `node scripts/preview-succulent-actions.mjs`; open http://127.0.0.1:4186.
The source imports camera direction rather than duplicating it. State controls
are available for manual review; this capture verifies the initial side-by-side
view only. Chrome emitted macOS display-link errors but produced the inspected
WebGL screenshot. Both preview and browser processes were stopped afterward.
