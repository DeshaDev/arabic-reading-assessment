/**
 * Parent-facing session summary. Results are descriptive educational observations, not a diagnosis.
 */
class ParentReportGenerator {
  static escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  static generateReportHtml(sessionData) {
    const s = sessionData || {};
    const m = s.metrics || {};
    const risk = s.riskClassification || {};
    const gazeAvailable = s.hasValidGaze === true || risk.hasValidGaze === true;
    const wpm = Number.isFinite(Number(s.wpm)) && s.wpm !== null ? Number(s.wpm) : null;
    const score = Number(s.comprehensionScore) || 0;
    const total = Number(s.comprehensionTotal) || 0;
    const date = s.date && !Number.isNaN(new Date(s.date).getTime())
      ? new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s.date))
      : 'غير متاح';
    const safe = ParentReportGenerator.escape;
    const gazeSummary = gazeAvailable
      ? 'تم تسجيل عينات نظر بعد محاولة المعايرة. تعتمد دقتها على الجهاز والإضاءة وطريقة الاستخدام.'
      : 'لم تتوفر عينات نظر كافية أو لم تكتمل المعايرة؛ لذلك لم تُدرج مؤشرات التثبيت والارتداد في هذا الملخص.';
    const speedSummary = wpm === null
      ? 'غير متاحة — مدة القراءة أو جودة القياس لا تسمح بحساب سرعة قابلة للتفسير.'
      : wpm + ' كلمة/دقيقة';
    const qualityLabel = risk.levelAr || 'مؤشرات وصفية — لا تصنيف تشخيصي';
    const reasons = Array.isArray(risk.reasons) ? risk.reasons : [];
    const segments = Array.isArray(s.readingSegments) ? s.readingSegments : [];
    const reasonsHtml = reasons.length
      ? reasons.map(function (reason) { return '<li>' + safe(reason) + '</li>'; }).join('')
      : '<li>راجع مدة القراءة وإجابات الفهم وجودة الإشارة مع المعلم.</li>';

    let html = '<div class="parent-report-document" id="printable-report">';
    html += '<header class="report-header"><div class="report-logo"><span class="logo-icon" aria-hidden="true">ن</span><div><h2>نَبراس</h2><p>ملخص جلسة قراءة عربية</p></div></div>';
    html += '<div class="report-meta"><div><strong>تاريخ الجلسة:</strong> ' + safe(date) + '</div><div><strong>رمز الجلسة:</strong> ' + safe(s.id || 'غير محفوظ') + '</div></div></header>';
    html += '<div class="report-divider"></div><div class="student-info-box">';
    html += '<div class="info-item"><span class="label">اسم الطالب / الرمز:</span><span class="value">' + safe(s.studentName || 'غير محدد') + '</span></div>';
    html += '<div class="info-item"><span class="label">الصف الدراسي:</span><span class="value">الصف ' + safe(s.grade || '—') + '</span></div>';
    html += '<div class="info-item"><span class="label">النص:</span><span class="value">' + safe(s.textTitle || 'غير محدد') + '</span></div>';
    html += '<div class="info-item"><span class="label">مدة القراءة:</span><span class="value">' + (Number(s.durationSeconds) || 0) + ' ثانية</span></div></div>';

    html += '<section class="report-section"><h3 class="section-title">ملخص الجلسة</h3><div class="summary-card"><p>' +
      'يعرض هذا التقرير ما سُجّل في جلسة واحدة فقط. هذه الملاحظات التعليمية لا تشخّص عسر القراءة ولا تثبت وجوده أو عدمه. ' +
      'يُفسَّر الأداء في ضوء عمر الطالب، وتعليمه السابق، ولغته، وظروف الجلسة، وملاحظات مختص مؤهل.' +
      '</p></div></section>';

    html += '<section class="report-section"><h3 class="section-title">الملاحظات المسجلة</h3><div class="metrics-grid">';
    html += '<div class="metric-card"><div class="metric-title">سرعة القراءة المحسوبة</div><div class="metric-val">' + speedSummary + '</div><div class="metric-desc">عدد كلمات النص ÷ مدة القراءة</div></div>';
    html += '<div class="metric-card"><div class="metric-title">فهم المقروء</div><div class="metric-val">' + score + ' / ' + total + '</div><div class="metric-desc">الإجابات الصحيحة المسجلة</div></div>';
    html += '<div class="metric-card"><div class="metric-title">عينات النظر</div><div class="metric-val">' + (gazeAvailable ? safe(m.totalFixations || 0) + ' تثبيت' : 'غير متاحة') + '</div><div class="metric-desc">' + (gazeAvailable ? 'قياس تقديري عبر كاميرا الجهاز' : 'إشارة غير كافية أو معايرة غير مكتملة') + '</div></div>';
    html += '<div class="metric-card"><div class="metric-title">حالة القياس</div><div class="metric-val">' + safe(qualityLabel) + '</div><div class="metric-desc">لا توجد درجة خطر أو تشخيص</div></div></div></section>';

    html += '<section class="report-section"><h3 class="section-title">تفاصيل مهام القراءة</h3><div class="recommendations-list">';
    html += '<div class="rec-card"><div class="rec-num">R</div><div><h4>تسمية الحروف</h4><p>الزمن: ' + (s.ranDurationSeconds == null ? 'غير مسجل' : safe(s.ranDurationSeconds) + ' ثانية') + ' · أخطاء رصدها المعلم: ' + (Number(s.ranErrors) || 0) + '.</p></div></div>';
    if (segments.length) {
      html += segments.map(function (segment, index) {
        const mode = segment.mode === 'oral' ? 'جهرية' : 'صامتة';
        const segmentWpm = typeof window !== 'undefined' && window.ReadingAssessmentProtocol ? window.ReadingAssessmentProtocol.calculateObservedWpm(segment.wordCount, segment.durationSeconds) : null;
        return '<div class="rec-card"><div class="rec-num">' + (index + 1) + '</div><div><h4>' + safe(segment.passageTitle || 'مقطع قراءة') + ' · ' + mode + '</h4><p>المدة: ' + (Number(segment.durationSeconds) || 0) + ' ثانية · الكلمات: ' + (Number(segment.wordCount) || 0) + ' · أخطاء رصدها المعلم: ' + (Number(segment.errors) || 0) + ' · كلمات محذوفة: ' + (Number(segment.omissions) || 0) + ' · تصحيحات ذاتية: ' + (Number(segment.selfCorrections) || 0) + '.</p><p>مؤشرات النظر: ' + (segment.hasValidGaze ? 'توجد عينات كافية مبدئيًا' : 'غير متاحة أو غير كافية') + '.</p></div></div>';
      }).join('');
    } else {
      html += '<p class="text-muted">هذه جلسة قديمة لا تتضمن تفاصيل المقاطع.</p>';
    }
    html += '</div></section>';
    if (s.readingIndependently !== undefined || s.assistanceType || s.teacherNotes) {
      html += '<section class="report-section"><h3 class="section-title">سياق المعلم</h3><div class="summary-card"><p>القراءة باستقلال: ' + (s.readingIndependently === true ? 'نعم' : s.readingIndependently === false ? 'لا' : 'غير محدد') + ' · المساعدة: ' + safe(s.assistanceType || 'غير محددة') + '.</p>' + (s.teacherNotes ? '<p>' + safe(s.teacherNotes) + '</p>' : '') + '</div></section>';
    }

    html += '<section class="report-section"><h3 class="section-title">ملاحظات فنية يجب مراجعتها</h3><div class="recommendations-list">';
    html += '<div class="rec-card"><div class="rec-num">1</div><div><h4>جودة إشارة النظر</h4><p>' + safe(gazeSummary) + '</p></div></div>';
    html += '<div class="rec-card"><div class="rec-num">2</div><div><h4>القراءة والفهم</h4><p>قارن السرعة المحسوبة وإجابات الفهم بملاحظات المعلم وعينات قراءة أخرى؛ لا تستنتج حالة تعلم من جلسة منفردة.</p></div></div>';
    html += '<div class="rec-card"><div class="rec-num">3</div><div><h4>خطوة تالية مناسبة</h4><p>عند استمرار القلق، اجمع أدلة متعددة وتواصل مع أخصائي صعوبات تعلم مؤهل لتحديد الحاجة إلى تقييم معياري معتمد.</p></div></div></div></section>';

    html += '<section class="diagnostic-reasons-card"><h4>تفاصيل الجلسة</h4><ul>' + reasonsHtml + '</ul></section>';
    html += '<div class="report-disclaimer"><strong>تنبيه مهم:</strong> نَبراس في هذه النسخة نموذج تقني تجريبي. تتبع النظر عبر كاميرا ويب عادية قد يكون غير دقيق، ولا يُعد معيارًا سريريًا مثبتًا لعسر القراءة. لا تستخدم هذه المخرجات لاتخاذ قرار تشخيصي أو تعليمي عالي الأثر دون مراجعة مختص.</div>';
    html += '<div class="report-actions no-print"><button class="btn btn-primary" onclick="window.print()">طباعة / حفظ كـ PDF</button><button class="btn btn-secondary" onclick="window.dashboardModule.closeModal()">إغلاق</button></div></div>';
    return html;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { ParentReportGenerator };
