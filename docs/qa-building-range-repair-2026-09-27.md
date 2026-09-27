# Preserve in-range building attacks during route repair

## Reproduction and fix

Independent review of main `8b6bcbbf338ce7a3fe20c85105aee37b56ad4c11`
reproduced an accepted Archer building attack being canceled by an unrelated
Barracks placement. The Archer was within weapon range at its continuous world
position, but its cell center was outside range. The friendly Archery Range and
terrain blocked the other candidate firing cells in its connected region.

Construction called `replanPathsBlockedBy`, which searched for a reachable firing
cell even though the Archer could already shoot. The absent approach cleared
`attackBuildingTargetId` from `2` to `-1`. The initial reproduction measured a
building-edge distance of `4.1012193308819755` against a weapon range of `4.5`.

Route repair now checks actual unit-to-building range before searching approach
cells. It clears stale movement paths and retains the valid attack. Out-of-range
units still search the existing kind-specific approach cells. The simulation
continues to enforce target existence, ownership, health and visibility before
applying damage.

## Regression geometry and evidence

```sh
node scripts/ranged-building-attack-scenario.mjs --edge-range-repair
```

The scenario constructs Archery Ranges and trains Archers through ordinary
commands, then restores a bounded geometry fixture using that real roster:

- 64×64 map; Archery Ranges at `(-3.5, 10.5)` and `(3.5, 10.5)`.
- Four-cell wall at columns 30–33, across the map height.
- Archers at `(-2.45, 8.9)` and `(2.45, 8.9)`.
- Each Archer's distance to the enemy footprint is about `4.451`; its cell-center
  distance is about `4.528`, just outside the `4.5` weapon range.
- Both attacks are accepted and damage buildings. Unrelated Barracks placements
  at `(-10.5, 12.5)` and `(10.5, 12.5)` then trigger route repair.
- After each placement, both targets remain assigned, both paths remain empty,
  and both Archers produce a later attack tick.

The exact new regression fails on an isolated copy of the baseline server at
the target-preservation assertion (`-1 !== 2`) and passes with the fix for both seats. The ordinary ranged-building test
continues to cover unreachable Infantry rejection. The existing Archer approach
scenario covers out-of-range movement, construction-triggered repair, damage,
ownership/generation checks and fog-hidden targets. Construction-connectivity and
live attack-move repair scenarios cover the neighboring movement rules.

This preserves the range-before-approach rule already researched from pinned
0 A.D. source in the [original building attack evidence](qa-ranged-building-attack-2026-09-27.md).
No upstream code was copied. The evidence is local authoritative simulation;
it does not claim a deployed observation or a human-play result.
