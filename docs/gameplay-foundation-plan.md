# Gameplay foundation implementation plan

[Roadmap](roadmap.md) · [Game bible](game-bible.md) · [Architecture](architecture.md)

## Outcome

Deliver one complete medieval-frontier faction on an extensible RTS foundation.
A new unit, building, technology or faction variant should be a validated content
change when it uses supported behaviors. A new behavior still requires explicit
simulation work. Sprite/model/animation changes must not change gameplay rules.

This is the next development tranche. Existing match/recovery checks remain the
regression floor; another validation-only tranche is not the primary outcome.
Human sessions inform usability and balance while implementation proceeds.
Art production stays independent and placeholders remain usable throughout.

## Current boundaries

The authoritative simulation is in `server.mjs`; browser integration/rendering
is in `src/main.js`. Existing queues, rally points, construction connectivity,
food/wood gathering, combat, fog, objectives, persistence and seeded PvE should
be extended rather than replaced.

`src/gameplay-definitions.mjs` now owns validated unit, building, technology and
faction content, stable wire identities and the canonical gameplay revision.
Authoritative queues/actions, HUD availability, editor validation and filtered AI
observations consume these definitions. Houses and completed Town Centers provide
gameplay capacity separately from safety ceilings; friendly drop-offs, repair,
cancellation and shared combat/progression rules extend the existing simulation.
`src/gameplay-presentation.mjs` binds content to declared procedural profiles.
Sprite/GLB loaders remain renderer capabilities; skeletal animation and full F4
variant/scale proofs are still separate work.

## Milestones and shipping slices

### F1 — Extensible roster and rules

**Deliverable:** existing gameplay consumes one versioned, validated registry;
a Spearman and House exercise it through the real match pipeline.

1. Extract shared unit, building, technology and faction definitions. Begin by
   reproducing current behavior exactly. Units define stats, costs, training
   time, population cost, capabilities and combat tags. Buildings define
   footprint, construction, HP, functions and production lists. Technology
   definitions describe costs, prerequisites, duration and supported effects.
2. Use stable content IDs and a deterministic resolved ruleset revision. Keep
   wire IDs compact through a registry mapping; retain compatibility with the
   existing roster until a deliberate protocol migration is ready.
3. Route authoritative affordability, queues, command validation and research
   through definitions. Expose derived legal actions/rejection reasons to HUD
   and filtered AI observations; clients never choose authoritative costs.
4. Replace closed role lists in selection, production UI, editor validation and
   AI capabilities. Policies retain explicit strategy choices, rather than
   assuming the registry itself decides strategy.
5. Add Spearman as a melee production option with placeholder art. Add House as
   the first non-production building; complete population behavior in F2.

**Acceptance:** Worker/Infantry/Archer behavior and known scenario outcomes are
preserved during extraction. Spearman and House reach selection, construction or
training, fog-filtered snapshots, save/reload, reconnect and rematch without new
hardcoded kind branches in generic systems. Multiple products can share one
building. Missing references, duplicate IDs, prerequisite cycles and invalid
values fail validation with actionable messages. Each real addition includes
both-seat and AI coverage; clients cannot bypass prerequisites or affordability.

### F2 — Complete base and economy lifecycle

**Deliverable:** players decide where to expand, how much capacity to build and
where to defend. Initial roster: Town Center, House, Storehouse, Barracks,
Archery Range, Stable, Watchtower and Workshop. Workshop arrives in F3.

1. Make Houses add gameplay population capacity, separate from the 1,000-per-seat
   safety ceiling. Reserve queued population atomically; show used/reserved/cap
   and explain blocked production. Destruction reduces cap without deleting
   living units; prevent further reservations until capacity is available.
2. Add Storehouse as a food/wood drop-off. Workers choose a reachable friendly
   completed drop-off; destruction or route blockage reassigns them without
   duplicating or losing cargo. Keep the current Town Center valid.
3. Allow additional constructible Town Centers and worker production. Define
   footprint, access, rally/exit search, population and elimination behavior;
   a single lost Town Center must not accidentally eliminate a surviving army.
4. Add Watchtower using shared targeting/damage rules and explicit sight/range.
   Give it a clear counter and avoid making objectives trivially unassailable.
