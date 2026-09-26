# Audio direction · first 1v1 pass

The audio palette is original procedural Web Audio synthesis in `src/audio.mjs`. There are no recorded samples, external assets, dependencies, or third party licenses. Cues use soft woodlike triangle tones for commands, with short filtered-noise transients adding a little impact to attack and build acknowledgements. Production completion uses clear sine intervals, research completion a rising triangle C-minor triad, objective capture a rising A-major triad, and rejection a short rough downward tone. A finished building uses its own low two-part cue: a soft 185 Hz triangle followed after a short rest by a quiet 277 Hz sine, a low open fifth with no shared fundamentals with the 196/247 Hz triangle battle alert. Building loss uses a rough low sliding cue with separate fundamentals from match defeat. Match victory uses an upper-register rising A-major phrase, separated from the objective, production-complete, and selection pitches. The synthesized wind and sparse three note phrases sit well below the effects mix.

| Event | Player meaning | Trigger |
| --- | --- | --- |
| Selection | The new unit or building selection registered | Explicit selection action only |
| Move, attack, gather, build | The command was sent | Local command, once per order regardless of unit count |
| Rally point | A production building's spawn destination changed or cleared | Confirmed rally-point notice; distinct short two-note cue |
| Reject | The order or production request failed | Server notice or offline send |
| Queue | Production or research began | Server confirmation |
| Building complete | A friendly construction site becomes a finished production building | One friendly `complete: false` → `true` building transition; distinct low open-fifth cue with a 2.6-second cooldown |
| Production complete | A friendly unit finishes production | Friendly production queue transition or team notice, with a 2.2-second cooldown |
| Research complete | A friendly attack upgrade finishes | Friendly research completion notice; distinct rising triangle C-minor triad with a 2.6-second cooldown |
| Scenario reward | A timed event grants resources, units, or technology to the local team | Event notification lists affected teams; a light two-note cue is used, while opponent-only rewards stay silent |
| Battle, selected unit, base alert | A new fight, selected force taking damage, or building under attack | Aggregated friendly snapshot damage |
| Resource empty, base lost | Gathering must redirect or a friendly production building was destroyed | Server notice, with independent limits; base loss has its own rough low slide |
| Objective gained or lost, victory, defeat, draw | Match state changed | Server event or winner transition; victory has a distinct high four-note fanfare |

Combat uses one event decision per snapshot. Ordinary damage only signals a new engagement after nine quiet seconds. Selected force and base alerts have independent twelve second limits. There are no per-unit attack, hit, death, gathering, or footstep sounds: those would mask orders and scale with 2,000 units. Routine cues cap at twelve tonal voices, and at most two short filtered-noise transients can overlap them; critical alerts may use up to twenty tonal voices.

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

The first user gesture unlocks Web Audio. Match Controls has enable, overall volume, effects level, cue previews, an ambience/music toggle, a separate ambience level, playback status, and saved local settings. Effects and ambience levels each range from 0% to 200%; their 100% defaults preserve the existing mix. Cue previews use the current effects and master levels. The music phrase can be previewed on demand at the current ambience and master levels; this does not advance the periodic phrase sequence or change tactical ducking. An ambience level of zero skips scheduled music phrases. Muting, setting overall volume to zero, disabling both output paths, or hiding the tab suspends the audio context. Music phrases occur about every 34 seconds and yield for ten seconds after tactical alerts. The atmosphere ducks for 2.4 seconds under tactical alerts while respecting the selected ambience level. The audio mix can be judged during a full 1v1 playtest; the current levels are a first pass, not a measured loudness master.

## Critical sound captions · 26 September 2026

Match Controls can optionally show short captions for major audio cues, including combat warnings, objective changes, depleted resources, production milestones, scenario rewards, and match outcomes. Captions follow gameplay cue decisions, so they remain available when effects are muted, audio is unavailable, or playback has not yet been unlocked. Frequent command acknowledgements and selection sounds are left out because the interface already shows those actions and captions for them would crowd the battlefield. The match-result card has a higher stacking order than the transient caption and already displays the outcome.

## Critical alert distinction · 25 September 2026

The earlier base-loss and defeat cues shared two fundamentals (261.63 Hz and 196 Hz) and both descended as three-note motifs. Base loss now uses a low sawtooth-to-triangle slide with no shared fundamentals with the sine-based defeat motif. The focused audio policy scenario guards the exact oscillator profiles and pitch separation; speaker and headphone listening remains part of the broader mix review.

## Outcome cue separation · 25 September 2026

