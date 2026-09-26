# Compact objectives and feedback

26 September 2026. Implemented from main `227526c`.

The closed HUD shows the next available victory objective, following authored prerequisites. Active hold countdowns for either team and the timed-control deadline remain outside the detail panel. Objectives opens the existing nonmodal brief with live objective/event cards, preserving capture requirements, rewards, prerequisite locks and countdowns. Repeated recent notices are grouped in a bounded history inside that panel. Hints can be hidden and reopened; placement and armed targeting force their cancellation guidance visible. Only the hint preference is persisted.

Validation:
- Five focused state tests pass (prerequisite advancement, any-zone defense, simultaneous countdowns and deadline, spectator/result states, cyclic input, bounded repeated notices).
- Objective fog visibility scenario passes all four public/redacted-progress checks.
- Local browser at 1280 × 720: compact North Signal instruction visible, objective stack absent when closed; opening exposes authored Forked Vale rules and live cards in a scrollable panel; Escape closes and returns focus to the objective opener; Hide hints removes instructional text and leaves Show hints accessible.
- Preview used source from this branch with existing root assets linked temporarily. Some root art assets were unavailable; this is UI evidence, not an art validation.

Human novice sessions, complete match play, touch/fullscreen and final combined-layout coverage remain pending. The broader Battlefield first milestone's 75% uncovered viewport target must be measured on the combined HUD changes; this slice alone does not claim that gate.
