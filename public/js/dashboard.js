/**
 * وحدة لوحة التحكم وإدارة الطلاب والفصول والإحصاءات المدرسية
 */

class DashboardModule {
  constructor() {
    this.students = [];
    this.sessions = [];
    this.stats = {};
  }

  async loadData() {
    try {
      const [studentsRes, sessionsRes, statsRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/sessions'),
        fetch('/api/stats')
      ]);

      this.students = await studentsRes.json();
      this.sessions = await sessionsRes.json();
      this.stats = await statsRes.json();
      return true;
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      return false;
    }
  }

  renderDashboard(containerId = 'main-view-container') {
    const container = document.getElementById(containerId);

    container.innerHTML = `
      <div class="dashboard-page fade-in">
        <!-- الترويسة العليا -->
        <div class="dashboard-header">
          <div>
            <h1>لوحة مؤشرات القراءة وصعوبات التعلم</h1>
            <p>متابعة الفرز الدوري لمهارات القراءة والمسار البصري لطلاب المرحلة الابتدائية</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.dashboardModule.openNewStudentModal()">+ إضافة طالب جديد</button>
            <button class="btn btn-success" onclick="window.appRouter.navigate('assessment')">⚡ فحص سريع لطالب</button>
          </div>
        </div>

        <!-- بطاقات الإحصاءات العامة (KPIs) -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div>
              <div class="stat-num">${this.stats.totalStudents || 0}</div>
              <div class="stat-label">إجمالي الطلاب المسجلين</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div>
              <div class="stat-num">${this.stats.lowRiskCount || 0}</div>
              <div class="stat-label">قراءة طبيعية (مخاطر منخفضة)</div>
            </div>
          </div>

          <div class="stat-card stat-warning">
            <div class="stat-icon">⚠️</div>
            <div>
              <div class="stat-num">${this.stats.moderateRiskCount || 0}</div>
              <div class="stat-label">يحتاج متابعة وتدريب</div>
            </div>
          </div>

          <div class="stat-card stat-danger">
            <div class="stat-icon">🚨</div>
            <div>
              <div class="stat-num">${this.stats.highRiskCount || 0}</div>
              <div class="stat-label">مؤشرات عسر قراءة مرتفعة</div>
            </div>
          </div>
        </div>

        <!-- جدول الطلاب والفرز -->
        <div class="table-container-card">
          <div class="table-toolbar">
            <h3>قائمة الطلاب وحالات الفحص</h3>
            <div class="table-filters">
              <input type="text" id="student-search-input" placeholder="🔍 ابحث بالاسم..." oninput="window.dashboardModule.filterStudents()" />
              <select id="grade-filter-select" onchange="window.dashboardModule.filterStudents()">
                <option value="all">جميع الصفوف</option>
                <option value="1">الصف الأول</option>
                <option value="2">الصف الثاني</option>
                <option value="3">الصف الثالث</option>
                <option value="4">الصف الرابع</option>
                <option value="5">الصف الخامس</option>
                <option value="6">الصف السادس</option>
              </select>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>اسم الطالب</th>
                  <th>الصف</th>
                  <th>الفصل</th>
                  <th>آخر تقييم</th>
                  <th>سرعة القراءة (WPM)</th>
                  <th>مؤشر الخطر</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody id="students-table-body">
                ${this.renderStudentRows(this.students)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderStudentRows(studentsList) {
    if (!studentsList || studentsList.length === 0) {
      return `<tr><td colspan="7" class="text-center text-muted">لا يوجد طلاب مطابقين للبحث.</td></tr>`;
    }

    return studentsList.map(s => {
      let badgeClass = 'badge-none';
      let badgeLabel = 'لم يُفحص بعد';

      if (s.riskLevel === 'high') {
        badgeClass = 'badge-high';
        badgeLabel = 'خطر مرتفع';
      } else if (s.riskLevel === 'moderate') {
        badgeClass = 'badge-mod';
        badgeLabel = 'متابعة وتدريب';
      } else if (s.riskLevel === 'low') {
        badgeClass = 'badge-low';
        badgeLabel = 'طبيعي';
      }

      return `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>الصف ${s.grade}</td>
          <td>${s.classroom}</td>
          <td>${s.lastAssessment ? s.lastAssessment : '<span class="text-muted">--</span>'}</td>
          <td>${s.avgWpm ? `${s.avgWpm} ك/د` : '--'}</td>
          <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
          <td class="table-actions">
            <button class="btn btn-sm btn-primary" onclick="window.dashboardModule.launchAssessmentForStudent('${s.id}')">فحص الآن 👁️</button>
            <button class="btn btn-sm btn-outline" onclick="window.dashboardModule.viewStudentDetails('${s.id}')">الملف 📄</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  filterStudents() {
    const searchVal = document.getElementById('student-search-input').value.trim().toLowerCase();
    const gradeVal = document.getElementById('grade-filter-select').value;

    const filtered = this.students.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchVal);
      const matchesGrade = (gradeVal === 'all') || (s.grade.toString() === gradeVal);
      return matchesSearch && matchesGrade;
    });

    document.getElementById('students-table-body').innerHTML = this.renderStudentRows(filtered);
  }

  launchAssessmentForStudent(studentId) {
    const student = this.students.find(s => s.id === studentId);
    if (!student) return;

    // العثور على النص المناسب لصفه
    const targetGrade = student.grade || 3;
    const text = ARABIC_TEXTS_BANK.find(t => t.grade === targetGrade) || ARABIC_TEXTS_BANK[2];

    window.appRouter.navigate('assessment');
    setTimeout(() => {
      window.assessmentManager.startSession(student, text);
    }, 150);
  }

  viewStudentDetails(studentId) {
    const student = this.students.find(s => s.id === studentId);
    if (!student) return;

    const studentSessions = this.sessions.filter(sess => sess.studentId === studentId);
    const modal = document.getElementById('app-modal');
    const modalContent = document.getElementById('modal-content');

    modalContent.innerHTML = `
      <div class="student-profile-view fade-in">
        <div class="profile-header">
          <h2>ملف الطالب: ${student.name}</h2>
          <span class="badge-info">الصف ${student.grade} - ${student.classroom}</span>
        </div>

        <div class="profile-notes">
          <strong>ملاحظات المعلم:</strong> ${student.notes || 'لا توجد ملاحظات مسجلة.'}
        </div>

        <h3>سجل الجلسات السابقة (${studentSessions.length})</h3>
        <div class="sessions-history-list">
          ${studentSessions.length === 0 ? '<p class="text-muted">لم يتم إجراء جلسات سابقة بعد.</p>' : ''}
          ${studentSessions.map(sess => `
            <div class="session-history-item">
              <div>
                <strong>${sess.textTitle}</strong> - ${new Date(sess.date).toLocaleDateString('ar-EG')}
                <div class="text-muted">السرعة: ${sess.wpm} ك/د | التثبيت: ${sess.metrics.avgFixationDurationMs}ms | الارتدادات: ${sess.metrics.regressionRatePercent}%</div>
              </div>
              <div class="actions">
                <button class="btn btn-sm btn-primary" onclick="window.dashboardModule.openSessionReport('${sess.id}')">عرض التقرير</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="window.dashboardModule.closeModal()">إغلاق</button>
        </div>
      </div>
    `;

    modal.classList.add('open');
  }

  openSessionReport(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = ParentReportGenerator.generateReportHtml(session);
  }

  openNewStudentModal() {
    const modal = document.getElementById('app-modal');
    const modalContent = document.getElementById('modal-content');

    modalContent.innerHTML = `
      <div class="modal-form-box fade-in">
        <h2>إضافة طالب جديد للفحص</h2>
        <form id="new-student-form" onsubmit="window.dashboardModule.saveNewStudent(event)">
          <div class="form-group">
            <label>اسم الطالب الرباعي:</label>
            <input type="text" id="std-name" required placeholder="مثال: يوسف أحمد العتيبي" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>الصف الدراسي:</label>
              <select id="std-grade" required>
                <option value="1">الصف الأول الابتدائي</option>
                <option value="2">الصف الثاني الابتدائي</option>
                <option value="3" selected>الصف الثالث الابتدائي</option>
                <option value="4">الصف الرابع الابتدائي</option>
                <option value="5">الصف الخامس الابتدائي</option>
                <option value="6">الصف السادس الابتدائي</option>
              </select>
            </div>

            <div class="form-group">
              <label>الفصل / الشعبة:</label>
              <input type="text" id="std-class" placeholder="مثال: الثالث - ب" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>العمر:</label>
              <input type="number" id="std-age" value="8" min="5" max="15" />
            </div>

            <div class="form-group">
              <label>الجنس:</label>
              <select id="std-gender">
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>ملاحظات أولية (إن وجدت):</label>
            <textarea id="std-notes" rows="2" placeholder="ملاحظات المعلم حول قراءة الطفل..."></textarea>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">حفظ الطالب</button>
            <button type="button" class="btn btn-secondary" onclick="window.dashboardModule.closeModal()">إلغاء</button>
          </div>
        </form>
      </div>
    `;

    modal.classList.add('open');
  }

  async saveNewStudent(e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById('std-name').value.trim(),
      grade: Number(document.getElementById('std-grade').value),
      classroom: document.getElementById('std-class').value.trim(),
      age: Number(document.getElementById('std-age').value),
      gender: document.getElementById('std-gender').value,
      notes: document.getElementById('std-notes').value.trim()
    };

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const created = await res.json();
      this.students.unshift(created);
      this.closeModal();
      this.renderDashboard();
    } catch (err) {
      alert('تعذر حفظ الطالب: ' + err.message);
    }
  }

  openInterventionForStudent(pattern) {
    window.appRouter.navigate('intervention');
    setTimeout(() => {
      window.interventionModule.renderMenu(pattern);
    }, 100);
  }

  closeModal() {
    const modal = document.getElementById('app-modal');
    modal.classList.remove('open');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DashboardModule };
}
