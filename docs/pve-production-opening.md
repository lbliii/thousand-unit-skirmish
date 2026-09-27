# PvE Barracks and Infantry opening

## Outcome — 2026-09-27

Base build `d7f9862483f1b5fae3528273797f409caebc4f2a` issued gathering and
attack-move orders but never built or trained. The opponent could collect stock
and contest objectives, but could not reinforce or replace army losses.

The deterministic policy now attempts one Barracks after its first 300 observed
simulation ticks. It takes one worker with no carried resources, leaving the
others on the economy. Completed Barracks train Infantry while alive military
plus queued military is below 12 and total friendly units plus all queues is
below 24. Each new soldier receives an order toward the current objective or
fallback destination; existing soldiers keep their orders.

## Spending and recovery rules

- A Barracks costs 175 wood; the policy requires 200, retaining 25 wood.
- Infantry costs 50 food; the policy requires 100, retaining 50 food.
- Queue at most one Infantry at a time; blocked exits suppress training.
- At most one accepted Barracks per match. An unfinished building can receive a
  replacement builder; a destroyed Barracks is not rebuilt in this bounded opening.
- Unconfirmed construction/training backs off over 150, 300, 600, then at most
  900 ticks (5, 10, 20, 30 seconds at 30 Hz). Repeated snapshots cannot spend again.
- Observed construction or a nonempty queue postpones further spending. Worker
  cargo, food/wood balances, friendly population and all friendly queues are
  checked again for each attempt.
- Construction and gathering commands never assign the same worker in one
  decision. Ordinary gather-first opening and tactical fairness remain intact.

The costs mirror the authoritative `BUILDING_RULES` in `server.mjs`; tests of
actual construction and training protect this boundary. The server remains the
final authority for affordability, population, placement and spawn clearance.

## Placement without hidden information

Record a home anchor from the initially observed friendly workers. Try a seeded
ordering of eight nearby candidate sites. Each 3×3 footprint must fit inside the
map, be currently visible under fog, and avoid observed units/resources/buildings
and public objective zones. The policy does not receive raw terrain or spawn
metadata. The server checks terrain, Town Center collision, connectivity and
other placement restrictions. If no building appears, a later bounded attempt
uses another candidate. There is no hidden enemy, resource or map-state read.

This is a small opening planner. It does not search the whole map, expand to
multiple producers, research upgrades, rebuild a destroyed Barracks, or prove a
complete economy strategy for every custom map.

## Source research

Reviewed OpenRA release `release-20250330`, commit
`b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787`,
[`UnitBuilderBotModule.cs`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Mods.Common/Traits/BotModules/UnitBuilderBotModule.cs).
It checks a minimum resource balance before production, selects a free queue,
observes unit limits, and spaces production checks to allow feedback. Our opening
uses those general constraints with explicit food/wood reserves, one producer,
one queued unit and deterministic observation-based retry timing. The code is
independently implemented; no GPL source was copied.

## Evidence

`node scripts/pve-production-scenario.mjs` covers both seats and seeds `0`,
`20260925`, `4294967295`: deterministic candidate order, opening delay, reserves,
queue/population limits, casualty replacement, blocked exits, duplicate snapshots,
bounded retries, unfinished construction, one accepted Barracks, unseen terrain,
gather/build conflicts, and reinforcement slot generations. The integrated
construction assertion fails on the base policy and passes after the change.

The authoritative runtime scenario runs ordinary commands for both seats:

```sh
node scripts/pve-production-runtime-scenario.mjs forked-vale
node scripts/pve-production-runtime-scenario.mjs woodland-expanse
```

Recorded runs used seed `20260925` for Azure and `4294967295` for Ember:

| Map | Seat | Barracks order tick | First Infantry train tick | New soldier ordered |
| --- | --- | --- | --- | --- |
| Forked Vale | Azure | 510 | 1,350 | 25 |
| Forked Vale | Ember | 513 | 1,293 | 24 |
| Woodland Expanse | Azure | 510 | 1,320 | 24 |
| Woodland Expanse | Ember | 513 | 1,353 | 25 |

Each run verified a completed Barracks, authoritative training acknowledgement,
a new Infantry unit, an attack-move for that reinforcement, one accepted building,
and no queue above one. Forked Vale retained ordinary team fog filtering. These
are local deterministic/runtime checks, not a deployment or player-fun claim.
