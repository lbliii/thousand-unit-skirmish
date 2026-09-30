# Custom skirmish authoring and play

[Roadmap](roadmap.md) · [Capability inventory](references/feature-coverage-inventory.md) · [QA](qa-vertical-slice.md)

## Outcome and baseline

A creator visually authors a custom skirmish, configures useful event chains,
shares an invite, and both players command their armies and hear the assigned
feedback without hand-editing JSON or separately installing a shipped audio pack.
Placeholders remain sufficient; art direction and audio production stay independent.

Planning baseline: main `10869c2`, inspected 30 September 2026. Stop/Hold,
checkpoint-safe first-presence region conditions and ready/death/repair audio
are integrated. Region definitions still use JSON; broader completion triggers,
Patrol/Follow, ongoing work feedback and automatic map audio delivery remain gaps.
The all-zone source pack is technically playable and packaged, but has no authored
map event bindings/compositions and is not creatively accepted final audio.

The user authorized completion of this milestone on 30 September 2026. The
three existing implementation owners are resumed in their isolated worktrees;
the coordinating owner carries the combined proof through integration. This
authorization does not declare features implemented. References remain a loose
inventory, not a parity mandate.

## Parallel implementation lanes

### A — Persistent tactical orders

Own authoritative Patrol and Follow, order interruption, HUD/hotkeys, task state
and checkpoint/reconnect/rematch behavior. Own command-specific tests and guides.

1. Ship Patrol as a bounded repeated route with combat engagement followed by
   return to the route. Stop/Hold/plain orders cancel it predictably. Existing
   waypoint semantics remain compatible; persistence retains patrol intent.
2. Ship Follow for living friendly units, using generation-safe target identity,
   bounded replanning and explicit lost/dead/unreachable-target behavior. Follow
   never reveals hidden enemy state or silently becomes an attack command.
3. Show the current persistent order in selection context. Mixed-speed units
   should not oscillate around their leader or repeatedly consume all path work.

Acceptance: both seats can patrol a choke, fight, resume patrol, follow a mixed-speed
leader, stop/hold, and recover those orders after restart. Verify target death,
generation replacement, invalid ownership, route blockage and reset. Large-group
checks measure planning work as well as visible movement.

### B — Visual scenario authoring and bounded completion triggers

Own region/editor state, map validation, scenario activation/actions, debug trace,
authoring UI and scenario tests. Keep changes outside tactical command semantics.

1. Replace required region JSON editing with draw/select/move/resize/name/delete
   tools and typed event forms. Retain JSON import/export and old-map support.
   Introduce bounded undo/redo for region and event edits; an invalid draft cannot
   silently replace the last valid published definition.
2. Add construction-complete and research-complete activation sources, filtered
   by team and registered building/technology ID. Define initial completed state,
   one-shot activation, simultaneous completion and checkpoint behavior explicitly.
   Reuse current delays, rewards, repeats and event chains rather than launching
   a second scenario execution engine.
3. Provide a host-only bounded event trace: waiting, armed, delivered, completed,
   activation reason and recipient. It is an author diagnostic, not unrestricted
   enemy information for normal players. Invalid references identify a fixable field.

Acceptance: create regions and a research/construction -> reward -> region chain
using forms; undo/redo, export/import, reopen and publish it. Both-seat runtime
checks prove exact activation and rewards. Restart after arming but before delivery
must not duplicate or lose the reward; rematch rearms the map.

Explicitly defer arbitrary scripts, general variable algebra, per-entity death
triggers and preplaced entity editing. Those require a coherent authored-entity
identity model and are separate follow-ups, not hidden dependencies of this wave.

### C — Shared audio delivery and execution feedback

Own audio pack loading/manifests, sound bindings, playback gates, audio inspector
and focused serving/release wiring. Existing audio creators retain asset production.

1. Deliver approved shipped packs/profiles automatically by stable version/hash
   references. Bind one existing reviewed/test profile to a disposable scenario;
   local authored packs and existing ID-only map references remain compatible.
   Expose loading/ready/fallback status to both seats. Hash/MIME/size/reference
   checks and bounded caching prevent ambiguous or unbounded downloads. Room upload
   and public content hosting remain separate work.
