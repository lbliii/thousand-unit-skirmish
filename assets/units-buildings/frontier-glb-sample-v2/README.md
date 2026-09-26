# Frontier character and Barracks pack

Checkpoint 0.2.0 is the current compact GLB asset sample for the Worker, Infantry, Archer, and Barracks. The earlier v0.1.2 review package is superseded and is not shipped in this directory; its base Blender builder is retained under `source/` for provenance.

**Scope:** source-review only. This is not a runtime-ready pack: the two GLBs embed separate copies of the atlas, and the expanded `source/authoring-manifest.json` is not the renderer's v1 runtime schema. Do not pass it to `validate-visual-pack.mjs` or load these models in the game. Runtime manifest, shared-texture loading, and in-game appearance remain separate integration work.

## Visual finish

The models use simple faceted geometry with broad vertex-color value shapes and one shared, low-frequency material atlas for cloth, leather, wood, stone, slate, and metal. The matte finish is intended to sit beside the painterly environment cutouts; the renderer contract proposes displaying it through the existing unlit material path. Team color is limited to the shared unit sash and small, shape-coded building standards; role equipment and building architecture stay neutral. Here, “skin” means material finish. The parts are rigid and do not use skeletal skinning.

## Assets

- `models/unit-art-v2.glb` contains one shared humanoid core and sash plus the Worker backpack/tool, Infantry six-sided shield/spear, and Archer bow/quiver. The steel-grey Infantry cap and moss-green Archer hood are included in their existing role bins. The renderer owner accepted eight bins per team: head-plus-torso core to `bodyMeshes` (neutral), sash to `teamAccentMeshes` (`TEAM_HEX` on the sash only, replacing the old `headMeshes` sphere slot), and Worker backpack/tool, Infantry shield/spear, and Archer bow/quiver to their matching existing slots. The sash inherits the core pose and GLB node transform; independent head-sphere bob is dropped. Loader integration remains pending.
- `models/barracks.glb` contains five sampled progress states at 0%, 25%, 50%, 75%, and 100%: foundation, frame, walls, roof, and finished details. All states share one ground pivot. Ten authored part groups include two mutually exclusive standards; the renderer selects exactly one matching the building team, with at most nine active building batches. `barracks.anchor.productionCue` is an anchor only; queue state and cue geometry belong to the renderer.
- Both GLBs embed the same 768×512 RGBA8 atlas. Team accents are outside the atlas. The projected resident texture estimate is 4 MiB for both embedded copies, assuming full mip chains and no cross-model GPU sharing.
- `source/frontier-material-atlas.png`, `source/frontier-character-pack-v2.blend`, the authoring scripts, and `source/pose-samples.json` preserve the atlas, editable Blender scene, and sampled rigid-part transforms. The scene opens with the Worker and completed Azure Barracks visible; the other role parts, construction state, and Ember standard remain available in the Outliner.
- `source/game-dev-package-unit.json` and `source/game-dev-package-barracks.json` are policy/provenance requests for later canonical packages. Building those packages is a separate authorized write.

Town Center (wide stone hall with a taller rear tower) and Archery Range (open canopy with a front target) are planned for a later checkpoint and are not included here.

## Review limits

This focused source review contains six individual 1280×720 frames: one Azure Worker at gameplay zoom 0.91 and five Azure Barracks progress states at the same zoom and camera over Meadow. The sequence broadly reads in order, but the roof and complete stages look too similar at about 50 pixels wide. The complete frame's cyan mark is a temporary renderer-cue stand-in, absent from both GLBs and not evidence that the Azure standard reads. The renderer owner requested a broader neutral gate/front trim and clearer Azure/Ember standards in the existing part groups; these revisions are pending a new source render. The Worker is about 12 pixels tall, so its backpack and tool are not yet assessable at normal zoom. Infantry, Archer, other Worker poses, strategic zoom, Cinder, and close craft views remain unreviewed. Source renders do not establish runtime signoff. The current game renderer still draws procedural geometry and does not load these GLBs; loader integration and an authored-GLB 2,000-unit measurement remain open.

The Worker body is about 12 pixels tall at zoom 0.91. Its backpack and broad tool were not assessable in the full-field frame. At zoom 0.48, use the renderer-owned instanced role LOD without changing world scale. Exported atlas/UV data has been inspected and rendered, but the finish has not received broad art signoff; the generic validator reports the 768×512 atlas's shortest edge below its 1024-pixel guidance and its non-power-of-two dimensions. It passes the project's 512-pixel policy. Review native-size in-game frames before accepting the material finish.

`source/authoring-manifest.json` records bounds, anchors, batch keys, team variants, atlas family/UV mapping, texture estimate, state samples, review views, provenance, and file hashes. Run `game-dev asset inspect models/unit-art-v2.glb --json` and `game-dev asset inspect models/barracks.glb --json` for read-only inspection. `SHA256SUMS.txt` covers every package file except itself.
