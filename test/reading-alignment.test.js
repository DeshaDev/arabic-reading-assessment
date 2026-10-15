const test = require('node:test');
const assert = require('node:assert/strict');
const { alignReadingTranscript, normalizeArabicWord, tokenizeArabic, alignTimedWordsToTranscript } = require('../lib/reading-alignment');

test('normalizes tashkeel and common alif variants without changing the display text', () => {
  assert.equal(normalizeArabicWord('إِنَّ'), 'ان');
  assert.equal(normalizeArabicWord('ٱلْمَدْرَسَةُ'), 'المدرسة');
  assert.deepEqual(tokenizeArabic('ذَهَبَ سَامِي إِلَى المَدْرَسَةِ').map(word => word.text),
    ['ذَهَبَ', 'سَامِي', 'إِلَى', 'المَدْرَسَةِ']);
});

test('aligns an exact transcript without reporting reading differences', () => {
  const result = alignReadingTranscript('قرأ سامي الدرس اليوم', 'قرأ سامي الدرس اليوم');
  assert.deepEqual(result.counts, {
    matches: 4,
    substitutions: 0,
    deletions: 0,
    insertions: 0,
    repetitions: 0
  });
  assert.equal(result.wordErrorRate, 0);
});

test('finds likely substitution, deletion and repeated-word differences in Arabic', () => {
  const result = alignReadingTranscript(
    'ذهب سامي إلى المدرسة ثم عاد إلى البيت',
    'ذهب سامي المدرسة ثم ثم عاد إلى المنزل'
  );
  assert.equal(result.counts.deletions, 1);
  assert.equal(result.counts.repetitions, 1);
  assert.equal(result.counts.substitutions, 1);
  assert.equal(result.wordErrorRate, 0.375);
  assert.ok(result.operations.some(op => op.type === 'deletion' && op.targetWord === 'إلى'));
  assert.ok(result.operations.some(op => op.type === 'repetition' && op.spokenWord === 'ثم'));
  assert.equal(result.operations.find(op => op.type === 'repetition').targetWord, 'ثم');
  assert.ok(result.operations.some(op => op.type === 'substitution' && op.targetWord === 'البيت' && op.spokenWord === 'المنزل'));
});

test('normalizes Arabic diacritics and alif variation for matching', () => {
  const result = alignReadingTranscript('أَكَلَ الطِّفْلُ', 'اكل الطفل');
  assert.equal(result.counts.matches, 2);
  assert.equal(result.editDistanceErrors, 0);
});

test('rejects reference or transcript with too many tokens', () => {
  const longText = Array.from({ length: 1001 }, () => 'كلمة').join(' ');
  assert.throws(() => alignReadingTranscript(longText, 'كلمة'), RangeError);
  assert.throws(() => alignReadingTranscript('كلمة', longText), RangeError);
});

test('reports deletions for an empty transcription and insertions for an empty reference', () => {
  const missing = alignReadingTranscript('هذا نص عربي', '');
  assert.equal(missing.counts.deletions, 3);
  assert.equal(missing.editDistanceErrors, 3);
  const extra = alignReadingTranscript('', 'كلام زائد');
  assert.equal(extra.counts.insertions, 2);
  assert.equal(extra.wordErrorRate, null);
});


test('maps timestamps only when the timestamp pass agrees with the primary transcript', () => {
  const result = alignTimedWordsToTranscript('ذهب سامي إلى المدرسة', [
    { word: 'ذهب', start: 0.0, end: 0.24 },
    { word: 'سامي', start: 0.28, end: 0.62 },
    // The timestamp model omitted «إلى»; following word times must not shift to the wrong word.
    { word: 'المدرسة', start: 1.05, end: 1.48 }
  ]);
  assert.equal(result.quality, 'partial');
  assert.equal(result.transcriptWordCount, 4);
  assert.equal(result.timestampWordCount, 3);
  assert.equal(result.matchedWordCount, 3);
  assert.equal(result.coveragePercent, 75);
  assert.deepEqual(result.words.map(word => word.transcriptIndex), [0, 1, 2, 3]);
  assert.equal(result.words[0].startSeconds, 0);
  assert.equal(result.words[1].startSeconds, 0.28);
  assert.equal(result.words[2].timingQuality, 'unmatched');
  assert.equal(result.words[2].startSeconds, null);
  assert.equal(result.words[3].word, 'المدرسة');
  assert.equal(result.words[3].startSeconds, 1.05);
  assert.equal(result.words[3].timingQuality, 'cross-model-agreement');
});

test('does not assign one model’s timestamp to a different transcript word', () => {
  const result = alignTimedWordsToTranscript('قال الولد كتابًا', [
    { word: 'قال', start: 0.0, end: 0.2 },
    { word: 'الولد', start: 0.25, end: 0.5 },
    { word: 'كتابه', start: 0.55, end: 0.9 }
  ]);
  assert.equal(result.matchedWordCount, 2);
  assert.equal(result.words[2].timingQuality, 'unmatched');
  assert.equal(result.words[2].startSeconds, null);
});

test('validates odd or missing timing records without generating timestamp coverage', () => {
  const result = alignTimedWordsToTranscript('قرأ الطفل', [
    { word: 'قرأ', start: 1.0, end: 0.9 },
    { word: 'الطفل', start: -2, end: 2 }
  ]);
  assert.equal(result.matchedWordCount, 0);
  assert.equal(result.quality, 'unavailable');
});
