const express = require('express');
const path = require('path');
const fs = require('fs');

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
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// REST endpoints. This server is a local prototype, not a production student-data service.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Nebras Arabic Reading Assessment Prototype',
    version: '1.1.0',
    mode: 'prototype',
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
  const session = {
    id: 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    studentId,
    studentName: student.name,
    grade,
    date: new Date().toISOString(),
    textId,
    textTitle,
    observedWordCount: Math.max(0, Math.min(2000, Number(body.observedWordCount) || 0)),
    durationSeconds,
    wpm,
    comprehensionScore,
    comprehensionTotal,
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
