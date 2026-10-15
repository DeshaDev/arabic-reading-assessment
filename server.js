const express = require('express');
const path = require('path');
const fs = require('fs');
const { alignReadingTranscript, alignTimedWordsToTranscript } = require('./lib/reading-alignment');
const { getTranscriptionConfig } = require('./lib/transcription-config');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const DATA_DIR = process.env.NEBRAS_DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'database.json');

// Initialize database with realistic seed data if not present
function initializeDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const seedData = { students: [], sessions: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(seedData, null, 2), 'utf-8');
  }
}

initializeDatabase();

function readDatabase() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB:', err);
    return { students: [], sessions: [] };
  }
}

function writeDatabase(data) {
  const temporaryFile = DB_FILE + '.tmp';
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(temporaryFile, DB_FILE);
}

// REST endpoints. This server is a local prototype, not a production student-data service.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Nebras Arabic Reading Assessment Prototype',
    version: '1.3.0',
    mode: 'prototype',
    automaticSpeechAnalysisEnabled: getTranscriptionConfig().apiKeyAvailable,
    wordLevelGazeSummaryEnabled: true,
    independentCalibrationValidationEnabled: true,
    transcriptionModel: getTranscriptionConfig().transcriptionModel,
    wordTimestampAnalysisEnabled: getTranscriptionConfig().wordTimestampAnalysisEnabled,
    wordTimestampModel: getTranscriptionConfig().wordTimestampModel,
    wordTimestampModelIsLegacy: getTranscriptionConfig().wordTimestampModelIsLegacy,
    wordTimestampModelRemovalDate: getTranscriptionConfig().wordTimestampModelRemovalDate,
    wordTimestampDisabledReason: getTranscriptionConfig().timestampDisabledReason,
    privacyNotice: 'Do not use identifiable student data in a publicly exposed deployment.'
  });
});

// Students
app.get('/api/students', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readDatabase().students);
});

app.post('/api/students', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const classroom = typeof body.classroom === 'string' ? body.classroom.trim() : '';
  const grade = Number(body.grade);
  const age = Number(body.age);
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const gender = typeof body.gender === 'string' ? body.gender.trim() : 'غير محدد';

  if (!name || name.length > 100) return res.status(400).json({ error: 'اسم الطالب مطلوب ويجب ألا يتجاوز 100 حرف.' });
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return res.status(400).json({ error: 'الصف يجب أن يكون بين 1 و6.' });
  if (!classroom || classroom.length > 40) return res.status(400).json({ error: 'الفصل مطلوب ويجب ألا يتجاوز 40 حرفًا.' });
  if (!Number.isFinite(age) || age < 5 || age > 15) return res.status(400).json({ error: 'العمر يجب أن يكون بين 5 و15 سنة.' });
  if (notes.length > 1000) return res.status(400).json({ error: 'الملاحظات لا يجب أن تتجاوز 1000 حرف.' });
  if (gender.length > 20) return res.status(400).json({ error: 'قيمة الجنس غير صالحة.' });

  const db = readDatabase();
  const newStudent = {
    id: 'std_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name, gender, grade, age,
    school: '',
    classroom,
    lastAssessment: null,
    riskLevel: 'none',
    avgWpm: null,
    notes
  };
  db.students.unshift(newStudent);
  writeDatabase(db);
  res.status(201).json(newStudent);
});

// Session summaries. Raw gaze coordinates are intentionally not persisted in the JSON database.
app.get('/api/sessions', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readDatabase().sessions);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = readDatabase().sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة.' });
  res.set('Cache-Control', 'no-store');
  res.json(session);
});

