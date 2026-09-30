# UI sound direction

[Audio runtime](audio-design.md) · [Shared kit](audio-kit-plan.md) · [Regional palettes](vaelora-zone-audio-plan.md)

Creative specification, 30 September 2026, based on `src/audio.mjs`, `src/audio-policy.mjs`, `src/audio-event-profile.mjs` and the call sites in `src/main.js`. This is a source review and proposed sampled direction, not a listening test or an implemented replacement. The current fallback is synthesized. The ElevenLabs pilot supplies candidate ingredients for editing, not finished cues.

## The sound of commanding Vaelora

The commander handles worn wood, leather, muted iron and taut strings. A successful order feels like a small deliberate gesture. Finished work gets a short musical answer. Danger interrupts that intimacy with a rounded horn. Significant changes in the world receive a little luminous resonance.

Keep meaning consistent across regions: **gesture → acknowledgement; resolved phrase → completion; horn pattern → attention; longer cadence → match result**. Regional instruments can color these sounds later, but rhythm, contour and relative prominence stay stable. Azure and Ember share the grammar. Speech can be a later character layer; it is not needed for this first UI palette.

UI cues should be dry, centered and close, with immediate onset. They confirm an interface event rather than simulate a distant object. An attack order must not sound like a hit that has already landed; build/gather orders must not become long hammering/chopping loops. Gameplay foley and environmental activity belong to separate visible-event paths.

The durations below are final edited targets including audible decay, not generation settings. Request longer isolated sources when needed, then trim. Preserve useful contour from the fallback while replacing its electronic timbre. Exact pitches can be arranged from the D Dorian kit after measuring the generated pluck/horn sources; prompt text alone does not establish tuning.

## Routine commands

| Existing cue | Intended player meaning | Proposed sound and rhythm | Edited target |
| --- | --- | --- | --- |
| `select` | This group or building is now selected | One small rounded hardwood token tick, crisp but soft. No tune or long tail. Lightest sound in the set. | 60–100 ms |
| `move` | Go there | One warm short upward string gesture, optionally a faint leather brush beneath it. Smooth and open, one gesture. | 120–200 ms |
| `attack` | Commit to this hostile order | Dull iron contact with two tightly spaced low wood accents. Compact, firm, lower/drier than move; no horn or blade clash. | 180–260 ms |
| `gather` | Begin collecting | A small woody scrape with one light upward muted pluck. More textured and softer than move. Wood/food variants can change the scrape while keeping the gesture. | 140–220 ms |
| `build` | Begin this construction order | Two hollow wood taps, first low and second lighter, with a tiny settling sound. Workmanlike, no completion chord. | 180–280 ms |
| `rally` | Future units will assemble here | Two clear plucks separated enough to feel like a destination marker: low then higher, second gently held. Reserve horns for alerts. | 220–350 ms |
| `queue` | This production/research request has entered the queue | Two small token contacts, close together, with a barely pitched upward lift. Lighter and shorter than rally or completion. | 120–200 ms |
| `reject` | This action could not proceed, or this notice needs attention | One damped descending string gesture with a dry stop. Specific but courteous; no harsh buzzer or scolding voice. The text explains the reason. | 120–220 ms |

Selection variants can suggest a Worker with cloth/wood, Infantry with dull iron, Archer with a short string tick, and mounted units with subdued leather. Buildings can add a little hollow wood body. These should be tiny changes to the same selection gesture, not full creature noises or building performances. Start with the generic cue until variants prove useful.

## Work and economy notices

| Existing cue | Intended player meaning | Proposed sound and rhythm | Edited target |
| --- | --- | --- | --- |
| `complete` | A unit is ready | Two rounded plucked notes, rising and resolving, more spacious than queue. Small satisfaction, no fanfare. | 300–450 ms |
| `building-complete` | Construction has finished | Low wooden settling contact followed by two resolved string notes. Broader and weightier than unit ready. | 400–600 ms |
| `research-complete` | A capability has been gained | Three deliberate ascending plucks with one restrained glass harmonic on the final resolution. Clearer and more luminous than ordinary completion. | 450–700 ms |
| `scenario-reward` | A scenario has granted something to your seat | A rounded two-note answer with a soft resonant bloom, distinct from the three-note objective pattern. Generous rather than triumphant. | 350–550 ms |
| `resource-empty` | This source is exhausted | One hollow knock, then a falling muted pluck that ends decisively. A practical interruption, lighter than loss or rejection. | 220–350 ms |

Queue says “accepted”; completion says “ready.” Keep their spacing and tail different even when they share sources. Resource depletion uses hollow material and a stopped ending; rejection uses a damped string alone. Avoid musical victory language for routine income or production.

## Strategic attention and outcomes

| Existing cue | Intended player meaning | Proposed sound and rhythm | Edited target |
| --- | --- | --- | --- |
| `battle-alert` | A friendly force has entered a new engagement | One short rounded horn call with a slight rising finish. Attention, not panic. | 300–450 ms |
| `selected-alert` | The force you selected is taking damage | Two unequal horn calls, short then longer, with a falling contour. Directly addressed and more insistent than battle nearby. | 400–600 ms |
| `base-alert` | A friendly building is under attack | Two equal repeated horn calls with a clear gap and a firm low wood accent. Most insistent recurring warning; recognize it by rhythm, not only loudness. | 500–700 ms |
| `base-lost` | A local building has been destroyed | A short low wood break/settle followed by a descending horn fragment. Weight and finality, but leave room for continuing orders. | 600–850 ms |
| `objective` | A capture notice routed to this positive cue | Three clearly rising resonant plucks, with a restrained glass accent. Broad enough to mark a strategic change, shorter than victory. | 450–650 ms |
| `objective-lost` | A capture notice routed to this loss cue | Two descending resonant plucks, final note muted. Preserve the objective family timbre; no horn that implies attack. | 350–550 ms |
| `victory` | You won the match | Four rising resolved notes on warm strings, gently reinforced by wood and a restrained final resonance. Immediate recognizable opening, then a short release. | 900–1400 ms |
| `defeat` | You lost the match | Three falling notes on low viol/plucked strings; settled and dignified, no mocking flourish or horror sting. | 800–1200 ms |
| `draw` | Neither seat won | Two equal middle-register notes, balanced spacing and neutral sustain. No upward victory lift or downward loss contour. | 650–1000 ms |

