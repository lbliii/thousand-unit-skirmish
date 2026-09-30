# Warcraft RTS study

[Documentation index](../README.md) · [RTS coverage](feature-coverage-inventory.md)

**Historical reference study:** 25 September 2026. Its scope is Warcraft I–III
and their recorded remaster/Reforged presentations, rather than World of Warcraft,
Rumble, or Heroes of the Storm. This project uses original setting, assets, names,
maps, and writing.

The [full reference ledger](../archive/2026-09/warcraft-rts-inventory.md) retains
the original feature comparisons and official source links. Those observations
are dated research; they do not assert current upstream product features.

## Questions to carry into this project

| Study topic | Project question |
| --- | --- |
| Direct orders and classic-control improvements | Are selection, right-click orders, feedback, and information comfortable at our much larger group sizes? |
| Distinct unit/faction silhouettes | Can players identify role and ownership at normal/strategic zoom without relying on hue alone? |
| Naval map play | Would another traversal family improve a proven land game enough to justify its pathing/transport/content scope? |
| Heroes, items, abilities, and neutral sites | Would a focal unit or site clarify the large-army game or distract from it? Test later, separately. |
| Scenario editors and custom modes | Can Map Studio expose useful objectives/events while remaining understandable and validated? |
| HUD, hotkeys, and feedback | Can players discover actions without giving up fast keyboard control? |
| Online service/replay features | Which observed playtest need warrants accounts, ranking, replay, or public discovery? |

## Scope decisions

Selection, readable teams, economy, production, objectives, editor usability, and
reliable invite play support the current slice. Heroes, naval combat, broad faction
asymmetry, items, and large ability systems remain later candidates. Campaigns
and public ranked service remain outside the first slice.

Judge a borrowed principle against the [game bible](../game-bible.md), then test
it in an original scenario. Keep historical reference descriptions separate from
current project coverage and milestone evidence.

## 2026-09-30 — Renewed feature and tools research

Reviewed official Blizzard editor guidance, classic unit-command/hotkey guides,
hero, creep, day/night and upkeep guides, replay FAQ and Reforged 2.0 notes.
These document reference capabilities across releases; this is not a hands-on
audit of the latest Warcraft executable. Local source baseline is `b61e167`.

[Blizzard's editor guide](https://news.blizzard.com/en-us/article/23395649/revisiting-the-warcraft-iii-editor)
identifies terrain/regions, triggers/scripts, sound, object data, AI, object and
asset management, plus map testing and custom lobbies. Our map painter and
capture/supply event editor cover only a subset. The highest-value missing tools
are named entities/regions, general bounded event-condition-action authoring,
scenario debugging, map-local content editing and portable dependency packaging.

[Classic commands](https://classic.battle.net/war3/basics/unitcommands.shtml)
include Stop, Hold Position, Patrol and attack-ground alongside Move/Attack.
[Hotkey/subgroup guidance](https://classic.battle.net/war3/basics/specialcommands.shtml)
also documents Follow and cycling command subgroups. Our formations, control
groups and queued movement are useful, but these missing commands and mixed-group
interaction semantics deserve explicit design and acceptance checks.

[Heroes](https://classic.battle.net/war3/basics/heroes.shtml),
[neutral creeps](https://classic.battle.net/war3/neutral/creepbasics.shtml),
[day/night](https://classic.battle.net/war3/basics/daynight.shtml) and
[upkeep](https://classic.battle.net/war3/basics/upkeep.shtml) expose separate engine
families: experience/items/abilities, neutral ownership and rewards, time-dependent
vision/regeneration, and population-dependent income. None exists as a general
system here. These are optional design directions, not requirements for a strong
large-army RTS. In particular, Warcraft upkeep explicitly supports smaller armies.

[Replay functionality](https://classic.battle.net/war3/faq/replays.shtml) and
[2.0 interface options](https://news.blizzard.com/en-us/article/24167122/warcraft-iii-reforged-patch-notes-patch-2-0-0)
make replay review, configurable keys, scalable HUD and player-facing diagnostics
useful comparison targets. Our checkpoints are recovery state, not a replay.
Warcraft II's [naval scope](https://news.blizzard.com/en-us/article/22940764/warcraft-orcs-humans-and-warcraft-ii-battle-net-edition-now-available-on-gog-com)
remains another separate engine investment.

Recommendations and local audio wiring are recorded in the
[coverage assessment](feature-coverage-inventory.md). Existing scope boundaries
remain in the game bible; this research does not authorize those optional systems.
