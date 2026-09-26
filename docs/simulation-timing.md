# Simulation timing under overload

The authoritative simulation targets 30 ticks per second. Each timer callback
advances the game by exactly one fixed simulation step. The scheduler uses
monotonic deadlines and, after an event-loop stall or an overlong tick, skips
elapsed wall-clock slots before scheduling the next callback. It does not run
multiple ticks back-to-back to catch up.

This policy keeps unit movement, attack cadence, and scenario timers tied to
simulation ticks. During overload, simulation time slows relative to wall time;
it does not jump forward or spend a burst of CPU replaying missed steps. The
trade-off is that real-time effects such as match duration also take longer
while the server remains overloaded.

`/health.tickTiming.scheduler` reports the policy, cumulative skipped slots,
and the skipped-slot count and simulation tick for the most recent overload.
The ordinary start-lag samples continue to report observed callback delay.

Run `node scripts/simulation-scheduler-test.mjs` to exercise regular cadence,
an injected 150 ms stall, and the no-immediate-catch-up boundary.
