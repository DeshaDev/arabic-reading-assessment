const test = require('node:test');
const assert = require('node:assert/strict');
const { EyeMetricsEngine } = require('../public/js/metrics.js');

test('calculates words per minute from actual word count and session duration', () => {
  const engine = new EyeMetricsEngine();
  const result = engine.classifyRisk(3, 60, 60, { totalFixations: 0, avgFixationDurationMs: 0 }, 2, 3);
  assert.equal(result.wpm, 60);
  assert.equal(result.level, 'observations');
  assert.equal(result.score, null);
  assert.equal(result.hasValidGaze, false);
  assert.match(result.levelAr, /لا تصنيف تشخيصي/);
});

test('marks a short reading session as insufficient instead of inflating its speed', () => {
  const result = new EyeMetricsEngine().classifyRisk(1, 8, 30, {}, 1, 3);
  assert.equal(result.wpm, null);
  assert.equal(result.level, 'insufficient');
  assert.match(result.reasons.join(' '), /أقل من 15 ثانية/);
});

test('rejects implausible calculated pace as a data-quality issue', () => {
  const result = new EyeMetricsEngine().classifyRisk(2, 20, 110, {}, 3, 3);
  assert.equal(result.wpm, null);
  assert.equal(result.level, 'insufficient');
  assert.match(result.reasons.join(' '), /فحص الجودة التقني/);
});

test('never returns a diagnostic risk score', () => {
  const result = new EyeMetricsEngine().classifyRisk(5, 60, 80, {
    totalFixations: 20,
    avgFixationDurationMs: 240,
    regressionRatePercent: 33
  }, 0, 3);
  assert.equal(result.score, null);
  assert.equal(result.level, 'observations');
  assert.match(result.reasons.join(' '), /ليست معيارًا تشخيصيًا/);
});

test('handles missing or invalid input without producing speed figures', () => {
  const engine = new EyeMetricsEngine();
  const noWords = engine.classifyRisk(3, 30, 0, {}, 0, 0);
  assert.equal(noWords.wpm, null);
  assert.equal(noWords.level, 'insufficient');
  const invalidDuration = engine.classifyRisk(3, 'bad', 35, {}, 1, 3);
  assert.equal(invalidDuration.wpm, null);
  assert.equal(invalidDuration.level, 'insufficient');
});

test('uses observed timestamps instead of assuming a 30fps camera rate', () => {
  const engine = new EyeMetricsEngine();
  const fixation = engine.aggregateFixation([
    { t: 100, x: 40, y: 30 },
    { t: 120, x: 41, y: 30 },
    { t: 140, x: 42, y: 31 }
  ]);
  assert.equal(fixation.durationMs, 40);
});
