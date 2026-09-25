# Unit and building art format and finish review

**Status:** source-based recommendation for the current sample. This does not change runtime code or supersede the open renderer contract draft.

## Recommendation

Keep the current hybrid for this sample: Blender-authored rigid GLB geometry for units and buildings in the live oblique Three.js renderer, with fixed-camera cutout sprites for the environment. The different media are not a style decision by themselves. The current source-based pose transforms and continuous unit facing benefit from live geometry; the flat-color finish is the part that fails to sit comfortably beside the painterly environment sprites.

Keep the team-color contract: neutral role equipment and architecture, team tint on the Worker sash, and team identity on the small, shape-distinct building standards. For the next art pass, use vertex color for broad painted light/shadow shapes plus one shared, low-frequency base-color atlas for painterly material marks. UV-map the parts deliberately to that atlas and keep the renderer unlit so the existing material shading remains consistent. A shared texture on the existing batches adds texture sampling and memory, but should not add draw calls if the runtime shares the texture/material across the same batch keys. Do not add tiny surface noise as a substitute for better silhouettes.

The current v1 GLBs are a geometry and batching experiment, not the target finish. A texture map by itself will not settle the question: review the ordinary game-zoom capture over the real environment.

## Evidence from this project

- [`docs/environment-pack-v1.md`](environment-pack-v1.md) describes a fixed oblique view over textured ground with painterly transparent cutouts. The source `oak.webp`, `pine.webp`, `rock-outcrop.webp`, and `seamstone.webp` have painted value and material detail unlike the v1 meshes.
- [`src/environment-art.mjs`](../src/environment-art.mjs) creates those assets on camera-facing textured planes and batches repeated props with `THREE.InstancedMesh`.
- Read-only GLB inspection reports 416 triangles for the Worker asset and 524 for the Barracks, with two materials and zero textures in each. The existing preview README records the Worker at about 12 pixels high at gameplay zoom 0.91 and 6 pixels at strategic zoom 0.48.
- In the rendered meadow preview, the Worker collapses into a small color cluster at play zoom and the Barracks reads as a plain shed. The close-camera frames expose the geometry, but cannot establish fit at ordinary zoom.
- The meshes already have vertex-color attributes and UV coordinates, but the v1 UV assignment is coordinate-projected rather than a packed painted material atlas. The proposed atlas needs deliberate UV islands and a texture-sharing rule in the manifest/renderer contract.

## Painted 3D treatment

A small painted atlas can harmonize the live GLBs without trying to reproduce every detail of a 1024-pixel oak cutout on a 12-pixel unit. Use broad, hand-painted swatches for wool, leather, skin, timber, slate, stone, and iron, with one consistent light direction, soft baked occlusion, and restrained edge wear. The atlas should carry low-frequency brush variation; vertex colors should retain the large color blocks and per-face light/shadow shapes that survive downsampling. Preserve matte, unlit shading to avoid adding a specular style the environment images do not use.

Use one 512×512 or 1024×1024 RGBA8 atlas for the first shared material set. With a complete mip chain that is about 1.33 MiB or 5.33 MiB of uncompressed GPU memory, respectively. Share it across all unit part batches and the building materials; keep the team sash/pennants in their designated accent slots. This adds a small, bounded memory cost while retaining the present projected unit budget of eight part bins × two teams (16 batches) and the current Barracks projection of nine structure draw calls. The actual imported GLB path still needs a 2,000-unit runtime measurement; the existing movement benchmark measures the procedural renderer, not these authored GLBs.

At game zoom, silhouette, pose, and large value/color regions matter more than texture grain. The Worker needs a readable head/body/tool/backpack outline; buildings need distinct rooflines, entrances, and construction silhouettes. Enlarged close views are useful for craft checks only. Strategic zoom keeps the role silhouette and team cue in the renderer-owned LOD at the same world scale.

## Sprite-output alternative

Blender can also remain the editable source while the runtime receives prerendered transparent sprites. This matches the environment's cutout medium, but it changes the runtime representation and its direction/state machinery:

- Live units currently turn to the continuous `unit.angle` every update and animate walk, work, attack, hit, spawn, and defeat by changing rigid-part transforms. A sprite pack must quantize facing to a chosen number of views (for example 8, 16, or 32), then bake each required action into directional frames. Low direction counts can visibly pop as units turn; more directions and animation frames multiply atlas cells.
- Barracks/building sprites need aligned team-standard variants and construction/damage states, with a stable bottom-center pixel pivot and the existing world-space ground, rally, attachment, and `productionCue` anchors recorded in the manifest.
- Team hue cannot tint the whole sprite. The pack would need a team-accent mask/shader, a separate aligned accent layer, or baked Azure/Ember variants. Each choice has memory and integration costs.
- The environment helper currently batches one fixed image per `InstancedMesh`; it has no per-instance atlas-frame selector. A compact animated army would need an instanced quad atlas with a per-instance frame/facing selector in a custom shader or texture-array path. Without that, splitting batches by role × team × facing × state can grow draw calls sharply.
- Texture memory grows with directions × action frames × roles × team variants × pixel dimensions. As a simple lower-bound example, three roles × eight directions × four frames × two baked team variants at 64×64 RGBA8 uses 3 MiB of base pixels (about 4 MiB with a full mip chain), before atlas padding, buildings, extra actions, or zoom levels. Doubling frame width and height multiplies that cost by four. WebP reduces download size, not necessarily decoded GPU memory.

Sprite quads could reduce per-unit geometry to two triangles and use one or a few draw calls when a shared atlas selector is implemented. They replace much of the vertex work with atlas memory, fragment/alpha work, and custom frame-selection logic. They also lose continuous model rotation and need more baked views for smooth turns. The sprite route is plausible for this fixed camera, but it is not automatically faster or cheaper overall; compare both in the same 2,000-unit browser workload before switching.

## Historical comparison

There is no single medium across the Age of Empires and Warcraft series. World's Edge describes *Age of Empires: Definitive Edition* as a 2D isometric game that models units/buildings/trees in 3D and renders them to 2D images; its original directional set had eight views, while Definitive Edition expanded to 32 and added three zoom levels. That is a strong precedent for Blender-as-source and sprites-as-runtime, with a clear cost in baked directions and zoom assets ([official Age of Empires explanation](https://www.ageofempires.com/news/age-empires-definitive-edition-3d-2d-game/)). Blizzard's *Warcraft III: Reforged* art write-up describes reviewing live 3D models for scale, color, readability, and silhouette, then polishing their animation ([official Blizzard art write-up](https://news.blizzard.com/en-gb/article/23150111/tales-from-the-smithy-reforging-the-night-elves)). Both approaches are valid; our current renderer and state model favor the latter for this sample.

## Checkpoint and gates

For the next character/building checkpoint, keep GLB as the runtime candidate and add the painted material atlas to the editable source, manifest, and review frames. Review a Worker and Barracks on meadow and cinder at normal and strategic zoom before expanding all roles and building states. Keep source images, source `.blend`, anchors, pose samples, team rules, provenance, hashes, and texture-memory estimates in the versioned pack.

Only after the renderer/asset contract is agreed should `src/main.js` change. The appearance gate is the actual game capture at ordinary zoom; the performance gate is a measured 2,000-unit run with authored GLBs. This review does not authorize Blender execution, new preview generation, publication of the held pack, runtime integration, or deployment.
