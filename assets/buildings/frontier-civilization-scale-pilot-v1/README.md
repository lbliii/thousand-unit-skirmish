# Frontier scale pilot v1

Two approved Complete models and sixteen registered transparent captures. Review the [equal-scale gallery](preview.html) and [capture manifest](captures/capture-manifest.json). This follows the [eight-building concepts](../frontier-civilization-concepts-v1/README.md) and [style guide](../../../docs/frontier-civilization-art-style.md).

## Spend and provenance

The user approved two textured Meshy Image-to-3D jobs for 60 credits. Both succeeded at 30 credits each through Meshy CLI 0.4.0. No remesh, retexture or paid rerun was performed. [Model provenance](model-provenance.json) retains task IDs, actual charges, source hashes, measurements and local storage paths. Original GLBs remain in ignored `meshy_output/`, together with provider task history; signed URLs are excluded from publication. These high-density models are capture sources, not runtime meshes.

## Measured registration

| Source | Occupancy | Measured lower-base X × Z, world units | Uniform scale |
| --- | --- | --- | --- |
| Town Center | 5 × 5 | 4.40 × 4.24 | 2.3569 |
| House | 3 × 3 | 2.30 × 2.95 | 1.6154 |

The lower 5% geometry band supplies the recorded base-width and center candidates, reviewed against all eight views. The full House roof envelope extends slightly beyond three units in depth. Decorative silhouette and gameplay occupancy remain separate. Town Center base width is 1.913 times House; each model retains uniform proportions.

Every capture uses a 1024-square transparent canvas covering eight world units, 128 pixels/world unit, orthographic 46° elevation and eight azimuths in 45° steps. The grounded projected origin is approximately (512, 647.153) pixels from top left. Camera, lighting, transform and frame hash accompany each PNG. Frames are neither independently fitted nor cropped.

## Review and limits

The gallery shows all sixteen complete silhouettes without clipped roofs or bases. The civic hall keeps its wings, arcade and rear tower, and reads substantially broader than the modest house. Generated rear facades repeat entrances and decorative details; these are source interpretations, not validated architectural plans. Small pennants still require correct team shape and aligned masks. The gallery's white ruler represents a projected 0.8-unit vertical height; it is not the actual Worker sprite or proof of every doorway's clearance.

No runtime renderer or active game asset changes in this milestone. Construction/damage states, team masks, ordinary/strategic zoom review beside the Worker, and the other six calibrated building families remain outstanding. Additional paid generation requires separate authorization.

## Local tools

Run `npm ci`, then `node scripts/serve-building-scale-review.mjs` and open `http://127.0.0.1:8769/scripts/building-scale-review.html`. Original ignored GLBs must be present for model inspection; the saved gallery works without them. Enter measured native base width and center, target world width and occupancy before capturing. The server writes only the two fixed pilot families' eight PNG/JSON frame paths.

Use `node scripts/inspect-building-glb.mjs model.glb report.json` to inspect uncompressed GLB geometry and lower-height bands. Lower bands are measurement candidates, not automatic support-plane approval. See [dated QA evidence](../../../docs/qa-frontier-building-scale-pilot-2026-09-30.md).

Run `node scripts/validate-building-scale-pilot.mjs` to verify all sixteen frame hashes, dimensions, per-view record consistency and shared registration. It checks recorded alpha margins, not decoded alpha pixels or runtime behavior.

The gallery now supports Worker v1/v2/v3 atlas references beside both buildings. It uses the sprite loader’s `heightWorld / maxAlphaHeight` formula, multiplied by the building density of 128 pixels/world unit, and aligns the selected frame’s actual ground pivot. Fixed reference facing and origin-depth placement establish relative source scale; doorway fit and runtime terrain contact remain unverified.
