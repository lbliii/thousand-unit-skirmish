# Frontier building scale pilot — 30 September 2026

Source milestone on main baseline `56011c4`; no gameplay/map observation is claimed. The motivating player observation was that the current Town Center looked small and house-like.

Two user-approved Meshy tasks succeeded for 60 credits total. Original models, hashes, charges and task IDs are recorded in the [source pack](../assets/buildings/frontier-civilization-scale-pilot-v1/README.md). Sixteen Complete PNGs use shared 128 pixels/world unit, 46° orthographic elevation, fixed eight-unit frame and recorded ground pivots. Geometry measurements precede uniform scaling: Town Center lower-base 4.40 × 4.24, House 2.30 × 2.95 units.

Reviewed the entire eight-view pair in the browser and saved the full-page gallery. Broad civic wings and tower remain distinct from the household gable across directions. Rear details are generated interpretations and require art refinement. Checked all sixteen RGBA frames for 1024-square dimensions, nonempty alpha, unclipped silhouette bounds and matching manifest SHA-256. Camera density and pivots match across the family. Syntax checks pass for both Node utilities; documentation links and whitespace are checked before publication.

The ruler represents 0.8-unit height only. Actual Worker/door clearance, 0.91/0.48 game zoom, terrain contact, team masks and lifecycle transitions are not yet validated. No active runtime assets changed. Dense source GLBs remain ignored local capture inputs; saved PNGs and manifests are published. No paid remesh or rerun was performed.

Follow-up source audit: Worker v1/v2/v3 manifests declare heights 0.9385/0.8933/1.05, and the sprite runtime divides that height by maximum frame alpha height. The earlier approximate 0.8-unit vertical ruler is insufficient for actual sprite clearance. Guidance now explicitly distinguishes model-height projection from the camera-facing unit quad. No doorway acceptance claim follows from the ruler.
