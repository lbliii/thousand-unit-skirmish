# Audio direction · first 1v1 pass

The audio palette is original procedural Web Audio synthesis in `src/audio.mjs`. There are no recorded samples, external assets, dependencies, or third party licenses. Cues use soft woodlike triangle tones for commands, clear sine intervals for production completion and objectives, and a short rough downward tone for rejection. A finished building uses its own low two-part cue: a soft 185 Hz triangle followed after a short rest by a quiet 277 Hz sine, a low open fifth with no shared fundamentals with the 196/247 Hz triangle battle alert. The synthesized wind and sparse three note phrases sit well below the effects mix.

| Event | Player meaning | Trigger |
| --- | --- | --- |
| Selection | The new unit or building selection registered | Explicit selection action only |
| Move, attack, gather, build | The command was sent | Local command, once per order regardless of unit count |
| Reject | The order or production request failed | Server notice or offline send |
| Queue | Production or research began | Server confirmation |
| Building complete | A friendly construction site becomes a finished production building | One friendly `complete: false` → `true` building transition; distinct low open-fifth cue with a 2.6-second cooldown |
| Production complete | A friendly unit or research queue finishes | Friendly production queue transition or team notice, with a shared 2.2-second cooldown |
| Battle, selected unit, base alert | A new fight, selected force taking damage, or building under attack | Aggregated friendly snapshot damage |
| Resource empty, base lost | Gathering must redirect or a friendly production building was destroyed | Server notice, with independent limits |
| Objective gained or lost, victory, defeat, draw | Match state changed | Server event or winner transition |

Combat uses one event decision per snapshot. Ordinary damage only signals a new engagement after nine quiet seconds. Selected force and base alerts have independent twelve second limits. There are no per-unit attack, hit, death, gathering, or footstep sounds: those would mask orders and scale with 2,000 units. Routine cues cap at twelve oscillator voices; critical alerts may use up to twenty.

## Browser audit · 25 September 2026

I audited a local Forked Vale match with two browser seats connected (`2 / 2 ONLINE`). Both seats unlocked Web Audio through a user click; the settings panel reported `SOUND READY` at 50% volume, and neither browser recorded console errors. The client’s audio status counter records every cue actually scheduled by Web Audio.

| Match event | Live browser result |
| --- | --- |
| Selection and move | Selecting Azure’s workers and issuing a ground order scheduled `select` and `move` once each. |
| Gathering | Four workers ordered to the food node produced `gather`; the server confirmed `GATHER ORDER · 4 WORKERS`. |
| Construction | Barracks placement scheduled `build`; its pre-fix finish used the shared `complete` cue. On the updated client, an Archery Range placement scheduled `build`, then its `complete: false` → `true` transition scheduled `building-complete` once. A blocked placement scheduled `reject`. |
| Production | The Barracks confirmation scheduled `queue`; `AZURE INFANTRY READY` scheduled `complete`. |
| Objective | Azure’s 13-unit force claimed North Signal and scheduled `objective`. Ember’s attack-move later took the signal, and Azure scheduled `objective-lost`. |
| Combat | Ember sent 12 units into the selected Azure force. The HUD reported nine Azure unit defeats; Azure’s scheduled-cue counter advanced three times during the contest, ending on `objective-lost`. The two intervening callbacks came from the aggregated damage gate, rather than per-unit death sounds. |
| Result | The unclaimed Vale Watch deadline ended in a draw; both seats scheduled `draw` and displayed the result card. |

At the end of the match, Azure had scheduled 11 cues and Ember six. This run confirms event routing and gesture-safe browser playback; it does not replace a listening playtest on other speakers or output levels.

## Mix follow-up · 25 September 2026

Producer review caught that the first building-completion draft reused the battle alert's 196/246.94 Hz fundamentals. The updated cue uses 185/277.18 Hz (F-sharp 3 to C-sharp 4), a low open fifth with separate fundamentals and a short rest. In a two-seat follow-up at 50% volume, Azure's completed Archery Range scheduled `building-complete`; the incoming Ember attack then scheduled `selected-alert` while Azure workers were selected. The focused audio scenario compares the construction and battle-alert oscillator pitches directly. This browser run exercised selected-force damage during the attack; the original combat pass separately exercised the aggregated battle alert. Neither run is a subjective listening test across speakers.

The first user gesture unlocks Web Audio. Match Controls has enable, volume, and ambience/music controls, a playback status, and saved local settings. Muting, setting volume to zero, or hiding the tab suspends the audio context. Music phrases occur about every 34 seconds and yield for ten seconds after tactical alerts. The atmosphere ducks for 2.4 seconds under tactical alerts. The audio mix can be judged during a full 1v1 playtest; the current levels are a first pass, not a measured loudness master.
