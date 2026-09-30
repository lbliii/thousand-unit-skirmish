# Frontier support-building source evidence — 30 September 2026

Four approved textured Meshy jobs succeeded for 120 credits total. [Source pack](../assets/buildings/frontier-civilization-models-v1/README.md) records exact tasks, charges and hashes. No remesh or paid rerun occurred. Original dense GLBs remain ignored local capture inputs.

Captured 32 Complete views at 46° orthographic elevation, eight 45° azimuths, fixed 1024-square/eight-world-unit frames and 128 pixels/world unit. Measured native lower-base geometry precedes uniform scaling. Width targets: Storehouse/Workshop 2.8, Stable 2.75, Watchtower 1.8. Stable’s adjustment keeps measured base depth inside three cells. Ground pivots and lighting accompany each frame.

Reviewed all four eight-view families in the browser. Every frame passed RGBA dimensions, nonempty unclipped alpha and SHA-256 comparison. Source model switching retains native bounds despite prior uniform scaling. DOM-image decoding restored a valid embedded texture after the desktop ImageBitmap path failed; no pixels were regenerated.

Storehouse’s low profile needs actual Worker/door clearance review. Generated rear details, horse/bay scale, team pennants and masks remain unaccepted. These are Complete source views only: no construction/damage states or active game asset changes. Full eight-building runtime baseline remains the goal.