5. Complete cancel/refund and repair rules for construction, training and research.
   Specify refund timing, builder interruption/resumption, queue destruction,
   access blocking and checkpoint behavior before implementation.

**Acceptance:** a two-seat match can expand to a second resource region, shorten
worker trips with a Storehouse, hit and relieve a population block, and destroy
an expansion/defense without broken pathing, lost resources or stale queues.
AI builds capacity, expands and recovers from losses using visible information.
Manual large-army fixtures retain their separate stress-testing mode.

### F3 — Army composition and progression

**Deliverable:** a bounded combined-arms roster and small technology tree, not a
large civilization catalog.

1. Introduce shared attack/armor classes and tag-based modifiers with a documented
   damage formula. Define target eligibility, minimum damage, attack timing,
   range and structure interactions. Preserve deterministic simultaneous combat.
2. Add Stable and Scout/Rider: a fast reconnaissance/raiding role. Make Spearman
   an effective answer to mounted units; retain Infantry and Archer roles.
3. Add Workshop and a siege unit whose advantage against defenses is balanced
   by vulnerability to mobile armies. Add projectile/area effects only if this
   concrete role requires them, with bounded queries and friendly-fire rules.
4. Generalize existing attack research into a small progression tree: a second
   military tier, weapon/armor upgrades and the siege unlock. Apply effects by
   supported stat modifiers; define stacking, current/new units and save state.
5. Teach the deterministic AI mixed production, prerequisite acquisition and
   counter responses. Use only its filtered observation and bounded planning.

**Acceptance:** representative matches demonstrate scouting, a mounted raid,
its Spearman response, and an assault on a defended position. Costs, modifiers,
unlocks and availability agree between server, HUD and AI. Technology purchase
and completion survive reconnect/restart and reset correctly on rematch.
Balance numbers are tuned from these interactions rather than declared final
in this plan.

### F4 — Interchangeable presentation and variants at scale

Start the presentation interface during F1; finish the interchangeability proof
after the roster exercises it. Do not wait for finished graphics.

1. Bind gameplay definitions to presentation profiles rather than asset paths
   or renderer types. Profiles declare backend, asset references, dimensions,
   facing, selection bounds, team accent, attachments and supported states.
2. Normalize idle, move, gather, build, attack, hit, death and spawn states/events.
   Deduplicate attacks and deaths by tick/entity generation; animation duration
   must not determine authoritative hits, movement or construction completion.
3. Define optional animation clips and capability negotiation. Static/sprite
   fallback remains valid. Extend existing schemas/loaders deliberately before
   claiming animated or skinned assets are supported. Reuse batching/LOD paths;
   avoid one scene object, mixer or material per unit by default.
4. Make faction variants resolve explicit roster/stat/technology/presentation
   overrides. Team identity stays separate. Pin the resolved ruleset to each
   room/checkpoint and reject or migrate incompatible saved rules explicitly.
5. Prove two presentation variants and one bounded gameplay variant. A developer
   adds supported content through definitions/assets, validation and release
   packaging; no simulation edits are needed for a visual swap.

