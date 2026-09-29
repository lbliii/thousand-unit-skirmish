# Unit sprite exploration — 26 September 2026

## Recommendation

On 26 September 2026, the user chose the one-image Meshy path as the direction for unit characters and asked to try the Infantry pilot as the Worker/peasant. The already-approved 26-credit model, rig, walk, attack, and defeat outputs are now baked into eight-heading sprites and used by the default Worker path on this branch. No additional Meshy credits or building assets were used. The model has no tools and omitted the source spear and shield. Its attack swing is reused for gather/build; that action mapping needs player review.

The earlier sprite choice fits the project's existing environment art: painted transparent cutouts already sit on camera-facing planes, and the battlefield uses a fixed oblique orthographic camera. The new study keeps 2D unit rendering as the candidate output while evaluating a Meshy-generated rig as the source, which could avoid manual Blender modeling but adds rig, clip, and prop-attachment risks.

The work shifts rather than disappears. A sprite needs a consistent frame for every chosen facing and animation pose. The local Meshy bake captures eight headings and 264 frames: idle, eight walk poses, sixteen attack poses, and eight defeat poses per facing. One orthographic camera and one shared fit cover the complete sampled motion; the 128×128 union bounds are x=20–108 and y=10–117, with one ground pivot at (64, 113.4). There are no empty or edge-touching frames. Attack now plays over 900 ms instead of 270 ms. Scale, facing, the shared pivot, action continuity, and ordinary-zoom readability still need human game review.

## Evidence and implications

