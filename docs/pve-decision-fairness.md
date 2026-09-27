# PvE decisions during economy retries

## Reproduction and outcome — 2026-09-27

Base build: `20d076b1b8254f877e6c27a28fe1d3fae1818883`.
Maps: Forked Vale and Woodland Expanse. Seats: Azure and Ember.
Policy seeds: `0`, `20260925`, and `4294967295`.

The policy returned immediately whenever it generated a gather order. Gather
orders become eligible for retry after 20 ticks, while ordinary one-second bot
decisions are about 30 server ticks apart. A worker that remained idle after a
rejected gather order could therefore consume every decision. Soldiers never
received their opening advance or a later retake order, even while a public
objective was available.

The policy now permits at most one consecutive decision devoted only to gather
orders. On the next decision it evaluates tactics and returns any needed army
order alongside the gather retries. The usual gather-first opening, target
priorities, command authority, fog boundary, and unchanged-target deduplication
remain intact. There is no new command or observation field.

## Source research and project decision

Reviewed OpenRA release `release-20250330`, commit
`b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787`, specifically
[`SquadManagerBotModule.AssignRolesToIdleUnits`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Mods.Common/Traits/BotModules/SquadManagerBotModule.cs#L306).
The method independently schedules squad updates, new-unit assignment, and
attack-force creation. This supports keeping tactical evaluation live while
another kind of work remains pending. Our smaller policy needs only a bounded
one-decision deferral, rather than a squad framework. This is an independently
written scheduling change; no OpenRA GPL source was copied.

## Evidence and limits

`node scripts/pve-decision-fairness-scenario.mjs` uses the authored maps and
peer-observation adapter with synthetic authoritative snapshots in which workers
remain idle. It fails on the base build at the missing opening attack assertion
and passes after the fix. It covers both seats, three seeds, repeated 30-tick
retries, objective loss and retake, maps without objectives, duplicate suppression,
army loss, and identical replay traces.

This reproduces decision starvation after unconfirmed orders; it does not claim
a specific live pathfinding rejection or a player-tested improvement in fun.
The later [tactical recovery change](pve-tactical-recovery.md) adds bounded retries
when observations show that the army has stalled short of its destination. Register this scenario with the standard CI runner alongside the
existing opponent checks.
