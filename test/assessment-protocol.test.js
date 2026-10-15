const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countArabicWords,
  calculateObservedWpm,
  createRapidNamingSequence,
  summarizeReadingSegments,
  summarizeWordMarks,
  summarizeWordGaze,
  assessCalibrationValidation,
  summarizeLowEnergyFrames
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


test('summarizes per-word gaze dwell, coverage, and RTL reading-order regressions', () => {
  const samples = [
    { t: 0, wordIndex: 0 }, { t: 50, wordIndex: 0 }, { t: 100, wordIndex: 0 },
    { t: 150, wordIndex: 1 }, { t: 200, wordIndex: 1 }, { t: 250, wordIndex: 1 },
    { t: 300, wordIndex: 2 }, { t: 350, wordIndex: 2 }, { t: 400, wordIndex: 2 },
    { t: 450, wordIndex: 1 }, { t: 500, wordIndex: 1 }, { t: 550, wordIndex: 1 }
  ];
  const summary = summarizeWordGaze(samples, 6);
  assert.equal(summary.quality, 'observed');
  assert.equal(summary.sampleCount, 12);
  assert.equal(summary.inTextSamples, 12);
  assert.equal(summary.sampleCoveragePercent, 100);
  assert.equal(summary.uniqueWordsSeen, 3);
  assert.equal(summary.wordCoveragePercent, 50);
  assert.equal(summary.stableWordVisits, 4);
  assert.equal(summary.regressions, 1);
  assert.equal(summary.forwardTransitions, 2);
  assert.equal(summary.totalDwellMs, 400);
  assert.deepEqual(summary.perWord.map(item => item.wordIndex), [0, 1, 2]);
  assert.equal(summary.perWord.find(item => item.wordIndex === 1).visitCount, 2);
});

test('does not inflate gaze dwell across missing samples or low-duration blips', () => {
  const summary = summarizeWordGaze([
    { t: 100, wordIndex: 0 }, { t: 130, wordIndex: 0 },
    { t: 500, wordIndex: 0 }, { t: 530, wordIndex: 0 },
    { t: 560, wordIndex: null }, { t: 600, wordIndex: 1 }, { t: 630, wordIndex: 1 }
  ], 4);
  assert.equal(summary.stableWordVisits, 0);
  assert.equal(summary.totalDwellMs, 0);
  assert.equal(summary.quality, 'insufficient');
});

test('accepts calibration only when enough independent validation targets are within internal tolerance', () => {
  const good = assessCalibrationValidation([
    { sampleCount: 12, errorPx: 60 }, { sampleCount: 12, errorPx: 80 },
    { sampleCount: 12, errorPx: 100 }, { sampleCount: 12, errorPx: 120 },
    { sampleCount: 12, errorPx: 300 }
  ], 1280, 800);
  assert.equal(good.passed, true);
  assert.equal(good.validTargetCount, 5);
  assert.equal(good.medianErrorPx, 100);
  assert.equal(good.targetsWithinTolerance, 4);

  const poor = assessCalibrationValidation([
    { sampleCount: 12, errorPx: 260 }, { sampleCount: 12, errorPx: 270 },
    { sampleCount: 12, errorPx: 280 }, { sampleCount: 12, errorPx: 290 },
    { sampleCount: 12, errorPx: 320 }
  ], 1280, 800);
  assert.equal(poor.passed, false);
  const insufficient = assessCalibrationValidation([
    { sampleCount: 12, errorPx: 20 }, { sampleCount: 12, errorPx: 40 },
    { sampleCount: 12, errorPx: 60 }
  ], 1280, 800);
  assert.equal(insufficient.passed, false);
});


test('detects internal low-energy gaps in audio without labeling them as reading errors', () => {
  const energies = [
    ...Array(60).fill(0.05),
    ...Array(25).fill(0.0001),
    ...Array(60).fill(0.05)
  ];
  const result = summarizeLowEnergyFrames(energies, 0.02, 0.05, { durationSeconds: 2.9 });
  assert.equal(result.quality, 'observed');
  assert.equal(result.pauseCount, 1);
  assert.equal(result.longPauseCount, 0);
  assert.equal(result.pauses[0].durationMs, 500);
  assert.equal(result.pauses[0].startSeconds, 1.2);
  assert.equal(result.pauses[0].endSeconds, 1.7);
  assert.equal(result.voiceActivityRatioPercent, 82.8);
});

test('classifies very long low-energy gaps for review and bridges brief energy dips', () => {
  const longGap = summarizeLowEnergyFrames([
    ...Array(60).fill(0.04), ...Array(40).fill(0.0001), ...Array(60).fill(0.04)
  ], 0.02, 0.04, { durationSeconds: 3.2 });
  assert.equal(longGap.longPauseCount, 1);
  assert.equal(longGap.pauses[0].durationMs, 800);

  const briefDip = summarizeLowEnergyFrames([
    ...Array(30).fill(0.04), ...Array(3).fill(0.0001), ...Array(30).fill(0.04)
  ], 0.02, 0.04, { durationSeconds: 1.26 });
  assert.equal(briefDip.pauseCount, 0);
  assert.equal(briefDip.quality, 'insufficient');
});

test('marks low-level or too-short recordings insufficient instead of inventing pause statistics', () => {
  const quiet = summarizeLowEnergyFrames(Array(150).fill(0.001), 0.02, 0.001, { durationSeconds: 3 });
  assert.equal(quiet.quality, 'insufficient');
  assert.equal(quiet.pauseCount, 0);
  const short = summarizeLowEnergyFrames(Array(40).fill(0.05), 0.02, 0.05, { durationSeconds: 0.8 });
  assert.equal(short.quality, 'insufficient');
});
