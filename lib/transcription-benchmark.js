'use strict';

const { alignReadingTranscript } = require('./reading-alignment');
const ANNOTATION_TYPES = new Set(['substitution', 'deletion', 'insertion', 'repetition']);

function validateRecord(record, index, seenIds) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('سجل الاختبار رقم ' + (index + 1) + ' ليس كائنًا صالحًا.');
  }
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const grade = Number(record.grade);
  const mode = typeof record.mode === 'string' ? record.mode.trim() : '';
  const model = typeof record.model === 'string' ? record.model.trim() : '';
  const referenceText = typeof record.referenceText === 'string' ? record.referenceText.trim() : '';
  const transcriptText = typeof record.transcriptText === 'string' ? record.transcriptText.trim() : '';

  if (!id || id.length > 80) throw new TypeError('يجب أن يحتوي كل سجل على معرّف مجهول لا يتجاوز 80 حرفًا.');
  if (seenIds.has(id)) throw new TypeError('المعرّف مكرر في مجموعة الاختبار: ' + id);
  seenIds.add(id);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) throw new TypeError('الصف غير صالح في السجل ' + id + '.');
  if (!['oral', 'unknown'].includes(mode)) throw new TypeError('طريقة القراءة يجب أن تكون oral أو unknown في السجل ' + id + '.');
  if (!model || model.length > 100) throw new TypeError('اسم النموذج مطلوب في السجل ' + id + '.');
  if (!referenceText || referenceText.length > 12000 || !transcriptText || transcriptText.length > 12000) {
    throw new TypeError('النص المرجعي والتفريغ مطلوبان وبحد أقصى 12000 حرف في السجل ' + id + '.');
  }

  const annotationsProvided = Object.prototype.hasOwnProperty.call(record, 'expertAnnotations');
  if (annotationsProvided && !Array.isArray(record.expertAnnotations)) {
    throw new TypeError('expertAnnotations يجب أن تكون مصفوفة في السجل ' + id + '.');
  }

  return {
    id,
    grade,
    mode,
    model,
    referenceText,
    transcriptText,
    annotationsProvided,
    expertAnnotations: annotationsProvided ? record.expertAnnotations : []
  };
}

function operationKey(operation) {
  return operation.type + ':' + operation.targetIndex;
}

function validateExpertAnnotations(annotations, referenceWordCount, id) {
  const keys = new Set();
  annotations.forEach((annotation, index) => {
    const type = annotation && annotation.type;
    const targetIndex = Number(annotation && annotation.targetIndex);
    if (!ANNOTATION_TYPES.has(type)) {
      throw new TypeError('نوع annotation غير صالح في السجل ' + id + ' عند العلامة ' + (index + 1) + '.');
    }
    const maxIndex = type === 'insertion' ? referenceWordCount : referenceWordCount - 1;
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > maxIndex) {
      throw new TypeError('targetIndex خارج النطاق في السجل ' + id + ' عند العلامة ' + (index + 1) + '.');
    }
    const key = type + ':' + targetIndex;
    if (keys.has(key)) throw new TypeError('علامة خبيرة مكررة في السجل ' + id + ': ' + key);
    keys.add(key);
  });
  return keys;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.round(numerator / denominator * 10000) / 10000 : null;
}

function calculateExpertDetection(predictedKeys, expertKeys) {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  predictedKeys.forEach(key => {
    if (expertKeys.has(key)) truePositives++;
    else falsePositives++;
  });
  expertKeys.forEach(key => {
    if (!predictedKeys.has(key)) falseNegatives++;
  });
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : Math.round((2 * precision * recall / (precision + recall)) * 10000) / 10000;
  return { truePositives, falsePositives, falseNegatives, precision, recall, f1 };
}

