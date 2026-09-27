# Audio and captions

[Documentation index](README.md) · [QA protocol](qa-vertical-slice.md)

## Direction

Audio should confirm commands and distinguish urgent events without becoming
constant noise during a large battle. All current sounds are synthesized with
Web Audio in `src/audio.mjs`; no sampled audio pack is required.

The [reusable audio kit plan](audio-kit-plan.md) proposes the next palette,
ElevenLabs source workflow, cue recipes and modular music. Its prompts are saved
as drafts; sampled audio and adaptive music are not yet integrated.

## Runtime responsibilities

| Module | Responsibility |
| --- | --- |
| `src/audio.mjs` | Synthesis, cue cooldowns, voice limits, ambience, ducking, and saved mix settings. |
| `src/audio-policy.mjs` | Which notices/events produce local cues and how combat alerts are gated. |
| `src/audio-recognition-check.mjs` | Shuffled recognition trials, answers, mix metadata, and optional copy action. |
| `src/main.js` | Gameplay integration, audio controls, and visible critical captions. |

Order cues include selection, move, attack, gather, build, rally, and queue.
Completion, research, rewards, objectives, depletion, battle/base alerts, and
victory/defeat/draw have distinct event roles. Cooldowns and voice budgets prevent
large armies from producing one sound per unit.

Critical captions follow the gameplay cue decision even before audio unlock or
when output is muted/unavailable. The match-result card takes precedence over
a duplicate outcome caption. Captions must not reveal a hidden event or enemy state.

## Settings

Defaults are audio enabled, master volume 0.5, effects level 1, ambience enabled,
ambience level 1, and captions off. Settings persist under `tus-audio-v1`.
The UI distinguishes waiting for audio unlock, muted, silent mix, and unavailable
output. Audition controls use the current mix; critical samples also show their
caption when captions are enabled.

## Recognition check

Audio settings offers ten shuffled trials: two each of move, attack, victory,
defeat, and draw. Players answer before the label is revealed and can choose
**Not sure** separately from a confident wrong answer. Results include mix and
caption settings and can be copied explicitly; nothing is sent automatically.

Run with fresh players, captions off and on, and record category results. Change
a cue in response to a specific confusion, then repeat the affected trials.
No automated sound-policy test establishes human recognition.

## Checks and evidence

```sh
node scripts/audio-policy-scenario.mjs
node scripts/audio-recognition-check-scenario.mjs
```

Browser checks should cover pre-unlock, mute, zero output, missing Web Audio,
rapid repeated orders, overlapping alerts, caption density, and ambience seams.
The [historical audio ledger](archive/2026-09/audio-design.md) retains the original
mix decisions, dated checks, cue revisions, and their limits.
