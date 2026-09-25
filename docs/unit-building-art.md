# Unit and building art — frontier kit v1

This document defines the authored character and building kit for the 1v1 vertical slice. It follows the oblique camera, Azure and Ember team colors, and illustrated frontier materials. Terrain and neutral landmarks belong to the environment art track. The state mapping, manifest, batching limits, and runtime gates are specified in [the renderer contract](renderer-state-contract.md). Cross-pack palette, scale, asset format, visual-state names, and review gates are summarized in [the unit and building art format and finish review](unit-building-art-output-proposal.md).

## Authored shape language

| Object | Readable cue at play zoom | Material and color cue |
| --- | --- | --- |
| Worker | Short body, warm cap, backpack, broad hand tool | Neutral ochre leather and worn timber; the sash is the only team-tinted surface |
| Infantry | Full-height body, dark six-sided shield, upright spear | Steel-grey cap, neutral shield and dark shaft; the sash is the only team-tinted surface |
| Archer | Narrower body, bow on the forward side, back quiver | Moss hood and weathered wood; the sash is the only team-tinted surface |
| Town Center | Wide stone hall, high rear tower, compact standard | Pale weathered stone and charcoal slate; shared architecture with an owner-selected standard |
| Barracks | Enclosed timber walls, pitched ridge roof, gate, compact standard | Dark timber and slate; shared architecture with an owner-selected standard |
| Archery Range | Open corner posts, single sloped canopy, front target, compact standard | Dark timber and slate; shared architecture with an owner-selected standard |

Azure stays sky blue and Ember rust red. Authored units reserve team tint for the named sash; shields, packs, tools, bows, quivers, and weapons remain neutral. Building walls, roofs, shields, trim, and other architecture also remain neutral. The compact standard carries building ownership: Azure uses a straight-cut pennant with one centered bar, while Ember uses a forked tail with a split bar. Shapes and equipment distinguish roles when color is hard to see. Unit and building state cues remain renderer-owned so they cannot be confused with baked model details.

## Renderer motion and signals

- Full-detail walking units use an offset stride phase. Workers use gathering and construction poses only while the server reports those tasks; movement takes precedence over the tool swing. Known cargo tints the existing Worker backpack batch leaf green for wood, amber for food, and neutral when unknown. Resource-specific work is shown only after `cargoType` is known.
- At strategic zoom, role glyphs and equipment, including the small backpack facet, stay neutral. Azure and Ember identity use separate team-colored square and diamond markers. The facet reuses the existing Worker role batch and adds no unit draw batch. These renderer cues are source-only and still need runtime visual review.
- A fresh server attack tick drives the short infantry spear thrust, archer bow release, or worker tool swing. The renderer deduplicates the tick; the animation signals an attack event, while an HP decrease signals a hit. A capped, sampled arrow trace marks some archer shots without filling a mass battle with projectiles. Attack and hit are transient overlays; defeat takes precedence and ends the pose for that unit generation.
- Newly produced units scale in briefly. Defeated units tilt and shrink before disappearing. Strike ticks and target positions are consumed only from the filtered snapshot; hidden enemy positions and targets are not inferred.
- Building construction uses earthwork and foundation ground stages. Finished details appear with the roof. Health, focused attackers, selection, rally position, and production remain separate cues.
- A renderer-owned production cue is attached at the authored `productionCue` anchor and is not baked into the building model. It is hidden while idle, pulses in team color for active production, and stays visible, muted, and static when production is blocked. Town Center worker production follows the same state language.
- Resource visuals use the four manifest stages `full`, `worked`, `low`, and `depleted`, derived from starting stock and the latest visible snapshot. Fog-omitted nodes keep their last-known stage until they become visible again.
- Unit pieces are instanced; there are no per-unit Three.js objects. Resource state sprites are batched by asset and stage. The renderer contract sets the batch budgets and requires a candidate-checkout 2,000-unit browser measurement.

## Procedural renderer baseline — historical notes

The current renderer still uses procedural objects until an authored-pack integration checkpoint is reviewed. The notes below describe older procedural renders and isolated-branch experiments. They are not palette rules for authored assets and do not substitute for visual or performance evidence on the current renderer candidate.

- Earlier procedural passes used team-tinted bodies and shields, Town Center doorway or tower accents, and team-colored roof or canopy trim. Those details remain part of the procedural baseline pending side-by-side migration review; authored units use sash-only team tint, and authored building architecture remains neutral.
- A first-pass browser review on an isolated art branch covered Stone Pass at ordinary zoom and a closer base view with 250 and 1,000 units. It reported readable team color, Town Center roof, and massed spear silhouette. A 250-unit mixed-roster preview exercised Range and Barracks construction, Archer and Infantry training, and active Town Center/Barracks production. An ordinary-zoom review also covered Stone Pass and Cinder Ridge. These are historical observations from that branch.
- A historical headless Chrome movement benchmark on the isolated art branch reported 1,998 moving units, 16.8 ms frame-interval p95, 3.5 ms animation-callback p95, and no tasks over 50 ms during a 30.13-second measurement on Apple M2 / Metal. The measurement did not cover windowed presentation or GPU completion and does not satisfy the current candidate's browser gate.
- A later procedural refinement added easing for facing, idle breathing, hit recoil, and team-colored Town Center roof trim/banner, Barracks ridge, and Range canopy. Those choices describe that procedural pass, not the authored material contract above.

## Current review gates

Review a mixed Worker/Infantry/Archer roster and building silhouettes at zoom 0.91 and strategic zoom 0.48, on Meadow and Cinder, with both teams and fog-safe visibility. Confirm the production cue's idle, active, and blocked states and the four resource stages. Measure the 2,000-unit browser run on the renderer candidate. Zoom 2.3 is optional close-up review and cannot replace either required view or the performance measurement. The renderer contract records the full evidence requirements and current open reviews.