app.post('/api/sessions', (req, res) => {
  const body = req.body || {};
  const durationSeconds = Number(body.durationSeconds);
  const comprehensionScore = Number(body.comprehensionScore);
  const comprehensionTotal = Number(body.comprehensionTotal);
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : '';
  const textId = typeof body.textId === 'string' ? body.textId : '';
  const textTitle = typeof body.textTitle === 'string' ? body.textTitle.slice(0, 180) : '';
  const grade = Number(body.grade);
  const wpm = body.wpm === null || body.wpm === undefined ? null : Number(body.wpm);

  if (!studentId || !textId || !textTitle || !studentName) return res.status(400).json({ error: 'بيانات الطالب والنص مطلوبة.' });
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 3600) return res.status(400).json({ error: 'مدة الجلسة غير صالحة.' });
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return res.status(400).json({ error: 'الصف غير صالح.' });
  if (!Number.isInteger(comprehensionScore) || !Number.isInteger(comprehensionTotal) || comprehensionTotal < 0 || comprehensionScore < 0 || comprehensionScore > comprehensionTotal || comprehensionTotal > 30) {
    return res.status(400).json({ error: 'قيم أسئلة الفهم غير صالحة.' });
  }
  if (wpm !== null && (!Number.isFinite(wpm) || wpm < 0 || wpm > 240)) return res.status(400).json({ error: 'تعذر قبول سرعة القراءة؛ راجع مدة الجلسة.' });

  const db = readDatabase();
  const student = db.students.find(s => s.id === studentId);
  if (!student) return res.status(404).json({ error: 'سجل الطالب غير موجود؛ حدّث قائمة الطلاب وحاول مرة أخرى.' });

  const incomingMetrics = body.metrics && typeof body.metrics === 'object' ? body.metrics : {};
  const metrics = {
    totalFixations: Math.max(0, Math.min(10000, Number(incomingMetrics.totalFixations) || 0)),
    avgFixationDurationMs: Math.max(0, Math.min(10000, Number(incomingMetrics.avgFixationDurationMs) || 0)),
    forwardSaccadesCount: Math.max(0, Math.min(100000, Number(incomingMetrics.forwardSaccadesCount) || 0)),
    regressionsCount: Math.max(0, Math.min(100000, Number(incomingMetrics.regressionsCount) || 0)),
    regressionRatePercent: Math.max(0, Math.min(100, Number(incomingMetrics.regressionRatePercent) || 0)),
    lineSweepsCount: Math.max(0, Math.min(100000, Number(incomingMetrics.lineSweepsCount) || 0)),
    sampleCount: Math.max(0, Math.min(1000000, Number(incomingMetrics.sampleCount) || 0))
  };
  const clampInt = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  const optionalSeconds = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 3600 ? Math.round(number * 100) / 100 : null;
  };
  const rawGazeCalibration = body.gazeCalibration && typeof body.gazeCalibration === 'object'
    ? body.gazeCalibration : null;
  const safeGazeCalibration = rawGazeCalibration ? {
    passed: rawGazeCalibration.passed === true,
    validationTargetCount: clampInt(rawGazeCalibration.validationTargetCount, 5),
    validTargetCount: clampInt(rawGazeCalibration.validTargetCount, 5),
    targetsWithinTolerance: clampInt(rawGazeCalibration.targetsWithinTolerance, 5),
    tolerancePx: clampInt(rawGazeCalibration.tolerancePx, 5000),
    medianErrorPx: rawGazeCalibration.medianErrorPx == null ? null : clampInt(rawGazeCalibration.medianErrorPx, 10000),
    meanErrorPx: rawGazeCalibration.meanErrorPx == null ? null : clampInt(rawGazeCalibration.meanErrorPx, 10000),
    quality: rawGazeCalibration.passed === true ? 'within-internal-tolerance' : 'insufficient-or-outside-tolerance'
  } : null;
  const risk = body.riskClassification && typeof body.riskClassification === 'object' ? body.riskClassification : {};
  const riskClassification = {
    level: risk.level === 'observations' && wpm !== null ? 'observations' : 'insufficient',
    levelAr: risk.level === 'observations' && wpm !== null ? 'مؤشرات وصفية — لا تصنيف تشخيصي' : 'بيانات غير كافية للتفسير',
    score: null,
    hasValidGaze: body.hasValidGaze === true && safeGazeCalibration !== null && safeGazeCalibration.passed === true && durationSeconds >= 10 && metrics.totalFixations >= 2,
    reasons: Array.isArray(risk.reasons) ? risk.reasons.slice(0, 12).filter(x => typeof x === 'string').map(x => x.slice(0, 400)) : []
  };
  const safeReadingSegments = Array.isArray(body.readingSegments) ? body.readingSegments.slice(0, 2).map(segment => {
    const source = segment && typeof segment === 'object' ? segment : {};
    const mode = source.mode === 'oral' || source.mode === 'silent' ? source.mode : 'silent';
    const segmentMetrics = source.metrics && typeof source.metrics === 'object' ? source.metrics : {};
    const wordCount = clampInt(source.wordCount, 2000);
    const segmentDurationSeconds = optionalSeconds(source.durationSeconds) || 0;
    const gazeValidForSegment = source.hasValidGaze === true &&
      safeGazeCalibration !== null && safeGazeCalibration.passed === true &&
      segmentDurationSeconds >= 10 && clampInt(segmentMetrics.totalFixations, 10000) >= 2;
    const gazeSource = source.wordGaze && typeof source.wordGaze === 'object' ? source.wordGaze : {};
    const gazeSampleCount = clampInt(gazeSource.sampleCount, 1000000);
    const inTextSampleCount = Math.min(gazeSampleCount, clampInt(gazeSource.inTextSamples, 1000000));
    const seenWordCount = Math.min(wordCount, clampInt(gazeSource.uniqueWordsSeen, 2000));
    const wordGazeQuality = gazeValidForSegment && wordCount > 0 &&
      inTextSampleCount >= 10 && seenWordCount >= Math.min(3, wordCount)
      ? 'observed' : 'insufficient';
    const acousticSource = source.acousticAnalysis && typeof source.acousticAnalysis === 'object' ? source.acousticAnalysis : null;
    const safeAcousticAnalysis = acousticSource ? (function () {
      const durationSeconds = Math.max(0, Math.min(3600, Number(acousticSource.durationSeconds) || 0));
      const pauses = Array.isArray(acousticSource.pauses) ? acousticSource.pauses.slice(0, 40).reduce((items, pause) => {
        const startSeconds = Number(pause && pause.startSeconds);
        const endSeconds = Number(pause && pause.endSeconds);
        const durationMs = Number(pause && pause.durationMs);
        if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || !Number.isFinite(durationMs) ||
            startSeconds < 0 || endSeconds <= startSeconds || endSeconds > 3600 || durationMs < 280 || durationMs > 3600000) return items;
        items.push({
          startSeconds: Math.round(startSeconds * 100) / 100,
          endSeconds: Math.round(endSeconds * 100) / 100,
          durationMs: Math.round(durationMs),
          kind: durationMs >= 700 ? 'long-low-energy-gap' : 'low-energy-gap'
        });
        return items;
      }, []) : [];
      return {
        method: 'local-rms-energy-v1',
        quality: acousticSource.quality === 'observed' && durationSeconds >= 2 ? 'observed' : 'insufficient',
        durationSeconds: durationSeconds,
        voiceActivityRatioPercent: Math.max(0, Math.min(100, Number(acousticSource.voiceActivityRatioPercent) || 0)),
        pauseCount: pauses.length,
        longPauseCount: pauses.filter(pause => pause.durationMs >= 700).length,
        longestPauseMs: pauses.reduce((longest, pause) => Math.max(longest, pause.durationMs), 0),
        pauses: pauses,
        note: 'تحليل محلي لانخفاض الطاقة الصوتية؛ قد تتأثر النتائج بالضجيج والهمس ولا تعني وحدها وجود تردد أو خطأ.'
      };
    })() : null;
    const safeWordGaze = {
      quality: wordGazeQuality,
      targetWordCount: wordCount,
      sampleCount: gazeSampleCount,
      inTextSamples: inTextSampleCount,
      sampleCoveragePercent: gazeSampleCount ? Math.round(inTextSampleCount / gazeSampleCount * 1000) / 10 : 0,
      uniqueWordsSeen: seenWordCount,
      wordCoveragePercent: wordCount ? Math.round(seenWordCount / wordCount * 1000) / 10 : 0,
      stableWordVisits: clampInt(gazeSource.stableWordVisits, 100000),
      totalDwellMs: clampInt(gazeSource.totalDwellMs, 3600000),
      regressions: clampInt(gazeSource.regressions, 100000),
      forwardTransitions: clampInt(gazeSource.forwardTransitions, 100000),
      perWord: Array.isArray(gazeSource.perWord) ? gazeSource.perWord.slice(0, 200).reduce((items, item) => {
        const wordIndex = Number(item && item.wordIndex);
        if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex >= wordCount || items.some(entry => entry.wordIndex === wordIndex)) return items;
        items.push({
          wordIndex,
          wordText: typeof item.wordText === 'string' ? item.wordText.slice(0, 60) : '',
          totalDwellMs: clampInt(item.totalDwellMs, 300000),
          visitCount: clampInt(item.visitCount, 1000),
          longestDwellMs: clampInt(item.longestDwellMs, 300000)
        });
        return items;
      }, []) : []
    };
    return {
      passageId: typeof source.passageId === 'string' ? source.passageId.slice(0, 80) : '',
      passageTitle: typeof source.passageTitle === 'string' ? source.passageTitle.slice(0, 180) : '',
      mode,
      durationSeconds: segmentDurationSeconds,
      wordCount,
      errors: clampInt(source.errors, 200),
      omissions: clampInt(source.omissions, 200),
      selfCorrections: clampInt(source.selfCorrections, 200),
      hasValidGaze: gazeValidForSegment,
      wordGaze: safeWordGaze,
      acousticAnalysis: safeAcousticAnalysis,
      metrics: {
        totalFixations: clampInt(segmentMetrics.totalFixations, 10000),
        avgFixationDurationMs: clampInt(segmentMetrics.avgFixationDurationMs, 10000),
        forwardSaccadesCount: clampInt(segmentMetrics.forwardSaccadesCount, 100000),
        regressionsCount: clampInt(segmentMetrics.regressionsCount, 100000),
        regressionRatePercent: Math.max(0, Math.min(100, Number(segmentMetrics.regressionRatePercent) || 0)),
        sampleCount: clampInt(segmentMetrics.sampleCount, 1000000)
      },
      wordMarks: Array.isArray(source.wordMarks) ? source.wordMarks.slice(0, 500).reduce((marks, mark) => {
        const wordIndex = Number(mark && mark.wordIndex);
        const type = ['substitution', 'omission', 'hesitation', 'selfCorrection'].includes(mark && mark.type) ? mark.type : null;
        if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex > 2000 || !type || marks.some(item => item.wordIndex === wordIndex)) return marks;
        marks.push({ wordIndex, type });
        return marks;
      }, []) : []
    };
  }) : [];
  const assistanceTypes = ['none', 'prompt', 'word', 'shared'];
  const assistanceType = assistanceTypes.includes(body.assistanceType) ? body.assistanceType : 'none';
  const readingIndependently = typeof body.readingIndependently === 'boolean' ? body.readingIndependently : null;
  const teacherNotes = typeof body.teacherNotes === 'string' ? body.teacherNotes.trim().slice(0, 1000) : '';
  const ranDurationSeconds = optionalSeconds(body.ranDurationSeconds);
  const ranErrors = clampInt(body.ranErrors, 36);
  const totalAssessmentDurationSeconds = optionalSeconds(body.totalAssessmentDurationSeconds);
  const firstComprehensionScore = clampInt(body.firstComprehensionScore, 30);
  const firstComprehensionTotal = clampInt(body.firstComprehensionTotal, 30);
  const secondComprehensionScore = clampInt(body.secondComprehensionScore, 30);
  const secondComprehensionTotal = clampInt(body.secondComprehensionTotal, 30);
  if (firstComprehensionScore > firstComprehensionTotal || secondComprehensionScore > secondComprehensionTotal) {
    return res.status(400).json({ error: 'قيم فهم المقروء لكل مقطع غير صالحة.' });
  }
  const session = {
    id: 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    studentId,
    studentName: student.name,
    grade,
    date: new Date().toISOString(),
    protocolVersion: typeof body.protocolVersion === 'string' ? body.protocolVersion.slice(0, 80) : 'legacy',
    textId,
    textTitle,
    secondTextId: typeof body.secondTextId === 'string' ? body.secondTextId.slice(0, 80) : '',
    secondTextTitle: typeof body.secondTextTitle === 'string' ? body.secondTextTitle.slice(0, 180) : '',
    observedWordCount: Math.max(0, Math.min(2000, Number(body.observedWordCount) || 0)),
    durationSeconds,
    totalAssessmentDurationSeconds,
    wpm,
    comprehensionScore,
    comprehensionTotal,
    firstComprehensionScore,
    firstComprehensionTotal,
    secondComprehensionScore,
    secondComprehensionTotal,
    ranDurationSeconds,
    ranErrors,
    readingSegments: safeReadingSegments,
    readingAnalyses: [],
    gazeCalibration: safeGazeCalibration,
    comparableReadingMode: new Set(safeReadingSegments.map(segment => segment.mode)).size <= 1,
    teacherMarkedErrors: clampInt(body.teacherMarkedErrors, 600),
    omissions: clampInt(body.omissions, 600),
    selfCorrections: clampInt(body.selfCorrections, 600),
    readingIndependently,
    assistanceType,
    teacherNotes,
    audioRecorded: body.audioRecorded === true,
    metrics,
    hasValidGaze: riskClassification.hasValidGaze,
    riskClassification
  };

  db.sessions.unshift(session);
  student.lastAssessment = session.date.slice(0, 10);
  student.avgWpm = wpm;
  student.riskLevel = 'none'; // No clinical risk level is assigned by this prototype.
  writeDatabase(db);
  res.status(201).json(session);
});

