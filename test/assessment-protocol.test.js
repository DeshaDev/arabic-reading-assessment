const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countArabicWords,
  calculateObservedWpm,
  createRapidNamingSequence,
  summarizeReadingSegments,
  summarizeWordMarks
} = require('../public/js/assessment-protocol.js');
const { ARABIC_TEXTS_BANK, ARABIC_ALTERNATE_TEXTS } = require('../public/js/texts.js');

test('counts Arabic tokens without counting tashkeel as separate words', () => {
  assert.equal(countArabicWords('قَرَأَ الطِّفْلُ نَصًّا جَدِيدًا.'), 4);
});

test('does not calculate WPM from too-short or implausible sessions', () => {
  assert.equal(calculateObservedWpm(30, 8), null);
  assert.equal(calculateObservedWpm(110, 20), null);
  assert.equal(calculateObservedWpm(60, 60), 60);
});

test('builds a 36-cell Arabic rapid naming task from letters only', () => {
  const ran = createRapidNamingSequence(() => 0.5);
  assert.equal(ran.length, 36);
  assert.ok(ran.every(letter => /^[ء-ي]$/.test(letter)));
});

test('summarizes two passages using combined reading time and word counts', () => {
  const summary = summarizeReadingSegments([
    { durationSeconds: 30, wordCount: 45, errors: 2, omissions: 1, selfCorrections: 1 },
    { durationSeconds: 60, wordCount: 75, errors: 1, omissions: 0, selfCorrections: 2 }
  ]);
  assert.equal(summary.segmentCount, 2);
  assert.equal(summary.durationSeconds, 90);
  assert.equal(summary.wordCount, 120);
  assert.equal(summary.wpm, 80);
  assert.equal(summary.teacherMarkedErrors, 3);
  assert.equal(summary.omissions, 1);
  assert.equal(summary.selfCorrections, 3);
});

test('does not combine oral and silent reading speeds into one overall measure', () => {
  const summary = summarizeReadingSegments([
    { mode: 'oral', durationSeconds: 30, wordCount: 45 },
    { mode: 'silent', durationSeconds: 60, wordCount: 75 }
  ]);
  assert.equal(summary.comparableMode, false);
  assert.equal(summary.wpm, null);
  assert.equal(summary.wordCount, 120);
  assert.equal(summary.durationSeconds, 90);
});

test('provides a distinct alternate passage for every grade with valid comprehension questions', () => {
  assert.equal(ARABIC_TEXTS_BANK.length, 6);
  assert.equal(ARABIC_ALTERNATE_TEXTS.length, 6);
  for (let grade = 1; grade <= 6; grade++) {
    const primary = ARABIC_TEXTS_BANK.find(text => text.grade === grade);
    const alternate = ARABIC_ALTERNATE_TEXTS.find(text => text.grade === grade);
    assert.ok(primary, 'missing primary passage for grade ' + grade);
    assert.ok(alternate, 'missing alternate passage for grade ' + grade);
    assert.notEqual(primary.id, alternate.id);
    assert.notEqual(primary.content, alternate.content);
    assert.equal(alternate.comprehensionQuestions.length, 3);
    for (const question of alternate.comprehensionQuestions) {
      assert.ok(question.correctIndex >= 0 && question.correctIndex < question.options.length);
    }
  }
});

test('summarizes unique teacher word marks without double-counting a word', () => {
  const summary = summarizeWordMarks([
    { wordIndex: 2, type: 'substitution' },
    { wordIndex: 4, type: 'omission' },
    { wordIndex: 4, type: 'hesitation' },
    { wordIndex: 8, type: 'selfCorrection' },
    { wordIndex: 99, type: 'invalid' }
  ]);
  assert.deepEqual(summary, {
    total: 3,
    substitution: 1,
    omission: 1,
    hesitation: 0,
    selfCorrection: 1
  });
});
