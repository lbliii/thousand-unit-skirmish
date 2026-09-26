# Thousand Unit Skirmish — Game Bible

- **Working title:** Thousand Unit Skirmish
- **Document:** 0.1 · 25 September 2026
- **Prototype baseline:** 0.95

This is the living design contract for the project. It records what the prototype already does, what the next playable product should feel like, and which questions are still open. It is not a promise to reproduce any one commercial game.

## 1. The promise

Build a polished, invite-first online RTS skirmish playground where friends command very large armies, fight over readable terrain and objectives, and make their own scenarios.

The near-term product is a complete multiplayer skirmish and a useful map/scenario editor. **There is no campaign in the current goal.** A campaign, a large technology tree, ranked matchmaking, and a roster of many asymmetric factions are outside the first vertical slice.

The project is browser-first today. Treat desktop mouse and keyboard as the interaction baseline while the large-army command model is being proven.

## 2. Design pillars

### Command the crowd

One clear order should move a formation coherently. Selecting, grouping, routing, and redirecting hundreds of units should feel deliberate rather than fiddly. Players should be able to zoom out to command the battle and zoom in to read important local events.

### Terrain creates decisions

Chokes, resources, sightlines, and capture zones should shape where armies go and what players value. A map should make at least one interesting choice visible before the first order is given.

### Every match can be authored

Players should be able to create a map or objective scenario, validate it, save it, and bring another player into it without needing to understand engine internals. Triggers should be understandable from their names and in-game feedback.

### Readability survives scale

Team, unit role, selection, health, order state, and objective ownership must remain legible with a crowded battlefield. Visual effects and UI decoration must not hide the tactical picture.

### Online play earns trust

Players receive a clear response to each command. A lost connection or recovering match explains what happened and gives the player a reasonable path back in. The server remains authoritative over match state.

## 3. Taste floor

These are review gates for gameplay, interface, maps, art, audio, and online features.

- **The first glance explains the match.** The viewer can locate both teams, the important route, the main objective, and the current selection without reading a manual.
- **Commands feel acknowledged.** A selection, move, attack, build, or rejected order produces immediate and specific feedback. No important input fails silently.
- **Large armies look composed.** Formations move with purpose; units do not read as an undifferentiated particle cloud. Local combat remains understandable inside the larger battle.
- **The world feels authored.** Maps have a clear focal point and visual rhythm. Terrain, objectives, resources, and bases look like parts of one world rather than editor primitives.
- **The interface is game UI, not a debug panel.** Keep the current dark pine and warm field palette, but give essential labels comfortable reading size, strong hierarchy, and enough room to breathe. Tiny technical labels may support secondary diagnostics; they cannot carry essential play information.
- **Feedback is informative and restrained.** Selection rings, health, damage, objective changes, and alerts communicate different things at a glance. Effects should clarify events without flooding the screen.
- **Custom scenarios fail clearly.** Invalid or unreachable setups explain what needs fixing before players launch them.
- **The multiplayer path is dependable.** Joining, reconnecting, victory, rematch/reset, and server recovery are understandable to both players.
- **Content is original.** Study other games for lessons; create original code, art, audio, names, maps, and writing. Do not copy proprietary assets or game data.

## 4. Match fantasy and loop

The player is the commander of a people and army, not a named hero. The pleasure comes from making a plan, issuing a broad order, watching the force respond, and adapting when terrain or an opponent disrupts that plan.

The intended skirmish loop is:

1. Join a friend by invite and understand the map and objective.
2. Gather and spend resources, build a small infrastructure, and choose what to produce.
3. Divide the army into useful groups and move through the map's routes.
4. Contest objectives, engage the opponent, and react to scenario events.
5. Reach a clear victory state, then offer a straightforward rematch or a different authored scenario.

The first complete match should have a readable opening, meaningful mid-game choices, and an ending players can explain. Match length and economy pacing are open tuning targets; do not make a long match the goal by itself.

## 5. Mechanics checklist

### Present in prototype 0.95

- [x] Two authoritative teams: Azure and Ember.
- [x] Large unit rosters, with local performance scenarios exercising 2,000 total units.
- [x] Single, box, class-based, double-click, and control-group selection.
- [x] Box, line, and column formation destinations; move, attack, attack-move, direct attack, and queued waypoints.
- [x] Workers gather food and wood; Town Centers train workers; Barracks and Archery Ranges construct and produce military units.
- [x] Basic upgrades, building rally points, population limits, and production queues.
- [x] Capture zones, prerequisite-gated objectives, victory conditions, deadlines, timed rewards, and linked scenario events.
- [x] Fog of war, tactical minimap, shipped maps, and host-authored Map Studio maps/scenarios.
- [x] Invite rooms, authoritative match workers, reconnect windows, and checkpoint recovery.

