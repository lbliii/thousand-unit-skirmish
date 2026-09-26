# Painterly environment sprite layers — proposal and candidate

Status: an additive source-only candidate is authored at [`assets/environment/frontier-resource-atlas-v1-candidate/`](../assets/environment/frontier-resource-atlas-v1-candidate/). It follows Technical Art's canonical `sprite-atlas-pack-v1` shape and Renderer has confirmed the resource kind, state clips, shared ground pivot, layer IDs, and crop offsets. Runtime adoption remains a separate Renderer decision. The shipped `frontier-interactive-v1` pack stays unchanged and remains the approved runtime/reference set.

## Candidate checkpoint

The candidate manifest is [`manifest.json`](../assets/environment/frontier-resource-atlas-v1-candidate/manifest.json), version `0.1.0`, maturity `source-only`. It carries oak and berries as `kind: "resource"`, with exact `full`/`worked`/`low`/`depleted` clips. All frames preserve the v1 canvases and bottom-center anchor estimate; each cropped layer declares its `layerId` and canvas-local `offsetPx`. The source fallback and layer pages record SHA-256 and dimensions. There are no runtime files or renderer edits.

The candidate uses deterministic color mattes to partition the existing approved pixels into foliage, woody structure, and berry-fruit layers. Its build report confirms exact reconstruction of every visible source RGBA pixel. This proves registration and image preservation, not that the proposed occlusion order is artist-approved or clearer in a live scene. The ground pivot remains marked `unreviewed-estimate` pending human contact-point review.

## Scope

Prepare a layered 2D/2.5D follow-up for the existing oak and berry resource families. Keep the current four stock stages for each family: `full`, `worked`, `low`, and `depleted`. Do not create new Blender or other 3D environment assets for this pass.

The layer breakup should help workers read as moving through the world instead of being pasted in front of one flat card:

- A ground shadow/contact layer sits on the ground plane.
- Rear foliage and branches draw behind workers.
- The trunk and woody structure remain a registered cutout.
- Selected foreground roots, leaves, or berry clusters may draw over workers.
- Oak `full`/`worked`/`low` share a stable trunk base; `depleted` uses the stump/root state.
- Berry foliage and fruit clusters vary by stock state while the woody base stays registered; `depleted` has no fruit.

Every layer in a family uses a common canvas registration. Each state records its actual non-transparent bounds and ground-contact point; the contact point must map to the same resource-node world position across stage changes. Keep alpha edges clean against both light and dark backgrounds.

## Shared spatial and visual conventions

Maps confirmed one world unit per map tile, a 45° camera azimuth from +X toward +Z, and a 45.44° camera elevation. The directional light is at `(-24, 38, 20)` with warm hemisphere fill.

- Map `tileFootprint` describes gameplay-occupied cells only. Existing resource nodes remain one-cell anchors.
- Map/gameplay data owns occupied cells. `recommendedTileFootprint` is an optional non-authoritative hint and never changes placement or collision.
- `artBoundsWorld` describes visible extent relative to the sprite anchor; it may overhang occupied cells and does not block navigation. `sortAnchorWorld` defaults to the ground root; optional `depthBiasWorld` is a bounded renderer ordering hint.
- Source canvas dimensions and alpha bounds are recorded in pixels. The proposal's `groundAnchorPx` maps directly to the canonical frame field `groundPivotPx`; all layers in one logical frame share this canvas-local point.
- Use canonical `drawLayer` values `background`, `midground`, `actor`, and `foreground`. Keep ground shadows as ground decals rather than sprite layers.
- Use the same declared source canvas, anchor semantics, and state registration for both zoom acceptance views: ordinary `0.91` and strategic `0.48`.

The canonical manifest fields are defined in Technical Art's `sprite-atlas-pack-v1`: `pages`, `layers.drawLayer`, `frames.canvasPx`, `frames.groundPivotPx`, `frames.frameRectsPx`, and `clips.stateId`. Resource clip states map to the existing `full`, `worked`, `low`, and `depleted` stages. The spatial meaning above is agreed with Maps; renderer adoption or a narrow adapter remains a separate decision.

## V1 reference measurements

The current approved assets are single cutout cards with bottom-center pivot `[0.5, 1.0]`. Their declared visual sizes are oak `4.1 × 3.75` world units on a `1226 × 1283` canvas and berries `2.55 × 1.56` on a `1536 × 1024` canvas. Those are visual extents, not navigation footprints. The pack's current patch version is `1.0.1`; it changes only construction orientation/pivot metadata, not these resource assets.

The following alpha bounds use the canonical review threshold `alpha >= 96/255`; rectangles are half-open pixel bounds. They describe visible extent only and do not determine the ground pivot.

| Family/state | Canvas | `alphaBoundsPx` |
| --- | ---: | --- |
| Oak `full` | 1226 × 1283 | `{ "x": 37, "y": 40, "width": 1164, "height": 1188 }` |
| Oak `worked` | 1226 × 1283 | `{ "x": 61, "y": 36, "width": 1131, "height": 1194 }` |
| Oak `low` | 1226 × 1283 | `{ "x": 59, "y": 33, "width": 1136, "height": 1202 }` |
| Oak `depleted` | 1226 × 1283 | `{ "x": 301, "y": 869, "width": 696, "height": 374 }` |
| Berries `full` | 1536 × 1024 | `{ "x": 191, "y": 147, "width": 1153, "height": 740 }` |
| Berries `worked` | 1536 × 1024 | `{ "x": 53, "y": 68, "width": 1432, "height": 900 }` |
| Berries `low` | 1536 × 1024 | `{ "x": 35, "y": 26, "width": 1469, "height": 959 }` |
| Berries `depleted` | 1536 × 1024 | `{ "x": 43, "y": 40, "width": 1446, "height": 953 }` |

The source images also have low-alpha pixels outside several of these bounds. Each new layer frame must declare one human-reviewed `groundPivotPx` shared across its states; the existing V1 `[0.5, 1.0]` pivot remains unchanged for runtime compatibility. The V1 source and manifest remain untouched.

The existing ordinary-zoom pilot verifies live `worked`, `low`, and `depleted` rendering and both player stock rows. Its strategic-zoom captures show the resource props small in the full battlefield view, so the new layer pass should preserve silhouettes and resource cues at `0.48` without changing node occupancy. The exact pilot and source provenance remain documented in [environment-state-pack-v1.md](environment-state-pack-v1.md).

## Evidence and next checkpoint

The renderer's four-frame pilot is the current runtime proof. An attempted expanded renderer matrix captured the four full-stock Meadow frames, then timed out because the scenario did not create a visible earthwork building row; it wrote no persistent matrix evidence. That failure is limited to the combined construction capture and does not invalidate the resource pilot.

The raster-layer manifest shape and rectangle/offset/sampler fields are now settled in the candidate and validated against Technical Art contract commit `a21cec6bda2cc92e87e85667a0f4d04c63167e37` (7 files, 7 pages, 2 assets). The remaining review is whether the heuristic layer split and estimated pivot are suitable for renderer adoption. Any runtime encode, adapter, state/sort behavior, or new in-game capture should be a distinct follow-up; none changes the already-shipped v1 resource-state path.
