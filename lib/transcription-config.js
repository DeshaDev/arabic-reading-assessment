'use strict';

const WORD_TIMESTAMP_MODEL_REMOVAL_DATE = '2027-02-26';

function getTranscriptionConfig(env) {
  const source = env && typeof env === 'object' ? env : process.env;
  const transcriptionModel = String(source.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe').trim() || 'gpt-transcribe';
  const wordTimestampModel = String(source.OPENAI_WORD_TIMESTAMP_MODEL || 'whisper-1').trim() || 'whisper-1';
  const apiKeyAvailable = Boolean(String(source.OPENAI_API_KEY || '').trim());
  const timestampRequested = String(source.OPENAI_ENABLE_WORD_TIMESTAMPS || '').toLowerCase() !== 'false';
  const timestampModelSupported = wordTimestampModel === 'whisper-1';

  let timestampDisabledReason = null;
  if (!apiKeyAvailable) {
    timestampDisabledReason = 'لا يوجد مفتاح API على الخادم.';
  } else if (!timestampRequested) {
    timestampDisabledReason = 'عُطّل تمرير توقيت الكلمات عبر الإعداد.';
  } else if (!timestampModelSupported) {
    timestampDisabledReason = 'واجهة التوقيتات التفصيلية الحالية تدعم whisper-1 فقط؛ لم يُرسل طلب بتكوين غير مدعوم.';
  }

  return {
    apiKeyAvailable,
    transcriptionModel,
    wordTimestampModel,
    timestampRequested,
    timestampModelSupported,
    wordTimestampAnalysisEnabled: apiKeyAvailable && timestampRequested && timestampModelSupported,
    timestampDisabledReason,
    wordTimestampModelRemovalDate: WORD_TIMESTAMP_MODEL_REMOVAL_DATE,
    wordTimestampModelIsLegacy: timestampModelSupported
  };
}

module.exports = { getTranscriptionConfig, WORD_TIMESTAMP_MODEL_REMOVAL_DATE };
