# Frontier environment redesign — first concepts

Status: original AI-generated concept art for review. The approved single-cliff pilot is complete: [model, eight captured views, and standalone review](../frontier-cliff-pilot-v1/README.md). It cost 30 credits. Exact illustration prompts are in `prompts.json`; the job record is in `meshy-request.json` (planning metadata, not a raw API payload).

## Art direction

Use broad fractured stone forms, mossy olive caps, warm ochre soil, and distinct oak/pine silhouettes. Build cliff runs from straight sections, corners, and tapered ends. Keep open ground quiet enough for armies and team colors to read.

- `art-direction.png`: assembled landscape study and six asset studies. This is a review board, not a Meshy input or an in-game screenshot.
- `cliff-straight-reference.png`: isolated first model reference. Output has transparency despite the prompt asking for white. Review its fine foliage edges after reconstruction.

Ground materials remain world-space painted textures. Meshy is proposed for dimensional obstacles, foliage, and landmarks. Raised walkable terrain remains a separate gameplay feature.

## Bounded pilot

1. Submit the standalone cliff image as one textured Image-to-3D job after a spend ceiling is provided. Completed under the approved 30-credit ceiling, with 30 credits actually consumed. No paid remesh or reruns included.
2. Inspect the returned model and preview for silhouette, back faces, grass artifacts, unwanted ground, textures, and usable joins. Intended nominal size: 4 × 1.5 × 2 world units (length × depth × height). Generated boundaries will need checking; an illustration does not enforce modular geometry.
3. Capture eight azimuths at 45-degree steps, approximately 46-degree camera elevation, initially 640 × 640 RGBA with consistent world scale, frame bounds, origin, and lighting. Reuse the existing Town Center capture conventions after checking camera orientation. Capture depth for the cliff occlusion test; keep ground-contact shadows separate.
4. Review repeated straights and turns at strategic zoom, with units in front and behind. Check actual depth behavior, transparent fringes, alignment and atlas memory. A turntable alone does not prove runtime occlusion. The pilot page uses directional frame selection and per-pixel depth. Normal gameplay terrain remains unchanged.
5. If the pilot passes, create separate references and models for a corner, end, low outcrop, oak, and pine. Later add shape variants, berries, and the objective landmark. Promote only after in-game art review.

Sources were generated with the built-in image tool on 2026-09-26. No third-party art was supplied. Provenance does not establish legal exclusivity. Source images remain unmodified; no new license is asserted here.

## SHA-256

- `art-direction.png`: `dd36a23211a276e262ded24a954d97ead110d8102482bb871ebf80096533557c`
- `cliff-straight-reference.png`: `effc9bff945a5813706f0d90223a4248e3e425403e7082ab1ca71aeb9b890530`
