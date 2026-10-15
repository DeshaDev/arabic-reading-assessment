'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getTranscriptionConfig,
  WORD_TIMESTAMP_MODEL_REMOVAL_DATE
} = require('../lib/transcription-config');

test('defaults to GPT-Transcribe and enables timestamps only when the supported model and API key are present', () => {
  const config = getTranscriptionConfig({
    OPENAI_API_KEY: 'test-key'
  });
  assert.equal(config.transcriptionModel, 'gpt-transcribe');
  assert.equal(config.wordTimestampModel, 'whisper-1');
  assert.equal(config.wordTimestampAnalysisEnabled, true);
  assert.equal(config.wordTimestampModelIsLegacy, true);
  assert.equal(config.wordTimestampModelRemovalDate, '2027-02-26');
});

test('does not attempt a provider request for word timestamps when no API key is available', () => {
  const config = getTranscriptionConfig({});
  assert.equal(config.apiKeyAvailable, false);
  assert.equal(config.wordTimestampAnalysisEnabled, false);
  assert.match(config.timestampDisabledReason, /لا يوجد مفتاح API/);
});

test('respects the explicit environment switch to disable the extra timestamp pass', () => {
  const config = getTranscriptionConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_ENABLE_WORD_TIMESTAMPS: 'false'
  });
  assert.equal(config.timestampRequested, false);
  assert.equal(config.wordTimestampAnalysisEnabled, false);
  assert.match(config.timestampDisabledReason, /عُطّل/);
});

test('refuses timestamp models that do not support the current word timestamp API parameters', () => {
  const config = getTranscriptionConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_WORD_TIMESTAMP_MODEL: 'gpt-transcribe'
  });
  assert.equal(config.wordTimestampModel, 'gpt-transcribe');
  assert.equal(config.timestampModelSupported, false);
  assert.equal(config.wordTimestampAnalysisEnabled, false);
  assert.match(config.timestampDisabledReason, /whisper-1 فقط/);
});

test('accepts a configured speech transcription model without changing timestamp-provider validation', () => {
  const config = getTranscriptionConfig({
    OPENAI_API_KEY: 'test-key',
    OPENAI_TRANSCRIPTION_MODEL: 'gpt-transcribe'
  });
  assert.equal(config.transcriptionModel, 'gpt-transcribe');
  assert.equal(config.wordTimestampAnalysisEnabled, true);
  assert.equal(WORD_TIMESTAMP_MODEL_REMOVAL_DATE, '2027-02-26');
});
