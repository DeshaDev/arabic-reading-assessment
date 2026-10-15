'use strict';

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/gu;
const TOKEN_PATTERN = /[\p{L}\p{N}\u064B-\u065F\u0670]+/gu;

function normalizeArabicWord(word) {
  return String(word || '')
    .normalize('NFC')
    .replace(/ـ/g, '')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLocaleLowerCase('ar');
}

function tokenizeArabic(text) {
  const source = String(text || '').normalize('NFC');
  const words = source.match(TOKEN_PATTERN) || [];
  return words.map(function (word, index) {
    return { text: word, normalized: normalizeArabicWord(word), index: index };
  }).filter(function (word) {
    return Boolean(word.normalized);
  });
}

function alignReadingTranscript(referenceText, transcriptText) {
  const reference = tokenizeArabic(referenceText);
  const transcript = tokenizeArabic(transcriptText);
  if (reference.length > 1000 || transcript.length > 1000) {
    throw new RangeError('النص أطول من الحد المسموح للتحليل.');
  }

  const rows = reference.length + 1;
  const cols = transcript.length + 1;
  const dp = Array.from({ length: rows }, function () {
    return new Uint16Array(cols);
  });
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = reference[i - 1].normalized === transcript[j - 1].normalized ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const reversed = [];
  let i = reference.length;
  let j = transcript.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 &&
        reference[i - 1].normalized === transcript[j - 1].normalized &&
        dp[i][j] === dp[i - 1][j - 1]) {
      reversed.push({
        type: 'match',
        targetIndex: i - 1,
        targetWord: reference[i - 1].text,
        spokenWord: transcript[j - 1].text
      });
      i--;
      j--;
      continue;
    }

    // If an adjacent ASR token repeats and insertion is an equally short edit,
    // prefer recording a possible repetition instead of shifting alignment into substitution.
    if (j > 1 &&
        transcript[j - 1].normalized === transcript[j - 2].normalized &&
        dp[i][j] === dp[i][j - 1] + 1) {
      reversed.push({
        type: 'repetition',
        targetIndex: i > 0 ? i - 1 : reference.length,
        targetWord: i > 0 ? reference[i - 1].text : null,
        spokenWord: transcript[j - 1].text
      });
      j--;
      continue;
    }

    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      reversed.push({
        type: 'substitution',
        targetIndex: i - 1,
        targetWord: reference[i - 1].text,
        spokenWord: transcript[j - 1].text
      });
      i--;
      j--;
      continue;
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      reversed.push({
        type: 'deletion',
        targetIndex: i - 1,
        targetWord: reference[i - 1].text,
        spokenWord: null
      });
      i--;
      continue;
    }

    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      const spokenWord = transcript[j - 1].text;
      const prior = j > 1 ? transcript[j - 2].normalized : null;
      const isRepetition = prior !== null && prior === transcript[j - 1].normalized;
      reversed.push({
        type: isRepetition ? 'repetition' : 'insertion',
        targetIndex: i > 0 ? i - 1 : reference.length,
        targetWord: i > 0 ? reference[i - 1].text : null,
        spokenWord: spokenWord
      });
      j--;
      continue;
    }

    // Defensive fallback for any unexpected dynamic-programming state.
    if (i > 0) {
      reversed.push({ type: 'deletion', targetIndex: i - 1, targetWord: reference[i - 1].text, spokenWord: null });
      i--;
    } else if (j > 0) {
      reversed.push({ type: 'insertion', targetIndex: reference.length, targetWord: null, spokenWord: transcript[j - 1].text });
      j--;
    }
  }

  const operations = reversed.reverse();
  const counts = { matches: 0, substitutions: 0, deletions: 0, insertions: 0, repetitions: 0 };
  operations.forEach(function (operation) {
    if (operation.type === 'match') counts.matches++;
    else if (operation.type === 'substitution') counts.substitutions++;
    else if (operation.type === 'deletion') counts.deletions++;
    else if (operation.type === 'repetition') counts.repetitions++;
    else if (operation.type === 'insertion') counts.insertions++;
  });
  const errors = counts.substitutions + counts.deletions + counts.insertions + counts.repetitions;
  const wer = reference.length ? errors / reference.length : null;

  return {
    referenceWordCount: reference.length,
    transcriptWordCount: transcript.length,
    counts: counts,
    editDistanceErrors: errors,
    wordErrorRate: wer === null ? null : Math.round(wer * 1000) / 1000,
    operations: operations
  };
}

module.exports = { normalizeArabicWord, tokenizeArabic, alignReadingTranscript };