These checkboxes describe implementation, not finished-game quality or balance.

### Gate for the first vertical slice

- [ ] A new player can join an invite and understand the controls and objective without developer coaching.
- [ ] One authored scenario carries a full match from opening economy to victory, with at least two viable strategic responses.
- [ ] Army commands remain predictable through chokes, combat, new buildings, and reconnects.
- [ ] Map Studio can produce, validate, export, and reload that scenario without hand-editing JSON.
- [ ] Both players see clear order results, objective changes, match end, and rematch/reset state.
- [ ] A deployed 1v1 match is exercised under realistic latency and packet loss. Local simulation benchmarks are not presented as internet-capacity evidence.
- [ ] A 2,000-unit total stress run meets the agreed simulation and network budgets on intended hosting hardware. Set the network budget from measured playtests before claiming a capacity target.
- [ ] A small external playtest can finish a match and describe what decisions mattered and what felt confusing.

### Explicitly later

Player accounts, public matchmaking, ranked play, persistent progression, campaign missions, many factions, a broad technology tree, and fully general scripting can be considered after the vertical slice earns them.

**Future terrain idea — worker-dug earthworks.** Workers could dig trenches and canals from a river or coast toward a farm, mill, industry, or other useful site. A dry trench might instead form a soft defensive line that slows crossing. Explore water flow, useful destinations, pathfinding, counterplay, and how dug ground is filled or repaired in a small playable experiment later. This is an idea to revisit, not a current milestone or assigned build.

## 6. Visual direction

### Battlefield

**Working target:** a handcrafted, stylized medieval frontier seen from an oblique orthographic camera. Keep enough shape and color variation to make the field inviting, while keeping silhouettes simple enough to read at army scale. The target is a coherent illustrated world with depth and material character, not photorealism and not bare debug geometry.

- **Composition:** clear lanes, landmarks, resource clusters, and objective silhouettes. Use height and value contrast to separate passable ground from obstacles.
- **Palette:** moss, muted grass, weathered stone, timber, and water; warm daylight and light atmospheric depth. Reserve bright colors for teams, selected units, alerts, and important orders.
- **Teams:** Azure uses a cool sky-blue identity; Ember uses warm rust/terracotta. Carry those colors through banners, cloth, building details, UI, and map markers. Do not rely on hue alone; use shape, outline, and labels as backup signals.
- **Units:** workers, infantry, and archers need distinct silhouettes and visible carried tools or weapons. At strategic zoom, role and team should survive even when individual facial detail cannot.
- **Buildings:** recognizable rooflines and footprints at a glance. Team trim identifies ownership; the structure's own material still belongs to the world.
- **Animation:** prioritize readable idle, walk, turn, attack, gather, build, train/spawn, hit, and defeat states. Give formations a common intent without making every unit move in lockstep.
- **Effects:** use short, localized signals for orders, projectile impacts, damage, capture, and victory. Keep persistent glow and screen shake rare.

### Interface

The current visual language is a dark pine command board over a warm green battlefield: subdued panels, soft borders, parchment-like text, and restrained lime interaction accents. Azure and Ember are the primary team colors; amber and leaf green identify resources.

Keep the useful hierarchy and compact tactical framing in `style.css`, while raising essential control and status text to comfortable play size. Use color, icon, and wording together. Avoid expanding the interface into a wall of technical counters during ordinary play.

### Existing visual baseline

The prototype uses an orthographic oblique camera, flat-shaded instanced unit meshes, seeded tile color variation, low-poly terrain blockers and trees, and simple geometric buildings. This is a performance-conscious placeholder style. The vertical slice should make the battlefield feel authored without sacrificing the 2,000-unit readability and rendering budget.

## 7. Character and world tone

There is no named cast, campaign plot, or fixed lore bible yet. Azure and Ember are currently team identities, not finished cultures. Keep characterization at the level the skirmish needs:

- The player supplies the central personality through their strategy and command style.
- Teams should gain recognizable identity through visual kit, building shapes, banners, unit silhouettes, and short match language before we write deep lore.
- Announcements are brief, active, and specific: who did what, where, and why it matters.
- The working tone is confident, human, and adventurous, with occasional dry warmth. Avoid grimdark cruelty, constant quips, lore dumps, and faux-historical claims.
- Unit acknowledgements, if added, should be short and varied enough not to become noise. They should confirm the order or signal a problem.
- Scenario names such as *Stone Pass*, *Cinder Ridge*, and *Three Crowns* suggest a frontier of contested routes and landmarks. Treat that as a useful seed, not established canon.