**Acceptance:** the same seeded commands produce identical authoritative results
under both visual variants. All supported states have a real asset or declared
fallback; missing assets fail usefully. Mixed-role/building sessions work at
ordinary and strategic zoom. Measure 250/500/1,000/2,000 total units using the
[scale profile](core-playtest-tranche.md#scale-measurement-profile--proposed),
including animation/batch memory, browser CPU, snapshots and command delay.
Compare against recorded baselines; do not claim hardware support from an
uncontrolled capture. Package and staging smoke resolve all new dependencies.

## Dependency order and boundaries

Ship small PRs in this order: registry parity → shared production/actions →
Spearman/House → population → drop-offs/expansion → defenses/lifecycle → combat
classes/Stable → siege/progression → variant and presentation proofs. Define
presentation binding early alongside registry parity; art can target it while
other gameplay work proceeds. Each slice owns server, HUD, persistence, AI,
authoring and focused checks that it changes, through staging integration.

No new ECS, scripting VM, generic plugin engine, naval layer, campaign, public
account service or full civilization tree is needed for this tranche. Do not
rewrite working movement/room systems just to reorganize files. Keep runtime
entity storage compact; version schema changes and preserve visibility filters,
planning budgets, generation handling and order feedback.

Exact costs, starting capacity, tier prices, repair/refund values and combat
multipliers are implementation proposals to settle in their focused slices.
The content list and system outcomes above define the target scope; they are
not claims of implemented functionality or finished art.

## First implementation goal

Extract and validate the current rules registry without changing gameplay, then
prove a second Barracks product can train, appear in the HUD, persist, reconnect
and be used by the AI. Establish the presentation-profile interface in that
slice. This tests the architecture with a real addition before widening it.

### Ruleset contract slice

The F1 contract now validates compact wire identities, faction rosters and
prerequisite cycles; canonical gameplay revisions are published in snapshots and
pinned in schema-12 checkpoints. Incompatible pinned saves are preserved as
rejected files. Generic product availability is authoritative and shared with
HUD and filtered AI observations. Building rules and footprint geometry derive
from definitions, and building presentation profiles join the earlier unit
profiles. Focused checks cover both-seat prerequisite rejection before spending,
HUD reasons, canonical identity, legacy save migration and mismatched-save
preservation. The full F2/F3 outcomes remain in progress.

### Storehouse economy slice

Storehouses add completed friendly food/wood drop-offs, route-length selection
among reachable candidates, and cargo-preserving replanning on destruction or
navigation changes. The generic building menu consumes definitions; producers'
rally controls use registered product lists. The AI may build/resume/rebuild one
remote Storehouse using its own visible resource observation and bounded retries.
Both-seat runtime evidence covers costs, restart selection, deposits, destruction
and return to the surviving home drop-off. Focused checks cover wrong-team,
unfinished and disconnected choices, menu affordability, and AI recovery.
The prior schema-12 roster revision has an explicit compatible migration for this
addition; unknown revisions remain rejected and preserved. Town Center expansion,
defenses and cancellation/repair are still outstanding F2 work.

### Cancellation and repair slice

Construction, active/pending military and Worker queues, and research now have
explicit proportional refund semantics. Completed friendly structures support
paid Worker repairs, including interrupted save recovery and a zero-wood pause.
Contextual controls expose building cancellation and repair; the legacy Worker
queue has its own cancellation control. Both-seat runtime checks demonstrate
exact foundation refunds, proportional repair spending, preserved repair orders,
queue/research cancellation and remaining population reservations. The AI can
repair observed damage without repeating active work. Expansion Town Centers,
Watchtower defenses, and the F3 composition/progression roster remain outstanding.

### Town Center expansion slice

Town Centers now have a registered five-cell expansion footprint, 100 food /
400 wood cost, 60-second construction, 2,400 HP, five capacity slots, Worker
production and food/wood drop-off. Starting centers retain their existing map
placement/collision shape and compatibility Worker queue; they are selectable,
repairable and destructible entities. Expansion queues, rally points and cargo
routing use the shared production/building rules. Surviving units, paid queues
or an affordable reachable producer prevent elimination after a center is lost.
The deterministic policy can construct/resume one visible-resource expansion
and replace Workers at a surviving center. Procedural geometry and existing
captured Town Center art remain placeholders independent of authoritative rules.

### Watchtower defense slice

Watchtower is a non-production defense: 50 food / 150 wood, 35-second build,
three-cell footprint, 1,200 HP, seven-cell attack range and ten-cell sight from
its access perimeter. A completed tower deals eight unit damage every 1.25
seconds. It uses team visibility and the same pending-damage resolution as unit
attacks; unfinished towers cannot fire. Nearest inspected targets are chosen
with deterministic ties and rotating spatial scans capped at 64 enemy visits.
Idle scans back off for a quarter-second. Siege supplies the intended dedicated
defense counter in F3; the present numbers are provisional rather than final
balance. AI builds at most one tower for a visible threat near its own base.

### Shared combat classes and effects slice

Units and defenses now resolve hits through the same pure combat module. Content
specifies attack class, target tags, attack mode, armor, capability permissions
and matching tag multipliers. Damage is `max(0.5, base × completed technology
multipliers × matching tag multipliers − target class armor − technology armor)`;
ineligible targets take zero. Structure hits retain their own base damage.
Multipliers stack multiplicatively and armor effects add, with a stable technology
order. Existing Infantry/Archer upgrades retain their role scope; current and new
units derive effects from team completion state rather than rewriting entity stats.
Spearman declares its mounted multiplier for the following Stable/Rider slice.
Generic ranged-building access uses the content's mode/range. Gathering,
construction, repair and structure attacks use supported capabilities, and the
military selection control includes the full registered military roster.

### Stable and mounted roster slice

Stable supplies Scout and Rider through the shared producer registry. Its three-cell
foundation costs 200 wood, builds in 25 seconds and has 1,600 HP. Scout costs
40 food / 30 wood, trains in 16 seconds, uses one population, moves at 4.5 cells
per second and sees eleven cells; 60 HP and weak attacks make it reconnaissance
rather than a frontline fighter. Rider costs 85 food / 25 wood, trains in 20
seconds and uses two population. Its 130 HP, 3.8-cell speed and melee/pierce armor
support raids, while Spearman's mounted bonus remains a direct answer. These are
provisional numbers grounded in the first both-seat combat trades.

Mounted procedural placeholders share one instanced horse mesh per team and a
mounted silhouette at strategic zoom. Stable currently uses the procedural
Barracks presentation profile as its declared fallback. The bounded policy can
acquire/resume one Stable and train at most one Scout and two Riders, prioritizing
Spearmen for currently visible mounted threats. Workshop, siege, second-tier
progression and representative defended-position/scouting matches remain F3 work.

### Bounded technology progression slice

Military Tier II researches at any completed Town Center for 200 food / 150 wood
in 35 seconds. It enables military armor (Barracks, 100 / 100, 25 seconds) and
mounted forging (Stable, 120 / 100, 25 seconds). Armor adds one melee and one
pierce armor to Infantry, Spearman, Archer and mounted/siege tags; Workers stay
outside that scope. Mounted forging multiplies mounted damage by 1.2. Existing
Infantry forging and Archer fletching remain the initial weapon choices. Effects
resolve from completion state for current and newly produced units.

Shared research actions now derive prerequisites, ownership, completed-building,
economy, completion and single-active-project checks. HUD/contextual choices,
filtered AI options and Map Studio technology rewards enumerate the registry.
Checkpoint completion flags are generic; schema 18 explicitly migrates known
schema-17 state and validates active research at the correct surviving home as
well as constructed producers. AI acquires available progression after a viable
army while retaining food/wood reserves. Workshop/siege supplies the next concrete
tier unlock; representative raid, scouting and defended-position proofs remain.

### Workshop and siege slice

Tier II enables a three-cell Workshop (250 wood, 30 seconds, 1,600 HP). Siege
engineering researches there for 150 food / 150 wood in 30 seconds and unlocks
the Siege Engine: 80 food / 160 wood, 30-second training, three population,
90 HP, 1.8-cell movement, eight-cell range and a 2.5-second attack period.
Its siege-class hits deal six unit damage or 24 structure damage, multiplied
by two for defense tags. No area effect or projectile simulation is necessary
for this single-target role. Full-health both-seat checks show an engine at the
outer firing edge destroying a tower in 25 shots without return fire, while an
engine exposed inside tower range dies first. Rider defeats an engine with
112 HP remaining. These initial interactions inform provisional balance.

Procedural siege carts remain instanced and have a separate strategic silhouette;
Workshop declares the existing Range geometry as its placeholder. AI can build
one Workshop for a visible defense, acquire the unlock and train at most two
engines. Up to two engines assault the nearest inspected visible defense among
at most 64 candidates; army orders exclude those engines. Observed movement or
attacks preserve the order, a ten-second stall permits a retry, and loss of the
visible target returns them to army orders. Mixed-terrain/scouting/raid matches,
full CI and staging evidence are still required for claiming F3 completion.

### AI composition during siege acquisition

When a defense is visible, ordinary recruitment reserves the last two slots of
the twelve-unit military target for engines, including while the tier or unlock
is pending. Capacity planning uses the engine's registered three-population cost;
two free population triggers a House instead of leaving the counter unavailable.
The normal army and twenty-four-unit roster bounds remain in force. Losing sight
of the defense releases the counter reservation; no hidden target state is used.

The live acquisition check isolates the production policy and siege assault orders
while ordinary troops hold their opening positions. It purchases the tier, builds
one Workshop, researches engineering, trains two engines and demolishes the
opposing full-health tower from both seats. This component interaction proof does
not replace a full AI match. The separate Forked Vale reconnaissance/raid check
demonstrates fog discovery, retreat and a timely Spearman response in both seats.
Integration, staging and representative full-match evidence remain required.

### 2026-09-30 — Completion audit checkpoint

F1–F3 remain the active implementation scope; F4's complete variant and scale
proofs are separate. The following maps the original requirements to current
authoritative check surfaces, rather than declaring all acceptance complete.

| Requirement | Current proof surface | Remaining verification |
| --- | --- | --- |
| F1.1–2 registry, stable IDs, revision and compatibility | gameplay-definitions, ruleset-revision and ruleset-checkpoint checks | Integrated main CI remains the regression floor. |
| F1.3–5 shared actions, open roster, Spearman/House | roster-options runtime scenarios, roster UI, population and editor checks | Deployed Firefox empty-selection/catalog observation recorded in QA; local narrow-layout evidence retained. |
| F2.1 capacity and atomic reservations | population and production-lifecycle scenarios | No new implementation gap identified in these checks. |
| F2.2 reachable food/wood drop-offs | storehouse-routing tests and Storehouse runtime scenario | Runtime destruction/cargo proof complements disconnected-route selection tests. |
| F2.3 additional centers and survival | Town Center runtime and Worker exit scenarios | Corrected live both-seat expansion run passed at tick 4560; PR #252 integration/CI pending. |
| F2.4 defenses and counter | Watchtower and siege-defense scenarios, shared combat tests | Field-role and paid AI siege evidence cover distinct interactions. |
| F2.5 construction, training, research, repair lifecycle | base-lifecycle and production-lifecycle scenarios | Includes cancellation, interruption, repair funding and persisted reservations. |
| F3.1 shared deterministic combat | combat-rules tests and simultaneous lethal runtime scenario | Damage rules are documented in architecture/game bible. |
| F3.2–3 mounted/scouting and siege roster | mounted/siege roster scenarios, field-roles and siege-defense scenarios | These role fixtures do not claim one full match exercises every role. |
| F3.4 technology progression | progression and siege roster scenarios, research action tests | Both-seat purchase rejection, active/completed restart and rematch covered. |
| F3.5 bounded filtered AI | production/reconnaissance tests, paid siege runtime and contested-match scenarios | Live expansion passed; outstanding PR integration and final evidence review pending. |
| Early presentation binding | gameplay-presentation validation and runtime profile consumption | Full F4 interchangeability/animated asset proof is outside this goal. |
| Staging integration | Deployment fcc377e8 at abce656; readiness/assets/WSS and 250-unit gameplay smoke | Deployed contextual catalog and automatic art-deploy recovery observed separately in Firefox. |

Read the dated QA records for build identities, measured observations and limits.
A listed test is a proof surface, not an assertion that every original acceptance
criterion has passed merely because its filename exists. Final completion still
requires review of the results and integration of outstanding focused PRs.

### 2026-09-30 — F1–F3 integrated completion

F1–F3 and the early presentation binding are implemented and integrated in main.
PR #252 merged as `496d387` after all three CI shards passed at `c8539cf`; the
new live expansion check passed in CI at tick 4560. The requirement audit above
is resolved by those results together with the named registry, lifecycle,
combined-arms, progression, filtered AI, authoring and recovery runtime evidence.

Staging deployment `d0707391-06ce-4e74-9972-d74e4301ea93` succeeded at exact
merge `496d387bcd7d8b3d2a720ca53aa167b36a04d292`. Packaging/transport smoke and
a fresh 250-unit authored room passed readiness, both seats/reconnect, map
save/reload, elimination victory and synchronized rematch (`qa-staging-muo1git3`).
The deployed HUD observation and earlier narrow-layout evidence remain in QA.
These proofs establish the requested foundation; they do not certify final
balance, finished art, unassisted novice usability or full F4 variants/scale.