2. Add bounded work execution feedback for wood gathering, food gathering and
   repair. It begins with observed authoritative task execution, stops on task
   change/death/reset/disconnect, and respects visibility/audibility and mix settings.
   Aggregate nearby work rather than running a loop for every worker.
3. Move spoken order success responses to authoritative applied feedback where
   an order token exists. Keep immediate neutral sending feedback and explicit
   rejection cues. New Patrol/Follow cues can use generic fallbacks; they do not
   require new recordings. Preserve ready/death generation/tick deduplication.
4. Provide an inspector for binding resolution, missing sources, load status and
   cooldown/voice-limit suppression. No new paid generation or mandatory sound
   set redesign is needed to prove these hooks.

Acceptance: a fresh second browser hears an assigned shipped profile without an
Audio Studio import. Missing/invalid content retains useful fallback. Wood, food
and repair execution can resolve different supplied test clips; task changes and
recovery do not leave stale loops. Rejected orders do not speak success. Test
simultaneous workers, rapid orders, muted buses and pack switches.

## Shared interfaces and integration

| Contract | Owner | Other consumers |
| --- | --- | --- |
| Patrol/Follow intent, target generation and applied-order token | A | C consumes existing/new applied notices; no duplicate command protocol. |
| Region/event schemas, completion identity and host trace | B | Integration scenario fixtures; C consumes map audio reference only. |
| Versioned audio reference and supported event/binding catalog | C | B offers map assignment using the established reference; no separate pack loader. |
| Combined proof, documentation reconciliation and staging observation | Coordinating owner | Reads all three merged artifacts; no central PR approval queue. |

Each lane extracts small pure modules where useful and limits shared-file edits
to its responsibility in `server.mjs`, `src/main.js`, `index.html` and CI registration.
Checkpoint changes need explicit migration and preservation tests. Record shared
contracts before dependent wiring; independent tests can use fixtures until the
owning slice merges. Read current main before integration and resolve only concrete
conflicting edits with the affected owner. Each author ships tested scoped PRs to
main and owns staging fixes; the whole milestone is not a merge gate.

Recommended sequence: first PRs for Patrol, visual regions/forms and shipped pack
delivery can proceed concurrently. Follow, completion triggers/trace and execution
feedback follow within their lanes. Integrate the combined scenario after the
needed interfaces merge. Do not open a fourth speculative framework workstream.

## Combined product proof

Author a small original **Fortified Crossing** scenario using existing terrain
and placeholders. A named crossing activates a reward; completing a registered
building or technology activates a later supply event. The creator can explain
the event chain in the editor and inspect why it fires. Patrol protects the route;
Follow moves a mixed army behind a friendly Scout. Both seats use the same assigned
shipped audio profile. Existing capture/hold victory supplies a clear result.

1. Create/configure without JSON edits; export/import and reopen.
2. Launch a fresh invite room; the guest needs no separate shipped-pack install.
3. Play both seats through economy, completion triggers, patrol/follow, combat and
   capture result. Record map/build and any confusing or failed action.
4. Disconnect/reclaim one seat and restart the disposable worker during an armed
   delayed event. Preserve intent, resources and event state without duplicate cues.
5. Finish and rematch. Regions/events/orders/audio baselines reset correctly.

Automated both-seat proof is the engineering floor. One unassisted author and
human pair establish discoverability; an agent-operated browser cannot establish
that claim. Record any remaining human-session requirement explicitly.

Measure combined movement/combat/event/audio behavior at 250, 500 and 1,000 total
units; use 2,000 as a diagnostic ceiling. Separate server tick/planning/event cost,
browser frame/long tasks, network/order delay and recovery. Use recorded controlled
conditions for comparable measurements. This wave must not claim a new supported
hardware/network limit from synthetic checks alone; the existing hosted scale
proposal remains the support-profile starting point.

## Completion boundary

The milestone is complete when the author-to-friend proof works on one identified
integrated build, the three lane acceptances pass, and limitations/performance
observations are recorded. Useful slices ship before that final proof.

Later candidates: authored entity placement/identity and death triggers, scenario
variables, configurable hotkeys, custom object editing, walls/gates, broader pack
upload/distribution and replay tools. Heroes, naval/air traversal, campaigns,
teams/FFA and public matchmaking remain separate product decisions.
