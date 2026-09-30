# Custom-skirmish milestone evidence

[Milestone requirements](custom-skirmish-milestone-plan.md) · [QA evidence standard](qa-vertical-slice.md)

## Current acceptance audit

This record distinguishes the foundation from the final combined proof. It does
not declare the milestone complete. Each lane's focused implementation and
checks must be integrated before the combined scenario can establish its claims.

| Requirement | Current evidence | Remaining proof |
| --- | --- | --- |
| Fortified Crossing terrain and resources | `scripts/fortified-crossing-layout.mjs` passes on foundation commit `b42b50e`; mirrored routes to North Signal 31 cells, South Signal 30, Watch/crossing 20 from each seat, including home collision | Recheck final published map |
| Both-seat paid economy and active research recovery | `scripts/fortified-crossing-economy.mjs` passes on `b42b50e`; both Barracks complete, infantry trained, infantry attack research completes after worker restart with original seat tokens; final resources 200 food / 350 wood per seat | Combine with completion rewards, gathering, orders and combat |
| Persistent Patrol/Follow | Lane A merged in PR #277 (`540785b`), with focused both-seat/1,000-unit browser evidence in `qa-persistent-orders-2026-09-30.md` | Lane A acceptance and combined mixed-speed, combat, recovery/rematch proof |
| Visual region/event authoring | Lane B merged in PR #274 (`8a93749`); combined candidate `559ce08` passes visual draw, typed forms, joined-source assertions, undo/redo, export/import, reopening and publishing all nine events in a real invite | Recheck combined final build; human discoverability remains unobserved |
| Completion triggers and diagnostic trace | Lane B merged in PR #274; focused both-seat completion/recovery/rematch and guest privacy checks recorded there | Both-seat construction/research chains, initial-state semantics and delayed delivery recovery |
| Automatic shipped audio and execution feedback | Lane C merged in PR #271 (`56011c4`); verified shipped manifests/sources, bounded observed work, applied-token acknowledgements and inspector. Focused loader/execution/serving/playback and fresh-context browser evidence recorded in the PR | Fresh guest, missing content fallback, accepted/rejected feedback, wood/food/repair task lifecycle and inspector |
| Combined result and rematch | Candidate `a4c9a31` plus roster/diagnostic harness edits passes both winner variants of the authoritative combined script | Final merged build and browser/audio reset checks |
| Scale evidence | Runner being validated; no comparable measurements recorded | Server and browser/audio measurements at 250/500/1,000, diagnostic 2,000, with controlled conditions |
| Hosted observation | Local real-invite browser proof passes on candidate `559ce08`; this is not staging evidence | Identified staging deployment and fresh invite/guest observations |
| Unassisted author and human pair | Not observed | Actual people must establish discoverability; automation cannot supply this evidence |

## Reproduction commands

Run from the repository with Node 24 and local listening permitted:

```sh
node scripts/fortified-crossing-layout.mjs
node scripts/fortified-crossing-economy.mjs
node scripts/fortified-crossing-scale.mjs 20 250,500,1000,2000
# After all feature lanes integrate:
node scripts/fortified-crossing-combined.mjs 0
node scripts/fortified-crossing-combined.mjs 1
node scripts/fortified-crossing-browser.mjs
```

The economy test uses real paid orders and never injects checkpoint state. Its
worker and save directory are disposable. The scale runner publishes a derived
map with a distinct ID and the selected starting roster; it retains the terrain,
fog, resource and capture/event rules. It alternates converging attack-move and
withdrawal, samples health and reclaims both seats after restarting the worker.
Its JSON output identifies build, timestamp, Node/platform/CPU, workload duration,
rolling tick timing, planning, transport, checkpoint and applied notice latency.

These are loopback server diagnostics. They do not measure rendered frames,
audio callbacks, real network latency, player comprehension or supported hosted
capacity. Overlapping health windows are reported as such. Performance claims
require separately recorded conditions and browser evidence; a smoke run under
other active development workloads validates the runner only.

## Runner smoke, 30 September 2026

The 10-second 250-unit run on `b42b50e` plus the uncommitted runner
collected 20 health samples and four successful applied notices, then reclaimed
both original seats after restart. The runner revision is committed with this
record. Other development work was active on the host; this run is validation
of the runner, not a comparable performance baseline. No rendered client or
audio callback was measured.

## Combined proof preparation

The combined candidate assigns the supplied `rts-feedback-test` / `worker-actions`
v1 hash, arms each seat’s delayed Barracks and infantry-attack rewards, and joins
its completed research reward with its crossing reward before delivering field
reinforcement. The new combined scripts are prepared and syntax checked; they
remain unproven until the pending tactical and scenario contracts integrate.
The browser harness uses real disposable invite rooms and empty Chrome contexts,
form and pointer actions, export/import/reopen, published map assignment and
automatic guest delivery. It never establishes unassisted human usability.

## Combined author-to-invite browser, 30 September 2026

Candidate `559ce08` (main `8a93749` plus combined map/proof changes) passes
`node scripts/fortified-crossing-browser.mjs` in Chrome 154.0.8037.92 at
1280×720/DPR 1. A real disposable supervisor invite hosts the scenario. The
script removes the inherited event/region definitions using controls, draws a
14×8 Central Crossing at column 33/row 28, configures nine events with typed
forms, checks the exact joined source IDs, exercises undo/redo, exports and
imports its own file, closes/reopens/restores the draft, and saves it to the room.
The host and guest use independent empty Chrome contexts; both report the hashed
shipped profile ready with available binding sources and zero imported packs.
Neither context reports a runtime exception.

The initial runs corrected harness assumptions about invite URL format, import
status wording and native dialog-close event sequencing. The final run follows
the actual `?room=` invite format and waits for dialog close processing before
reopening. This proves browser authoring and automatic delivery; native playback
scheduling is supported by lane C’s separate fresh-context work-clip test. It
does not prove listening quality, unassisted authoring or hosted capacity.

## Combined authoritative match, 30 September 2026

Both `node scripts/fortified-crossing-combined.mjs 0` and `1` pass after all three
lane implementations integrate on main `540785b` plus the combined candidate.
Both seats build and gather, buy infantry and research, preserve Patrol and active
research across worker restart while construction relief is armed, Follow their
Scout into the crossing, reclaim Ember’s seat, receive the joined research/crossing
reinforcement, clear persistent intent with Stop/Hold, fight, finish capture/hold
victory, and rematch with fresh generations/resources/events/orders. Host trace
privacy and no duplicate event notifications are asserted. Checkpoint contents
are inspected but never modified.

The first Follow-arrival probe placed the Scout too near the region edge; one
Ember follower correctly stopped outside the three-unit condition. The final
probe moves the leader farther inside rather than changing the authored rule.
These scripted matches establish the engineering behavior, not player comprehension
or browser playback; those use their separate browser evidence.
