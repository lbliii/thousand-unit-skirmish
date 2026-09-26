# Frontier cliff — Meshy pilot

Review in the game: **Match Controls → Terrain Art Pilot** (`/environment-review.html`). Use Q/E or the camera buttons to cycle eight views. The page is isolated from live matches and uses the same Three.js version and camera pitch as the game.

The gallery compares the current single-view cliff with the new directional model captures. Three copies show the uncorrected joins. Two infantry-shaped probes circle the joined pieces to exercise depth; these are client-only review objects, not simulated or colliding gameplay units. This pilot does not replace normal battlefield terrain.

## Delivered

- [Eight-view preview](eight-view-preview.png)
- [Manifest](manifest.json): source hash, frame hashes, world scale, anchor, camera and depth encoding, runtime size, and checks.
- Eight 640 × 640 color WebP frames and eight 16-bit RG depth PNGs in `runtime/`, totaling **1,028,670 bytes**. They share textures across four review instances. Decoded texture storage is substantially larger than the download: approximately 29 MiB including color mipmaps, before driver overhead.
- Source GLB: [source/cliff-source.glb](source/cliff-source.glb); **37,809,628 bytes**, **973,328 triangles**, one material, three 2048 × 2048 embedded textures. This is an offline source, not a runtime mesh.
- Source capture project: [capture script](source/capture.py), [render page](source/render-cliff.html), color/normal/depth/silhouette PNGs, inspection receipt and provider preview. Run `python3 assets/environment/frontier-cliff-pilot-v1/source/capture.py --overwrite` with Pillow, Node.js, installed Three.js and Chrome to regenerate locally; no Meshy request is made.

## Provenance and spend

Original [illustrated source](../frontier-v2-concepts/cliff-straight-reference.png), with the exact prompt retained in that concept folder. Meshy resource `image-to-3d`, task **01a0e003-8ecc-707f-9ca0-966ebfb6c52d**. Standard textured generation, PBR enabled, 2K textures, GLB. The completed provider receipt reports **30 credits consumed**, matching the approved ceiling. No paid remesh or rerun.

Capture uniformly scales the longest horizontal extent to four world units and puts the lowest point at ground height. Actual dimensions are **4 × 0.998 × 1.306** (X × Y × Z), lower than the concept's intended two-unit height. Capture elevation exactly matches the game camera at **45.4359°**, with azimuths 0–315° at 45° intervals, fixed world lighting, a five-unit frame, and ground anchor (320,376). The source model is unchanged.

The review shader decodes per-pixel camera distance from RG bytes and writes scene depth for the orthographic camera. Frames are selected by camera azimuth; the normal captures are retained for inspection but not used at runtime. The pilot has baked lighting and no separate contact-shadow pass. The generated model's missing explicit tangents are recorded in `inspection.json`; lighting has been visually reviewed with Three.js, not validated across other importers.

## Findings

- The broad fractured rock silhouette survives reconstruction and remains coherent around the object.
- The model reads as a low ridge. It does not yet satisfy the taller cliff specification.
- Grass and moss are smoother and less detailed than the illustration.
- Adjacent pieces have visible uneven boundaries. Matching edge geometry, corners, caps, and shape variants remain necessary for a finished modular kit.
- Alpha/depth checks passed for all eight frames, with nonempty silhouettes fully inside the shared frame. The original local gallery cycled all eight views without browser warnings or errors and passed its repository checks. This PR ports the pilot to a standalone page on current main; its checks are recorded in the PR description.
- Moving depth probes support visual inspection, but this is not a comprehensive terrain/foliage occlusion or performance certification. No gameplay collision, walkable terrain elevation, or production art promotion was changed.

Original generated art and Meshy output are retained with provenance. No third-party source art was supplied; no new license or claim of legal exclusivity is asserted.