// Automatic oral-reading analysis. Audio is held in memory and forwarded only on explicit request.
const transcriptionRequests = new Map();
const allowedAudioTypes = new Set([
  'audio/webm', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-m4a', 'audio/m4a'
]);
const audioBodyParser = express.raw({
  type: req => Boolean(req.is('audio/*') || req.is('video/webm')),
  limit: '20mb'
});

app.post('/api/analyze-reading', audioBodyParser, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'التحليل الآلي غير مفعّل على الخادم. اضبط متغير البيئة OPENAI_API_KEY ثم أعد تشغيله.'
    });
  }

  const now = Date.now();
  const requester = req.ip || req.socket.remoteAddress || 'unknown';
  const windowState = transcriptionRequests.get(requester);
  if (!windowState || now - windowState.startedAt > 60_000) {
    transcriptionRequests.set(requester, { startedAt: now, count: 1 });
  } else {
    windowState.count++;
    if (windowState.count > 8) {
      return res.status(429).json({ error: 'تم بلوغ حد طلبات التحليل المؤقت. انتظر دقيقة ثم أعد المحاولة.' });
    }
  }
  if (transcriptionRequests.size > 1000) {
    for (const [ip, value] of transcriptionRequests) {
      if (now - value.startedAt > 60_000) transcriptionRequests.delete(ip);
    }
  }

  if (!Buffer.isBuffer(req.body) || req.body.length < 1024) {
    return res.status(400).json({ error: 'ملف الصوت فارغ أو قصير جدًا للتحليل.' });
  }
  if (req.body.length > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'حجم التسجيل يتجاوز 20 ميغابايت.' });
  }

  const requestedType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!allowedAudioTypes.has(requestedType)) {
    return res.status(415).json({ error: 'صيغة الصوت غير مدعومة. سجّل بصيغة WebM أو MP4 أو WAV أو OGG.' });
  }

  const encodedReference = String(req.headers['x-reading-text-base64'] || '');
  if (!encodedReference || encodedReference.length > 16000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedReference)) {
    return res.status(400).json({ error: 'تعذر قراءة النص المرجعي للمقطع.' });
  }
  const referenceText = Buffer.from(encodedReference, 'base64').toString('utf8').trim();
  if (!referenceText || referenceText.length > 12000) {
    return res.status(400).json({ error: 'النص المرجعي فارغ أو يتجاوز الحد المسموح.' });
  }

  const extensionByType = {
    'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/flac': 'flac',
    'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a'
  };
  const transcriptionConfig = getTranscriptionConfig();
  const model = transcriptionConfig.transcriptionModel;

  try {
    const form = new FormData();
    form.append('file', new Blob([req.body], { type: requestedType }), 'reading.' + extensionByType[requestedType]);
    form.append('model', model);
    if (model === 'gpt-transcribe') form.append('languages[]', 'ar');
    else form.append('language', 'ar');
    form.append('response_format', 'json');

    const providerResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: form,
      signal: AbortSignal.timeout(120_000)
    });
    const providerBody = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      console.error('Speech transcription provider returned status', providerResponse.status);
      if (providerResponse.status === 429) {
        return res.status(503).json({ error: 'خدمة التفريغ مشغولة أو وصلت إلى حد الاستخدام. حاول لاحقًا.' });
      }
      return res.status(502).json({ error: 'تعذر تفريغ الصوت من مزوّد الخدمة. تحقق من إعداداته وصيغة التسجيل.' });
    }
    const transcript = typeof providerBody.text === 'string' ? providerBody.text.trim() : '';
    if (!transcript) return res.status(422).json({ error: 'لم يُرجع محرك التفريغ نصًا يمكن مراجعته.' });

    let alignment;
    try {
      alignment = alignReadingTranscript(referenceText, transcript);
    } catch (error) {
      return res.status(422).json({ error: error.message || 'تعذر محاذاة التفريغ مع النص.' });
    }

    let wordTimestamps = [];
    let timestampAlignment = {
      enabled: transcriptionConfig.wordTimestampAnalysisEnabled,
      model: transcriptionConfig.wordTimestampModel,
      quality: 'unavailable',
      transcriptWordCount: (transcript.match(/[\p{L}\p{N}][\p{L}\p{N}\u064B-\u065F\u0670\u06D6-\u06ED]*/gu) || []).length,
      timestampWordCount: 0,
      matchedWordCount: 0,
      coveragePercent: 0,
      note: 'لم تتوفر توقيتات كلمات مؤكدة عبر مطابقة المحركين.'
    };
    if (timestampAlignment.enabled) {
      try {
        const timestampForm = new FormData();
        timestampForm.append('file', new Blob([req.body], { type: requestedType }), 'reading.' + extensionByType[requestedType]);
        timestampForm.append('model', timestampAlignment.model);
        timestampForm.append('language', 'ar');
        timestampForm.append('response_format', 'verbose_json');
        timestampForm.append('timestamp_granularities[]', 'word');
        const timestampResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
          body: timestampForm,
          signal: AbortSignal.timeout(60_000)
        });
        const timestampBody = await timestampResponse.json().catch(() => ({}));
        if (timestampResponse.ok && Array.isArray(timestampBody.words)) {
          const timestampResult = alignTimedWordsToTranscript(transcript, timestampBody.words);
          wordTimestamps = timestampResult.words;
          timestampAlignment = Object.assign(timestampAlignment, {
            quality: timestampResult.quality,
            transcriptWordCount: timestampResult.transcriptWordCount,
            timestampWordCount: timestampResult.timestampWordCount,
            matchedWordCount: timestampResult.matchedWordCount,
            coveragePercent: timestampResult.coveragePercent,
            note: 'التوقيت محفوظ فقط للكلمات التي اتفق عليها التفريغ الأساسي وتمرير التوقيت المستقل؛ قد تظل حدود الكلمة تقريبية.'
          });
        } else {
          console.warn('Word timestamp pass unavailable:', timestampResponse.status);
          timestampAlignment.note = timestampResponse.ok
            ? 'لم يرجع تمرير التوقيت قائمة كلمات مفصلة.'
            : 'فشل تمرير توقيت الكلمات؛ بقي التفريغ الأساسي متاحًا.';
        }
      } catch (timestampError) {
        console.warn('Word timestamp pass unavailable:', timestampError && timestampError.message ? timestampError.message : 'unknown error');
        timestampAlignment.note = 'تعذر إكمال تمرير التوقيت؛ بقي التفريغ الأساسي متاحًا دون توقيت كلمات.';
      }
    } else {
      timestampAlignment.note = transcriptionConfig.timestampDisabledReason || 'لم يُفعّل تمرير توقيت الكلمات بسبب إعدادات مزوّد الخدمة.';
    }

    return res.json({
      transcript: transcript,
      model: model,
      language: 'ar',
      alignment: alignment,
      wordTimestamps: wordTimestamps,
      timestampAlignment: timestampAlignment,
      caveat: 'هذه مقارنة آلية بين النص المرجعي وتفريغ الكلام؛ قد تكون الفروق ناتجة عن خطأ التعرف الصوتي، ويجب مراجعتها مع التسجيل والمعلم. التوقيتات لا تُعرض إلا للكلمات التي اتفق عليها التفريغ الأساسي وتمرير التوقيت المستقل.'
    });
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (timedOut) return res.status(504).json({ error: 'استغرق التفريغ وقتًا أطول من الحد المسموح. أعد المحاولة بتسجيل أقصر.' });
    console.error('Speech transcription request failed:', error && error.message ? error.message : 'unknown error');
    return res.status(502).json({ error: 'تعذر الاتصال بخدمة التفريغ الصوتي.' });
  }
});

