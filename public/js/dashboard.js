/**
 * Nebras dashboard module. Real API records only; never turns a screening observation into a diagnosis.
 */
class DashboardModule {
  constructor() {
    this.students = [];
    this.sessions = [];
    this.stats = {};
    this.dataReady = false;
    this.loadError = null;
  }

  escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  formatDate(value, options) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-EG', options || { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  async loadData() {
    try {
      var responses = await Promise.all([
        fetch('/api/students', { headers: { Accept: 'application/json' } }),
        fetch('/api/sessions', { headers: { Accept: 'application/json' } }),
        fetch('/api/stats', { headers: { Accept: 'application/json' } })
      ]);
      if (responses.some(function (response) { return !response.ok; })) throw new Error('تعذر تحميل بعض بيانات مساحة العمل.');
      var data = await Promise.all(responses.map(function (response) { return response.json(); }));
      if (!Array.isArray(data[0]) || !Array.isArray(data[1]) || !data[2] || typeof data[2] !== 'object') {
        throw new Error('استجابة الخادم ليست بالصيغة المتوقعة.');
      }
      this.students = data[0];
      this.sessions = data[1];
      this.stats = data[2];
      this.dataReady = true;
      this.loadError = null;
      return true;
    } catch (err) {
      console.error('Dashboard loading error:', err);
      this.dataReady = false;
      this.loadError = err.message || 'تعذر الاتصال بالخادم.';
      return false;
    }
  }

  renderDashboard(containerId) {
    var container = document.getElementById(containerId || 'main-view-container');
    if (!container) return;
    if (!this.dataReady) {
      container.innerHTML = '<section class="empty-state panel fade-in"><div class="empty-illustration">↻</div><h3>تعذر تحميل مساحة العمل</h3><p>' +
        this.escape(this.loadError || 'تأكد من تشغيل الخادم ثم أعد المحاولة.') +
        '</p><button class="btn btn-primary" onclick="window.dashboardModule.retryLoad()">إعادة المحاولة</button></section>';
      return;
    }

    var studentCount = this.students.length;
    var ids = new Set(this.sessions.map(function (s) { return s.studentId; }).filter(Boolean));
    var assessedStudents = this.students.filter(function (s) { return ids.has(s.id); }).length;
    var recentSessions = this.sessions.slice().sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); }).slice(0, 5);
    var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var weeklySessions = this.sessions.filter(function (s) {
      var t = new Date(s.date || 0).getTime();
      return Number.isFinite(t) && t >= weekAgo && t <= Date.now();
    }).length;
    var incompleteSessions = this.sessions.filter(function (s) {
      return !(s.hasValidGaze === true || (s.riskClassification && s.riskClassification.hasValidGaze === true));
    }).length;
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'أهلًا بك' : 'مساء الخير';

    var html = '<div class="dashboard-page fade-in">';
    html += '<section class="welcome-panel"><div class="welcome-copy"><div class="eyebrow">مساحة التقييم التربوي</div>';
    html += '<h1>' + greeting + '، لنفهم رحلة القراءة بشكل أوضح.</h1>';
    html += '<p>اجمع ملاحظات القراءة في مكان واحد، تابع الجلسات، وحدّد الخطوة التعليمية التالية — من دون تحويل المؤشرات الأولية إلى تشخيص.</p>';
    html += '<div class="header-actions"><button class="btn btn-primary" onclick="window.appRouter.navigate(\'assessment\')">＋ بدء جلسة تقييم</button>';
    html += '<button class="btn btn-outline" onclick="window.appRouter.navigate(\'texts\')">استعراض مكتبة النصوص ←</button></div></div>';
    html += '<div class="welcome-art" aria-hidden="true"><svg class="book-illustration" viewBox="0 0 220 190" fill="none"><circle cx="111" cy="91" r="76" fill="#D9EFE6" fill-opacity=".10"/><circle cx="111" cy="91" r="61" stroke="#D9EFE6" stroke-opacity=".25" stroke-dasharray="3 7"/><path d="M41 55c19-9 39-5 60 7v91c-19-12-41-16-60-7V55Z" fill="#F6FCF9" stroke="#AEDCCE" stroke-width="2"/><path d="M101 62c20-12 40-16 60-7v91c-19-9-41-5-60 7V62Z" fill="#C9E8DC" stroke="#9BD0BE" stroke-width="2"/><path d="M51 75c12-4 23-2 34 3M51 87c13-4 22-2 34 3M51 99c12-4 23-2 34 3M112 76c12-5 23-7 36-5M112 89c12-5 23-7 36-5M112 102c12-5 23-7 36-5" stroke="#7CAFA0" stroke-width="2.4" stroke-linecap="round"/><path d="m128 22 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" fill="#E6C987"/><circle cx="176" cy="125" r="6" fill="#A2D8C7"/><circle cx="52" cy="36" r="4" fill="#E6C987"/></svg></div></section>';

    html += '<section class="dashboard-section"><div class="section-head"><div><h2>صورة النشاط</h2><p>ملخص مستمد من السجلات الموجودة في مساحة العمل</p></div><span class="pilot-pill"><span></span> بيانات الجلسات فقط</span></div>';
    html += '<div class="stats-row">';
    html += this.renderStat('♙', studentCount, 'طلاب مسجلون', 'السجلات المحفوظة', '');
    html += this.renderStat('▤', this.sessions.length, 'جلسات محفوظة', 'بغض النظر عن اكتمال المؤشرات', '');
    html += this.renderStat('◷', weeklySessions, 'جلسات آخر 7 أيام', 'وفق وقت تسجيل الجلسة', 'stat-warning');
    html += this.renderStat('!', incompleteSessions, 'جلسات بلا بيانات نظر كافية', 'مراجعة تقنية، لا تصنيف للطفل', 'stat-danger');
    html += '</div></section>';

    html += '<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h3>وتيرة الجلسات</h3><p>عدد الجلسات يوميًا خلال آخر 7 أيام</p></div><div class="chart-legend"><span class="legend-dot"></span> الجلسات</div></div><div class="panel-content"><div class="chart-wrap">' + this.renderWeeklyChart() + '</div></div></section>';
    html += '<section class="panel"><div class="panel-header"><div><h3>ما يستحق الانتباه</h3><p>جودة البيانات وخطوة العمل التالية</p></div></div><div class="panel-content attention-card">' +
      this.renderAttentionItems(studentCount, assessedStudents, incompleteSessions) + '</div></section></div>';

    html += '<section class="dashboard-section"><div class="section-head"><div><h2>أحدث الجلسات</h2><p>آخر النشاطات المسجلة على المنصة</p></div><a href="#students" class="subtle-link" onclick="window.dashboardModule.scrollToStudents();return false;">إدارة الطلاب ←</a></div><section class="panel">';
    if (recentSessions.length) {
      html += '<div class="panel-content"><div class="session-list">' + recentSessions.map(this.renderSessionItem.bind(this)).join('') + '</div></div>';
    } else {
      html += '<div class="empty-state"><div class="empty-illustration">▤</div><h3>ستظهر الجلسات هنا</h3><p>بعد تسجيل طالب وإكمال جلسة، ستجد وقتها والنص المستخدم وحالة اكتمال البيانات في هذا القسم.</p><button class="btn btn-primary" onclick="window.appRouter.navigate(\'assessment\')">بدء أول جلسة</button></div>';
    }
    html += '</section></section>';

    html += '<section class="dashboard-section" id="students-section"><div class="section-head"><div><h2>قائمة الطلاب</h2><p>إدارة السجلات التعليمية والوصول إلى سجل الجلسات</p></div><button class="btn btn-primary" onclick="window.dashboardModule.openNewStudentModal()">＋ إضافة طالب</button></div>';
    html += '<section class="table-container-card"><div class="table-toolbar"><div><h3>سجلات الطلاب</h3><p>لا تصنف هذه القائمة الطلاب بحسب احتمال عسر القراءة.</p></div><div class="table-filters">';
    html += '<input type="search" id="student-search-input" placeholder="ابحث باسم الطالب…" aria-label="البحث باسم الطالب" oninput="window.dashboardModule.filterStudents()">';
    html += '<select id="grade-filter-select" aria-label="تصفية حسب الصف" onchange="window.dashboardModule.filterStudents()"><option value="all">جميع الصفوف</option>';
    for (var g = 1; g <= 6; g++) html += '<option value="' + g + '">الصف ' + g + '</option>';
    html += '</select></div></div><div class="table-responsive"><table class="data-table"><thead><tr><th>الطالب</th><th>الصف</th><th>الفصل</th><th>آخر جلسة</th><th>عدد الجلسات</th><th>حالة السجل</th><th>الإجراءات</th></tr></thead><tbody id="students-table-body">' + this.renderStudentRows(this.students) + '</tbody></table></div>';
    html += '<div class="pagination-note" id="student-count-note">' + studentCount + ' سجلًا — تُعرض كل النتائج</div></section></section></div>';
    container.innerHTML = html;
  }

  renderStat(icon, value, label, note, extraClass) {
    return '<article class="stat-card ' + extraClass + '"><div class="stat-icon" aria-hidden="true">' + icon + '</div><div><div class="stat-num">' + Number(value || 0) + '</div><div class="stat-label">' + label + '</div><span class="stat-note">' + note + '</span></div></article>';
  }

  renderWeeklyChart() {
    var labels = [], values = [], now = new Date();
    for (var i = 6; i >= 0; i--) {
      var day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
      var next = new Date(day); next.setDate(next.getDate() + 1);
      labels.push(new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(day));
      values.push(this.sessions.filter(function (s) {
        var d = new Date(s.date || 0).getTime();
        return Number.isFinite(d) && d >= day.getTime() && d < next.getTime();
      }).length);
    }
    var w = 500, h = 190, left = 27, right = 18, top = 18, bottom = 31;
    var max = Math.max(4, ...values), plotH = h - top - bottom, plotW = w - left - right;
    var points = values.map(function (v, i) { return { x: left + i * plotW / 6, y: top + plotH - v / max * plotH, v: v }; });
    var path = points.map(function (p, i) { return (i ? 'L ' : 'M ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = path + ' L ' + points[6].x + ' ' + (top + plotH) + ' L ' + points[0].x + ' ' + (top + plotH) + ' Z';
    var grid = '';
    for (var j = 0; j < 4; j++) {
      var y = top + j * plotH / 3, val = Math.round(max * (3 - j) / 3);
      grid += '<line x1="' + left + '" y1="' + y + '" x2="' + (w-right) + '" y2="' + y + '" stroke="#eaf0ed" stroke-dasharray="3 5"/><text x="' + (left-8) + '" y="' + (y+3) + '" text-anchor="end" font-size="9" fill="#91a09f">' + val + '</text>';
    }
    var dots = points.map(function (p, index) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (p.v ? 4.5 : 3) + '" fill="' + (p.v ? '#248d7c' : '#c8d8d1') + '" stroke="#fff" stroke-width="2"><title>' + labels[index] + ': ' + p.v + ' جلسة</title></circle><text x="' + p.x + '" y="' + (h-8) + '" text-anchor="middle" font-size="10" fill="#7f9192">' + this.escape(labels[index]) + '</text>';
    }.bind(this)).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="عدد الجلسات خلال آخر سبعة أيام">' + grid + '<path d="' + area + '" fill="#dff2e9" opacity=".8"/><path d="' + path + '" fill="none" stroke="#248d7c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' + dots + '</svg>';
  }

  renderAttentionItems(studentCount, assessedStudents, incompleteSessions) {
    var items = [];
    if (!studentCount) items.push(['teal', 'ابدأ بإضافة سجل للطالب', 'أضف بيانات تجريبية أو بيانات مرخصة من المدرسة لتجربة سير العمل.']);
    else if (assessedStudents < studentCount) items.push(['teal', (studentCount - assessedStudents) + ' طالب دون جلسة مسجلة', 'عدم وجود جلسة ليس دليلًا على وجود صعوبة؛ ابدأ جلسة عند الحاجة.']);
    if (incompleteSessions) items.push(['rose', incompleteSessions + ' جلسة دون بيانات نظر كافية', 'راجع إذن الكاميرا وجودة الإشارة قبل تفسير أي رسم للمسار البصري.']);
    else if (this.sessions.length) items.push(['teal', 'راجع الأدلة المسجلة لكل جلسة', 'تحقق من مدة القراءة وإجابات الفهم وجودة الإشارة قبل مشاركة التقرير.']);
    if (!items.length) items.push(['teal', 'مساحة العمل جاهزة', 'ستظهر هنا تذكيرات تشغيلية مرتبطة بالسجلات الفعلية.']);
    return items.map(function (item) {
      return '<article class="attention-item"><span class="attention-marker ' + (item[0] === 'rose' ? 'rose' : 'teal') + '"></span><div><strong>' + this.escape(item[1]) + '</strong><p>' + this.escape(item[2]) + '</p></div></article>';
    }, this).join('');
  }

  renderSessionItem(session) {
    var initials = String(session.studentName || '؟').trim().slice(0,1) || '؟';
    var gaze = session.hasValidGaze === true || (session.riskClassification && session.riskClassification.hasValidGaze === true);
    return '<article class="session-list-item"><div class="session-avatar" aria-hidden="true">' + this.escape(initials) + '</div><div class="session-main"><strong>' +
      this.escape(session.studentName || 'طالب غير محدد') + '</strong><span>' + this.escape(session.textTitle || 'جلسة قراءة') + ' · ' + (gaze ? 'توجد بيانات نظر' : 'مراجعة بيانات النظر') +
      '</span></div><span class="session-time">' + this.formatDate(session.date, { day: 'numeric', month: 'short' }) + '</span></article>';
  }

  renderStudentRows(list) {
    if (!list || !list.length) {
      return '<tr><td colspan="7"><div class="table-empty"><strong>لا توجد سجلات بعد</strong>أضف طالبًا لبدء تجربة إدارة الجلسات.<br><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="window.dashboardModule.openNewStudentModal()">＋ إضافة طالب</button></div></td></tr>';
    }
    return list.map(function (student) {
      var sessions = this.sessions.filter(function (s) { return s.studentId === student.id; });
      var last = sessions.slice().sort(function (a,b) { return new Date(b.date || 0) - new Date(a.date || 0); })[0];
      return '<tr><td><strong>' + this.escape(student.name) + '</strong></td><td>الصف ' + this.escape(student.grade) +
        '</td><td>' + this.escape(student.classroom || '—') + '</td><td>' + (last ? this.formatDate(last.date) : '—') + '</td><td>' + sessions.length +
        '</td><td><span class="status-badge ' + (sessions.length ? 'badge-low' : 'badge-none') + '">' + (sessions.length ? 'لديه جلسات' : 'لم تبدأ جلسة') +
        '</span></td><td class="table-actions"><button class="btn btn-sm btn-primary" onclick="window.dashboardModule.launchAssessmentForStudent(\'' + this.escape(student.id) + '\')">بدء جلسة</button>' +
        '<button class="btn btn-sm btn-outline" onclick="window.dashboardModule.viewStudentDetails(\'' + this.escape(student.id) + '\')">عرض الملف</button></td></tr>';
    }, this).join('');
  }

  filterStudents() {
    var search = document.getElementById('student-search-input');
    var grade = document.getElementById('grade-filter-select');
    var tbody = document.getElementById('students-table-body');
    if (!search || !grade || !tbody) return;
    var needle = search.value.trim().toLocaleLowerCase('ar'), selected = grade.value;
    var filtered = this.students.filter(function (s) {
      return String(s.name || '').toLocaleLowerCase('ar').includes(needle) && (selected === 'all' || String(s.grade) === selected);
    });
    tbody.innerHTML = this.renderStudentRows(filtered);
    var note = document.getElementById('student-count-note');
    if (note) note.textContent = 'عرض ' + filtered.length + ' من ' + this.students.length + ' سجلًا';
  }

  scrollToStudents() {
    var section = document.getElementById('students-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async retryLoad() {
    var button = document.querySelector('#main-view-container .btn-primary');
    if (button) { button.disabled = true; button.textContent = 'جاري الاتصال…'; }
    await this.loadData();
    this.renderDashboard();
  }

  launchAssessmentForStudent(studentId) {
    var student = this.students.find(function (s) { return String(s.id) === String(studentId); });
    if (!student) return;
    var text = ARABIC_TEXTS_BANK.find(function (t) { return t.grade === (Number(student.grade) || 1); }) || ARABIC_TEXTS_BANK[0];
    window.appRouter.navigate('assessment');
    setTimeout(function () { window.assessmentManager.startSession(student, text); }, 100);
  }

  viewStudentDetails(studentId) {
    var student = this.students.find(function (s) { return String(s.id) === String(studentId); });
    if (!student) return;
    var sessions = this.sessions.filter(function (s) { return s.studentId === studentId; }).sort(function (a,b) { return new Date(b.date || 0) - new Date(a.date || 0); });
    var html = '<div class="student-profile-view fade-in"><div class="profile-header"><div><div class="eyebrow">سجل تعليمي</div><h2 id="modal-heading">ملف الطالب: ' + this.escape(student.name) +
      '</h2></div><span class="badge-info">الصف ' + this.escape(student.grade) + ' · ' + this.escape(student.classroom || '—') + '</span></div>';
    html += '<div class="student-info-box"><div class="info-item"><span class="label">العمر</span><span class="value">' + (student.age ? this.escape(student.age) + ' سنوات' : '—') +
      '</span></div><div class="info-item"><span class="label">عدد الجلسات</span><span class="value">' + sessions.length + '</span></div></div>';
    html += '<div class="profile-notes"><strong>ملاحظات المعلم:</strong> ' + this.escape(student.notes || 'لا توجد ملاحظات مسجلة.') + '</div><h3>سجل الجلسات (' + sessions.length + ')</h3><div class="sessions-history-list">';
    if (!sessions.length) html += '<p class="text-muted">لم يتم تسجيل أي جلسة لهذا الطالب بعد.</p>';
    sessions.forEach(function (s) {
      var gaze = s.hasValidGaze === true || (s.riskClassification && s.riskClassification.hasValidGaze === true);
      html += '<article class="session-history-item"><div><strong>' + this.escape(s.textTitle || 'جلسة قراءة') + '</strong><div class="text-muted">' + this.formatDate(s.date) +
        ' · ' + (Number(s.durationSeconds) || 0) + ' ثانية · الفهم ' + (Number(s.comprehensionScore) || 0) + '/' + (Number(s.comprehensionTotal) || 0) +
        '</div><div class="text-muted">' + (gaze ? 'توجد بيانات نظر' : 'بيانات النظر غير كافية') + '</div></div><button class="btn btn-sm btn-outline" onclick="window.dashboardModule.openSessionReport(\'' +
        this.escape(s.id) + '\')">عرض ملخص</button></article>';
    }, this);
    html += '</div><div class="modal-footer"><button class="btn btn-primary" onclick="window.dashboardModule.launchAssessmentForStudent(\'' + this.escape(student.id) +
      '\');window.dashboardModule.closeModal()">بدء جلسة جديدة</button></div></div>';
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('app-modal').classList.add('open');
  }

  openSessionReport(sessionId) {
    var session = this.sessions.find(function (s) { return String(s.id) === String(sessionId); });
    if (!session) return;
    document.getElementById('modal-content').innerHTML = ParentReportGenerator.generateReportHtml(session);
    document.getElementById('app-modal').classList.add('open');
  }

  openNewStudentModal() {
    var html = '<div class="modal-form-box fade-in"><div class="eyebrow">سجل جديد</div><h2 id="modal-heading">إضافة طالب إلى مساحة العمل</h2>';
    html += '<p class="text-muted" style="font-size:11px;margin:5px 0 20px">اجمع الحد الأدنى من البيانات اللازمة. لا تستخدم بيانات طفل حقيقية في النسخة التجريبية العامة.</p>';
    html += '<form id="new-student-form" onsubmit="window.dashboardModule.saveNewStudent(event)" novalidate>';
    html += '<div class="form-group"><label for="std-name">اسم الطالب أو الرمز الداخلي *</label><input id="std-name" name="name" required maxlength="100" autocomplete="off" placeholder="مثال: طالب تجريبي 01"></div>';
    html += '<div class="form-row"><div class="form-group"><label for="std-grade">الصف الدراسي *</label><select id="std-grade" name="grade" required>';
    for (var g=1; g<=6; g++) html += '<option value="' + g + '"' + (g===3?' selected':'') + '>الصف ' + g + ' الابتدائي</option>';
    html += '</select></div><div class="form-group"><label for="std-class">الفصل / الشعبة *</label><input id="std-class" name="classroom" required maxlength="40" placeholder="مثال: 3-أ"></div></div>';
    html += '<div class="form-row"><div class="form-group"><label for="std-age">العمر</label><input type="number" id="std-age" name="age" value="8" min="5" max="15" required></div>';
    html += '<div class="form-group"><label for="std-gender">الجنس (اختياري)</label><select id="std-gender" name="gender"><option value="غير محدد">عدم التحديد</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></div></div>';
    html += '<div class="form-group"><label for="std-notes">ملاحظات تعليمية (اختياري)</label><textarea id="std-notes" name="notes" rows="3" maxlength="1000" placeholder="ملاحظات تعليمية ذات صلة فقط…"></textarea></div>';
    html += '<p id="student-form-error" role="alert" style="display:none;color:#a8444b;font-size:11px"></p><div class="form-actions"><button type="submit" class="btn btn-primary">حفظ السجل</button><button type="button" class="btn btn-secondary" onclick="window.dashboardModule.closeModal()">إلغاء</button></div></form></div>';
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('app-modal').classList.add('open');
    var input = document.getElementById('std-name');
    if (input) input.focus();
  }

  async saveNewStudent(event) {
    event.preventDefault();
    var form = event.currentTarget, error = document.getElementById('student-form-error');
    var payload = {
      name: document.getElementById('std-name').value.trim(),
      grade: Number(document.getElementById('std-grade').value),
      classroom: document.getElementById('std-class').value.trim(),
      age: Number(document.getElementById('std-age').value),
      gender: document.getElementById('std-gender').value,
      notes: document.getElementById('std-notes').value.trim()
    };
    var fail = function (message) { error.textContent = message; error.style.display = 'block'; };
    if (!payload.name || payload.name.length > 100) return fail('أدخل اسمًا أو رمزًا صالحًا لا يتجاوز 100 حرف.');
    if (!Number.isInteger(payload.grade) || payload.grade < 1 || payload.grade > 6) return fail('اختر صفًا من الصفوف الأول إلى السادس.');
    if (!payload.classroom || payload.classroom.length > 40) return fail('أدخل الفصل في حدود 40 حرفًا.');
    if (!Number.isFinite(payload.age) || payload.age < 5 || payload.age > 15) return fail('يجب أن يكون العمر بين 5 و15 سنة.');
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'جاري الحفظ…';
    try {
      var response = await fetch('/api/students', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر حفظ السجل.');
      await this.loadData();
      this.closeModal();
      this.renderDashboard();
      this.showToast('تم حفظ سجل الطالب.');
    } catch (err) {
      fail(err.message || 'حدث خطأ أثناء الحفظ.');
      submit.disabled = false; submit.textContent = 'حفظ السجل';
    }
  }

  openInterventionForStudent(pattern) {
    this.closeModal();
    window.appRouter.navigate('intervention');
    setTimeout(function () { window.interventionModule.renderMenu(pattern); }, 100);
  }

  showToast(message) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var toast = document.createElement('div');
    toast.className = 'toast-message'; toast.textContent = message; region.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3200);
  }

  closeModal() {
    var modal = document.getElementById('app-modal');
    if (modal) modal.classList.remove('open');
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DashboardModule };
