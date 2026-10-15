const test = require('node:test');
const assert = require('node:assert/strict');
const { alignReadingTranscript, alignTimedTranscriptToReference, normalizeArabicWord, tokenizeArabic } = require('../lib/reading-alignment');

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


test('aligns timestamped words to Arabic reference words while preserving audio time', () => {
  const result = alignTimedTranscriptToReference('ذهب سامي إلى المدرسة', [
    { word: 'ذهب', start: 0.2, end: 0.45 },
    { word: 'سامي', start: 0.5, end: 0.9 },
    { word: 'المدرسة', start: 1.2, end: 1.8 }
  ]);
  const deletion = result.operations.find(op => op.type === 'deletion');
  const school = result.operations.find(op => op.type === 'match' && op.targetWord === 'المدرسة');
  assert.equal(deletion.targetWord, 'إلى');
  assert.equal(deletion.spokenStart, undefined);
  assert.equal(school.spokenStart, 1.2);
  assert.equal(school.spokenEnd, 1.8);
  assert.equal(school.transcriptIndex, 2);
});

test('does not invent times when timestamp metadata is absent or invalid', () => {
  const result = alignTimedTranscriptToReference('هذا نص', [
    { word: 'هذا', start: -0.5, end: 0.3 },
    { word: 'نص', start: 0.4, end: 0.2 },
    { word: 'مقطع', start: 0.5, end: 0.8 }
  ]);
  assert.equal(result.timestampWordCount, 1);
  assert.equal(result.operations.find(op => op.type === 'match' && op.targetWord === 'هذا').spokenStart, undefined);
  assert.equal(result.operations.find(op => op.type === 'insertion').spokenStart, 0.5);
});

test('rejects excessively long timestamp metadata', () => {
  assert.throws(() => alignTimedTranscriptToReference('كلمة', Array.from({ length: 1201 }, () => ({
    word: 'كلمة', start: 0, end: 0.2
  }))), RangeError);
});
