# First civilization: Frontier architectural style

[Illustrated wiki](lore/frontier-architecture.md) · [Concept pack](../assets/buildings/frontier-civilization-concepts-v1/README.md) · [Building atlas plan](building-atlas-production-plan.md)

Working art kit, 30 September 2026, informed by main `f896d09`. The current gameplay faction ID remains `frontier`. Bellweather supplies this kit's regional vocabulary; it does not restrict human settlement to Bellweather or resolve a political faction name. Common Hearth and the other proposed institutions remain separate lore decisions.

## Architectural grammar

Welcoming, cultivated human craft: pale river-limestone foundations, cream limewashed walls, dark honey-oak posts and visible joinery, muted sage shingles, restrained butter-yellow/ochre details and sparing aged copper. Stone is heavy and grounded; timber brackets support actual loads. Broad roof planes and clear openings carry identity before small props. Avoid black gothic spires, oversized crystals, elaborate royal ornament and noisy wall patterns.

Roofs share material and pitch vocabulary while function changes massing. The Town Center is a wide civic complex with subordinate wings, delivery arcades and rear bell tower. House is a modest cottage. Storehouse is a broad loading shed, Stable has stalls, Workshop has an engineering bay, Watchtower is slender and high, Barracks is enclosed and sturdy, and Archery Range is open and low with readable targets.

Ochre ornament belongs to the culture and stays subdued. Azure/Ember are owner accents, restricted to small standards. The generated Town Center includes illustrative grain emblems and a forked blue pennant; these are source concept details, not approved faction insignia or correct Azure geometry. Runtime production replaces them with the established straight-cut Azure/bar/square and forked Ember/split/diamond treatment. Architecture must work under either team.

## Scale and camera contract

One world unit equals one gameplay cell. Current registry occupancy is 5 × 5 for Town Center and 3 × 3 for the other seven. Some older art documentation describes the previous four-cell base; the current registry owns occupancy. Model visible bases independently; do not resize art to fill collision cells or image squares.

| Building | Proposed visible base width | Main silhouette |
| --- | --- | --- |
| Town Center | 4.4 world units | Broad hall, connected wings and rear tower |
| House | 2.3 world units | Single modest gable and chimney |
| Storehouse | 2.8 world units | Wide loading door and sheltered goods |
| Stable | 2.8 world units | Open stalls and compact yard |
| Workshop | 2.8 world units | Wide assembly bay and wheels |
| Watchtower | 1.8 world units | Narrow high lookout |
| Barracks | 2.8 world units | Enclosed gabled hall and gate |
| Archery Range | 2.8 world units | Open canopy and targets |

These are starting targets for model review, not image-derived measurements. Town Center is about 1.9 times House base width. Door clearance must be reviewed against the selected runtime unit pack. Worker v1/v2/v3 declare `heightWorld` 0.9385/0.8933/1.05; a 0.8-unit ruler understates these sprite references. Horse/engineering bays are larger. Preserve head clearance and equipment proportions rather than exaggerating every doorway. A 3-cell House footprint can include accessible open space around a smaller visible house.

Concept prompts requested orthographic 45° azimuth and roughly 46° downward elevation. Generated concepts are illustrative and not geometrically certified. Captured production uses a fixed orthographic camera, eight 45° directions, known pixels/world unit and grounded pivots. A taller/wider canvas is allowed at consistent density. No transparent-padding trick may establish a scale claim.

## Production coverage and review

The eight Complete concepts are the first source outcome. Each final gameplay pack needs registered construction and damage states and direction coverage. Verify Town Center expansion/repair using current simulation state; older source READMEs calling all centers static are historical limits. Use the [atlas plan](building-atlas-production-plan.md) for generation order, frame accounting and future Mill/Farm briefs.

Inspect the whole roster beside Workers at ordinary 0.91 and strategic 0.48 review zoom on representative ground. Check functional recognition, both owner accents, camera transitions, fog, terrain contact, accessible exits and repair/construction transitions. Record exact build/map/manifest and actual runtime visibility in QA. Source concepts can be integrated into the wiki while these runtime outcomes continue independently.

The [Town Center/House source pilot](../assets/buildings/frontier-civilization-scale-pilot-v1/README.md) now demonstrates those two width targets through measured uniform model transforms and sixteen controlled Complete captures. Their lower bases measure 4.40 × 4.24 and 2.30 × 2.95 world units. This establishes source registration; Worker clearance, lifecycle/team treatment and runtime scale remain open.

### Worker scale evidence

The sprite loader uses `heightWorld / maxAlphaHeight` for world units per atlas pixel (`src/unit-sprite-runtime.mjs`). Worker versions differ; human-roster preview can select the Human role instead. Review the actual selected role/version, its ground pivot and camera-facing quad, not only a vertical model ruler. At the pilot density of 128 pixels/world unit, the Worker packs’ maximum alpha heights map to approximately 120.13, 114.34 and 134.40 screen pixels respectively. A vertical 0.8-unit model ruler projects to about 71.13 pixels at 46° elevation and is a different measurement. These values do not prove any generated doorway fits a Worker.

The [runtime preview evidence](qa-frontier-building-runtime-preview-2026-09-30.md) records six Complete-only renderer manifests and the opt-in match binding. The revised Town Center is observed in a local live match; default matches, team masks and full lifecycle acceptance remain outstanding.
