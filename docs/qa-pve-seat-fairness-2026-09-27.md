# PvE seat, spawn and command-order audit — 2026-09-27

## Fixture

Base `664ecb6`; both policy seeds `20260925`; ordinary local server and two
WebSocket seats. Four bounded Forked Vale runs vary independently:

- Default or reversed harness decision/send order (`--reverse-order`).
- Original spawn ownership or swapped team ownership of the two existing spawn
  points (`--swap-spawns`). The swap uses normal map publication before play.

```sh
node scripts/pve-contested-match-scenario.mjs 300 20260925 20260925
node scripts/pve-contested-match-scenario.mjs 300 20260925 20260925 --reverse-order
node scripts/pve-contested-match-scenario.mjs 300 20260925 20260925 --swap-spawns
node scripts/pve-contested-match-scenario.mjs 300 20260925 20260925 --swap-spawns --reverse-order
```

The swapped fixture preserves terrain, resources, objective geometry and rules.
It swaps team/spawn ownership, not every coordinate of the world or every unit's
local formation offset. Each policy retains its assigned seat, IDs and normal
team-visible observation. The result reports both switches explicitly.

## Observed result

**The winner followed the left spawn in all four runs.** Reversing the harness
send order did not reverse the winner under either ownership arrangement.

| Spawn ownership | Send order | Winner | Wall seconds | South/North/Watch capture ticks |
| --- | --- | --- | --- | --- |
| Normal: Azure left | Azure then Ember | Azure | 170 | 2967 / 3759 / 4503 |
| Normal: Azure left | Ember then Azure | Azure | 170 | 2967 / 3759 / 4503 |
| Swapped: Ember left | Azure then Ember | Ember | 268 | 5904 / 6510 / 7446 |
| Swapped: Ember left | Ember then Azure | Ember | 259 | 5427 / 6042 / 7176 |

Both normal-spawn runs also had identical observed 90-second military counts
(5 Azure, 2 Ember). The swapped runs differed in timing and casualties, but
both produced Ember's capture/hold victory. All four passed same-observation
seeded replay, producer/queue/roster budgets, both-seat combat and losses,
production, and result agreement. No stopped policy or invalid target appeared.

This rules out the simple explanation that Azure wins because the harness
always invokes it first. It also weakens a pure team-index explanation: Team 1
won both runs when it owned the left spawn. It does not prove which spatial or
team-relative behavior causes the advantage. The concrete next diagnostic is a
fixed-cell mirrored opening that permutes team/ID ownership while retaining
exact physical unit positions, rather than applying a buff to Ember.

## Source inspection

Each `createDeterministicPolicy` instance owns its production policy, gathering
assignments, objective history and tactical watches. There is no shared mutable
policy decision state. The seed/team/worker key intentionally chooses gathering
ties; production rotates candidate sites by seed and orients offsets by team.
Objective selection uses public ownership/prerequisites and observed army position.

The real server chains commands per connection. It does not assign all player
commands a shared simulation-frame barrier. Reversing the harness send order is
therefore a timing control, not a claim that every command applied on the same
tick. Combat collects unit damage before applying it, preserving simultaneous
counterattacks. The attack-move flow-field build budget remains shared and units
are inspected in array order; this is a separate possible source of acquisition
timing differences, not proof of the observed winner's cause.

## Upstream technique

Reviewed OpenRA release `release-20250330`, commit
`b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787`,
[`OrderManager.cs`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Game/Network/OrderManager.cs).
`TryTick` waits for the next frame's client orders; `ProcessOrders` rejects a
packet whose frame number differs from the simulation frame. This separates
repeatable order timing from repeatable policy choices. Our harness verifies
identical policy output for identical observation traces, but ordinary socket
arrival timing is not lockstep. No networking redesign or upstream code was
copied for this audit.

## Interpretation limits

These are four local diagnostic runs, not a statistical win-rate estimate or
human balance evidence. One identical seed controls policy variation but does
not make differently numbered seats choose identical gathering assignments.
The spawn swap also changes which team's placement orientation applies at each
side. A stronger causal combat study would hold exact per-unit geometry and
command application ticks constant while permuting team/ID ownership. Preserve
unit stats, prices and rewards until such evidence identifies a concrete defect.
