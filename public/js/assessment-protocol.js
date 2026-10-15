(function (root) {
  'use strict';

  function countArabicWords(text) {
    const plain = String(text || '')
      .normalize('NFC')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
    return (plain.match(/[\p{L}\p{N}]+/gu) || []).length;
  }

  function calculateObservedWpm(wordCount, durationSeconds, options) {
    const settings = Object.assign({ minimumSeconds: 15, maximumWpm: 240 }, options || {});
    const words = Number(wordCount);
    const seconds = Number(durationSeconds);
    if (!Number.isFinite(words) || words <= 0 || !Number.isFinite(seconds) ||
        seconds < settings.minimumSeconds) return null;
    const wpm = Math.round(words * 60 / seconds);
    return wpm > 0 && wpm <= settings.maximumWpm ? wpm : null;
  }

  function createRapidNamingSequence(random) {
    const rng = typeof random === 'function' ? random : Math.random;
    const alphabet = Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');
    const sequence = alphabet.concat(alphabet.slice(0, 8));
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = sequence[i];
      sequence[i] = sequence[j];
      sequence[j] = tmp;
    }
    return sequence;
  }

  const WORD_MARK_TYPES = ['substitution', 'omission', 'hesitation', 'selfCorrection'];

  function summarizeWordMarks(marks) {
    const result = { total: 0, substitution: 0, omission: 0, hesitation: 0, selfCorrection: 0 };
    const seen = new Set();
    (Array.isArray(marks) ? marks : []).forEach(function (mark) {
      if (!mark || !Number.isInteger(Number(mark.wordIndex)) || Number(mark.wordIndex) < 0 ||
          !WORD_MARK_TYPES.includes(mark.type) || seen.has(Number(mark.wordIndex))) return;
      seen.add(Number(mark.wordIndex));
      result[mark.type] += 1;
      result.total += 1;
    });
    return result;
  }

  function summarizeReadingSegments(segments) {
    const safe = Array.isArray(segments) ? segments : [];
    const valid = safe.filter(function (segment) {
      return segment && Number.isFinite(Number(segment.durationSeconds)) &&
        Number(segment.durationSeconds) > 0 && Number.isFinite(Number(segment.wordCount)) &&
        Number(segment.wordCount) > 0;
    });
    const modes = new Set(valid.map(function (segment) { return segment.mode; }).filter(Boolean));
    const comparableMode = modes.size <= 1;
    const durationSeconds = valid.reduce(function (sum, segment) {
      return sum + Number(segment.durationSeconds);
    }, 0);
    const wordCount = valid.reduce(function (sum, segment) {
      return sum + Number(segment.wordCount);
    }, 0);
    const totalErrors = valid.reduce(function (sum, segment) {
      return sum + Math.max(0, Number(segment.errors) || 0);
    }, 0);
    const omissions = valid.reduce(function (sum, segment) {
      return sum + Math.max(0, Number(segment.omissions) || 0);
    }, 0);
    const selfCorrections = valid.reduce(function (sum, segment) {
      return sum + Math.max(0, Number(segment.selfCorrections) || 0);
    }, 0);
    return {
      segmentCount: valid.length,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      wordCount: wordCount,
      wpm: comparableMode ? calculateObservedWpm(wordCount, durationSeconds) : null,
      comparableMode: comparableMode,
      teacherMarkedErrors: totalErrors,
      omissions: omissions,
      selfCorrections: selfCorrections
    };
  }

  const api = { countArabicWords, calculateObservedWpm, createRapidNamingSequence, summarizeReadingSegments, summarizeWordMarks, WORD_MARK_TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ReadingAssessmentProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
