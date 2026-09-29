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

`BUILDING_RULES` already describes Barracks and Range, but each names one unit
kind. Unit stats/costs and research effects still contain role-specific branches.
`src/pve-production.mjs` duplicates opening costs and assumes Barracks/Infantry;
`src/selection-context.mjs` enumerates the three current kinds. Population
reservations enforce safety caps; they do not yet provide a house-based economy.
Visual-state helpers and sprite/GLB formats exist, but a common presentation
binding and animation-capability boundary must be established. Renderer v1 is
static rigid geometry, not an implemented skeletal-animation contract.

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
