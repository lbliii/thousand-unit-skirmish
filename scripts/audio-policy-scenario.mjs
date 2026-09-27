import assert from 'node:assert/strict';
import { CombatAudioGate, cueForNotice, cueForScenarioEvent, isLocalRejection } from '../src/audio-policy.mjs';
import { createGameAudio, readAudioSettings } from '../src/audio.mjs';

assert.equal(cueForNotice('MOVE ORDER · 400 UNITS', { localTeam: 0, tokenized: true }), null);
assert.equal(cueForNotice('MOVE REJECTED · TARGET UNREACHABLE', { localTeam: 0, tokenized: true }), 'reject');
assert.equal(cueForNotice('WORKER QUEUED · 1/5 · 50 FOOD', { localTeam: 0 }), 'queue');
assert.equal(cueForNotice('RALLY POINT SET', { localTeam: 0 }), 'rally');
assert.equal(cueForNotice('RALLY POINT CLEARED', { localTeam: 0 }), 'rally');
assert.equal(cueForNotice('RALLY POINT REJECTED · CHOOSE GROUND ON THE MAP', { localTeam: 0 }), 'reject');
assert.equal(cueForNotice('AZURE BARRACKS COMPLETE · TRAIN INFANTRY', { localTeam: 0 }), 'complete');
assert.equal(cueForNotice('EMBER BARRACKS COMPLETE · TRAIN INFANTRY', { localTeam: 0 }), null);
assert.equal(cueForNotice('AZURE INFANTRY FORGING COMPLETE · +20% ATTACK', { localTeam: 0 }), 'research-complete');
assert.equal(cueForNotice('EMBER ARCHER FLETCHING COMPLETE · +20% ATTACK', { localTeam: 0 }), null);
assert.equal(cueForNotice('EMBER ARCHER FLETCHING COMPLETE · +20% ATTACK', { localTeam: 1 }), 'research-complete');
assert.equal(cueForNotice('ARCHERY RANGE PLACED · WORKERS BUILDING', { localTeam: 0, tokenized: true }), 'build');
assert.equal(cueForNotice('AZURE BARRACKS DESTROYED · PRODUCTION QUEUE LOST', { localTeam: 0 }), 'base-lost');
assert.equal(cueForNotice('EMBER BARRACKS DESTROYED · PRODUCTION QUEUE LOST', { localTeam: 0 }), null);
assert.equal(cueForNotice('RESOURCE NODE EMPTY · OAK-2', { localTeam: 0 }), 'resource-empty');
assert.equal(cueForNotice('AZURE WORKER READY', { localTeam: 0 }), 'complete');
assert.equal(cueForNotice('UNIT CAP REACHED · TRAINING BLOCKED', { localTeam: 0 }), 'reject');
assert.equal(cueForNotice('ORDER CANCELLED · TARGET LOST', { localTeam: 0 }), 'reject');
assert.equal(cueForScenarioEvent({ team: 'both', rewardTeams: [0, 1] }, { localTeam: 0 }), 'scenario-reward');
assert.equal(cueForScenarioEvent({ team: 0, rewardTeams: [0] }, { localTeam: 0 }), 'scenario-reward');
assert.equal(cueForScenarioEvent({ team: 1, rewardTeams: [1] }, { localTeam: 0 }), null,
  'an opponent-only timed reward does not play as a friendly reward');
assert.equal(cueForScenarioEvent({ team: 'capturing', rewardTeams: [1] }, { localTeam: 0 }), null,
  'capture-triggered rewards route using the actual affected team');
assert.equal(cueForScenarioEvent({ team: 'capturing', rewardTeams: [1] }, { localTeam: 1 }), 'scenario-reward');
assert.equal(cueForScenarioEvent({ team: 'capturing' }, { localTeam: 0 }), null,
  'ambiguous capture rewards do not guess which team received the reward');
assert.equal(isLocalRejection('SELECT YOUR UNITS BEFORE ISSUING AN ORDER'), true);
assert.equal(isLocalRejection('BARRACKS SITE BLOCKED · CHOOSE AN OPEN 3 × 3 AREA'), true);
assert.equal(isLocalRejection('YOUR ARMY SELECTED · 500'), false);

