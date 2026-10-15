const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
    const seedData = {
      students: [
        {
          id: 'std_001',
          name: 'عمر خالد المنصور',
          gender: 'ذكر',
          grade: 3,
          age: 8,
          school: 'مدارس الرواد الأهلية',
          classroom: 'الثالث - أ',
          lastAssessment: '2026-10-10',
          riskLevel: 'high',
          avgWpm: 42,
          notes: 'ملاحظة تعثر في قراءة الحروف المتشابهة وارتداد النظر المتكرر'
        },
        {
          id: 'std_002',
          name: 'سارة أحمد العتيبي',
          gender: 'أنثى',
          grade: 3,
          age: 8,
          school: 'مدارس الرواد الأهلية',
          classroom: 'الثالث - أ',
          lastAssessment: '2026-10-12',
          riskLevel: 'low',
          avgWpm: 78,
          notes: 'قراءة سلسة مع استيعاب قرائي ممتاز'
        },
        {
          id: 'std_003',
          name: 'يوسف مصطفى إبراهيم',
          gender: 'ذكر',
          grade: 2,
          age: 7,
          school: 'مدارس النيل المصرية',
          classroom: 'الثاني - ب',
          lastAssessment: '2026-10-11',
          riskLevel: 'moderate',
          avgWpm: 46,
          notes: 'بطء في فك شفرة الكلمات المشكولة ويحتاج متابعة'
        },
        {
          id: 'std_004',
          name: 'مريم راشد الشامسي',
          gender: 'أنثى',
          grade: 4,
          age: 9,
          school: 'مدرسة الاتحاد الوطنية',
          classroom: 'الرابع - ج',
          lastAssessment: '2026-10-13',
          riskLevel: 'low',
          avgWpm: 92,
          notes: 'أداء متميز وتثبيت بصري منتظم'
        }
      ],
      sessions: [
        {
          id: 'sess_101',
          studentId: 'std_001',
          studentName: 'عمر خالد المنصور',
          grade: 3,
          date: '2026-10-10T10:30:00Z',
          textId: 'text_gr3_01',
          textTitle: 'مغامرة الصقر في الجبل',
          durationSeconds: 110,
          wpm: 42,
          comprehensionScore: 2,
          comprehensionTotal: 3,
          metrics: {
            avgFixationDurationMs: 345,
            totalFixations: 128,
            totalSaccades: 127,
            forwardSaccades: 78,
            regressions: 49,
            regressionRatePercent: 38.5,
            saccadeAmplitudeAvgDeg: 1.8,
            lineSweeps: 6
          },
          riskClassification: {
            level: 'high',
            levelAr: 'مؤشر خطر مرتفع',
            score: 78,
            color: '#ef4444',
            reasons: [
              'ارتفاع ملحوظ في نسبة الارتدادات العكسية (38.5% مقارنة بالمعيار الطبيعي 15%)',
              'طول مدة التثبيت البصري على الكلمات المشابهة (345ms مقارنة بالمعيار 240ms)',
              'انخفاض سرعة القراءة بالكلمة في الدقيقة (42 ك/د مقارنة بمعيار الصف 65-80 ك/د)'
            ]
          }
        }
      ]
    };
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

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Arabic Eye-Tracking Reading Assessment Platform', version: '1.0.0' });
});

// Students
app.get('/api/students', (req, res) => {
  const db = readDatabase();
  res.json(db.students);
});

app.post('/api/students', (req, res) => {
  const db = readDatabase();
  const newStudent = {
    id: `std_${Date.now()}`,
    name: req.body.name,
    gender: req.body.gender || 'غير محدد',
    grade: Number(req.body.grade) || 1,
    age: Number(req.body.age) || 7,
    school: req.body.school || 'المدرسة النموذجية',
    classroom: req.body.classroom || 'عام',
    lastAssessment: null,
    riskLevel: 'none',
    avgWpm: 0,
    notes: req.body.notes || ''
  };
  db.students.unshift(newStudent);
  writeDatabase(db);
  res.status(201).json(newStudent);
});

// Assessment Sessions
app.get('/api/sessions', (req, res) => {
  const db = readDatabase();
  res.json(db.sessions);
});

app.get('/api/sessions/:id', (req, res) => {
  const db = readDatabase();
  const session = db.sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

app.post('/api/sessions', (req, res) => {
  const db = readDatabase();
  const sessionData = req.body;
  const newSession = {
    id: `sess_${Date.now()}`,
    studentId: sessionData.studentId,
    studentName: sessionData.studentName,
    grade: sessionData.grade,
    date: new Date().toISOString(),
    textId: sessionData.textId,
    textTitle: sessionData.textTitle,
    durationSeconds: sessionData.durationSeconds,
    wpm: sessionData.wpm,
    comprehensionScore: sessionData.comprehensionScore,
    comprehensionTotal: sessionData.comprehensionTotal,
    metrics: sessionData.metrics,
    riskClassification: sessionData.riskClassification,
    gazeData: sessionData.gazeData || [] // Gaze coordinates & fixations map
  };

  db.sessions.unshift(newSession);

  // Update student's last assessment and risk level
  const student = db.students.find(s => s.id === sessionData.studentId);
  if (student) {
    student.lastAssessment = new Date().toISOString().split('T')[0];
    student.riskLevel = sessionData.riskClassification.level;
    student.avgWpm = sessionData.wpm;
  }

  writeDatabase(db);
  res.status(201).json(newSession);
});

// School Stats
app.get('/api/stats', (req, res) => {
  const db = readDatabase();
  const totalStudents = db.students.length;
  const assessedStudents = db.students.filter(s => s.lastAssessment !== null).length;
  const highRiskCount = db.students.filter(s => s.riskLevel === 'high').length;
  const moderateRiskCount = db.students.filter(s => s.riskLevel === 'moderate').length;
  const lowRiskCount = db.students.filter(s => s.riskLevel === 'low').length;

  const avgWpm = totalStudents > 0 
    ? Math.round(db.students.reduce((acc, s) => acc + (s.avgWpm || 0), 0) / (assessedStudents || 1))
    : 0;

  res.json({
    totalStudents,
    assessedStudents,
    highRiskCount,
    moderateRiskCount,
    lowRiskCount,
    avgWpm,
    totalSessions: db.sessions.length
  });
});

app.listen(PORT, () => {
  console.log(`[OK] منصة التقييم المبكر لمهارات القراءة وتتبع النظر تعمل الآن على المنفذ: ${PORT}`);
  console.log(`[LINK] افتح المتصفح على: http://localhost:${PORT}`);
});
