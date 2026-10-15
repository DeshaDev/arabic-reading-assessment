/**
 * مولد تقرير ولي الأمر العربي المبسط والمتوافق مع الطباعة و PDF
 * صمم بلغة مطمئنة وخالية من الوصم مع إرشادات وتمارين منزلية عملية.
 */

class ParentReportGenerator {
  static generateReportHtml(sessionData) {
    const s = sessionData;
    const m = s.metrics || {};
    const risk = s.riskClassification || {};

    let statusBadgeClass = 'badge-low';
    let statusText = 'قراءة طبيعية سلسة ومبشرة';
    let summaryMessage = `أظهر ${s.studentName} طلاقة ممتازة في متابعة الكلمات، وتناسقاً بصرياً مريحاً مع استيعاب طيب لمعاني القصة.`;

    if (risk.level === 'high') {
      statusBadgeClass = 'badge-high';
      statusText = 'يحتاج إلى خطة دعم وتدريب مكثفة';
      summaryMessage = `لاحظنا خلال جلسة القراءة أن عيني ${s.studentName} تبذلان جهداً إضافياً في التوقف وإعادة قراءة بعض الكلمات ذات الحروف المتشابهة، مما يؤدي إلى الشعور بالإجهاد السريع وانخفاض تدفق القراءة. هذا مؤشر شائع جداً ويمكن تجاوزه بأنشطة بسيطة وممتعة في المنزل والمدرسة.`;
    } else if (risk.level === 'moderate') {
      statusBadgeClass = 'badge-mod';
      statusText = 'يحتاج متابعة وتدريب منتظم';
      summaryMessage = `يتقدم ${s.studentName} بشكل جيد في القراءة، ولكن لوحظ بعض التردد البصري عند الكلمات المشكولة أو الطويلة، ونوصي بممارسة تمارين القراءة المشتركة لتعزيز ثقته وسرعته.`;
    }

    return `
      <div class="parent-report-document" id="printable-report">
        <!-- ترويسة التقرير -->
        <div class="report-header">
          <div class="report-logo">
            <span class="logo-icon">👁️</span>
            <div>
              <h2>منصة القارئ الذكي</h2>
              <p>التقييم المبكر لمهارات القراءة وتتبع النظر</p>
            </div>
          </div>
          <div class="report-meta">
            <div><strong>تاريخ التقييم:</strong> ${new Date(s.date).toLocaleDateString('ar-EG')}</div>
            <div><strong>رمز الجلسة:</strong> ${s.id}</div>
          </div>
        </div>

        <div class="report-divider"></div>

        <!-- بيانات الطالب -->
        <div class="student-info-box">
          <div class="info-item">
            <span class="label">اسم الطالب:</span>
            <span class="value">${s.studentName}</span>
          </div>
          <div class="info-item">
            <span class="label">الصف الدراسي:</span>
            <span class="value">الصف ${s.grade} الابتدائي</span>
          </div>
          <div class="info-item">
            <span class="label">النص المقروء:</span>
            <span class="value">${s.textTitle}</span>
          </div>
          <div class="info-item">
            <span class="label">النتيجة العامة:</span>
            <span class="value status-badge ${statusBadgeClass}">${statusText}</span>
          </div>
        </div>

        <!-- الملخص التربوي لولي الأمر -->
        <div class="report-section">
          <h3 class="section-title">🌟 رسالة إلى الأسرة الكريمة</h3>
          <div class="summary-card">
            <p>${summaryMessage}</p>
          </div>
        </div>

        <!-- المؤشرات الحيوية المبسطة -->
        <div class="report-section">
          <h3 class="section-title">📊 ماذا تظهر حركة عين طفلك أثناء القراءة؟</h3>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-title">سرعة القراءة</div>
              <div class="metric-val">${s.wpm} <small>كلمة/دقيقة</small></div>
              <div class="metric-desc">المعدل الطبيعي لصفه: 65 - 85 ك/د</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">سلاسة تدفق القراءة</div>
              <div class="metric-val">${s.hasValidGaze ? `${m.avgFixationDurationMs || 0} <small>مللي ثانية</small>` : '<span style="font-size:14px; color:#64748b;">غير متاح (لا توجد إشارة)</span>'}</div>
              <div class="metric-desc">متوسط زمن التوقف البصري على الكلمة</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">نسبة مراجعة الكلمات</div>
              <div class="metric-val">${s.hasValidGaze ? `${m.regressionRatePercent || 0}%` : '<span style="font-size:14px; color:#64748b;">غير متاح (لا توجد إشارة)</span>'}</div>
              <div class="metric-desc">حركات النظر المرتدة للخلف للتأكد</div>
            </div>

            <div class="metric-card">
              <div class="metric-title">فهم المقروء</div>
              <div class="metric-val">${s.comprehensionScore} / ${s.comprehensionTotal}</div>
              <div class="metric-desc">استيعاب أحداث القصة الرئيسية</div>
            </div>
          </div>
        </div>

        <!-- التمارين المنزلية المقترحة -->
        <div class="report-section">
          <h3 class="section-title">🏡 ماذا يمكننا أن نفعل في البيت معاً؟ (10 دقائق يومياً)</h3>
          <div class="recommendations-list">
            <div class="rec-card">
              <div class="rec-num">1</div>
              <div>
                <h4>لعبة "صياد النقاط"</h4>
                <p>تصفحا قصة قصيرة معاً، واطلبي من الطفل أن يضع إصبعه الصغير على جميع الكلمات التي تبدأ بحرف له نقطة تحت مثل (الباء) ثم التي لها نقطتان فوق مثل (التاء). هذا يدرب مسار الإدراك البصري.</p>
              </div>
            </div>

            <div class="rec-card">
              <div class="rec-num">2</div>
              <div>
                <h4>القراءة التناوبية اللطيفة (قراءة المرآة)</h4>
                <p>اقرئي سطراً بصوت دافئ ومريح، ثم دعي طفلك يقرأ السطر التالي. هذا يمنح عينيه استراحة دورية ويخفف من التوتر والقلق.</p>
              </div>
            </div>

            <div class="rec-card">
              <div class="rec-num">3</div>
              <div>
                <h4>بطاقة نافذة الكلمات</h4>
                <p>قصي ورقة صغيرة لتكشف كلمة واحدة أو سطرين فقط في المرة الواحدة أثناء القراءة، لمنع تشتت العين بالسطور السفلية (Visual Crowding).</p>
              </div>
            </div>
          </div>
        </div>

        <!-- الإخلاء القانوني الإلزامي -->
        <div class="report-disclaimer">
          <strong>⚠️ تنبيه تربوي وأخلاقي هام:</strong>
          نتائج هذا التقييم مستخلصة عبر الذكاء الاصطناعي وتتبع حركة النظر كأداة فرز ومسح مبدئي لمهارات القراءة والمسار البصري. هذه النتيجة ليست تشخيصاً طبياً أو نفسياً لمرض أو إعاقة، وإنما هي مؤشر توجيهي لمساعدة المدرسة والأسرة على تقديم الدعم المبكر للطفل.
        </div>

        <!-- أزرار الإجراءات في العرض -->
        <div class="report-actions no-print">
          <button class="btn btn-primary" onclick="window.print()">🖨️ طباعة التقرير أو حفظه كـ PDF</button>
          <button class="btn btn-secondary" onclick="window.dashboardModule.closeModal()">إغلاق</button>
        </div>
      </div>
    `;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParentReportGenerator };
}
