import assert from 'node:assert/strict';
import {
  AUDIO_RECOGNITION_CATEGORIES, AUDIO_RECOGNITION_CUE_LABELS, AUDIO_RECOGNITION_UNSURE_ANSWER,
  copyAudioRecognitionText, createAudioRecognitionRound,
  summarizeAudioRecognitionResponses,
} from '../src/audio-recognition-check.mjs';

const round = createAudioRecognitionRound({ random: () => 0 });
assert.equal(round.total, 10, 'the check contains two samples for each event category');
assert.equal(round.current().position, 1);
assert.equal(round.submit('unknown'), null, 'an invalid answer does not advance the check');

const submitted = [];
for (let index = 0; index < round.total; index++) {
  const trial = round.current();
  assert.equal(trial.position, index + 1);
  const answer = index === 0
    ? AUDIO_RECOGNITION_UNSURE_ANSWER
    : index === 1
    ? (trial.expected === 'move' ? 'attack' : 'move')
    : trial.expected;
  const result = round.submit(answer);
  assert.equal(result.correct, answer === trial.expected);
  submitted.push(result);
}

assert.equal(round.current(), null, 'the check ends after its ten balanced samples');
assert.equal(submitted.filter((result) => result.correct).length, 8);
assert.equal(submitted.filter((result) => result.answer === AUDIO_RECOGNITION_UNSURE_ANSWER).length, 1);
assert.deepEqual(round.responses, submitted, 'responses remain available for a local score summary');
const categoryCounts = Object.fromEntries(AUDIO_RECOGNITION_CATEGORIES.map(({ id }) => [
  id, submitted.filter((result) => result.expected === id).length,
]));
assert.deepEqual(categoryCounts, { move: 2, attack: 2, victory: 2, defeat: 2, draw: 2 });
const cueCounts = Object.fromEntries(['move', 'attack', 'victory', 'defeat', 'draw'].map((cue) => [
  cue, submitted.filter((result) => result.cue === cue).length,
]));
assert.deepEqual(cueCounts, categoryCounts, 'each match outcome is sampled separately');
assert.deepEqual(AUDIO_RECOGNITION_CUE_LABELS, {
  move: 'Move order', attack: 'Attack order', victory: 'Match victory',
  defeat: 'Match defeat', draw: 'Match draw',
});
const mixSettings = { volume: 0.5, effectsLevel: 0.8, ambience: true, ambienceLevel: 0.25 };
const summary = summarizeAudioRecognitionResponses(submitted, { captionsEnabled: true, mixSettings });
assert.equal(summary.correct, 8);
assert.equal(summary.unsure, 1);
assert.equal(summary.total, 10);
assert.match(summary.score, /^8\/10 correct · 1 unsure · captions on/);
assert.equal(summary.conditions, 'master 50% · effects 80% · ambience on at 25%');
assert.match(summary.report, /Captions: on/);
assert.match(summary.report, /Mix: master 50% · effects 80% · ambience on at 25%/);
assert.match(summary.report, /Score: 8\/10 \(1 marked not sure\)/);
assert.match(summary.report, /missed 1 as not sure/);
assert.match(summary.report, /Answers:/);
for (const label of ['Match victory 2/2', 'Match defeat 2/2', 'Match draw 2/2']) {
  assert.ok(summary.report.includes(label), `the report separates ${label}`);
}
const quietSummary = summarizeAudioRecognitionResponses(submitted, {
  mixSettings: { volume: 1, effectsLevel: 1, ambience: false, ambienceLevel: 0.25 },
});
assert.equal(quietSummary.conditions, 'master 100% · effects 100% · ambience off');
assert.match(quietSummary.report, /Captions: off\nMix: master 100% · effects 100% · ambience off/);
const missed = submitted.find((response) => !response.correct);
const labelById = new Map([
  ...AUDIO_RECOGNITION_CATEGORIES.map(({ id, label }) => [id, label]),
  [AUDIO_RECOGNITION_UNSURE_ANSWER, 'Not sure'],
]);
assert.ok(summary.report.includes(`${missed.position}. ${labelById.get(missed.expected)} → ${labelById.get(missed.answer)} (missed)`));

const modernClipboard = { calls: [], async writeText(text) { this.calls.push(text); } };
assert.equal(await copyAudioRecognitionText(summary.report, { clipboard: modernClipboard }), true);
assert.deepEqual(modernClipboard.calls, [summary.report], 'the browser clipboard API receives the report first');

const fallbackCalls = [];
const fallbackField = {
  style: {},
  setAttribute(name, value) { fallbackCalls.push(['attribute', name, value]); },
  select() { fallbackCalls.push(['select']); },
  remove() { fallbackCalls.push(['remove']); },
};
const previousFocus = { focus(options) { fallbackCalls.push(['restore-focus', options.preventScroll]); } };
const fallbackDocument = {
  activeElement: previousFocus,
  body: { append(field) { assert.equal(field, fallbackField); fallbackCalls.push(['append']); } },
  createElement(tag) { assert.equal(tag, 'textarea'); fallbackField.value = ''; return fallbackField; },
  execCommand(command) { fallbackCalls.push(['command', command]); return true; },
};
assert.equal(await copyAudioRecognitionText(summary.report, {
  clipboard: { async writeText() { throw new Error('permission denied'); } },
  document: fallbackDocument,
}), true, 'a denied async clipboard write falls back to selected text');
assert.equal(fallbackField.value, summary.report);
assert.ok(fallbackCalls.some(([kind, command]) => kind === 'command' && command === 'copy'));
assert.ok(fallbackCalls.some(([kind]) => kind === 'remove'), 'the temporary field is removed');
assert.ok(fallbackCalls.some(([kind]) => kind === 'restore-focus'), 'the previous control regains focus');

assert.equal(await copyAudioRecognitionText(summary.report, {
  clipboard: { async writeText() { throw new Error('permission denied'); } },
}), false, 'copying reports unavailable when neither clipboard route exists');
console.log('Audio recognition check scenario passed.');
