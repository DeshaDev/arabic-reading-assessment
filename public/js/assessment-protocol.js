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

  function summarizeWordGaze(samples, targetWordCount, options) {
    const settings = Object.assign({ maximumSampleGapMs: 300, minimumVisitMs: 80 }, options || {});
    const targetCount = Math.max(0, Math.min(2000, Math.floor(Number(targetWordCount) || 0)));
    const safeSamples = Array.isArray(samples) ? samples.filter(function (sample) {
      return sample && Number.isFinite(Number(sample.t));
    }) : [];
    const wordSamples = safeSamples.filter(function (sample) {
      const index = Number(sample.wordIndex);
      return Number.isInteger(index) && index >= 0 && index < targetCount;
    });
    const visits = [];
    let active = null;

    function closeVisit() {
      if (!active) return;
      const durationMs = Math.max(0, active.lastT - active.startT);
      if (active.sampleCount >= 2 && durationMs >= settings.minimumVisitMs) {
        visits.push({
          wordIndex: active.wordIndex,
          durationMs: Math.round(durationMs),
          sampleCount: active.sampleCount
        });
      }
      active = null;
    }

    safeSamples.forEach(function (sample) {
      const rawIndex = sample.wordIndex;
      const index = Number(rawIndex);
      const isWord = rawIndex !== null && rawIndex !== undefined &&
        Number.isInteger(index) && index >= 0 && index < targetCount;
      const timestamp = Number(sample.t);
      if (!isWord) {
        closeVisit();
        return;
      }
      if (active && active.wordIndex === index &&
          timestamp >= active.lastT && timestamp - active.lastT <= settings.maximumSampleGapMs) {
        active.lastT = timestamp;
        active.sampleCount++;
      } else {
        closeVisit();
        active = { wordIndex: index, startT: timestamp, lastT: timestamp, sampleCount: 1 };
      }
    });
    closeVisit();

    const dwellByWord = new Map();
    visits.forEach(function (visit) {
      const item = dwellByWord.get(visit.wordIndex) || {
        wordIndex: visit.wordIndex, totalDwellMs: 0, visitCount: 0, longestDwellMs: 0
      };
      item.totalDwellMs += visit.durationMs;
      item.visitCount++;
      item.longestDwellMs = Math.max(item.longestDwellMs, visit.durationMs);
      dwellByWord.set(visit.wordIndex, item);
    });
    const perWord = Array.from(dwellByWord.values()).sort(function (a, b) { return a.wordIndex - b.wordIndex; });
    const seen = new Set(perWord.map(function (item) { return item.wordIndex; }));
    let regressions = 0;
    let forwardTransitions = 0;
    for (let i = 1; i < visits.length; i++) {
      if (visits[i].wordIndex < visits[i - 1].wordIndex) regressions++;
      else if (visits[i].wordIndex > visits[i - 1].wordIndex) forwardTransitions++;
    }
    const inTextSamples = wordSamples.length;
    const sampleCoveragePercent = safeSamples.length
      ? Math.round(inTextSamples / safeSamples.length * 1000) / 10
      : 0;
    const wordCoveragePercent = targetCount
      ? Math.round(seen.size / targetCount * 1000) / 10
      : 0;
    const quality = targetCount > 0 && inTextSamples >= 10 && seen.size >= Math.min(3, targetCount)
      ? 'observed'
      : 'insufficient';

    return {
      quality: quality,
      targetWordCount: targetCount,
      sampleCount: safeSamples.length,
      inTextSamples: inTextSamples,
      sampleCoveragePercent: sampleCoveragePercent,
      uniqueWordsSeen: seen.size,
      wordCoveragePercent: wordCoveragePercent,
      stableWordVisits: visits.length,
      totalDwellMs: visits.reduce(function (sum, visit) { return sum + visit.durationMs; }, 0),
      regressions: regressions,
      forwardTransitions: forwardTransitions,
      perWord: perWord.map(function (item) {
        return {
          wordIndex: item.wordIndex,
          totalDwellMs: Math.round(item.totalDwellMs),
          visitCount: item.visitCount,
          longestDwellMs: Math.round(item.longestDwellMs)
        };
      })
    };
  }

  function summarizeLowEnergyFrames(energyValues, frameDurationSeconds, peakRms, options) {
    const settings = Object.assign({
      thresholdFloorRms: 0.003,
      relativeThreshold: 0.10,
      bridgeGapFrames: 4,
      minimumPauseMs: 280,
      longPauseMs: 700,
      minimumDurationSeconds: 2,
      minimumPeakRms: 0.006
    }, options || {});
    const values = Array.isArray(energyValues) ? energyValues.slice(0, 180000).map(function (value) {
      return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    }) : [];
    const step = Math.max(0.001, Number(frameDurationSeconds) || 0.02);
    const peak = Math.max(0, Number(peakRms) || 0);
    const durationSeconds = Math.max(0, Number(settings.durationSeconds) || values.length * step);
    const threshold = Math.max(settings.thresholdFloorRms, peak * settings.relativeThreshold);
    const active = values.map(function (value) { return value >= threshold; });

    let cursor = 0;
    while (cursor < active.length) {
      if (active[cursor]) { cursor++; continue; }
      const start = cursor;
      while (cursor < active.length && !active[cursor]) cursor++;
      const gapLength = cursor - start;
      if (start > 0 && cursor < active.length && gapLength <= settings.bridgeGapFrames) {
        for (let k = start; k < cursor; k++) active[k] = true;
      }
    }

    const regions = [];
    let regionStart = null;
    for (let frame = 0; frame < active.length; frame++) {
      if (active[frame] && regionStart === null) regionStart = frame;
      if (!active[frame] && regionStart !== null) {
        regions.push({ start: regionStart, end: frame });
        regionStart = null;
      }
    }
    if (regionStart !== null) regions.push({ start: regionStart, end: active.length });

    const pauses = [];
    for (let i = 1; i < regions.length; i++) {
      const durationMs = Math.round((regions[i].start - regions[i - 1].end) * step * 1000);
      if (durationMs >= settings.minimumPauseMs) {
        pauses.push({
          startSeconds: Math.round(regions[i - 1].end * step * 100) / 100,
          endSeconds: Math.round(regions[i].start * step * 100) / 100,
          durationMs: durationMs,
          kind: durationMs >= settings.longPauseMs ? 'long-low-energy-gap' : 'low-energy-gap'
        });
      }
    }

    const activeFrames = active.filter(Boolean).length;
    const voiceActivityRatioPercent = active.length
      ? Math.round(activeFrames / active.length * 1000) / 10
      : 0;
    const quality = durationSeconds >= settings.minimumDurationSeconds &&
      peak >= settings.minimumPeakRms && activeFrames >= 6 ? 'observed' : 'insufficient';
    return {
      method: 'local-rms-energy-v1',
      quality: quality,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      voiceActivityRatioPercent: voiceActivityRatioPercent,
      pauseCount: pauses.length,
      longPauseCount: pauses.filter(function (pause) { return pause.durationMs >= settings.longPauseMs; }).length,
      longestPauseMs: pauses.reduce(function (longest, pause) { return Math.max(longest, pause.durationMs); }, 0),
      pauses: pauses.slice(0, 40),
      thresholdRms: Math.round(threshold * 100000) / 100000
    };
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function assessCalibrationValidation(measurements, viewportWidth, viewportHeight) {
    const width = Math.max(1, Number(viewportWidth) || 1);
    const height = Math.max(1, Number(viewportHeight) || 1);
    const tolerancePx = Math.round(Math.max(90, Math.min(width, height) * 0.22));
    const valid = (Array.isArray(measurements) ? measurements : []).filter(function (item) {
      return item && Number(item.sampleCount) >= 6 && Number.isFinite(Number(item.errorPx)) && Number(item.errorPx) >= 0;
    });
    const errors = valid.map(function (item) { return Number(item.errorPx); });
    const medianErrorPx = median(errors);
    const meanErrorPx = errors.length ? errors.reduce(function (sum, value) { return sum + value; }, 0) / errors.length : null;
    const targetsWithinTolerance = errors.filter(function (error) { return error <= tolerancePx * 1.5; }).length;
    const passed = valid.length >= 4 && medianErrorPx !== null &&
      medianErrorPx <= tolerancePx && targetsWithinTolerance >= 4;

    return {
      passed: passed,
      validationTargetCount: Array.isArray(measurements) ? measurements.length : 0,
      validTargetCount: valid.length,
      targetsWithinTolerance: targetsWithinTolerance,
      tolerancePx: tolerancePx,
      medianErrorPx: medianErrorPx === null ? null : Math.round(medianErrorPx),
      meanErrorPx: meanErrorPx === null ? null : Math.round(meanErrorPx),
      quality: passed ? 'within-internal-tolerance' : 'insufficient-or-outside-tolerance'
    };
  }

  const api = { countArabicWords, calculateObservedWpm, createRapidNamingSequence, summarizeReadingSegments, summarizeWordMarks, summarizeWordGaze, assessCalibrationValidation, summarizeLowEnergyFrames, WORD_MARK_TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ReadingAssessmentProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
