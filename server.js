const express = require('express');
const path = require('path');
const fs = require('fs');
const { alignReadingTranscript } = require('./lib/reading-alignment');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
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
    version: '1.2.0',
    mode: 'prototype',
    automaticSpeechAnalysisEnabled: Boolean(process.env.OPENAI_API_KEY),
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe',
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
  const risk = body.riskClassification && typeof body.riskClassification === 'object' ? body.riskClassification : {};
  const riskClassification = {
    level: risk.level === 'observations' && wpm !== null ? 'observations' : 'insufficient',
    levelAr: risk.level === 'observations' && wpm !== null ? 'مؤشرات وصفية — لا تصنيف تشخيصي' : 'بيانات غير كافية للتفسير',
    score: null,
    hasValidGaze: body.hasValidGaze === true && durationSeconds >= 10 && metrics.totalFixations >= 2,
    reasons: Array.isArray(risk.reasons) ? risk.reasons.slice(0, 12).filter(x => typeof x === 'string').map(x => x.slice(0, 400)) : []
  };
  const clampInt = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  const optionalSeconds = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 3600 ? Math.round(number * 100) / 100 : null;
  };
  const safeReadingSegments = Array.isArray(body.readingSegments) ? body.readingSegments.slice(0, 2).map(segment => {
    const source = segment && typeof segment === 'object' ? segment : {};
    const mode = source.mode === 'oral' || source.mode === 'silent' ? source.mode : 'silent';
    const segmentMetrics = source.metrics && typeof source.metrics === 'object' ? source.metrics : {};
    return {
      passageId: typeof source.passageId === 'string' ? source.passageId.slice(0, 80) : '',
      passageTitle: typeof source.passageTitle === 'string' ? source.passageTitle.slice(0, 180) : '',
      mode,
      durationSeconds: optionalSeconds(source.durationSeconds) || 0,
      wordCount: clampInt(source.wordCount, 2000),
      errors: clampInt(source.errors, 200),
      omissions: clampInt(source.omissions, 200),
      selfCorrections: clampInt(source.selfCorrections, 200),
      hasValidGaze: source.hasValidGaze === true,
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
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe';

  try {
    const form = new FormData();
    form.append('file', new Blob([req.body], { type: requestedType }), 'reading.' + extensionByType[requestedType]);
    form.append('model', model);
    form.append('language', 'ar');
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

    return res.json({
      transcript: transcript,
      model: model,
      language: 'ar',
      alignment: alignment,
      caveat: 'هذه مقارنة آلية بين النص المرجعي وتفريغ الكلام؛ قد تكون الفروق ناتجة عن خطأ التعرف الصوتي، ويجب مراجعتها مع التسجيل والمعلم.'
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
  const readingAnalysis = {
    passageIndex: passageIndex,
    passageId: passageId,
    passageTitle: passageIndex === 0 ? session.textTitle : session.secondTextTitle,
    transcript: transcript,
    model: model,
    analyzedAt: new Date().toISOString(),
    alignment: alignment,
    note: 'مقارنة أولية بين التفريغ الآلي والنص المرجعي؛ قد تمثل بعض الفروق أخطاء تعرف صوتي ولا تُعد أخطاء قراءة مؤكدة.'
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

app.listen(PORT, HOST, () => {
  console.log(`[OK] نَبراس (نسخة تجريبية) يعمل على http://${HOST}:${PORT}`);
  console.log(`[LINK] افتح المتصفح على: http://${HOST}:${PORT}`);
});