- World's Edge described *Age of Empires: Definitive Edition* as a 2D isometric engine that renders its 3D-made units into 2D images. The original used eight directions; the Definitive Edition used 32 and rendered assets at three zoom levels. This is useful precedent for the directional and zoom cost, not content to copy: [World's Edge, “Is it a 3D or a 2D game?”](https://www.ageofempires.com/news/age-empires-definitive-edition-3d-2d-game/).
- Three.js `Sprite` is a camera-facing plane with a transparent texture, which fits the current locked view: [Three.js Sprite](https://threejs.org/docs/pages/Sprite.html). Three.js textures support UV offset/repeat, and `InstancedMesh` reduces draw calls for repeated geometry/material pairs: [Texture](https://threejs.org/docs/pages/Texture.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html).
- The existing unit batches do not have a per-instance atlas-frame selector. The next runtime slice needs an instanced quad atlas path with per-unit facing/state/frame data, or an equivalent frame-texture-array design. Creating one Three.js object per soldier would work against the large-army renderer.
- An eight-view set preserves recognizable turns better than a four-view set, but every added state multiplies the art frames. A 32-view set or separate zoom levels would multiply the atlas more; start with eight and measure before widening it.

## Sprite roster and animation check

Source-only eight-facing studies now cover all three unit roles: [Worker](../assets/units/worker-sprite-v1/README.md), [Infantry](../assets/units/infantry-sprite-v1/README.md), and [Archer](../assets/units/archer-sprite-v1/README.md). Each sheet has six rows: idle, two walk poses, role-specific action poses, and a defeated pose. The [animation test](../assets/units/sprite-animation-test.html) puts the three sheets on a small battlefield: Worker walks to gather/build sites, Infantry walks and thrusts at a practice post, and Archer walks, draws/releases, and repositions. It includes pause, replay, size/speed, and defeat controls.

The sheets include manifests, prompts, provenance, measured frame metadata, gray8 team-accent masks, and validation, following the building-art sample's source/manifest/preview/validation workflow. The source PNGs remain unchanged. The building sample's GLB material schema is not reused because its material bindings do not describe sprite frame grids. A second Worker source pass is parked at [`worker-sprite-v2`](../assets/units/worker-sprite-v2/README.md); it improves body mass at atlas scale but still has visible colored edge contamination and is not the runtime choice.

All three RGBA atlases are about 1.4 MB on disk apiece. Their combined decoded pixel buffer is about 18.0 MiB; the three gray8 team masks add about 4.5 MiB. The zero-gutter pilot uses linear filtering without mipmaps and applies a shared half-texel UV inset to color/mask pages; inspect for aliasing at strategic zoom. Mask recoloring avoids storing baked images for both teams. Atlas memory, alpha overdraw, filtering, and batching need a measured runtime comparison before claiming a performance benefit.

## Local game preview — 26 September 2026

The local renderer now uses the Meshy Worker v3 pack at the normal game URL. Its gather/build clips loop the 16-pose swing over 900 ms; idle, walk, facing, team tint, and defeat use the same atlas runtime. `?workerSpritePreview=1` remains a comparison against Worker v2, and `?unitSpritePreview=1` shows the previous v1 roster. Fog filtering continues to come from each unit's visibility state. Team/role LOD glyphs remain visible at strategic zoom. The merged packs record rights verification based on Meshy API task receipts and the contemporaneous terms; future capture-tool output is kept in ignored local staging until rights and attribution are verified. See the [pipeline checkpoint](unit-character-meshy-pipeline.md).

At local `HEAD` `d315ca6`, a one-player Forked Vale browser run at 1280×720 loaded four default Workers and accepted a move order across open ground. The Worker atlas stayed in the normal renderer path during movement, and the console showed no sprite-load errors. At this framing the figures still read as small blue silhouettes; ask the user to judge role readability at ordinary and strategic zoom. This is a visual spot check, not an animation-completeness or large-army performance claim.

The local static all-role v1 `renderer-appearance-lod` capture (`run_unit_sprite_roster_markers_20260926`) covered Meadow and Cinder, both teams, and zooms 0.91 and 0.48. Its generated manifest and frames are ignored `.game-dev/runs` outputs and are not included in this source branch. The run exercised the three v1 packs in the actual game renderer for both fog-filtered clients; it is not evidence for Worker v2. The wide 64×64 review map makes the sprites small at play zoom; strategic team/role glyphs remain as a fallback. The capture is static and does not verify movement or action transitions, and it is not a performance measurement.

The dedicated `renderer-worker-sprite-v2` scenario recorded eight full game views and eight matching unit-cluster close-ups across Meadow/Cinder, both fog-filtered teams, and camera zooms 0.91/0.48 in local run `run_1790458381860_7b7077d0a4ca46b9a706ccb806154a79`. Its generated manifest and frames are ignored `.game-dev/runs` outputs and are not included in this source branch. The scenario ran and the sealed roster, capture contract, and raster decoding verified. Human review found the 1280×720 battlefield too wide to establish Worker readability at either zoom. The 4× crops make its shape and equipment inspectable, but do not demonstrate standard-scale readability. Red/yellow fringe remains visible in the atlas. These are static idle views only; live walk, gather/build, attack, and defeat transitions are not captured, and no performance claim is made.

## Next production slice

1. Review Worker v3 at ordinary and strategic gameplay zoom, especially the blue team mask and the gather/build swing, then correct the shared pivot if the live feet drift.
2. Keep other character roles on their existing visuals until a distinct one-image source pilot can be reviewed; this Worker experiment should not force one character onto every role.
3. Review Worker v3 at ordinary gameplay zoom and confirm the generated model remains a good Worker fit; treat 2,000-unit performance as a separate claim.

The earlier Blender-authored GLB sample remains historical. The current study treats a Meshy-generated and animated unit as an intermediate source for sprite production, not a request to replace the current game renderer with skinned GLBs.

## Resume checkpoint

- **Direction:** the user chose Meshy-sourced 2D unit sprites as the general direction. The approved one-image pilot now supplies the default Worker appearance on this branch. Building work is outside this checkpoint.
- **Ready to inspect:** the three source atlases and [`sprite-animation-test.html`](../assets/units/sprite-animation-test.html) show all roles walking and performing their main actions; that page is an illustrative mock battlefield, not proof of game behavior. The Meshy preview in the local `infantry-meshy-pilot` worktree plays Infantry walk, attack, and defeat clips at eight camera headings. The Worker v2 game run still has 4× close-ups at each zoom for art inspection.
- **In-game scope:** the normal game URL renders Workers from `worker-sprite-v3`; Infantry and Archer still use their previous default visuals. `?workerSpritePreview=1` selects Worker v2, while `?unitSpritePreview=1` previews all three roles from v1. The Meshy v3 Worker and Infantry v2 packs are source assets on `main`; their rights evidence and task IDs are recorded in their READMEs and the pipeline note.
- **What looks promising:** eight directional columns preserve more turns than four, role equipment reads in the sheets, gray8 masks separate team color from the authored art, and deterministic packing makes frame/pivot metadata repeatable.
- **What remains weak:** the model has no tools, its source spear and shield are absent, and the attack swing is only a proxy for worker actions. Eight facings approximate intermediate angles. The 128×128 frames fit all sampled poses, but readability and ground placement still need review in a normal game view. No 2,000-unit performance claim has been measured.
- **Next step:** review the current default Worker in a live match, then decide whether the next character needs its own source image and Meshy run. No new paid stage is included here.
- **Repeatable pack check:** `node scripts/validate-unit-sprite-atlas.mjs assets/units/<role>-sprite-v1/manifest.json`; run the same validator against `assets/units/worker-sprite-v2/manifest.json` for the Worker v2 experiment.
- **Merge checkpoint (26 September 2026):** [PR #172](https://github.com/lbliii/thousand-unit-skirmish/pull/172) merged the directional sprite exploration, Meshy Worker default, local capture tool, and manifests/provenance. Worker-scale readability and 2,000-unit performance remain separate evidence gaps. Follow-up local-staging and rights-evidence safeguards are recorded in the pipeline note.

## Cast readability candidate — 27 September 2026

The opt-in `?castPreview=1` path compares four derived cast packs: human, orc,
elf, and troll. Each pack contains 264 frames across eight directions with
idle, walk, attack/work, and defeat clips, a source atlas, a runtime atlas, and
a team-accent mask. The preview assigns the four roles by visible unit slot so
the silhouettes can be compared in one ordinary match without changing the
authoritative Worker/Infantry/Archer roster.

This is a source/runtime candidate, not a default art or faction integration.
The cast study records pose drift and edge-residue limits, including known troll
edge residue; review foot registration, identity stability, ordinary/strategic
zoom readability, and rights before promoting any pack. The canonical pack
contract validates metadata, image dimensions, hashes, frame bounds, clips, and
team masks; visual approval remains separate.


## Native motion capture and playback

The sprite baker preserves vertical hip motion while removing horizontal root travel. It derives clip duration and approximately 16 fps sample counts from the source animation, preserving endpoint poses for non-looping clips. The atlas uses 32 columns and fails explicitly if it exceeds the GPU texture limit. Existing tracked atlases are not regenerated by this change.

The runtime uses elapsed milliseconds rather than procedural mesh phase for sprite animation, takes attack/defeat lifetimes from the manifest, and lets defeat finish before a 150 ms shrink. Worker action animations continue updating at low-detail camera zoom. This decouples visible animation timing from simulation movement and resource production.

Validation: two local 15K Smart Topology A-pose workers were rebaked into 992-frame, eight-direction candidates. All 1,984 frames passed nonempty/unclipped bounds and hash checks; native clip totals were preserved with moving-frame durations at most 63 ms. Focused clock tests cover elapsed timing and state transitions. Local in-game worker movement completed without rendering errors. These checks do not establish rig quality, distant readability, combat correctness, or large-match performance; the local candidate assets and distance/filter experiments are excluded from this change.

A controlled live worker-versus-infantry duel additionally verified all eight tracked worker defeat frames in the browser renderer, approximately 583 ms observed lifetime for the 430 ms clip plus 150 ms fade, and zero final scale. The simulation reported the worker defeated and the opposing infantry at 60 HP. No browser warnings/errors were observed. A separate live fixture also reached all 58 defeat frames of the 3.533-second local candidate and ended at zero scale after approximately 3,677 ms, including the fade.

## Mixed cast Workers — 29 September 2026

By user direction, the human, orc, elf, and troll review packs now supply the default Worker appearance. The slot-based assignment stays stable during movement and work and distributes the four appearances across the opening Workers. Infantry and Archer retain their existing visuals. `?castPreview=0` restores the Meshy Worker; earlier sprite comparison flags also keep their previous behavior. These remain exploratory illustrations with shared motion and pending human readability review.

## Clipping correction — 29 September 2026

At staging source `8a870f8`, the four cast packs reused a ground pivot at y=88.26 while idle alpha commonly extended to y=99–113. The camera-facing quad therefore placed visible feet below the ground plane. Pixel inspection also found 60 source cells with alpha >=8 at a cell edge (Elf 2, Human 3, Orc 6, Troll 49). The declared 128×128 alpha bounds were placeholders; schema and hash checks had not measured this defect.

The v0.2 review runtime retains the original source PNGs, adds eight pixels of transparent safety margin, records measured alpha bounds, and uses the standing foot baseline for each heading, shared across its animations. Scale is adjusted to preserve the previous authored pixel/world ratio. No per-frame centering or foot snapping is used. For animated pixels below the root, the runtime shifts the billboard toward the camera just enough to clear the terrain, leaving screen position unchanged; a projection regression verifies this. The 60 source-cut poses temporarily hold the nearest complete pose in their own directional clip, keeping all sequence durations. Each pack's `clipping-review.json` lists every substitution and the original source hash. This is an explicit review fallback, not reconstructed art or a claim of smooth/full animation; Troll east work has only one complete source pose and particularly needs replacement.

`scripts/prepare-cast-sprite-review.py <pack...>` audits and rejects edge-cut sources by default. `--hold-safe-poses --write` explicitly prepares this temporary review fallback without altering sources. CI decodes all 1,056 runtime frames and rejects edge pixels, false alpha bounds, and idle feet below the measured heading baseline. The Meshy baker now rejects empty or edge-cut frames in its final fitted pass as well as its initial probes.

For new sprite production: capture every sampled pose and heading first, fit one camera to their union, preserve the animation root/pivot, then require a final pixel audit with at least four transparent pixels per edge. Generate isolated pose renders when possible: a generative tiled sheet can spill between cells, and resizing that sheet cannot recover an already missing hand, tool, or foot. Keep originals and source-cut evidence; regenerate or recapture failed poses before claiming a finished pack. Review ground registration, walking/work/defeat, both teams and gameplay zoom separately from pixel completeness.