const gate = new CombatAudioGate();
assert.equal(gate.observe({ friendlyDamage: 750 }, 1000), 'battle-alert');
for (let i = 0; i < 2000; i++) {
  assert.equal(gate.observe({ friendlyDamage: 1000 }, 1010 + i * 10), null);
}
assert.equal(gate.observe({ friendlyDamage: 50 }, 30000), 'battle-alert');
assert.equal(gate.observe({ selectedDamage: 30, friendlyDamage: 30 }, 30010), 'selected-alert');
assert.equal(gate.observe({ selectedDamage: 30, friendlyDamage: 30 }, 30020), null);
assert.equal(gate.observe({ buildingDamage: 2, selectedDamage: 30 }, 30030), 'base-alert');
assert.equal(gate.observe({ buildingDamage: 2 }, 30040), null);
gate.reset();
assert.equal(gate.observe({ friendlyDamage: 1 }, 30050), 'battle-alert');

const saved = { getItem: () => JSON.stringify({ enabled: false, volume: 4, ambience: false }) };
assert.deepEqual(readAudioSettings(saved), {
  enabled: false, captions: false, volume: 1, effectsLevel: 1, voiceLevel: 1, musicLevel: 0, ambience: false, ambienceLevel: 1,
});
assert.deepEqual(readAudioSettings({ getItem: () => '{' }), {
  enabled: true, captions: false, volume: 0.5, effectsLevel: 1, voiceLevel: 1, musicLevel: 1, ambience: true, ambienceLevel: 1,
});
assert.equal(readAudioSettings({ getItem: () => JSON.stringify({ captions: true }) }).captions, true,
  'saved critical sound captions stay enabled independently of audio output');
assert.equal(readAudioSettings({ getItem: () => JSON.stringify({ ambienceLevel: 4 }) }).ambienceLevel, 2,
  'stored ambience level is capped at twice the reference mix');
assert.equal(readAudioSettings({ getItem: () => JSON.stringify({ effectsLevel: 4 }) }).effectsLevel, 2,
  'stored effects level is capped at twice the reference mix');
assert.equal(readAudioSettings({ getItem: () => JSON.stringify({ effectsLevel: -1 }) }).effectsLevel, 0,
  'stored effects level cannot go below mute');

