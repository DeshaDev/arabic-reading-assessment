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
        transcriptIndex: j - 1,
        targetWord: reference[i - 1].text,
        spokenWord: transcript[j - 1].text
      });
      i--;
      j--;
      continue;
    }

    // Backtracking moves right-to-left: a redundant repeated token may be
    // the earlier token in the adjacent pair because the later one was matched first.
    const sameAsPrevious = j > 1 && transcript[j - 1].normalized === transcript[j - 2].normalized;
    const sameAsNext = j < transcript.length && transcript[j - 1].normalized === transcript[j].normalized;
    const differsFromCurrentTarget = i > 0 && transcript[j - 1] && transcript[j - 1].normalized !== reference[i - 1].normalized;
    if (j > 0 && differsFromCurrentTarget && (sameAsPrevious || sameAsNext)) {
      const repetitionTargetIndex = sameAsNext
        ? (i < reference.length ? i : reference.length)
        : (i > 0 ? i - 1 : reference.length);
      reversed.push({
        type: 'repetition',
        targetIndex: repetitionTargetIndex,
        transcriptIndex: j - 1,
        targetWord: repetitionTargetIndex < reference.length ? reference[repetitionTargetIndex].text : null,
        spokenWord: transcript[j - 1].text
      });
      j--;
      continue;
    }

    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      reversed.push({
        type: 'substitution',
        targetIndex: i - 1,
        transcriptIndex: j - 1,
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
        transcriptIndex: null,
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
        transcriptIndex: j - 1,
        targetWord: i > 0 ? reference[i - 1].text : null,
        spokenWord: spokenWord
      });
      j--;
      continue;
    }

    // Defensive fallback for any unexpected dynamic-programming state.
    if (i > 0) {
      reversed.push({ type: 'deletion', targetIndex: i - 1, transcriptIndex: null, targetWord: reference[i - 1].text, spokenWord: null });
      i--;
    } else if (j > 0) {
      reversed.push({ type: 'insertion', targetIndex: reference.length, transcriptIndex: j - 1, targetWord: null, spokenWord: transcript[j - 1].text });
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

function alignTimedWordsToTranscript(transcriptText, timedWords) {
  const transcript = tokenizeArabic(transcriptText);
  const flattened = [];
  (Array.isArray(timedWords) ? timedWords : []).slice(0, 1500).forEach(function (timedWord) {
    const wordText = String(timedWord && (timedWord.word || timedWord.text) || '');
    const tokens = tokenizeArabic(wordText);
    const start = Number(timedWord && timedWord.start);
    const end = Number(timedWord && timedWord.end);
    tokens.forEach(function (token) {
      flattened.push({
        text: token.text,
        normalized: token.normalized,
        start: Number.isFinite(start) && start >= 0 ? start : null,
        end: Number.isFinite(end) && end > start ? end : null,
        sourceWord: wordText
      });
    });
  });
  if (transcript.length > 1000 || flattened.length > 1500) {
    throw new RangeError('النص أو عدد كلمات التوقيت أطول من الحد المسموح.');
  }
  const aligned = alignReadingTranscript(transcript.map(function (word) { return word.text; }).join(' '),
    flattened.map(function (word) { return word.text; }).join(' '));
  const words = transcript.map(function (word) {
    return {
      transcriptIndex: word.index,
      word: word.text,
      startSeconds: null,
      endSeconds: null,
      timingQuality: 'unmatched'
    };
  });
  let matched = 0;
  aligned.operations.forEach(function (operation) {
    if (operation.type !== 'match' || operation.targetIndex == null || operation.transcriptIndex == null) return;
    const baseWord = transcript[operation.targetIndex];
    const timedWord = flattened[operation.transcriptIndex];
    if (!baseWord || !timedWord || timedWord.start === null || timedWord.end === null) return;
    if (baseWord.normalized !== timedWord.normalized) return;
    words[operation.targetIndex] = {
      transcriptIndex: baseWord.index,
      word: baseWord.text,
      startSeconds: Math.round(timedWord.start * 1000) / 1000,
      endSeconds: Math.round(timedWord.end * 1000) / 1000,
      timingQuality: 'cross-model-agreement'
    };
    matched++;
  });
  const coveragePercent = transcript.length
    ? Math.round(matched / transcript.length * 1000) / 10
    : 0;
  return {
    transcriptWordCount: transcript.length,
    timestampWordCount: flattened.length,
    matchedWordCount: matched,
    coveragePercent: coveragePercent,
    quality: matched > 0 ? 'partial' : 'unavailable',
    words: words
  };
}

module.exports = { normalizeArabicWord, tokenizeArabic, alignReadingTranscript, alignTimedWordsToTranscript };
