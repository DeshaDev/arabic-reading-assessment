/**
 * التطبيق الرئيسي ومتحكم التنقل والحالة (App Controller & Router)
 */

class AppRouter {
  constructor() {
    this.currentView = 'dashboard';
    this.tracker = new ArabicEyeTracker();
    this.visualizer = new GazeVisualizer(document.createElement('canvas'));
    this.metricsEngine = new EyeMetricsEngine();

    this.assessmentManager = new AssessmentSessionManager(this.tracker, this.visualizer, this.metricsEngine);
    this.dashboardModule = new DashboardModule();
    this.interventionModule = new ReadingInterventionModule(document.getElementById('main-view-container'));

    // نشر الكائنات عالمياً للوصول من عناصر HTML
    window.tracker = this.tracker;
    window.assessmentManager = this.assessmentManager;
    window.dashboardModule = this.dashboardModule;
    window.interventionModule = this.interventionModule;
    window.appRouter = this;
  }

  async init() {
    await this.dashboardModule.loadData();
    this.setupNavigation();
    this.navigate('dashboard');
  }

  setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');
        this.navigate(targetView);
      });
    });
  }

  navigate(viewName) {
    this.currentView = viewName;

    const sectionNames = { dashboard: 'نظرة عامة', assessment: 'جلسة تقييم جديدة', texts: 'مكتبة النصوص', intervention: 'أنشطة الدعم القرائي' };
    const sectionLabel = document.getElementById('topbar-section');
    if (sectionLabel) sectionLabel.textContent = sectionNames[viewName] || sectionNames.dashboard;
    if (window.location.hash !== '#' + viewName) history.replaceState(null, '', '#' + viewName);

    // تحديث أزرار التنقل
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-view') === viewName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    const container = document.getElementById('main-view-container');

    switch (viewName) {
      case 'dashboard':
        this.dashboardModule.renderDashboard();
        break;

      case 'assessment':
        this.renderAssessmentSetup();
        // Request camera access only after the user explicitly starts a session.
        break;

      case 'texts':
        this.renderTextsBank();
        break;

      case 'intervention':
        this.interventionModule.container = container;
        this.interventionModule.renderMenu();
        break;

      default:
        this.dashboardModule.renderDashboard();
    }
  }

  renderAssessmentSetup() {
    const container = document.getElementById('main-view-container');
    const students = this.dashboardModule.students;

    container.innerHTML = `
      <div class="assessment-setup-page fade-in" id="assessment-container">
        <div class="setup-card">
          <h2>🎯 بدء جلسة فحص قراءة جديدة</h2>
          <p>اختر الطالب والنص المعياري المناسب لبدء المعايرة وتتبع حركة العين.</p>

          <div class="form-group">
            <label>اختر الطالب من القائمة:</label>
            <select id="select-student" class="form-control" onchange="window.appRouter.onStudentSelectChange()">
              ${students.map(s => `<option value="${s.id}">الطالب: ${s.name} (الصف ${s.grade} - ${s.classroom})</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>اختر النص القرائي:</label>
            <select id="select-text" class="form-control">
              ${ARABIC_TEXTS_BANK.map(t => `<option value="${t.id}">الصف ${t.grade}: ${t.title} (${t.wordsCount} كلمة - تشكيل ${t.tashkeelType === 'full' ? 'كامل' : (t.tashkeelType === 'partial' ? 'جزئي' : 'بدون')})</option>`).join('')}
            </select>
          </div>

          <div class="setup-instructions">
            <h4>💡 نصائح لضمان دقة الفرز بنسبة 100%:</h4>
            <ul>
              <li>تأكد من جلوس الطفل على بعد 50–60 سم من الكاميرا ومواجهة الشاشة مباشرة.</li>
              <li>تأكد من عدم وجود مصدر إضاءة قوي خلف رأس الطفل مباشرة (مثل نافذة مفتوحة).</li>
              <li>شجع الطفل على قراءة النص بصمت أو همس دون تحريك رأسه.</li>
            </ul>
          </div>

          <div class="actions">
            <button class="btn btn-primary btn-lg" onclick="window.appRouter.launchSelectedAssessment()">
              بدء الفحص الآن 🚀
            </button>
          </div>
        </div>
      </div>
    `;

    this.onStudentSelectChange();
  }

  onStudentSelectChange() {
    const studentSelect = document.getElementById('select-student');
    const textSelect = document.getElementById('select-text');
    if (!studentSelect || !textSelect) return;

    const studentId = studentSelect.value;
    const student = this.dashboardModule.students.find(s => s.id === studentId);
    if (student) {
      // توجيه تلقائي لنص مناسب لصف الطالب
      const matchingText = ARABIC_TEXTS_BANK.find(t => t.grade === student.grade);
      if (matchingText) {
        textSelect.value = matchingText.id;
      }
    }
  }

  launchSelectedAssessment() {
    const studentId = document.getElementById('select-student').value;
    const textId = document.getElementById('select-text').value;

    const student = this.dashboardModule.students.find(s => s.id === studentId);
    const text = ARABIC_TEXTS_BANK.find(t => t.id === textId);

    if (student && text) {
      this.assessmentManager.startSession(student, text);
    }
  }

  renderTextsBank() {
    const container = document.getElementById('main-view-container');

    container.innerHTML = `
      <div class="texts-bank-page fade-in">
        <div class="dashboard-header">
          <div>
            <h1>بنك النصوص العربية المعيارية</h1>
            <p>نصوص متدرجة ومضبوطة لغوياً من الصف الأول إلى السادس لمسح طلاقة القراءة وعسر القراءة</p>
          </div>
        </div>

        <div class="texts-grid">
          ${ARABIC_TEXTS_BANK.map(t => `
            <div class="text-card">
              <div class="text-card-header">
                <span class="badge-grade">الصف ${t.grade}</span>
                <span class="badge-tashkeel">تشكيل ${t.tashkeelType === 'full' ? 'كامل' : (t.tashkeelType === 'partial' ? 'جزئي' : 'غير مشكول')}</span>
              </div>

              <h3>${t.title}</h3>
              <p class="text-desc">${t.description}</p>

              <div class="text-preview-box">${t.content}</div>

              <div class="text-meta-footer">
                <span>📝 ${t.wordsCount} كلمة</span>
                <span>⏱️ المعيار: ${t.targetWpmMin}-${t.targetWpmMax} ك/د</span>
                <span>❓ ${t.comprehensionQuestions.length} أسئلة استيعاب</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

// تشغيل التطبيق بأمان فور جاهزية المستند
function startApplication() {
  const app = new AppRouter();
  app.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication);
} else {
  startApplication();
}
