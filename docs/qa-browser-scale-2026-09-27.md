# Browser scale diagnostic — 27 September 2026

[QA plan](qa-vertical-slice.md) · [Performance checks](testing.md#performance-measurements)

## Failure retained

Clean source `26eea9b`, Apple M2/24 GB, macOS 26.6.2, Node 24.9.0,
headless Chrome 153.0.8010.53, WebGL2 through ANGLE Metal. The workload used
three ten-second movement waves, 2,000 visible units, two player connections
and one spectator browser. No timing limits were overridden.

The active gameplay fixtures were held during this bounded capture. AC power
was connected; load averages were 4.24/4.57/4.74 before and 4.86/4.67/4.77 after.
Other desktop/background work remained present. The image used Chrome's default
756×469 viewport, which is narrower than the intended ordinary desktop profile.

The run **failed** the zero-long-task limit:

| Measurement | Observed |
| --- | --- |
| Animation frame interval p95 | 16.7 ms |
| Worst frame interval | 83.4 ms |
| Animation callback CPU p95 | 1.9 ms |
| Worst animation callback | 87.8 ms |
| Tasks above 50 ms | 1, lasting 88 ms |

The task began about 934.8 ms into the page lifetime. The screenshot was
inspected: both teams and the battlefield were rendered, rather than a blank
page. It does not establish that individual roles are readable in this crowd.

The [failed sealed run](qa-evidence/run_1790516934810_e697c1cf8b564f8387d8780576c7f49c/run.json)
preserves the output, screenshot and hashes. Manifest SHA-256:
`9b1a76548b445cf4da810d334e5851f6f91204b6f56c13df0f5335f935f6a23e`.
Hash verification passed; process success and capture-contract validation are
false. This evidence must not be reported as a performance pass.

## Investigation and measurement changes

A disposable CPU-profiled rerun did not reproduce the spike. A later diagnostic
with long-animation-frame attribution exposed two startup frames before the
measurement window, dominated by animation callbacks; it did not identify the
cause of the original in-window spike. These runs changed instrumentation and
host activity, so they do not establish a renderer improvement. Runtime game
code and timing budgets were left unchanged.

The benchmark now fixes the viewport to 1280×720 at DPR 1, records viewport and
canvas dimensions, and optionally records long-animation-frame script/render
attribution when the browser supports it. Deferred entries identify whether they
occurred before, overlapped, or fell within the measurement window. Frame
attribution is independent of the long-task budget.

The first explicit-viewport attempt stopped before producing browser metrics:
the workload counted three planning jobs where it expected two. A focused
regression reproduced completion order `[2, 1]` followed by new jobs `[4, 3]`.
Using the last completed ID (`1`) incorrectly included old job `2`. The workload
now takes the maximum prior ID (`2`), retaining the same exactly-two-orders,
1,000-units-per-team, route-success and timing assertions. This fixes benchmark
bookkeeping, not a game pathfinding rule.

The [next desktop run](qa-evidence/run_1790517373949_06f45c74f03c4d2297a870ead3de269c/run.json)
verified a 1280×720 viewport and canvas at DPR 1 and reproduced a different
false failure: a 76 ms task started at 301.5 ms and ended at 377.5 ms, before
measurement began at 388.2 ms. Its observer callback arrived later. The frame
sample maximum was only 16.8 ms and callback maximum was 4.6 ms.

The benchmark now keeps these deferred pre-window tasks in a separate report
field. Tasks overlapping or starting within the window still count against
the unchanged zero-long-task limit. A regression fails before this fix and
passes afterward, including an overlapping task that must remain counted.
The original 88 ms failure lacks a window-start timestamp and also includes a
slow measured callback; this discovery does not establish that it was false.

The [final instrumented desktop run](qa-evidence/run_1790517451984_d0df72db4e6d44b399a1200bd69fadfb/run.json)
passed at 1280×720/DPR 1: frame interval p95 16.7 ms, callback p95 1.9 ms,
callback maximum 5 ms, and zero long tasks overlapping the measured window.
It retained one deferred 75 ms startup task ending at 399.9 ms, before the
411 ms measurement start. The bundle and screenshot hashes verify. This run
used `26eea9b` plus the benchmark changes in this PR, with other task activity
present; it validates instrumentation and is not a controlled before/after
renderer comparison. No game runtime performance fix is claimed.

The attribution fields follow the [W3C Long Animation Frames editor's draft](https://w3c.github.io/long-animation-frames/)
(consulted September 27, 2026; a work in progress). They are diagnostic context,
not GPU-completion measurements. Unit checks cover measurement resets, optional
API absence, retained long-task samples, and deferred startup classification.

## Remaining proof

Reproduce and attribute the 88 ms spike under fixed dimensions before choosing a
renderer optimization. A passing later sample cannot erase this failure. The
benchmark is a synthetic headless spectator workload, not a windowed player,
hosted match, GPU completion, or novice-readability result. Keep browser,
simulation, networking, and human-match evidence separate.
