# Simultaneous lethal combat — 2026-09-27

## Finding

No arbitrary seat or unit-ID advantage was reproduced on main
`664ecb6cf22d160b42ddabb0fb403fbc56b1257d` for equal units whose lethal attacks
are due on the same simulation tick. Production combat logic is unchanged.

The game bible requires the same rules for both human seats and the solo
opponent. Current mechanics explicitly stage unit damage during attack
resolution, then apply it after every living unit has acted. A lethal hit cannot
cancel another hit already due on that tick. Opening cooldowns are seeded by
team roster slot. These rules were introduced in
`2e67353969a82be1cf223d6e65b8f31b4ab20e53`; this audit protects their behavior.

## Actual-server fixture

```sh
node scripts/simultaneous-lethal-combat-scenario.mjs
```

The test publishes a small empty battlefield, records its normal checkpoint,
then restores controlled in-range duels in isolated server processes. The fixture
sets health, target orders, and cooldowns to make exact tick comparisons possible;
it does not claim to reproduce command arrival timing in an ordinary match.

Eighteen cases cover Worker, Infantry, and Archer, with Azure and Ember each
assigned the lower unit ID:

- One hit of health and both attacks immediately due: both hits land on the
  same tick and mutual elimination produces a draw.
- Three hits of health and equal initial cooldowns: all three observed attack
  ticks match between seats; repeated intervals are consistent; both units die
  on the same final tick.
- One hit of health with staggered cooldowns: the due attacker wins, regardless
  of its seat; the future counterattack never fires early.

The initial checkpoint also checks matching opening cooldowns by roster slot.
Each restored fixture has zero food and no production so elimination cannot be
postponed by economic recovery. Results are checked against the authoritative
checkpoint, including both health values, final attack ticks, winner, and reason.

## Pinned source comparison

Inspected OpenRA at `b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787`:

- [`World.Tick`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Game/World.cs#L450)
  advances simulation actors and traits during an unpaused world tick.
- [`Health.InflictDamage`](https://github.com/OpenRA/OpenRA/blob/b4f3d8ae02b6bd6f4a3a5441e6d0daf7c5073787/OpenRA.Mods.Common/Traits/Health.cs#L160)
  ignores additional damage to an already-dead actor and updates health during
  the damage call. That method alone does not establish simultaneous-hit
  semantics; attack scheduling and effect lifetime also matter.

The comparison reinforces the need to test this project's explicit staged-damage
rule instead of inferring fairness from deterministic iteration. No upstream
code was copied and no balance, cadence, projectile, or targeting rule changed.

## Limits

This isolates damage already due, not acquisition latency, command/network order,
movement separation, target selection, mass-fight balance, or terrain effects.
Those mechanisms can create intentional or unintended asymmetry and need their
own matched fixtures before any broader fairness claim.
