'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreTranscriptionBenchmark } = require('../lib/transcription-benchmark');

test('computes weighted Arabic WER and expert-labeled event precision/recall', () => {
  const report = scoreTranscriptionBenchmark([
    {
      id: 'anon-001',
      grade: 1,
      mode: 'oral',
      model: 'gpt-transcribe',
      referenceText: 'ذهب سامي إلى المدرسة',
      transcriptText: 'ذهب سامي المدرسة',
      expertAnnotations: [{ type: 'deletion', targetIndex: 2 }]
    },
    {
      id: 'anon-002',
      grade: 1,
      mode: 'oral',
      model: 'gpt-transcribe',
      referenceText: 'عاد الطفل إلى البيت',
      transcriptText: 'عاد الطفل إلى المنزل',
      expertAnnotations: [
        { type: 'substitution', targetIndex: 3 },
        { type: 'deletion', targetIndex: 1 }
      ]
    },
    {
      id: 'anon-003',
      grade: 2,
      mode: 'oral',
      model: 'other-model',
      referenceText: 'قرأ الطفل القصة',
      transcriptText: 'قرأ الطفل القصة'
    }
  ]);

  assert.equal(report.schemaVersion, 'nebras-transcription-benchmark-1');
  assert.equal(report.overall.records, 3);
  assert.equal(report.overall.annotatedRecords, 2);
  assert.equal(report.overall.referenceWords, 11);
  assert.equal(report.overall.editDistanceErrors, 2);
  assert.equal(report.overall.weightedWordErrorRate, 0.1818);
  assert.equal(report.overall.expertDetection.truePositives, 2);
  assert.equal(report.overall.expertDetection.falsePositives, 0);
  assert.equal(report.overall.expertDetection.falseNegatives, 1);
  assert.equal(report.overall.expertDetection.precision, 1);
  assert.equal(report.overall.expertDetection.recall, 0.6667);
  assert.equal(report.byGrade['1'].records, 2);
  assert.equal(report.byGrade['2'].records, 1);
  assert.equal(report.byModel['other-model'].weightedWordErrorRate, 0);
  assert.equal(report.records[0].wordErrorRate, 0.25);
});

test('keeps expert-detection metrics unavailable when no human labels were provided', () => {
  const report = scoreTranscriptionBenchmark([{
    id: 'anon-010',
    grade: 3,
    mode: 'oral',
    model: 'gpt-transcribe',
    referenceText: 'قرأ الطفل قصة',
    transcriptText: 'قرأ الطفل القصة'
  }]);
  assert.equal(report.overall.annotatedRecords, 0);
  assert.equal(report.overall.expertDetection.precision, null);
  assert.equal(report.overall.expertDetection.recall, null);
  assert.equal(report.records[0].expertDetection, null);
});

test('uses insertion boundary indices consistently when comparing expert labels', () => {
  const report = scoreTranscriptionBenchmark([{
    id: 'anon-020',
    grade: 2,
    mode: 'oral',
    model: 'gpt-transcribe',
    referenceText: 'ذهب سامي',
    transcriptText: 'ثم ذهب سامي',
    expertAnnotations: [{ type: 'insertion', targetIndex: 0 }]
  }]);
  assert.equal(report.records[0].counts.insertions, 1);
  assert.equal(report.records[0].differences[0].targetIndex, 0);
  assert.equal(report.records[0].expertDetection.truePositives, 1);
  assert.equal(report.records[0].expertDetection.precision, 1);
});

test('rejects duplicate ids, invalid grades, and out-of-range human annotations', () => {
  const base = {
    id: 'anon-030', grade: 2, mode: 'oral', model: 'model',
    referenceText: 'نص عربي', transcriptText: 'نص عربي'
  };
  assert.throws(() => scoreTranscriptionBenchmark([base, base]), /المعرّف مكرر/);
  assert.throws(() => scoreTranscriptionBenchmark([{ ...base, grade: 7 }]), /الصف غير صالح/);
  assert.throws(() => scoreTranscriptionBenchmark([{
    ...base,
    expertAnnotations: [{ type: 'deletion', targetIndex: 2 }]
  }]), /targetIndex خارج النطاق/);
  assert.throws(() => scoreTranscriptionBenchmark([]), /غير فارغة/);
});
