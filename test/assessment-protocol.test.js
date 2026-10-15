const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countArabicWords,
  calculateObservedWpm,
  createRapidNamingSequence,
  summarizeReadingSegments
} = require('../public/js/assessment-protocol.js');

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
  assert.ok(ran.every(letter => /^[\\u0621-\\u064A]$/.test(letter)));
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
