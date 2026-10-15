'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

test('session API saves sanitized gaze and acoustic summaries without raw samples', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebras-api-test-'));
  const priorDataDir = process.env.NEBRAS_DATA_DIR;
  process.env.NEBRAS_DATA_DIR = tempDir;

  const serverPath = require.resolve('../server.js');
  delete require.cache[serverPath];
  const app = require('../server.js');
  const server = http.createServer(app);

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const baseUrl = 'http://127.0.0.1:' + address.port;
    const requestJson = async (route, method, body) => {
      const response = await fetch(baseUrl + route, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    };

    const createdStudent = await requestJson('/api/students', 'POST', {
      name: 'طالب اختبار',
      grade: 2,
      age: 7,
      classroom: 'اختبار',
      notes: 'بيانات مؤقتة للاختبار'
    });
    assert.equal(createdStudent.status, 201);
    assert.ok(createdStudent.body.id);

    const payload = {
      protocolVersion: 'integration-test',
      studentId: createdStudent.body.id,
      studentName: createdStudent.body.name,
      grade: 2,
      textId: 'text-a',
      textTitle: 'نص الاختبار الأول',
      secondTextId: 'text-b',
      secondTextTitle: 'نص الاختبار الثاني',
      durationSeconds: 30,
      totalAssessmentDurationSeconds: 45,
      observedWordCount: 20,
      wpm: 40,
      comprehensionScore: 4,
      comprehensionTotal: 6,
      firstComprehensionScore: 2,
      firstComprehensionTotal: 3,
      secondComprehensionScore: 2,
      secondComprehensionTotal: 3,
      ranDurationSeconds: 12,
      ranErrors: 1,
      teacherMarkedErrors: 1,
      omissions: 0,
      selfCorrections: 1,
      hasValidGaze: true,
      riskClassification: { level: 'observations', reasons: ['وصف اختباري'] },
      gazeCalibration: {
        passed: true,
        validationTargetCount: 5,
        validTargetCount: 5,
        targetsWithinTolerance: 4,
        tolerancePx: 90,
        medianErrorPx: 38,
        meanErrorPx: 42
      },
      metrics: { totalFixations: 6, avgFixationDurationMs: 210, sampleCount: 60 },
      readingSegments: [{
        passageId: 'text-a',
        passageTitle: 'نص الاختبار الأول',
        mode: 'oral',
        durationSeconds: 30,
        wordCount: 20,
        errors: 1,
        omissions: 0,
        selfCorrections: 1,
        hasValidGaze: true,
        metrics: { totalFixations: 6, avgFixationDurationMs: 210, sampleCount: 60 },
        wordGaze: {
          quality: 'observed',
          sampleCount: 60,
          inTextSamples: 48,
          sampleCoveragePercent: 80,
          uniqueWordsSeen: 8,
          wordCoveragePercent: 40,
          stableWordVisits: 10,
          totalDwellMs: 1800,
          regressions: 2,
          forwardTransitions: 8,
          perWord: [{ wordIndex: 2, wordText: 'المدرسة', totalDwellMs: 500, visitCount: 2, longestDwellMs: 300 }]
        },
        acousticAnalysis: {
          quality: 'observed',
          durationSeconds: 30,
          voiceActivityRatioPercent: 72.5,
          pauseCount: 1,
          longPauseCount: 1,
          longestPauseMs: 900,
          pauses: [{ startSeconds: 4.2, endSeconds: 5.1, durationMs: 900, kind: 'long-low-energy-gap' }]
        },
        gazeSamples: [{ t: 100, segmentT: 10, x: 40, y: 20, wordIndex: 2 }],
        audioBytes: 'must-not-be-persisted'
      }]
    };

    const saved = await requestJson('/api/sessions', 'POST', payload);
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.hasValidGaze, true);
    assert.equal(saved.body.gazeCalibration.passed, true);
    assert.equal(saved.body.readingSegments[0].wordGaze.quality, 'observed');
    assert.equal(saved.body.readingSegments[0].wordGaze.perWord[0].wordText, 'المدرسة');
    assert.equal(saved.body.readingSegments[0].acousticAnalysis.pauseCount, 1);
    assert.equal(saved.body.readingSegments[0].acousticAnalysis.pauses[0].durationMs, 900);
    assert.equal('gazeSamples' in saved.body.readingSegments[0], false);
    assert.equal('audioBytes' in saved.body.readingSegments[0], false);
    assert.equal(saved.body.audioRecorded, false);
    assert.equal(saved.body.riskClassification.score, null);

    const persisted = await requestJson('/api/sessions', 'GET');
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.length, 1);
    assert.equal(persisted.body[0].id, saved.body.id);
    assert.equal(persisted.body[0].readingSegments[0].wordGaze.perWord[0].wordText, 'المدرسة');
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete require.cache[serverPath];
    if (priorDataDir === undefined) delete process.env.NEBRAS_DATA_DIR;
    else process.env.NEBRAS_DATA_DIR = priorDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
