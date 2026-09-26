const RECOGNITION_CUES = Object.freeze([
  Object.freeze({ cue: 'move', expected: 'move' }),
  Object.freeze({ cue: 'attack', expected: 'attack' }),
  Object.freeze({ cue: 'victory', expected: 'victory' }),
  Object.freeze({ cue: 'defeat', expected: 'defeat' }),
  Object.freeze({ cue: 'draw', expected: 'draw' }),
]);

export const AUDIO_RECOGNITION_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'move', label: 'Move order' }),
  Object.freeze({ id: 'attack', label: 'Attack order' }),
  Object.freeze({ id: 'victory', label: 'Match victory' }),
  Object.freeze({ id: 'defeat', label: 'Match defeat' }),
  Object.freeze({ id: 'draw', label: 'Match draw' }),
]);

export const AUDIO_RECOGNITION_CUE_LABELS = Object.freeze({
  move: 'Move order',
  attack: 'Attack order',
  victory: 'Match victory',
  defeat: 'Match defeat',
  draw: 'Match draw',
});

export function summarizeAudioRecognitionResponses(responses, { captionsEnabled = false } = {}) {
  if (!Array.isArray(responses)) throw new TypeError('responses must be an array');
  const labelById = new Map(AUDIO_RECOGNITION_CATEGORIES.map(({ id, label }) => [id, label]));
  const correct = responses.filter((response) => response.correct).length;
  const breakdown = AUDIO_RECOGNITION_CATEGORIES.map(({ id, label }) => {
    const categoryResponses = responses.filter((response) => response.expected === id);
    const categoryCorrect = categoryResponses.filter((response) => response.correct).length;
    const misreads = new Map();
    for (const response of categoryResponses.filter((candidate) => !candidate.correct)) {
      const answerLabel = labelById.get(response.answer);
      if (answerLabel) misreads.set(answerLabel, (misreads.get(answerLabel) || 0) + 1);
    }
    const missedAs = [...misreads].map(([answerLabel, count]) => `${count} as ${answerLabel.toLowerCase()}`);
    return `${label} ${categoryCorrect}/${categoryResponses.length}${missedAs.length ? ` · missed ${missedAs.join(', ')}` : ''}`;
  });
  const score = `${correct}/${responses.length} correct · captions ${captionsEnabled ? 'on' : 'off'} · ${breakdown.join(' · ')}`;
  const trialNotes = responses.map((response, index) => {
    const expectedLabel = labelById.get(response.expected) || response.expected;
    const answerLabel = labelById.get(response.answer) || response.answer;
    return `${index + 1}. ${expectedLabel} → ${answerLabel} (${response.correct ? 'correct' : 'missed'})`;
  });
  const report = [
    'Thousand Unit Skirmish audio recognition check',
    `Captions: ${captionsEnabled ? 'on' : 'off'}`,
    `Score: ${correct}/${responses.length}`,
    ...breakdown,
    '',
    'Guesses:',
    ...trialNotes,
  ].join('\n');
  return { correct, total: responses.length, score, report };
}

export async function copyAudioRecognitionText(text, {
  clipboard = globalThis.navigator?.clipboard,
  document: doc = globalThis.document,
} = {}) {
  if (typeof text !== 'string' || text.length === 0) return false;
  try {
    if (typeof clipboard?.writeText === 'function') {
      await clipboard.writeText(text);
      return true;
    }
  } catch {}

  if (!doc?.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') return false;
  const previousFocus = doc.activeElement;
  let field;
  try {
    field = doc.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.tabIndex = -1;
    field.setAttribute('aria-hidden', 'true');
    Object.assign(field.style, { position: 'fixed', left: '-9999px', top: '0', opacity: '0' });
    doc.body.append(field);
    field.select();
    return doc.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    try { field?.remove(); } catch {}
    try { previousFocus?.focus({ preventScroll: true }); } catch {}
  }
}

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
