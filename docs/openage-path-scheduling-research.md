# openage path scheduling: implications for deferred acquisition

Research date: 2026-09-27. Pinned openage commit
[`b23f5df2017c76f79774f6baa92bd5621015c053`](https://github.com/SFTtech/openage/tree/b23f5df2017c76f79774f6baa92bd5621015c053).
This supports the [fixed-position ID-order finding](qa-pve-fixed-position-2026-09-27.md).
It does not implement or approve a production scheduler change.

## What the inspected source actually provides

1. **Reduce pathfinding work by sharing spatial results.**
   [Pathfinding design](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/doc/code/pathfinding/README.md)
   describes portal A* followed by flow fields for selected sectors, with cached
   fields reused across requests. This reduces work per request; it is not a
   documented per-tick fair admission budget among units.

2. **Simulation time is part of the request, but unit/order identity is not.**
   [`path.h`](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/libopenage/pathfinding/path.h)
   defines `PathRequest` as grid, start, target and time.
   [`system/move.cpp`](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/libopenage/gamestate/system/move.cpp)
   calls `get_path` synchronously, then writes movement positions at simulation
   timestamps. This call path does not demonstrate an asynchronous result queue,
   a unit generation check or a command revision token.

3. **Cached spatial work and request-specific state have different lifetimes.**
   [`Integrator::get`](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/libopenage/pathfinding/integrator.cpp)
   keys portal fields by portal/other-sector IDs, checks cost-field dirtiness at
   request time, and evicts invalid cached fields. It copies cached fields before
   applying dynamic line-of-sight flags and clears dynamic flags from stored copies.
   Shared cache identity therefore does not replace result validity checks.

4. **Event time ordering is not proof of same-time fairness.**
   [`event.cpp`](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/libopenage/event/event.cpp)
   compares events by time only. Its hash combines target entity and handler IDs;
   it is not a unique path-request token.
   [`EventLoop::reach_time`](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/libopenage/event/event_loop.cpp)
   executes due events at their scheduled time and checks target lifetime before
   invocation. Its settling-attempt guard detects event-loop nontermination;
   it is not a pathfinding work budget.
   The general-purpose
   [`JobManager`](https://github.com/SFTtech/openage/blob/b23f5df2017c76f79774f6baa92bd5621015c053/libopenage/job/job_manager.cpp)
   collects finished jobs and executes their callbacks on the requesting thread,
   without establishing a simulation-frame ordering contract in that code.

## Concrete implications for this project

These are project conclusions, not claims that openage implements our fix:

- Keep the one-build budget separate from fair request admission and result
  application. Cache sharing alone cannot repair ascending-ID access to the slot.
- If work is retained across ticks, its entry needs unit ID **and generation**,
  order revision, target identity/position and navigation validity. Recheck these
  before application; a cached field or reused ID cannot authorize an obsolete
  order. A synchronous prepare/apply phase within one tick need not add such a
  queue merely to follow this research.
- Define when a result becomes visible in simulation ticks. Wall-clock worker
  completion or callback order must not silently select which army acts first.
- Keep successful cached lookups, budget deferral and genuine unreachability
  distinguishable. Deferral should not consume a tactical retry interval as if
  a path search had established failure.
- Validate the production budget and ownership permutations independently.
  openage's inspected synchronous path does not supply a drop-in bounded fair
  scheduler or a guarantee of equal-time tie-breaking.

No upstream code was copied. This is source inspection, not an openage benchmark
or a claim that its whole engine has the same scheduling behavior.
