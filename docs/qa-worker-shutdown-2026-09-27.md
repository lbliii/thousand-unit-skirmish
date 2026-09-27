# Room worker signal shutdown — 2026-09-27

## Reproduction and cause

Baseline `664ecb6` checked only a child process's `exitCode` when deciding
whether to wait for shutdown. A signal-terminated child keeps a null exit code
and sets `signalCode`. The supervisor consequently attached a second exit
listener and waited indefinitely after the first exit had already occurred.
This could interrupt supervisor drain or room cleanup when a worker was killed
by a signal during shutdown.

A focused test executes the actual `stopWorker` function against real Node
child processes. Before the fix, both a child exiting on SIGTERM and an
already SIGKILL-terminated child exceeded the test's one-second observation
limit. Clean exit and forced termination after the grace period passed.

## Fix and evidence

Both shutdown checks now consider normal exit and signal exit. The grace-period
timer is cleared as soon as its wait completes. The production seven-second
limit and checkpoint behavior are unchanged.

All four focused cases pass: clean exit, SIGTERM exit, previously killed child,
and a child ignoring SIGTERM that must be killed. The fixture uses a 100 ms
grace period and a five-second deadlock guard; these are correctness checks,
not deployment performance measurements. It is registered in CI.

The full local room-supervisor scenario separately exercises invite isolation,
checkpoint restart, seat recovery, queued production, default-worker crashes,
and graceful supervisor restart. Its result is recorded with this change's PR.
No hosted process was killed for this test.

The runtime distinction is documented in the official
[Node child-process API](https://nodejs.org/api/child_process.html#subprocessexitcode).