// Store transcript and alignment only (never audio bytes) so reviewed results are available in history.
app.patch('/api/sessions/:id/reading-analysis', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = req.body || {};
  const passageIndex = Number(body.passageIndex);
  const passageId = typeof body.passageId === 'string' ? body.passageId : '';
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  const referenceText = typeof body.referenceText === 'string' ? body.referenceText.trim() : '';
  const model = typeof body.model === 'string' ? body.model.slice(0, 100) : 'unknown';
  const rawWordTimestamps = Array.isArray(body.wordTimestamps) ? body.wordTimestamps.slice(0, 1000) : [];
  const rawTimestampAlignment = body.timestampAlignment && typeof body.timestampAlignment === 'object' ? body.timestampAlignment : {};
  const rawSpeechGazeContext = Array.isArray(body.speechGazeContext) ? body.speechGazeContext.slice(0, 80) : [];

  if (![0, 1].includes(passageIndex) || !passageId) {
    return res.status(400).json({ error: 'بيانات المقطع غير صالحة.' });
  }
  if (!transcript || transcript.length > 12000 || !referenceText || referenceText.length > 12000) {
    return res.status(400).json({ error: 'التفريغ أو النص المرجعي فارغ أو طويل جدًا.' });
  }

  const db = readDatabase();
  const session = db.sessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة؛ لم يتم تخزين التحليل.' });
  const expectedId = passageIndex === 0 ? session.textId : session.secondTextId;
  if (!expectedId || expectedId !== passageId) {
    return res.status(409).json({ error: 'المقطع لا يطابق المقطع المسجل في هذه الجلسة.' });
  }

  let alignment;
  try {
    alignment = alignReadingTranscript(referenceText, transcript);
  } catch (error) {
    return res.status(422).json({ error: error.message || 'تعذر محاذاة التفريغ.' });
  }
  const safeWordTimestamps = rawWordTimestamps.reduce((items, item) => {
    const transcriptIndex = Number(item && item.transcriptIndex);
    const word = typeof (item && item.word) === 'string' ? item.word.slice(0, 60) : '';
    const startSeconds = Number(item && item.startSeconds);
    const endSeconds = Number(item && item.endSeconds);
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || transcriptIndex >= alignment.transcriptWordCount ||
        items.some(existing => existing.transcriptIndex === transcriptIndex) ||
        !word || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
        startSeconds < 0 || endSeconds <= startSeconds || endSeconds > 3600 ||
        item.timingQuality !== 'cross-model-agreement') return items;
    items.push({
      transcriptIndex,
      word,
      startSeconds: Math.round(startSeconds * 1000) / 1000,
      endSeconds: Math.round(endSeconds * 1000) / 1000,
      timingQuality: 'cross-model-agreement'
    });
    return items;
  }, []).sort((a, b) => a.transcriptIndex - b.transcriptIndex);
  const timestampModel = typeof rawTimestampAlignment.model === 'string'
    ? rawTimestampAlignment.model.slice(0, 100) : 'whisper-1';
  const safeTimestampAlignment = {
    enabled: rawTimestampAlignment.enabled === true,
    model: timestampModel,
    quality: safeWordTimestamps.length ? 'partial' : 'unavailable',
    transcriptWordCount: alignment.transcriptWordCount,
    timestampWordCount: clampInt(rawTimestampAlignment.timestampWordCount, 1500),
    matchedWordCount: safeWordTimestamps.length,
    coveragePercent: alignment.transcriptWordCount
      ? Math.round(safeWordTimestamps.length / alignment.transcriptWordCount * 1000) / 10 : 0,
    note: safeWordTimestamps.length
      ? 'التوقيتات محفوظة فقط للكلمات التي اتفق عليها تفريغ الكلام وتمرير التوقيت المستقل.'
      : 'لم تتوفر توقيتات كلمات موثوقة بما يكفي بعد مقارنة المحركين.'
  };
  const safeSpeechGazeContext = rawSpeechGazeContext.reduce((items, item) => {
    const targetIndex = Number(item && item.targetIndex);
    const transcriptIndex = Number(item && item.transcriptIndex);
    const type = ['substitution', 'deletion', 'insertion', 'repetition'].includes(item && item.type) ? item.type : null;
    const audioStartSeconds = Number(item && item.audioStartSeconds);
    const audioEndSeconds = Number(item && item.audioEndSeconds);
    const gazeSampleCount = clampInt(item && item.gazeSampleCount, 20000);
    const mappedGazeSampleCount = Math.min(gazeSampleCount, clampInt(item && item.mappedGazeSampleCount, 20000));
    const targetWordSampleCount = Math.min(mappedGazeSampleCount, clampInt(item && item.targetWordSampleCount, 20000));
    if (!type || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= alignment.referenceWordCount ||
        item.transcriptIndex == null || !Number.isInteger(transcriptIndex) || transcriptIndex < 0 || transcriptIndex >= alignment.transcriptWordCount ||
        items.some(existing => existing.targetIndex === targetIndex && existing.transcriptIndex === transcriptIndex) ||
        item.timingAvailable !== true || !Number.isFinite(audioStartSeconds) || !Number.isFinite(audioEndSeconds) ||
        audioStartSeconds < 0 || audioEndSeconds <= audioStartSeconds || audioEndSeconds > 3600) return items;
    const quality = gazeSampleCount >= 3 && mappedGazeSampleCount >= 2 ? 'observed' : 'insufficient';
    items.push({
      type,
      targetIndex,
      transcriptIndex,
      timingAvailable: true,
      quality,
      audioStartSeconds: Math.round(audioStartSeconds * 1000) / 1000,
      audioEndSeconds: Math.round(audioEndSeconds * 1000) / 1000,
      gazeSampleCount,
      mappedGazeSampleCount,
      targetWordSampleCount,
      targetWordGazePercent: mappedGazeSampleCount
        ? Math.round(targetWordSampleCount / mappedGazeSampleCount * 1000) / 10 : null,
      dominantGazeWordIndex: item.dominantGazeWordIndex == null ? null : clampInt(item.dominantGazeWordIndex, 2000),
      dominantGazeWordSharePercent: item.dominantGazeWordSharePercent == null ? null
        : Math.max(0, Math.min(100, Number(item.dominantGazeWordSharePercent) || 0))
    });
    return items;
  }, []);

  const readingAnalysis = {
    passageIndex: passageIndex,
    passageId: passageId,
    passageTitle: passageIndex === 0 ? session.textTitle : session.secondTextTitle,
    transcript: transcript,
    model: model,
    analyzedAt: new Date().toISOString(),
    alignment: alignment,
    wordTimestamps: safeWordTimestamps,
    timestampAlignment: safeTimestampAlignment,
    speechGazeContext: safeSpeechGazeContext,
    note: 'مقارنة أولية بين التفريغ الآلي والنص المرجعي؛ قد تمثل بعض الفروق أخطاء تعرف صوتي ولا تُعد أخطاء قراءة مؤكدة. سياق النظر والصوت وصفي ولا يثبت سبب الخطأ.'
  };
  if (!Array.isArray(session.readingAnalyses)) session.readingAnalyses = [];
  session.readingAnalyses = session.readingAnalyses.filter(item => item.passageId !== passageId);
  session.readingAnalyses.push(readingAnalysis);
  writeDatabase(db);
  return res.json({ readingAnalysis: readingAnalysis });
});

app.get('/api/stats', (req, res) => {
  const db = readDatabase();
  const studentsWithSessions = new Set(db.sessions.map(s => s.studentId).filter(Boolean)).size;
  const sessionsMissingGaze = db.sessions.filter(s => s.hasValidGaze !== true).length;
  const averageWpmSessions = db.sessions.filter(s => Number.isFinite(s.wpm) && s.wpm > 0);
  const avgWpm = averageWpmSessions.length
    ? Math.round(averageWpmSessions.reduce((total, s) => total + s.wpm, 0) / averageWpmSessions.length)
    : null;
  res.json({
    totalStudents: db.students.length,
    studentsWithSessions,
    totalSessions: db.sessions.length,
    sessionsMissingGaze,
    avgWpm
  });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`[OK] نَبراس (نسخة تجريبية) يعمل على http://${HOST}:${PORT}`);
    console.log(`[LINK] افتح المتصفح على: http://${HOST}:${PORT}`);
  });
}

module.exports = app;