The original victory phrase reused both objective-gain pitches (392/493.88 Hz) and both production-complete pitches (392/587 Hz), so a match-ending event could sound like a louder routine confirmation. Victory now rises through A5, C-sharp 6, E6, and A6 (880–1760 Hz), clear of the objective and production pitches and above the selection sweep's 780 Hz ceiling. The focused audio policy scenario guards the four pitches and those separations. Listening on ordinary laptop speakers remains open because the fanfare now sits higher in the spectrum.

## Objective cue separation · 25 September 2026

Objective capture previously began on 392 Hz, the same note as production completion, and both used two rising sine tones. Capture now rises through A4, C-sharp 5, and E5 (440/554.37/659.25 Hz), a three-note A-major triad with no shared fundamentals with production completion or the match-victory fanfare. The focused audio policy scenario guards both cue profiles and their separation. Objective loss remains a separate lower, descending cue.

## Research completion cue · 25 September 2026

Research previously shared the two-note production-complete cue. Friendly Infantry Forging and Archer Fletching completions now use a separate three-note triangle C-minor arpeggio (C5/D-sharp 5/G5 at 523.25/622.25/783.99 Hz). It has no shared fundamentals with production completion, objective capture, or match victory. The audio policy scenario checks friendly-team routing, note profile, separation, and cooldown; enemy research notices remain silent.

## Scenario reward cue · 26 September 2026

Timed scenario rewards previously reused the objective-capture cue. They now use a short triangle/sine pair at 493.88 and 739.99 Hz. The server includes the actual affected team list so both-team, team-specific, and capture-triggered rewards route to the right player; opponent-only and ambiguous rewards stay silent. Objective capture remains tied to the separate ownership-change message. The focused audio policy scenario checks routing, profile, and cooldown.

## Rally point cue · 26 September 2026

Rally-point changes previously reused the worker-gather cue. Confirmed set and clear notices now use a short rising triangle/sine fifth at 466.16 and 698.46 Hz, with a 550 ms cooldown. Rejected rally orders keep the reject cue. The focused audio policy scenario checks notice routing, profile, and repeated-order limiting.

## Ambience loop seam · 25 September 2026

The wind texture now draws from a 12-second procedural buffer and crossfades its final and first 120 ms with equal-power gains, so its repeat interval is 11.88 seconds. At 48 kHz, the current loop boundary is 1.08× the ordinary 95th-percentile sample step; the original raw three-second loop seam was 4.91×. The unfiltered source RMS changes by 3% from the prior loop. The crossfaded `AudioBuffer` uses 2.18 MiB per audio context plus about 45 KiB of temporary edge samples. The focused audio policy scenario guards the boundary against exceeding 1.5× that percentile. This remains synthesized Web Audio with no added assets or third-party media; the measurements do not replace subjective listening.

## Command texture · 26 September 2026

The attack acknowledgement now has a sharper 3 ms onset and fast descending two-tone woodlike twang, with a quiet low impact and a brief airy noise tail. The build acknowledgement keeps its softer single transient. Both reuse one deterministic 90 ms noise buffer; transients have their own two-source cap and do not reduce the twelve-voice tonal budget. This stays local to Web Audio with no runtime download or asset license. Listening across speakers remains needed to judge the blend.

## Silent output state · 26 September 2026

When overall audio is enabled but both effects and ambience output are set to zero, the settings status reports `NO AUDIBLE CHANNELS` and the audio context stays suspended. Effects cues are not scheduled when the effects level is zero, so silent alerts do not duck audible ambience.

## Settings audition samples · 26 September 2026

The settings panel can preview every gameplay cue at the current effects and master levels, grouped into commands, progress, tactics, and match results. When critical captions are enabled, a preview also shows the mapped caption; command cues without critical captions remain identified by the sample selector. Preview playback bypasses gameplay cooldowns and does not trigger ambience ducking or increment the in-match cue counter, so players can compare the entire palette without changing match feedback state. A separate music-layer preview uses its own gain path, so it can be auditioned during a tactical duck without changing the live ambience mix.

## Cue recognition check · 26 September 2026

Audio settings also offers six shuffled samples: two each for move order, attack order, and match result. The player guesses before the cue label is revealed, and the page shows an overall score, per-category scores, and which category a wrong answer was mistaken for. The selected caption setting stays fixed for a run; with captions enabled, the normal result caption remains part of what the player sees. Scores stay in page memory only and are not saved or sent. This is a lightweight way to collect first-pass observations, not evidence that fresh players have already understood the cues. The result category currently samples victory; defeat and draw recognition remain outside this check.