These alert rhythms are proposals for authored samples; current synthesized alerts use different note shapes. Compare them in the recognition audition before replacing anything. Use one accepted horn source to construct the three alert rhythms so timbral inconsistency does not obscure the distinctions. Keep regional music from repeating these exact alert patterns.

`base-lost` is a legacy cue name: current notice routing can use it for any local building destruction, not only the last Town Center or match defeat. Its sound must not imply that the entire match is over. Capture routing currently sends an opposing team's capture to `objective-lost`; do not assume this means a previously owned point was taken from you. Captions and exact objective notices carry the detail.

## Quiet interface behavior

The reviewed cue set covers game commands, notices and outcomes. It does not establish a sound on every menu interaction. Proposed future behavior: a tiny wood tick for a committed menu action, a soft cloth slide for panel opening, and silence for hover, sliders, health changes and ordinary HUD updates. Do not reuse queue/completion sounds for settings changes. Connection recovery needs a dedicated calm status sound only if playtesting shows visual status is missed; do not route it to a battle alarm.

Repair, cancellation, Storehouse, Stable, Watchtower and Workshop do not need new sound families merely because they are new mechanics. A repair order can eventually use the work gesture, while cancellation can use a quiet stopped gesture. Their current routing should be checked before binding a new event: the existing rejection matcher also includes `CANCELLED`, and production/research notice matching contains named legacy cases. A profile binding cannot create a missing event or change its meaning. No routing changes were made for this proposal.

## Production recipes and pilot

The subsequent [subscribed-workspace browser pilot](audio-browser-pilot-2026-09-30.md)
completed one candidate for each of the seven families. Use its new flow for
audition; the plugin run below remains the historical failed attempt.

The [ElevenLabs audition flow](https://elevenlabs.io/app/flows/VGcpRXOM51rpg5l201Ex) contains three 20-second regional reference requests and four isolated ingredient requests: wood token, iron latch, muted gut-string pluck and restrained horn note. Exact prompts, node IDs and dispatch records are in the [pilot manifest](audio-zone-ui-pilot-2026-09-30.json). The earlier Timber & Thread pilot remains a separate draft.

The batch requested four takes per family; the provider accepted 12 starts and rate-limited 16 requests. Do not rerun the whole batch to fill missing takes. At least one start exists for all seven families. The full-batch estimate was 3,820 credits; it is not an actual charge receipt. Record completed outputs and any returned individual costs separately.

Final run outcome: one iron-latch candidate completed; all five music starts
failed with `Insufficient funds`, and the other six SFX starts failed quota
checks. The plugin reported four credits remaining against a 10,000-credit quota;
this is not the account's overall subscription balance. A subsequent browser
check showed Lawrence's Workspace on the Creator plan, with 122,236 credits
remaining out of 131,000. The plugin credential/workspace quota mismatch remains
unresolved. The completed source's
reported price is ten credits; billing settlement was not independently verified.
The candidate is available in the flow for audition. No generation was retried,
no billing was changed, and no source was imported into the game.

Build the first five recognition cues from accepted dry ingredients: move, attack, victory, defeat and draw. Edit rhythmic sequences on one timeline and export finished short cues; do not try to make a sound-effect model reliably perform exact composed pitches or timing. The horn and wood candidates also let us audition select and the three alert rhythms. Later source gaps are leather/cloth, hollow scrape, glass harmonic, low bowed phrase and short wood break; request them only after the pilot identifies what is missing.

For ordinary cues aim at one or two material layers, with the attack's two wood contacts treated as one edited rhythmic layer. Use small variant changes in texture, not timing or melodic direction. Keep finalized cues on the effects bus, mono/centered, with a tiny boundary fade and no avoidable leading silence. Imported originals remain intact. Pre-render the recipe rather than spawning several overlapping browser voices per command.

Sample bindings should set explicit cooldowns instead of inheriting the profile gate's 450 ms default. Begin near the fallback's existing per-cue values and keep long event gates for repeated alerts/depletion; tune only after rapid-order audition. Preserve critical priority, music ducking, captions, mute/unlock behavior and the current eight-sampled-cue limit. Do not emit these sounds once per soldier.

## Listening checks

Listen at a comfortable low level before judging at full volume. Compare move against gather, queue against complete, objective against victory, resource-empty against reject, and all three horn alerts. If a listener needs volume differences to distinguish alerts, change rhythm or timbre.

Use the existing ten-trial move/attack/victory/defeat/draw recognition check, first without captions and then with them. Also play a rapid-order sequence over each of the three regional music references, with completion and a base alert interrupting it. Check laptop speakers, headphones and mono. Reject harsh iron/glass, long tails, repeated clicks that accumulate, delayed attacks, unwanted accompanying sounds and any cue that falsely suggests a gameplay event has already happened.

The delivered specification is ready for composition and audition. Generation completion, source suitability, cue recognition and runtime integration are separate outcomes; none is established by this design document alone.