### Characterization checklist

- [ ] Azure and Ember have identities beyond blue and orange before faction asymmetry is introduced.
- [ ] Unit and building silhouettes reinforce role and team at ordinary camera zoom.
- [ ] Scenario writing adds stakes and place without interrupting play.
- [ ] Callouts say what changed and use consistent terms with the HUD and editor.
- [ ] Any future lore can coexist with user-authored maps and scenarios without requiring campaign continuity.

## 8. Map and scenario standards

Every shipped map should have a clear tactical question: hold a pass, divide attention between objectives, secure scarce resources, or survive a timed threat. Use symmetry when it improves a fair contest; use asymmetry only when both players have meaningful responses.

- Show spawn locations, routes, resources, and objective zones clearly.
- Give important objectives enough space for a real contest at large army sizes.
- Make prerequisite chains and timed triggers legible in the editor and during play.
- Avoid unreachable objectives, accidental resource traps, and triggers whose result is surprising or irreversible without warning.
- Test the map with both player assignments and at the intended army size.
- Make authored text concise and editable; the scenario should still make sense when names or teams change.

## 9. Online and technical design constraints

- The server is the authority for match rules, movement, combat, economy, objectives, and victory.
- The 30 Hz simulation and 2,000-total-unit local scenarios are engineering baselines, not promises of target-device or internet performance.
- Keep the command path responsive and snapshots within measured per-client bandwidth and CPU budgets.
- Invite-only play is the first online product. Add accounts and public matchmaking only when they solve a demonstrated playtest need.
- Preserve room isolation, reconnect behavior, and recovery as player-facing quality features, not invisible infrastructure details.
- Evaluate network frameworks against the existing transport with workload measurements before adopting them. Framework choice must serve the match experience and operations.

## 10. Reference studies

These are study targets, not content to reproduce. For each study, write down the specific observation and the design decision it informed.

| Reference | Study for | Project boundary |
| --- | --- | --- |
| [Age of Empires II: Definitive Edition](https://www.ageofempires.com/news/ageii-de-on-console-is-out-now/) | The genre promise around economy, unit production, map control, and custom match variety. Compare how information stays readable at zoomed-out scale. | Use it to test our assumptions about familiar RTS loops. Do not copy civilizations, campaign writing, art, sounds, names, or data. |
| [openage source repository](https://github.com/SFTtech/openage) | Technical and feature-coverage study for simulation boundaries, entity behavior, pathfinding, and the broader RTS feature space. See the [source study](references/openage-study.md) and [feature coverage inventory](references/feature-coverage-inventory.md) for findings from a pinned checkout. | Its material is broad but scattered across reverse-engineering notes, engine design, and speculative ideas. It is a reference, not a dependency, scope promise, or implementation plan. Keep this project’s code and assets original. |
| [Warcraft RTS I–III](https://news.blizzard.com/en-gb/article/24148499/catch-up-on-the-future-of-warcraft-with-the-warcraft-30th-anniversary-direct) | Study classic controls, Warcraft II's naval map play, Warcraft III's heroes and faction asymmetry, custom maps/editor, visual silhouettes, and modern quality-of-life features. See the [Warcraft feature inventory](references/warcraft-rts-inventory.md). | Distinguish the Warcraft RTS games from *World of Warcraft*, which is an MMO. No Warcraft setting, characters, art, or assets are part of this project. Campaigns are out of scope; heroes and naval play remain open/candidate mechanics. |

### Reference note template

When adding a reference, record:

1. **Source and date checked** — direct link to the game, paper, source repository, or developer writing.
2. **What we observed** — a concrete mechanic, visual treatment, interface pattern, or technical idea.
3. **What we take forward** — the player need or principle, expressed in our own design.
4. **What we leave behind** — any difference in scale, tone, implementation, audience, or constraints.

## 11. Open decisions

- What is the intended ordinary match length and resource pacing?
- Is 1,000 units per team a regular match target, or a stress ceiling with smaller default games?
- How much faction asymmetry can we add without weakening the large-army command model?
- Does the intended setting stay low-fantasy frontier, or grow into more overt fantasy?
- Does “Warcraft” as a reference mean Warcraft I–III, *World of Warcraft*, or both for different purposes?
- What production visual reference or moodboard best expresses the user’s taste floor?
- Which target server hardware and internet conditions define the online performance gate?

Resolve these through a playable scenario, a reference study, or a focused playtest; do not silently turn an open question into canon.
