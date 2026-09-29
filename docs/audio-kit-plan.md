# Reusable audio kit — Timber & Thread

[Audio runtime](audio-design.md) · [Game bible](game-bible.md)

## Recommendation

Build a tactile fantasy sound: dry timber, worn leather and muted iron beneath
plucked strings, bowed viol, breathy flute and occasional luminous glass harmonics.
Warm, human activity fills the foreground; strange, spacious tones suggest a
larger world. **Timber & Thread** is the working name: physical materials and a
thin thread of enchantment connecting music, objectives and results.

This production proposal is dated 26 September 2026, based on source `511c25f`.
No new audio has been generated, auditioned or integrated. The current game uses
Web Audio synthesis. An editable [ElevenLabs pilot](https://elevenlabs.io/app/flows/0AXaIqI9tTLOyV3GGgDr)
contains ten ungenerated nodes; [the prompt manifest](audio-pilot-plan.json)
preserves exact prompts, settings and node IDs.

## From visual references to sound

The existing Infantry concept has quilted cloth, leather, a wooden shield and
restrained metal. From the user's original inspiration set, I also inspected
images 01, 04, 08, 11, 14 and 16: a luminous cyan desert crystal, smiling horned
traveler, armored skeletal figure, shadowed woodland archer, figure before a
bright portal, and violet-lit spellcaster.

The local source index is
`/Users/lb/Developer/thousand-unit-skirmish/meshy_output/art-direction-inspiration/references.json`.
These are mood references, not redistributed kit assets. The translations below
are design proposals, not user-specified instruments or new gameplay commitments.

| Visual quality | Sonic interpretation |
| --- | --- |
| Warm skin, cloth and worn equipment | Intimate plucks, breathing reeds, rounded impacts. |
| Teal/violet shadows and glowing highlights | Dark bowed drone with sparse high glass harmonics. |
| Expressive heroic poses and flowing cloaks | Broad melodic intervals, gentle swells, purposeful hand percussion. |
| Painterly surfaces and selective linework | Textured sustain with a clear short attack; room for silence. |

Use the mysterious color in music and major-event accents initially. Everyday
orders stay quick and physical. Azure and Ember share the sound grammar because
they are currently team identities. This does not introduce magic mechanics.

## A kit of ingredients and recipes

Maintain three levels: **source ingredients → editable recipes → exported cues**.
One good wood knock can supply selection, construction and percussion through
different timing and layering. Preserve the dry original and recipe so future
styles can replace materials without rewriting gameplay events.

### First complete kit target

Counts are accepted deliverables, not promised generation yields. Four takes can
produce fewer than four usable variants. Test the pilot before making this whole kit.

| Family | Accepted sources | Reuse |
| --- | --- | --- |
| Command materials | 3 wood knocks, 3 iron clicks, 3 cloth/leather movements | Selection, orders, rally, queue, rejection. |
| Work and combat | 4 axe hits, 4 hammer hits, 4 shield hits, 4 bow releases, 4 arrow impacts, 3 debris falls | Gather, build, combat, destruction. Keep attacks and impacts separate. |
| Travel | 4 earth steps, 4 grass steps, 4 gravel steps | All roles; equipment layers add identity. |
| Pitched signatures | 3 pluck articulations, 2 horn articulations, 2 glass tones | Completions, warnings, objectives, results. |
| Environment | Separate canopy wind, grass wind, water and gentle-fire loops | Blend by location; add wildlife later as separate spots. |
| Music | Hearth, Muster and Veil, each with A/B eight-bar sections | Economy, conflict and mystery respectively. |
| Music transitions | 2 bridges and 3 endings | Enter/release tension; victory, defeat, draw. |

The first four rows total 51 short source variants. Town Center, Barracks and
Range can first reuse work/wood/bow sources with distinct rhythms; add specific
building recordings when a generic recipe is confusing.

### Cue recipes

These are editorial targets. Preserve existing event names and caption/policy
gates in `src/audio-policy.mjs`.

| Existing cue | Proposed distinction |
| --- | --- |
| `select` | One light wood tick, about 80 ms. |
| `move` | Leather brush and one ascending pluck; 150–220 ms. |
| `attack` | Iron click and two tight low wood knocks; 220–300 ms. |
| `gather`, `build` | Soft scrape/pluck versus two hollow hammer contacts. |
| `rally`, `queue` | Brief horn/pluck answer versus two light token taps. |
| `reject` | Damped descending pluck, under 250 ms; caption gives the reason. |
| `complete`, `building-complete`, `research-complete` | Two-note pluck; wood plus resolved pluck; glass plus resolved pluck. |
| `scenario-reward`, `objective`, `objective-lost` | Bright answer; rising three-note figure; falling figure with muted final note. |
| `resource-empty` | Hollow knock and downward pluck. |
| `battle-alert`, `selected-alert`, `base-alert` | One short horn call; two unequal calls; two equal insistent calls. |
| `base-lost` | Low wood collapse and descending horn. |
| `victory`, `defeat`, `draw` | Rising resolved four-note phrase; falling three-note phrase; two equal neutral notes. |

Keep an immediate result cue even when a musical ending follows. Use at most two
layers for routine commands, pre-rendered where useful. UI cues are lighter,
drier and centered; world impacts have distance and material weight. Rotate
material variants without changing cue rhythm or pitch contour. Voice acting is
a later optional personality layer.

## Music that can be recomposed

Start at **96 BPM, 4/4, D Dorian**, using a D/A pedal and notes D–E–F–G–A–B–C.
One bar is 2.5 seconds; eight bars are 20 seconds. The identity motif is D–A–E
with a short-short-long rhythm. Arrange it explicitly in the editing session if
generation does not reproduce it. Muster occasionally uses 3+3+2 eighth-note
percussion accents.

Each family needs A/B sections with equal bar counts and compatible boundary
harmony. Initially export full mixes for sequential transitions. Independently
generated tracks with the same tempo/key prompt are **not synchronized stems**.
Measure actual tempo and pitch, edit downbeats, and inspect endings first.

Later, derive percussion, low bed and melody layers from one accepted performance
or arrange isolated sources against one timeline. ElevenLabs has a
[stem-separation API](https://elevenlabs.io/docs/api-reference/music/separate-stems)
with two- and six-stem modes. Separation may leave instruments grouped or audible
bleed; it does not guarantee clean flute, string and glass tracks. Use full mixes
when separation damages attacks. Stems must share sample count, start, tempo map
and tail treatment before playing simultaneously.

### Proposed adaptive behavior

- **Economy:** Hearth, with long quiet gaps and an occasional motif.
- **Sustained locally visible combat:** enter Muster next bar through a one-bar
  transition; increase rhythmic density before loudness.
- **Recovery:** after 12 seconds without eligible combat, return on a phrase
  boundary. Hold each state at least eight bars to avoid constant switching.
- **Exploration:** occasional Veil interludes driven by public scenario or local
  presentation state. Hidden enemy activity never changes the soundtrack.
- **Alerts/results:** duck music immediately for critical alerts. Results cancel
  queued transitions and play once. Reset state on rematch/reconnect.

These timings are tuning hypotheses. Add a separate music control when samples
enter the runtime; the existing ambience control governs both wind and sparse
synthesized music. Migrate saved settings explicitly. Start with one music mix
and up to two ambience beds, then measure before adding simultaneous stems.

## ElevenLabs production sequence

The account's Creator plan was verified in the browser. The plugin confirmed
`eleven_music_v2` and `eleven_text_to_sound_v2`, including duration, instrumental
and SFX loop parameters. The website advertises Music v2.5; the saved pilot uses
the v2 model exposed by the plugin.

1. **Pilot:** three 40-second music prompts and seven SFX prompts: wood, iron,
   shield, bow, leather, canopy and glass. Four takes per node produce 40 outputs,
   including eight generated minutes of music. The live estimate is **8,120
   credits**, with no blocking errors. Nothing has been generated or charged.
2. **Select/edit:** compare equal-loudness takes against the references. Cut
   phrases, isolate ingredients, make five recognition cues and a 60–90 second
   economy → battle → result demonstration. Retain rejection reasons so each
   prompt revision addresses one audible defect.
3. **Playable minimum:** integrate move/attack/results and one music family
   through a versioned pack manifest with synthesized fallback. Check Forked
   Vale matches before larger maps.
4. **Expansion:** fill inventory gaps based on confusing or missing events.
   Suggested first-iteration envelope: **25,000 credits total**, including the
   pilot, with 8,000 reserved for revisions. This is a planning allowance, not
   an instruction to spend it or change billing. Re-estimate each concrete batch.

Generate one action per SFX prompt, with isolated silence, immediate onset and
a dry tail. Source requests can exceed final cue duration. Use looping for beds
and check seams manually; keep incidental birds, fighting and music separate.
Preserve model versions. Reuse the saved flow; inspect an uncertain run's status
instead of starting it again. The prompt JSON is a production plan, not a runtime
asset manifest.

## Editing and runtime delivery

Keep original downloads byte-for-byte, editable project files and export recipes.
Edit at 48 kHz; 24-bit WAV working masters are suitable, but converting lossy
sources does not restore fidelity. Use mono for localized effects, stereo for
music/ambience. Choose browser delivery codecs after Chrome/Safari decode checks;
use decoded buffers and explicit sample loop points for precision loops.

Suggested pack structure: `sources/`, `sessions/`, `exports/`, `manifest.json`,
`PROVENANCE.md`. Names: `tus_<family>_<action>_<variant>_v001`.
Retain exact prompt/settings, generation ID, date, original hash/format and rights
record. Export metadata includes source IDs, trim/fade/gain/pitch edits, channels,
sample rate, hash, cue key, variation group, priority, gain and loop boundaries.
Music adds measured key, BPM, bars, transitions and a common stem timeline.

Start music near -23 LUFS integrated and keep final mixed true peaks below -1
dBTP, then tune by listening at the default master level. Match very short effects
by perceived loudness and headroom, not an integrated-LUFS number. Check mono,
laptop speakers and headphones, particularly harsh glass/iron overlap.

Extend `src/audio.mjs` behind its current cue API. Preserve cooldowns, caption
decisions and ducking. World foley needs a separate visible-event path; a sample
alone does not create one. Filter by visibility/distance and aggregate activity;
never emit a footstep or hit per soldier at army scale. Bound buffers and sources,
reserve capacity for orders/results, and shed decorative foley first. Measure
the sampled mix before revising current voice limits.

## Acceptance

- **Sources:** clean onset/tail, no unintended voices/music, useful variants and
  recognizable materials at low volume.
- **Loops:** ten browser repetitions without clicks, drift, obvious seams or
  stacking tails; test every allowed transition and mono sum.
- **Recognition:** existing ten-trial move/attack/victory/defeat/draw check.
  Initial target: at least 8/10 per fresh player with three players; record
  category errors and retest recurring confusion, captions off and then on.
  This small sample diagnoses problems; it does not prove general usability.
- **Gameplay:** pre-unlock, mute, zero volume, failed download/decode, rapid
  orders, overlapping alerts, reconnect, results and rematch; no hidden-state cues.
- **Scale:** record active sources, memory and downloads in a representative
  large match, with build/map, camera, mix settings, hardware and observations.

## Music rights boundary

The current [Eleven Music terms](https://elevenlabs.io/eleven-music-model-specific-terms)
exclude Studio Games from Creator media rights, defining them as monetized games
available through more than one platform. They also restrict music-library and
repository distribution. Treat this as an internal production kit embedded in
the game; do not assume standalone library or public source-master distribution
is covered. Confirm the release model with ElevenLabs before commercial
multiplatform launch. Planning and auditioning can proceed. Record SFX rights
separately from music rights.

## Checkpoint

Delivered: palette, inventory, cue recipes, music arrangement rules, runtime
proposal, acceptance checks, ten editable draft nodes and a live credit estimate.
Next outcome: an auditionable pilot and edited gameplay sequence. Audio quality,
player recognition and runtime improvements remain untested.
