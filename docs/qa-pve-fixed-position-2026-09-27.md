# Fixed-position PvE ID-order isolation — 2026-09-27

## Causal finding

Base `469b97afbefbf177f36f0ccb606b42794f91851b`. In a controlled mirrored 8v8
opening, the lower-ID army wins regardless of its team or physical side. Changing
only the flow-field build budget from 1 to 16 in an uncommitted diagnostic server
copy removes that advantage: both tested ID orientations end in exact mutual
elimination with matching per-slot last-attack ticks.

The production scheduler visits units in array order with one shared new-flow
budget per tick. A due scanner advances its next scan tick before attempting the
budgeted path. Earlier units can therefore acquire paths while later units defer.
The budget is a causal contributor in this fixture. This does not prove it is
the sole cause of the earlier full-match left-spawn results; those also include
route/formation geometry, harvesting, production and changed ownership.

No combat or policy changes are included here. The combat owner is addressing
fair scheduling while retaining the production limit of one flow build per tick.
The diagnostic increase is not a proposed production fix or balance adjustment.

## Fixed geometry and permutations

```sh
node scripts/pve-fixed-position-fairness-scenario.mjs 0 left
node scripts/pve-fixed-position-fairness-scenario.mjs 1 left
node scripts/pve-fixed-position-fairness-scenario.mjs 0 right
node scripts/pve-fixed-position-fairness-scenario.mjs 1 right
```

The first argument is the team owning the left force; the second is the side
assigned unit IDs 4–11 (the other force uses IDs 16–23). The fixture restores
eight Infantry per side at `x = ±3.5, ±4.5`, `z = 13.5, 14.5, 15.5, 16.5`.
Those physical points remain fixed while team and ID ownership vary independently.
Attack cooldowns are the same by roster slot. Workers remain parked away from
combat. Forked Vale terrain and objective rules are retained; resource nodes,
starting stock and timed supply are removed to isolate the opening from economy.

Both normal policies use seed `20260925`, their own fog-filtered observations,
and real attack-move commands. Shadow policies verify identical output on the
same observation trace. Every initial tactical target is South Signal `(0, 15.5)`.
No objective changes owner in these 30-second probes, excluding capture priority
or ownership transitions as the cause of this outcome. Snapshot restoration fixes
positions; it does not bypass the server's command or combat path.

| Left team | Lower IDs on | Lower-ID survivors / HP | Higher-ID survivors / HP |
| --- | --- | --- | --- |
| Azure | Left | 3 / 70 | 0 / 0 |
| Ember | Left | 3 / 70 | 0 / 0 |
| Azure | Right | 4 / 40 | 0 / 0 |
| Ember | Right | 3 / 40 | 0 / 0 |

Small survivor-count differences remain subject to socket/application timing;
the lower-ID advantage survives all four permutations. The strict diagnostic
`--expect-parity` requires equal survivor counts and remaining HP, and fails
against this production baseline. It is opt-in while the scheduler fix is owned
separately; the normal diagnostic records results without freezing a biased
outcome into a required assertion.

## Counterfactual and provenance

The harness accepts `RTS_FAIRNESS_SERVER_PATH` to select an isolated server copy.
The diagnostic copy differs only at `ATTACK_MOVE_MAX_FLOW_BUILDS_PER_TICK = 16`.
With left team Azure, both lower-ID-side settings gave 0 survivors / 0 HP for
each force. Mirrored last-attack ticks also matched slot-for-slot:

- Lower IDs left: `150,139,139,144,413,411,410,410` for both forces.
- Lower IDs right: `151,140,140,145,414,412,411,411` for both forces.

The [preceding audit](qa-pve-seat-fairness-2026-09-27.md#upstream-technique)
records pinned OpenRA `OrderManager.cs` research: shared simulation-frame order
boundaries make timing reproducible. Our fixture narrows initial geometry and
ownership while preserving the existing authoritative server; it does not add
lockstep networking or claim globally deterministic WebSocket arrival times.
No upstream code was copied.

Syntax and documentation checks pass. This is a local controlled opening,
not a full-match balance measurement or a human-play claim.
