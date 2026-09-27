# Attack-move flow scheduling — 2026-09-27

## Reproduction and decision

The fixed-position Forked Vale fixture on main before this change gave the
lower-ID army the win in all four combinations of seat labels and ID blocks.
With low IDs on the left, it retained three Infantry / 70 HP; with low IDs on
the right, it retained three or four / 40 HP. A diagnostic one-line increase
from one to sixteen flow builds per tick produced mutual elimination. See
[the original audit](qa-pve-fixed-position-2026-09-27.md).

The production fix retains one new attack-move flow field per tick. A planning
pass now orders requests by least recent build grant, then physical position,
before ordinary combat updates. Cache hits do not spend a grant. Damage remains
simultaneous, attack cooldowns remain unchanged, and deferred requests retain
their existing bounded retry cadence. The transient grant history uses unit
objects, so dead/replaced rosters are not retained by the scheduler.

An alternating-tick traversal was rejected: six-tick target scans can repeatedly
land on the same priority parity. Rotating the whole combat traversal was also
rejected in favor of separating planning from damage updates.

## Actual-server evidence

Four ordinary local server/checkpoint runs retain fixed physical positions,
seed `20260925`, zero economy, and the existing two-seat policy commands.

| Left seat | Low IDs | Physical winner | Left survivors / HP | Right survivors / HP |
| --- | --- | --- | --- | --- |
| Azure | Left | Left | 3 / 70 | 0 / 0 |
| Azure | Right | Left | 4 / 90 | 0 / 0 |
| Ember | Left | Left | 3 / 70 | 0 / 0 |
| Ember | Right | Left | 4 / 90 | 0 / 0 |

Two controls reverse the Infantry slot order along Z (`13.5…16.5` becomes
`16.5…13.5`) and use seed `20260926`: Azure-left/low-IDs-left and
Ember-left/low-IDs-right both finish with left two / 100 HP, right zero.
This is a mirrored formation control on unchanged terrain, not a mirrored map.

The observed physical winner is invariant under these label/ID permutations.
**A left-side advantage remains**, and the original formation still has
ID-dependent casualty totals. This change does not establish full combat
symmetry, balance, or a statistical win rate. Exact mutual elimination remains
a useful diagnostic, not an asserted rule.

## Checks

- `node --test scripts/attack-flow-scheduling.test.mjs`: sustained service for
  sixteen requesters, seat/ID-invariant physical service order, free cache hits,
  and the real path helper's one-build cap.
- `node scripts/attack-flow-fairness-scenario.mjs`: runs the four actual-server
  permutations and requires one physical winner across them. The previous
  baseline fails that invariant. Each underlying command was run for this note.
- `node scripts/simultaneous-lethal-combat-scenario.mjs`: all eighteen existing
  lethal/cadence cases pass.
- `node scripts/cliff-pursuit-scenario.mjs`: existing both-seat ranged and
  unreachable pursuit cases pass.
- `node scripts/live-attack-move-repair-scenario.mjs`: construction-driven live
  route repair passes.

The older `attack-move-cursor-scenario.mjs` could not reach its combat check:
it expects a published map to retain the prior 2,000-unit roster, but current
map publication applies the map starting roster and returns 1,000. Its setup
assertion fails before attack-move commands; it is not counted as a pass here.

The fixture supports `RTS_FAIRNESS_SEED` and `RTS_FAIRNESS_MIRROR_Z=1` for the
controls above. Grant history and flow caches are transient across restart;
this note makes no claim of exact combat replay through a checkpoint.

## Pinned upstream reference

Reviewed 0 A.D. commit `61a3b9507d974084e6badb88a0826bd89a6d5b8b`,
[`CCmpPathfinder.cpp`, `SendRequestedPaths` and `StartProcessingMoves`](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/source/simulation2/components/CCmpPathfinder.cpp#L790-L838).
It separates queued path computation from result delivery, limits same-turn
work through `PrepareForComputation`, and waits for asynchronous jobs before
posting deterministic results. We adopt the separation of planning and
consumption; our least-recently-served single-build scheduler is a local design,
not a claim that 0 A.D. uses this fairness policy. No upstream code was copied.