let oscillators = 0;
let createdContext;
const parameter = () => ({
  value: 0, lastTarget: null, scheduledValues: [],
  setValueAtTime(value) { this.scheduledValues.push(value); },
  exponentialRampToValueAtTime(value) { this.scheduledValues.push(value); },
  setTargetAtTime(value) { this.lastTarget = value; },
});
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {} });
class FakeAudioContext {
  constructor() { createdContext = this; }
  state = 'running';
  suspendCalls = 0;
  resumeCalls = 0;
  currentTime = 0;
  sampleRate = 100;
  destination = node();
  gains = [];
  buffers = [];
  oscillatorNodes = [];
  createGain() { const gain = { ...node(), gain: parameter() }; this.gains.push(gain); return gain; }
  createOscillator() {
    oscillators++;
    const oscillator = { ...node(), frequency: parameter(), onended: null };
    this.oscillatorNodes.push(oscillator);
    return oscillator;
  }
  createBuffer(_channels, length, sampleRate) {
    const data = new Float32Array(length);
    this.buffers.push({ data, length, sampleRate });
    return { getChannelData: () => data };
  }
  createBufferSource() { return node(); }
  createBiquadFilter() { return { ...node(), frequency: parameter() }; }
  resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
const oldAudioContext = globalThis.AudioContext;
globalThis.AudioContext = FakeAudioContext;
try {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const statuses = [];
  const cues = [];
  const cueDecisions = [];
  const audio = createGameAudio({
    storage, doc,
    onStatusChange: (status) => statuses.push(status),
    onCue: (cue) => cues.push(cue),
    onCueDecision: (cue) => cueDecisions.push(cue),
  });
  assert.equal(audio.getStatus(), 'waiting');
  assert.equal(audio.getSettings().ambienceLevel, 1, 'new control preserves the existing ambience mix by default');
  assert.equal(audio.play('objective'), false, 'network events before a gesture cannot queue sounds');
  assert.deepEqual(cueDecisions, ['objective'], 'a gameplay cue decision remains visible before audio is unlocked');
  assert.equal(createdContext, undefined, 'pre-gesture events must not create an audio context');
  audio.unlock();
  assert.equal(createdContext.gains[2].gain.lastTarget, 0.18, 'the default ambience level preserves the existing atmosphere gain');
  const ambience = createdContext.buffers[0].data;
  assert.equal(ambience.length, 1188, 'the 120 ms crossfade keeps the wind loop near twelve seconds');
  const ambienceSteps = [];
  for (let i = 1; i < ambience.length; i++) ambienceSteps.push(Math.abs(ambience[i] - ambience[i - 1]));
  ambienceSteps.sort((a, b) => a - b);
  const normalStepP95 = ambienceSteps[Math.floor((ambienceSteps.length - 1) * 0.95)];
  const loopSeamStep = Math.abs(ambience[0] - ambience.at(-1));
  assert.ok(loopSeamStep <= normalStepP95 * 1.5,
    `ambience loop seam (${loopSeamStep}) should stay near ordinary steps (${normalStepP95})`);
  assert.equal(audio.play('select'), true);
  assert.deepEqual(cues, ['select']);
  assert.equal(audio.getStatus(), 'running');
  assert.equal(oscillators, 1);
  const constructionStart = createdContext.oscillatorNodes.length;
  assert.equal(audio.play('building-complete'), true, 'finished construction schedules its own short cue');
  assert.equal(oscillators, 3, 'building completion is a restrained two-part cue');
  assert.equal(cues.at(-1), 'building-complete');
  const constructionNotes = createdContext.oscillatorNodes.slice(constructionStart).map(({ type, frequency }) => ({
    wave: type, from: frequency.scheduledValues[0], to: frequency.scheduledValues[1],
  }));
  assert.deepEqual(constructionNotes, [
    { wave: 'triangle', from: 185, to: 185 },
    { wave: 'sine', from: 277.18, to: 277.18 },
  ], 'construction completion uses a low, open fifth distinct from the battle alert pitches');
  assert.equal(audio.play('building-complete'), false, 'repeated construction completions are rate limited');
  const battleStart = createdContext.oscillatorNodes.length;
  assert.equal(audio.play('battle-alert'), true);
  const battlePitches = createdContext.oscillatorNodes.slice(battleStart).map(({ frequency }) => frequency.scheduledValues[0]);
  assert.deepEqual(battlePitches, [196, 246.94]);
  assert.ok(constructionNotes.every(({ from }) => !battlePitches.includes(from)), 'construction and battle alerts share no fundamentals');
  assert.equal(oscillators, 5);
  for (let i = 0; i < 2000; i++) audio.play('move');
  assert.equal(oscillators, 6, 'two thousand same-frame move orders make one move tone');
  assert.deepEqual(cues, ['select', 'building-complete', 'battle-alert', 'move']);
  audio.setSettings({ enabled: false });
  assert.equal(audio.getStatus(), 'muted');
  assert.equal(createdContext.suspendCalls, 1);
  const scheduledBeforeMute = cues.length;
  assert.equal(audio.play('objective'), false);
  assert.equal(cueDecisions.at(-1), 'objective', 'mute suppresses playback, not the critical cue decision');
  assert.equal(cues.length, scheduledBeforeMute, 'muted decisions do not count as scheduled sounds');
  assert.equal(oscillators, 6);
  audio.setSettings({ enabled: true, volume: 0 });
  assert.equal(createdContext.suspendCalls, 2);
  const scheduledAtZeroVolume = cues.length;
  assert.equal(audio.play('victory'), false);
  assert.equal(cueDecisions.at(-1), 'victory', 'zero overall volume does not suppress an outcome caption decision');
  assert.equal(cues.length, scheduledAtZeroVolume, 'zero-volume decisions do not count as scheduled sounds');
  assert.equal(oscillators, 6);
  audio.setSettings({ enabled: true, volume: 0.3, effectsLevel: 0, ambience: false });
  const scheduledAtZeroEffects = cues.length;
  assert.equal(audio.play('scenario-reward'), false);
  assert.equal(cueDecisions.at(-1), 'scenario-reward', 'zero effects level preserves the visual reward caption');
  assert.equal(cues.length, scheduledAtZeroEffects, 'zero-effects decisions do not count as scheduled sounds');
  audio.setSettings({ effectsLevel: 1 });
  assert.equal(audio.getStatus(), 'running');
  assert.equal(createdContext.resumeCalls, 1);
  assert.deepEqual(readAudioSettings(storage), {
    enabled: true, captions: false, volume: 0.3, effectsLevel: 1, voiceLevel: 1, musicLevel: 1, ambience: false, ambienceLevel: 1,
  });
  assert.equal(createdContext.gains[0].gain.lastTarget, 0.3 * 0.78);
  assert.equal(createdContext.gains[1].gain.lastTarget, 0.52);
  assert.equal(createdContext.gains[2].gain.lastTarget, 0);
  audio.setSettings({ effectsLevel: 1.5, ambience: true, ambienceLevel: 0.4 });
  assert.equal(createdContext.gains[1].gain.lastTarget, 0.52 * 1.5,
    'effects level scales only the effects bus');
  assert.equal(createdContext.gains[2].gain.lastTarget, 0.045 * 0.4, 'ambience level scales only the already-ducked atmosphere bus');
  assert.equal(createdContext.gains[0].gain.lastTarget, 0.3 * 0.78, 'ambience level leaves overall volume unchanged');
  assert.equal(createdContext.gains[1].gain.value, 0.52, 'effects level leaves the initial effects bus headroom unchanged');
  assert.deepEqual(readAudioSettings(storage), {
    enabled: true, captions: false, volume: 0.3, effectsLevel: 1.5, voiceLevel: 1, musicLevel: 1, ambience: true, ambienceLevel: 0.4,
  });
  assert.equal(audio.play('base-lost'), true);
  assert.equal(createdContext.gains[2].gain.lastTarget, 0.045 * 0.4, 'tactical alert ducks the selected ambience level');
  assert.equal(audio.play('base-lost'), false, 'repeated building losses are rate limited');
  assert.equal(audio.play('resource-empty'), true);
  for (const cue of ['attack', 'gather', 'build', 'queue']) audio.play(cue);
  const saturatedCount = oscillators;
  assert.equal(saturatedCount, 12, 'routine cues stop at twelve active voices');
  assert.equal(audio.play('objective'), true);
  assert.equal(oscillators, 15, 'three-note objective cue retains room above routine limit');
  assert.equal(cues.at(-1), 'objective');
  doc.hidden = true;
  assert.equal(audio.play('defeat'), false, 'hidden tab does not schedule sounds');
  assert.equal(oscillators, 15);
  assert.ok(statuses.includes('muted') && statuses.includes('running'));
  audio.dispose();

  const criticalAudio = createGameAudio({
    storage: { getItem: () => null, setItem() {} },
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  criticalAudio.unlock();
  const baseLostStart = createdContext.oscillatorNodes.length;
  assert.equal(criticalAudio.play('base-lost'), true);
  const profile = (nodes) => nodes.map(({ type, frequency }) => ({
    wave: type, from: frequency.scheduledValues[0], to: frequency.scheduledValues[1],
  }));
  const baseLostProfile = profile(createdContext.oscillatorNodes.slice(baseLostStart));
  const defeatStart = createdContext.oscillatorNodes.length;
  assert.equal(criticalAudio.play('defeat'), true);
  const defeatProfile = profile(createdContext.oscillatorNodes.slice(defeatStart));
  assert.deepEqual(baseLostProfile, [
    { wave: 'sawtooth', from: 233.08, to: 155.56 },
    { wave: 'triangle', from: 138.59, to: 103.83 },
    { wave: 'triangle', from: 116.54, to: 87.31 },
  ], 'base loss uses a rough, low sliding cue');
  assert.deepEqual(defeatProfile.map(({ wave, from, to }) => ({ wave, from, to })), [
    { wave: 'sine', from: 329.63, to: 329.63 },
    { wave: 'sine', from: 261.63, to: 261.63 },
    { wave: 'sine', from: 196, to: 196 },
  ]);
  const defeatPitches = new Set(defeatProfile.map(({ from }) => from));
  assert.ok(baseLostProfile.every(({ from }) => !defeatPitches.has(from)),
    'base loss and match defeat share no fundamentals');
  const productionStart = createdContext.oscillatorNodes.length;
  assert.equal(criticalAudio.play('complete'), true);
  const productionProfile = profile(createdContext.oscillatorNodes.slice(productionStart));
  assert.deepEqual(productionProfile, [
    { wave: 'sine', from: 392, to: 392 },
    { wave: 'sine', from: 587, to: 587 },
  ]);
  const productionPitches = new Set(productionProfile.map(({ from }) => from));
  const objectiveStart = createdContext.oscillatorNodes.length;
  assert.equal(criticalAudio.play('objective'), true);
  const objectiveProfile = profile(createdContext.oscillatorNodes.slice(objectiveStart));
  assert.deepEqual(objectiveProfile, [
    { wave: 'sine', from: 440, to: 440 },
    { wave: 'sine', from: 554.37, to: 554.37 },
    { wave: 'sine', from: 659.25, to: 659.25 },
  ], 'objective gain uses a rising A-major triad');
  const objectivePitches = new Set(objectiveProfile.map(({ from }) => from));
  assert.ok([...objectivePitches].every((pitch) => !productionPitches.has(pitch)),
    'objective gain and production completion share no fundamentals');
  const victoryStart = createdContext.oscillatorNodes.length;
  assert.equal(criticalAudio.play('victory'), true);
  const victoryProfile = profile(createdContext.oscillatorNodes.slice(victoryStart));
  assert.deepEqual(victoryProfile, [
    { wave: 'sine', from: 880, to: 880 },
    { wave: 'sine', from: 1108.73, to: 1108.73 },
    { wave: 'sine', from: 1318.51, to: 1318.51 },
    { wave: 'sine', from: 1760, to: 1760 },
  ], 'match victory uses a bright, rising A-major fanfare');
  const victoryPitches = new Set(victoryProfile.map(({ from }) => from));
  assert.ok([392, 493.88, 587].every((pitch) => !victoryPitches.has(pitch)),
    'match victory shares no fundamentals with objective or production-complete cues');
  assert.ok([...objectivePitches].every((pitch) => !victoryPitches.has(pitch)),
    'objective gain and match victory share no fundamentals');
  assert.ok([...victoryPitches].every((pitch) => pitch > 780),
    'match victory stays above the selection cue sweep');
  criticalAudio.dispose();

  const previewDecisions = [];
  const previewCues = [];
  const captionPreviewAudio = createGameAudio({
    storage: { getItem: () => null, setItem() {} },
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} },
    onCue: (cue) => previewCues.push(cue),
    onCueDecision: (cue) => previewDecisions.push(cue),
  });
  captionPreviewAudio.unlock();
  assert.equal(captionPreviewAudio.preview('victory'), true, 'sample previews play while captions are off');
  assert.deepEqual(previewDecisions, [], 'caption-off previews do not create captions');
  captionPreviewAudio.setSettings({ captions: true });
  assert.equal(captionPreviewAudio.preview('victory'), true, 'captioned sample previews remain audible');
  assert.deepEqual(previewDecisions, ['victory'], 'enabled captions describe a critical sample preview');
  assert.deepEqual(previewCues, [], 'sample previews do not count as scheduled gameplay cues');
  captionPreviewAudio.dispose();

  const researchAudio = createGameAudio({
    storage: { getItem: () => null, setItem() {} },
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  researchAudio.unlock();
  const researchStart = createdContext.oscillatorNodes.length;
  assert.equal(researchAudio.play('research-complete'), true, 'research completion schedules its own cue');
  const researchProfile = profile(createdContext.oscillatorNodes.slice(researchStart));
  assert.deepEqual(researchProfile, [
    { wave: 'triangle', from: 523.25, to: 523.25 },
    { wave: 'triangle', from: 622.25, to: 622.25 },
    { wave: 'triangle', from: 783.99, to: 783.99 },
  ], 'research completion uses a rising C-minor triad');
  const researchPitches = new Set(researchProfile.map(({ from }) => from));
  assert.ok([...researchPitches].every((pitch) => !productionPitches.has(pitch)
    && !objectivePitches.has(pitch) && !victoryPitches.has(pitch)),
  'research completion shares no fundamentals with production, objective, or victory cues');
  assert.equal(researchAudio.play('research-complete'), false, 'repeated research cues are rate limited');
  researchAudio.dispose();

  const rewardAudio = createGameAudio({
    storage: { getItem: () => null, setItem() {} },
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  rewardAudio.unlock();
  const rewardStart = createdContext.oscillatorNodes.length;
  assert.equal(rewardAudio.play('scenario-reward'), true, 'scenario rewards schedule a distinct short cue');
  const rewardProfile = profile(createdContext.oscillatorNodes.slice(rewardStart));
  assert.deepEqual(rewardProfile, [
    { wave: 'triangle', from: 493.88, to: 493.88 },
    { wave: 'sine', from: 739.99, to: 739.99 },
  ], 'scenario rewards use a light two-note confirmation distinct from the objective chord');
  assert.equal(rewardAudio.play('scenario-reward'), false, 'repeated scenario reward cues are rate limited');
  rewardAudio.dispose();

  const rallyAudio = createGameAudio({
    storage: { getItem: () => null, setItem() {} },
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  rallyAudio.unlock();
  const rallyStart = createdContext.oscillatorNodes.length;
  assert.equal(rallyAudio.play('rally'), true, 'rally point changes schedule their own confirmation');
  const rallyProfile = profile(createdContext.oscillatorNodes.slice(rallyStart));
  assert.deepEqual(rallyProfile, [
    { wave: 'triangle', from: 466.16, to: 466.16 },
    { wave: 'sine', from: 698.46, to: 698.46 },
  ], 'rally confirmation is a short rising fifth with a distinct two-part contour');
  assert.equal(rallyAudio.play('rally'), false, 'rapid repeated rally changes are rate limited');
  rallyAudio.dispose();
} finally {
  if (oldAudioContext === undefined) delete globalThis.AudioContext;
  else globalThis.AudioContext = oldAudioContext;
}

console.log('Audio policy scenario passed.');
