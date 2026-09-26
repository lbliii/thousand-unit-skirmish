import assert from 'node:assert/strict';
import {
  AUDIO_RECOGNITION_CATEGORIES, AUDIO_RECOGNITION_CUE_LABELS, createAudioRecognitionRound,
} from '../src/audio-recognition-check.mjs';

const round = createAudioRecognitionRound({ random: () => 0 });
assert.equal(round.total, 6, 'the check contains two samples for each event category');
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

assert.equal(round.current(), null, 'the check ends after its six balanced samples');
assert.equal(submitted.filter((result) => result.correct).length, 5);
assert.deepEqual(round.responses, submitted, 'responses remain available for a local score summary');
const categoryCounts = Object.fromEntries(AUDIO_RECOGNITION_CATEGORIES.map(({ id }) => [
  id, submitted.filter((result) => result.expected === id).length,
]));
assert.deepEqual(categoryCounts, { move: 2, attack: 2, result: 2 });
assert.deepEqual(AUDIO_RECOGNITION_CUE_LABELS, {
  move: 'Move order', attack: 'Attack order', victory: 'Match result',
});
console.log('Audio recognition check scenario passed.');
