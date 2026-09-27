# Production lifecycle and population reservations — 2026-09-27

## Scope and command

Audit base `440ec87be6058f7a5510f0501ef1584b92f15123`; local authoritative
server, two WebSocket seats, custom 64×64 open map `production-lifecycle-audit`.
No server defect was found and no production behavior was changed.

```sh
node scripts/production-lifecycle-scenario.mjs
```

The scenario builds both Barracks, queues Infantry and starts research through
ordinary commands. Checkpoint fixtures place lethal attackers and tighten
completion timing; the server applies real combat damage and production ticks.
Temporary checkpoints and child servers are removed on exit.

## Assertions

- A producer killed one tick before unit/research completion loses both queues
  before progress advances. No ghost unit, upgrade, extra debit or refund appears.
- A builder killed at 99.9% construction contributes no further progress. Another
  surviving Worker resumes and completes the same building without another cost.
- Both seats start with 998 living units plus two paid Barracks reservations,
  saturating the 1,000 per-team and 2,000 match limits. Worker training is rejected
  without spending food while those reservations exist.
- Ordinary attacks destroy both producers. Each seat can then queue exactly two
  Workers; a third is rejected. Exactly 100 food is spent per seat.
- Both replacement queues finish through real simulation time, reaching exactly
  1,000 living units per seat. Further training remains rejected, with no extra
  charge or duplicate capacity release.

The dense roster is a restored fixture; it is not a performance measurement or
human-play proof. This covers simultaneous per-team/global saturation, not a
separate asymmetric-cap fixture. Barracks destruction and Infantry research are
representatives of the shared building cleanup path.

## Source research and project decision

Reviewed pinned 0 A.D. revision
`61a3b9507d974084e6badb88a0826bd89a6d5b8b`,
[ProductionQueue.js](https://github.com/0ad/0ad/blob/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/simulation/components/ProductionQueue.js).
`RemoveItem` stops the queued item; `ResetQueue` removes every item and disables
autoqueue. `OnOwnershipChanged` resets the queue and explicitly discusses
reserved population slots. The useful principle is to dispose of production
work and its capacity reservation together when its owner disappears.

Here, reservation totals are derived from live building/Worker queues.
`destroyBuilding` removes the producer and its bound research; the simulation
applies lethal damage before construction, production and research updates.
These existing rules satisfy the tested boundaries without another reservation
ledger or new cancellation/refund behavior. No upstream code was copied.