function summarizeRows(rows) {
  const counts = { matches: 0, substitutions: 0, deletions: 0, insertions: 0, repetitions: 0 };
  let referenceWords = 0;
  let transcriptWords = 0;
  let editDistanceErrors = 0;
  let annotatedRecords = 0;
  const expert = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };

  rows.forEach(row => {
    referenceWords += row.referenceWordCount;
    transcriptWords += row.transcriptWordCount;
    editDistanceErrors += row.editDistanceErrors;
    Object.keys(counts).forEach(key => { counts[key] += row.counts[key] || 0; });
    if (row.expertDetection) {
      annotatedRecords++;
      expert.truePositives += row.expertDetection.truePositives;
      expert.falsePositives += row.expertDetection.falsePositives;
      expert.falseNegatives += row.expertDetection.falseNegatives;
    }
  });

  const precision = annotatedRecords ? ratio(expert.truePositives, expert.truePositives + expert.falsePositives) : null;
  const recall = annotatedRecords ? ratio(expert.truePositives, expert.truePositives + expert.falseNegatives) : null;
  return {
    records: rows.length,
    annotatedRecords,
    referenceWords,
    transcriptWords,
    counts,
    editDistanceErrors,
    weightedWordErrorRate: ratio(editDistanceErrors, referenceWords),
    expertDetection: {
      ...expert,
      precision,
      recall,
      f1: precision === null || recall === null || precision + recall === 0
        ? null : Math.round((2 * precision * recall / (precision + recall)) * 10000) / 10000
    }
  };
}

function scoreTranscriptionBenchmark(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('أدخل مصفوفة غير فارغة من سجلات الاختبار.');
  }
  if (records.length > 10000) throw new RangeError('عدد سجلات الاختبار يتجاوز 10000.');

  const seenIds = new Set();
  const results = records.map((record, index) => {
    const normalized = validateRecord(record, index, seenIds);
    const alignment = alignReadingTranscript(normalized.referenceText, normalized.transcriptText);
    if (alignment.referenceWordCount === 0) {
      throw new TypeError('النص المرجعي في السجل ' + normalized.id + ' لا يحتوي كلمات قابلة للتقييم.');
    }
    const actualKeys = new Set(alignment.operations
      .filter(operation => operation.type !== 'match')
      .map(operationKey));
    let expertDetection = null;

    if (normalized.annotationsProvided) {
      const expertKeys = validateExpertAnnotations(normalized.expertAnnotations, alignment.referenceWordCount, normalized.id);
      expertDetection = calculateExpertDetection(actualKeys, expertKeys);
    }

    return {
      id: normalized.id,
      grade: normalized.grade,
      mode: normalized.mode,
      model: normalized.model,
      referenceWordCount: alignment.referenceWordCount,
      transcriptWordCount: alignment.transcriptWordCount,
      counts: alignment.counts,
      editDistanceErrors: alignment.editDistanceErrors,
      wordErrorRate: alignment.wordErrorRate,
      differences: alignment.operations.filter(operation => operation.type !== 'match'),
      expertDetection
    };
  });

  const groupBy = field => {
    const buckets = new Map();
    results.forEach(row => {
      const key = String(row[field]);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(row);
    });
    const output = {};
    Array.from(buckets.keys()).sort().forEach(key => { output[key] = summarizeRows(buckets.get(key)); });
    return output;
  };

  return {
    schemaVersion: 'nebras-transcription-benchmark-1',
    generatedAt: new Date().toISOString(),
    methodology: {
      weightedWordErrorRate: 'مجموع الاستبدال والحذف والإضافة والتكرار المحتمل ÷ مجموع كلمات النص المرجعي. هذا لا يقيس أخطاء النطق التي لا تظهر في التفريغ النصي.',
      expertDetection: 'تُحسب precision/recall/F1 فقط للسجلات التي تحتوي expertAnnotations، بمطابقة النوع وtargetIndex. العلامات البشرية يجب أن يضعها مختصون بعد مراجعة الصوت.',
      caution: 'هذه أداة تقييم بيانات، وليست معيارًا سريريًا أو إثباتًا لصلاحية التشخيص.'
    },
    overall: summarizeRows(results),
    byGrade: groupBy('grade'),
    byMode: groupBy('mode'),
    byModel: groupBy('model'),
    records: results
  };
}

module.exports = { scoreTranscriptionBenchmark, validateExpertAnnotations };
