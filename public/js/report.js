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
      ? (s.comparableReadingMode === false
        ? 'غير محسوبة لأن طريقة القراءة اختلفت بين المقاطع.'
        : 'غير متاحة — مدة القراءة أو جودة القياس لا تسمح بحساب سرعة قابلة للتفسير.')
      : wpm + ' كلمة/دقيقة';
    const qualityLabel = risk.levelAr || 'مؤشرات وصفية — لا تصنيف تشخيصي';
    const reasons = Array.isArray(risk.reasons) ? risk.reasons : [];
    const segments = Array.isArray(s.readingSegments) ? s.readingSegments : [];
    const readingAnalyses = Array.isArray(s.readingAnalyses) ? s.readingAnalyses : [];
    const gazeCalibration = s.gazeCalibration && typeof s.gazeCalibration === 'object' ? s.gazeCalibration : null;
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

    if (gazeCalibration) {
      html += '<section class="report-section"><h3 class="section-title">التحقق التقني لمعايرة النظر</h3><div class="summary-card"><p><strong>النتيجة:</strong> ' +
        (gazeCalibration.passed === true ? 'اجتازت نقاط التحقق الحد الهندسي الداخلي' : 'لم تجتز نقاط التحقق أو كانت عينات التحقق غير كافية') +
        '.</p><p>نقاط صالحة: ' + (Number(gazeCalibration.validTargetCount) || 0) + ' / ' +
        (Number(gazeCalibration.validationTargetCount) || 0) + ' · الخطأ الوسيط المقدر: ' +
        (gazeCalibration.medianErrorPx == null ? 'غير متاح' : (Number(gazeCalibration.medianErrorPx) || 0) + ' بكسل') +
        ' · الحد الداخلي: ' + (Number(gazeCalibration.tolerancePx) || 0) + ' بكسل.</p>' +
        '<p>هذا فحص جودة هندسي أولي على شاشة الجهاز وليس معيار دقة معتمدًا علميًا أو مقياسًا تشخيصيًا.</p></div></section>';
    }

    html += '<section class="report-section"><h3 class="section-title">تفاصيل مهام القراءة</h3><div class="recommendations-list">';
    html += '<div class="rec-card"><div class="rec-num">R</div><div><h4>تسمية الحروف</h4><p>الزمن: ' + (s.ranDurationSeconds == null ? 'غير مسجل' : safe(s.ranDurationSeconds) + ' ثانية') + ' · أخطاء رصدها المعلم: ' + (Number(s.ranErrors) || 0) + '.</p></div></div>';
    if (segments.length) {
      html += segments.map(function (segment, index) {
        const mode = segment.mode === 'oral' ? 'جهرية' : 'صامتة';
        const segmentWpm = typeof window !== 'undefined' && window.ReadingAssessmentProtocol ? window.ReadingAssessmentProtocol.calculateObservedWpm(segment.wordCount, segment.durationSeconds) : null;
        const wordGaze = segment.wordGaze || {};
        const topWordDwells = (Array.isArray(wordGaze.perWord) ? wordGaze.perWord : [])
          .slice().sort(function (a, b) { return Number(b.totalDwellMs || 0) - Number(a.totalDwellMs || 0); }).slice(0, 5);
        const topWordDwellsHtml = topWordDwells.length
          ? '<ul>' + topWordDwells.map(function (item) {
            return '<li>' + safe(item.wordText || ('الكلمة رقم ' + (Number(item.wordIndex) + 1))) +
              ' · زمن نظر تراكمي ' + (Number(item.totalDwellMs) || 0) + ' ms · مرات رصد مستقرة ' + (Number(item.visitCount) || 0) + '.</li>';
          }).join('') + '</ul>'
          : '';
        const wordGazeHtml = wordGaze.quality === 'observed'
          ? '<p><strong>مناطق كلمات رُصدت فيها إشارة النظر:</strong> ' + (Number(wordGaze.uniqueWordsSeen) || 0) + ' من ' +
            (Number(wordGaze.targetWordCount) || 0) + ' كلمة (' + (Number(wordGaze.wordCoveragePercent) || 0) + '% تغطية) · عينات أُسندت إلى كلمة ' +
            (Number(wordGaze.sampleCoveragePercent) || 0) + '% · انتقالات إلى كلمات سابقة ' + (Number(wordGaze.regressions) || 0) + '.</p>' +
            topWordDwellsHtml + '<p class="text-muted">زمن النظر والمناطق المرصودة لا يثبتان وحدهما حدوث خطأ قراءة أو فهم.</p>'
          : '<p>لا توجد تغطية كافية لربط النظر بالكلمات في هذا المقطع.</p>';
        return '<div class="rec-card"><div class="rec-num">' + (index + 1) + '</div><div><h4>' + safe(segment.passageTitle || 'مقطع قراءة') + ' · ' + mode + '</h4><p>المدة: ' + (Number(segment.durationSeconds) || 0) + ' ثانية · الكلمات: ' + (Number(segment.wordCount) || 0) + ' · سرعة المقطع: ' + (segmentWpm == null ? 'غير متاحة' : segmentWpm + ' كلمة/دقيقة') + ' · أخطاء رصدها المعلم: ' + (Number(segment.errors) || 0) + ' · كلمات محذوفة: ' + (Number(segment.omissions) || 0) + ' · تصحيحات ذاتية: ' + (Number(segment.selfCorrections) || 0) + '.</p><p>مؤشرات النظر: ' + (segment.hasValidGaze ? 'اجتازت المعايرة تحققًا تقنيًا أوليًا مع عينات مبدئية' : 'غير متاحة أو غير كافية') + '.</p>' + wordGazeHtml + '</div></div>';
      }).join('');
    } else {
      html += '<p class="text-muted">هذه جلسة قديمة لا تتضمن تفاصيل المقاطع.</p>';
    }
    html += '</div></section>';
    if (s.readingIndependently !== undefined || s.assistanceType || s.teacherNotes) {
      html += '<section class="report-section"><h3 class="section-title">سياق المعلم</h3><div class="summary-card"><p>القراءة باستقلال: ' + (s.readingIndependently === true ? 'نعم' : s.readingIndependently === false ? 'لا' : 'غير محدد') + ' · المساعدة: ' + safe(s.assistanceType || 'غير محددة') + '.</p>' + (s.teacherNotes ? '<p>' + safe(s.teacherNotes) + '</p>' : '') + '</div></section>';
    }

    if (readingAnalyses.length) {
      html += '<section class="report-section"><h3 class="section-title">تحليل آلي للقراءة الجهرية · يحتاج مراجعة بشرية</h3><p>قورِن تفريغ الكلام الآلي بالنص المستهدف. قد تمثل الفروق أخطاء تعرف صوتي، وليست كل علامة خطأ قراءة مؤكدًا.</p><div class="recommendations-list">';
      readingAnalyses.forEach(function (analysis, index) {
        const alignment = analysis.alignment || {};
        const counts = alignment.counts || {};
        const transcript = safe(analysis.transcript || '');
        const rate = alignment.wordErrorRate == null ? 'غير متاحة' : Math.round(alignment.wordErrorRate * 100) + '%';
        const typeLabels = { substitution: 'استبدال محتمل', deletion: 'حذف محتمل من التفريغ', insertion: 'كلمة إضافية', repetition: 'تكرار محتمل' };
        const differences = (alignment.operations || []).filter(function (operation) { return operation.type !== 'match'; }).slice(0, 80);
        const diffHtml = differences.length
          ? '<ul>' + differences.map(function (operation) {
            return '<li><strong>' + safe(typeLabels[operation.type] || 'فرق محتمل') + ':</strong> النص ' +
              safe(operation.targetWord || '—') + ' · التفريغ ' + safe(operation.spokenWord || 'لم يظهر') + '</li>';
          }).join('') + '</ul>'
          : '<p>لم يرصد التطابق النصي اختلافًا واضحًا في التفريغ؛ هذا لا يثبت خلو القراءة من الأخطاء.</p>';
        html += '<div class="rec-card"><div class="rec-num">' + (index + 1) + '</div><div><h4>' + safe(analysis.passageTitle || 'مقطع القراءة') + '</h4><p><strong>التفريغ:</strong> ' + transcript + '</p>' +
          '<p>استبدال: ' + (Number(counts.substitutions) || 0) + ' · حذف محتمل: ' + (Number(counts.deletions) || 0) +
          ' · إضافة: ' + (Number(counts.insertions) || 0) + ' · تكرار: ' + (Number(counts.repetitions) || 0) +
          ' · فرق التفريغ التقريبي: ' + rate + '.</p>' + diffHtml +
          '<p class="text-muted">محرك التفريغ: ' + safe(analysis.model || 'غير محدد') + ' · ' + safe(analysis.analyzedAt || '') + '</p></div></div>';
      });
      html += '</div></section>';
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
