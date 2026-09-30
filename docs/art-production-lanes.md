# Art production lanes

[Documentation index](README.md) · [Asset guide](assets.md) · [Working rules](../AGENTS.md)

## Responsibilities

| Lane | Primary output |
| --- | --- |
| Environment | Ground materials, water, shorelines, regional terrain, landmarks. |
| Vegetation and props | Trees, shrubs, rocks, resources, and depletion variants. |
| Unit characters | Worker/Infantry/Archer silhouettes, equipment, team cues, action samples. |
| Building architecture | Eight-building roster identity, scale, construction, damage, and ownership cues; see the [building atlas plan](building-atlas-production-plan.md) and [first-civilization style](frontier-civilization-art-style.md). |
| Technical art | Materials/atlases, UV/export conventions, manifests, validation, repeatable previews. |
| Art direction | Shared palette, finish, silhouette, and gameplay readability feedback. |
| Maps | Placement, routes, density, regional composition, and playable scenarios. |
| Renderer | Loading, batching, state mapping, LOD, animation, captures, and performance. |

These name primary outcomes rather than exclusive files or an approval sequence.
A small asset can include several crafts. Coordinate only the shared interface
or conflicting edit that blocks the work.

## Current integration priorities

The [asset guide](assets.md#know-what-is-actually-in-game) owns loader status.
Building sprites now have runtime and packaging paths. Building work should
check registration, state transitions, team cues, and ground contact in that
path. Unit character work should build from the manifest-driven sprite runtime
and check role readability, action mapping, and batching at game scale. Environment
work should preserve resource/depletion meaning, routes, and forest-clearing feedback.

Choose one visible outcome, name its pack and consuming loader, and state the
smallest useful proof. When a source sample has no loader yet, identify that
boundary in its README so a later contributor can integrate it without guessing.

## Small useful deliveries

A few compatible tree silhouettes, one shoreline treatment, one unit role,
one building lifecycle, or a material/export sample can each be a complete slice.
Include editable sources, intended runtime files, manifest/provenance, a focused
preview when available, and clear integration limits.

Source samples may ship before a loader or final polish. Runtime integration
uses the relevant contract and proportionate checks. Full art matrices and
2,000-unit measurements support M2/M3 claims, not every asset PR.

Keep unit characters and buildings as separate outcomes. The original
Worker/Barracks v0.2 source sample was explicitly released for its author-owned
merge; later polish or capture work does not reopen that publication hold.

Use code, PRs, and named captures as shared state. Follow the repository's
[working rules](../AGENTS.md) for integration and staging; production promotion
and new paid-provider work retain their separate authorization boundaries.
