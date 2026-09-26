const RECOGNITION_CUES = Object.freeze([
  Object.freeze({ cue: 'move', expected: 'move' }),
  Object.freeze({ cue: 'attack', expected: 'attack' }),
  Object.freeze({ cue: 'victory', expected: 'result' }),
]);

export const AUDIO_RECOGNITION_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'move', label: 'Move order' }),
  Object.freeze({ id: 'attack', label: 'Attack order' }),
  Object.freeze({ id: 'result', label: 'Match result' }),
]);

export const AUDIO_RECOGNITION_CUE_LABELS = Object.freeze({
  move: 'Move order',
  attack: 'Attack order',
  victory: 'Match result',
});

export function createAudioRecognitionRound({ random = Math.random, repetitions = 2 } = {}) {
  if (typeof random !== 'function') throw new TypeError('random must be a function');
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new RangeError('repetitions must be a positive integer');
  }

  const trials = RECOGNITION_CUES.flatMap((cue) => (
    Array.from({ length: repetitions }, () => ({ ...cue }))
  ));
  for (let index = trials.length - 1; index > 0; index--) {
    const sample = Number(random());
    const swapWith = Number.isFinite(sample)
      ? Math.min(index, Math.max(0, Math.floor(sample * (index + 1))))
      : 0;
    [trials[index], trials[swapWith]] = [trials[swapWith], trials[index]];
  }

  let cursor = 0;
  const responses = [];
  const validAnswers = new Set(AUDIO_RECOGNITION_CATEGORIES.map(({ id }) => id));

  return {
    get total() { return trials.length; },
    current() {
      const trial = trials[cursor];
      return trial ? { ...trial, position: cursor + 1, total: trials.length } : null;
    },
    submit(answer) {
      const trial = trials[cursor];
      if (!trial || !validAnswers.has(answer)) return null;
      const response = {
        cue: trial.cue,
        expected: trial.expected,
        answer,
        correct: answer === trial.expected,
        position: cursor + 1,
        total: trials.length,
      };
      responses.push(response);
      cursor++;
      return { ...response };
    },
    get responses() { return responses.map((response) => ({ ...response })); },
  };
}
