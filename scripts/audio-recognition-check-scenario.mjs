import assert from 'node:assert/strict';
import {
  AUDIO_RECOGNITION_CATEGORIES, AUDIO_RECOGNITION_CUE_LABELS, createAudioRecognitionRound,
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
    ? (trial.expected === 'move' ? 'attack' : 'move')
    : trial.expected;
  const result = round.submit(answer);
  assert.equal(result.correct, answer === trial.expected);
  submitted.push(result);
}

assert.equal(round.current(), null, 'the check ends after its ten balanced samples');
assert.equal(submitted.filter((result) => result.correct).length, 9);
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
const summary = summarizeAudioRecognitionResponses(submitted, { captionsEnabled: true });
assert.equal(summary.correct, 9);
assert.equal(summary.total, 10);
assert.match(summary.score, /^9\/10 correct · captions on/);
assert.match(summary.report, /Captions: on/);
assert.match(summary.report, /Guesses:/);
for (const label of ['Match victory 2/2', 'Match defeat 2/2', 'Match draw 2/2']) {
  assert.ok(summary.report.includes(label), `the report separates ${label}`);
}
const missed = submitted.find((response) => !response.correct);
const labelById = new Map(AUDIO_RECOGNITION_CATEGORIES.map(({ id, label }) => [id, label]));
assert.ok(summary.report.includes(`${missed.position}. ${labelById.get(missed.expected)} → ${labelById.get(missed.answer)} (missed)`));
console.log('Audio recognition check scenario passed.');
