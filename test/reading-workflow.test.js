'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const enhancementSource = fs.readFileSync(path.join(root, 'public/js/assessment-enhancements.js'), 'utf8');
const baseSource = fs.readFileSync(path.join(root, 'public/js/assessment.js'), 'utf8');
const trackerSource = fs.readFileSync(path.join(root, 'public/js/tracker.js'), 'utf8');

test('skipping calibration returns to camera setup and never opens an uncalibrated reading session', () => {
  class AssessmentSessionManager {}
  const sandbox = {
    AssessmentSessionManager,
    window: {},
    document: {},
    console,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => 1 },
    navigator: {},
    fetch: () => Promise.resolve({ ok: true, json: async () => ({}) })
  };
  vm.runInNewContext(enhancementSource, sandbox, { filename: 'assessment-enhancements.js' });

  const manager = Object.create(AssessmentSessionManager.prototype);
  let setupRendered = false;
  manager.calibrationCompleted = true;
  manager.allowUncalibratedGaze = true;
  manager.stage = 'calibration';
  manager.startReading = () => assert.fail('must not start word tracking without validated calibration');
  manager.renderEnvironmentCheck = () => { setupRendered = true; };

  manager.skipCalibration();

  assert.equal(manager.calibrationCompleted, false);
  assert.equal(manager.allowUncalibratedGaze, false);
  assert.equal(manager.stage, 'env_check');
  assert.equal(setupRendered, true);
});

test('successful calibration proceeds to the reading passage without an unrelated extra step', () => {
  assert.match(enhancementSource, /startReading\(&quot;oral&quot;, 0\)">ابدأ القراءة مع تتبع النظر/);
  assert.doesNotMatch(enhancementSource, /اجتازت إشارة النظر التحقق التقني الأولي[\s\S]{0,900}startRapidNaming\(\)/);
});

test('reading screen shows live word and line estimate and highlights the mapped word', () => {
  assert.match(enhancementSource, /id="live-gaze-readout"/);
  assert.match(enhancementSource, /إشارة النظر خارج النص أو بين الكلمات/);
  assert.match(enhancementSource, /classList\.add\('is-current-gaze'\)/);
  assert.match(enhancementSource, /السطر '\s*\+\s*wordItem\.lineNumber/);
  assert.match(enhancementSource, /allowUncalibratedGaze = false/);
  assert.doesNotMatch(enhancementSource, /تقدير غير مُعاير:/);
  assert.match(enhancementSource, /if \(!this\.calibrationCompleted\) \{/);
  assert.match(enhancementSource, /const x = gaze\.x - rect\.left/);
  assert.doesNotMatch(enhancementSource, /Math\.max\(4, Math\.min\(wrapper\.clientWidth - 4/);
});

test('calibration trains across nine screen regions and records time-separated samples', () => {
  const calibrationStart = enhancementSource.indexOf('proto.startCalibration = async function');
  const pointsStart = enhancementSource.indexOf('const points = [', calibrationStart);
  const pointsEnd = enhancementSource.indexOf('].map(point =>', pointsStart);
  assert.ok(calibrationStart >= 0 && pointsStart > calibrationStart && pointsEnd > pointsStart);
  const trainingPoints = enhancementSource.slice(pointsStart, pointsEnd);
  assert.equal((trainingPoints.match(/\{ name: '/g) || []).length, 9);
  assert.match(trackerSource, /for \(let sample = 0; sample < 3; sample\+\+\)/);
  assert.match(trackerSource, /await new Promise\(resolve => setTimeout\(resolve, 140\)\)/);
  assert.match(trackerSource, /this\.calibrationClicks >= 27/);
  assert.match(trackerSource, /calib-prediction-dot/);
  assert.match(enhancementSource, /class="calib-prediction-dot"/);
  assert.match(enhancementSource, /validationDetailItems/);
  assert.doesNotMatch(baseSource, /تخطي المعايرة والبدء في القراءة فوراً/);
  assert.match(baseSource, /تسع نقاط معايرة/);
});

test('the reading task refuses to begin without successful gaze calibration', async () => {
  class AssessmentSessionManager {}
  const status = { textContent: '' };
  const sandbox = {
    AssessmentSessionManager,
    window: {},
    document: { getElementById: id => id === 'live-gaze-readout' ? status : null },
    console,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => 1 },
    navigator: {},
    fetch: () => Promise.resolve({ ok: true, json: async () => ({}) })
  };
  vm.runInNewContext(enhancementSource, sandbox, { filename: 'assessment-enhancements.js' });
  const manager = Object.create(AssessmentSessionManager.prototype);
  manager.segmentActive = false;
  manager.calibrationCompleted = false;
  manager.currentReadingMode = 'oral';
  manager.startAudioCapture = () => assert.fail('audio/reading should not start before gaze calibration');
  await manager.beginReadingSegment();
  assert.match(status.textContent, /يجب اجتياز معايرة النظر أولًا/);
});

test('oral reading records audio by default after the user starts the passage, with a downloadable result', () => {
  assert.match(enhancementSource, /id="record-audio-opt-in" checked/);
  assert.match(enhancementSource, /beginReadingSegment = async function/);
  assert.match(enhancementSource, /تنزيل ملف التسجيل الصوتي/);
  assert.match(enhancementSource, /audioExtension/);
});

test('camera initialization no longer blocks rendering the camera/status screen', () => {
  const render = baseSource.indexOf('this.renderEnvironmentCheck();');
  const initialize = baseSource.indexOf('this.cameraInitializationPromise');
  assert.ok(render >= 0 && initialize > render);
  assert.match(baseSource, /camera-startup-status/);
  assert.match(baseSource, /onCameraStatusChange/);
});

test('uncalibrated gaze estimates cannot create a report heatmap', () => {
  assert.match(enhancementSource, /wordGaze\.quality === 'observed' && segment\.hasValidGaze === true/);
  assert.match(enhancementSource, /المعايرة لم تجتز التحقق التقني الأولي/);
});
