/**
 * مدير جلسة التقييم الكاملة:
 * فحص البيئة -> معايرة النظر والتحقق منها -> قراءة النص وتتبع النظر -> أسئلة الفهم -> النتائج والتحليلات
 * متكامل مع ودجت الكاميرا المستمر و Google MediaPipe Face Mesh & Iris
 */

class AssessmentSessionManager {
  constructor(tracker, visualizer, metricsEngine) {
    this.tracker = tracker;
    this.visualizer = visualizer;
    this.metricsEngine = metricsEngine;

    this.currentStudent = null;
    this.currentText = null;
    this.sessionStartTime = null;
    this.sessionEndTime = null;

    this.rawGazeSamples = [];
    this.comprehensionAnswers = [];

    this.stage = 'idle'; // idle | env_check | calibration | reading | comprehension | results
    this.readingTimer = null;
    this.elapsedSeconds = 0;
  }

  async startSession(student, text) {
    this.currentStudent = student;
    this.currentText = text;
    this.rawGazeSamples = [];
    this.comprehensionAnswers = [];
    this.elapsedSeconds = 0;
    this.calibrationCompleted = false;
    this.qualityNotice = null;

    // Render the session immediately; a slow camera/model startup must not leave a blank screen.
    this.renderEnvironmentCheck();
    if (!this.tracker.isStreaming) {
      const sessionToken = this.audioSessionToken;
      this.cameraInitializationPromise = Promise.resolve()
        .then(() => this.tracker.initialize())
        .then(ready => {
          if (sessionToken !== this.audioSessionToken || this.stage === 'stopped') {
            this.tracker.shutdown();
            return false;
          }
          if (!ready && this.tracker.cameraError) {
            const alertBox = document.getElementById('camera-alert-box');
            const errMsg = document.getElementById('camera-err-msg');
            if (alertBox) alertBox.style.display = 'block';
            if (errMsg) errMsg.textContent = this.tracker.cameraError;
          }
          return ready;
        })
        .catch(error => {
          if (sessionToken !== this.audioSessionToken || this.stage === 'stopped') return false;
          this.tracker.cameraError = error && error.message ? error.message : 'تعذر تشغيل الكاميرا.';
          const alertBox = document.getElementById('camera-alert-box');
          const errMsg = document.getElementById('camera-err-msg');
          if (alertBox) alertBox.style.display = 'block';
          if (errMsg) errMsg.textContent = this.tracker.cameraError;
          return false;
        });
    }
  }

  // المرحلة 1: فحص البيئة والإضاءة
  renderEnvironmentCheck() {
    this.stage = 'env_check';
    const container = document.getElementById('assessment-container');

    container.innerHTML = `
      <div class="assessment-card fade-in">
        <div class="step-indicator">الخطوة 1 من 4: التحقق من وضعية الجلوس والكاميرا</div>
        <h2>مرحباً يا بطل! لنستعد معاً لمغامرة القراءة</h2>
        <p>انظر إلى نافذة الكاميرا في أسفل يسار الشاشة للتأكد من ظهور وجهك وعينيك بدقة.</p>
        <p id="camera-startup-status" class="text-muted" role="status" aria-live="polite">يجري تجهيز الكاميرا… اسمح بالوصول إليها من نافذة المتصفح عند الطلب.</p>

        <div id="camera-alert-box" style="display: none; margin: 20px 0; padding: 16px 20px; border-radius: 10px; background: #fef2f2; border: 1px solid #f87171; color: #991b1b; text-align: right; line-height: 1.6;">
          <strong>⚠️ تعذّر بدء الكاميرا أو نموذج تتبع النظر:</strong>
          <p id="camera-err-msg" style="margin: 6px 0 10px 0; font-size: 13px;">جاري فحص الكاميرا...</p>
          <ol style="margin: 0 20px 12px 0; padding: 0; font-size: 13px;">
            <li><strong>غطاء الكاميرا المنزلق (Shutter):</strong> إذا كان اللابتوب به غطاء بلاستيكي صغير فوق العدسة، تأكد من فتحه.</li>
            <li><strong>زر الكاميرا في لوحة المفاتيح:</strong> اضغط <code>Fn + F8</code> أو <code>Fn + F10</code> لإلغاء كتم الكاميرا في ويندوز.</li>
            <li><strong>إذن المتصفح:</strong> اضغط على أيقونة الإعدادات 🔒 بجانب <code>localhost:3000</code> وتأكد من اختيار <strong>Allow</strong>.</li>
          </ol>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" id="btn-retry-camera" onclick="window.assessmentManager.retryCamera()">🔄 فحص وتفعيل الكاميرا هنا</button>
            <a href="camera_test.html" target="_blank" class="btn btn-sm btn-outline" style="text-decoration:none; color:#1e293b; border-color:#cbd5e1; background:#fff;">🛠️ فتح صفحة فحص الكاميرا والعتاد مباشرة ↗️</a>
          </div>
        </div>

        <div class="env-status-indicators" style="margin-top: 26px;">
          <div class="status-pill" id="ind-face">
            <span class="dot"></span> إشارة النظر: بانتظار أول عينة
          </div>
          <div class="status-pill" id="ind-light">
            <span class="dot"></span> سطوع الصورة: بانتظار الكاميرا
          </div>
          <div class="status-pill" id="ind-dist">
            <span class="dot"></span> المعايرة: لم تبدأ بعد
          </div>
        </div>

        <div class="setup-instructions" style="margin: 28px 0;">
          <h4>🔍 تعليمات المعايرة الحقيقية:</h4>
          <ul>
            <li>تأكد من إعطاء إذن الكاميرا عند طلبه في المتصفح لرصد حركة العين بدقة.</li>
            <li>ستظهر تسع نقاط معايرة. انظر مباشرة إلى كل نجمة وانقرها ثلاث مرات لتدريب النموذج عبر مناطق الشاشة.</li>
            <li>يتحقق النظام بعد ذلك من تقدير النظر على نقاط مستقلة. لا يبدأ تتبع الكلمات إلا إذا اجتاز هذا الفحص.</li>
          </ul>
        </div>

        <div class="actions" style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary btn-lg" id="btn-start-calib" onclick="window.assessmentManager.startCalibration()">
            بدء معايرة النظر (9 نقاط) ⭐
          </button>
          <button class="btn btn-sm btn-secondary" onclick="window.assessmentManager.retryCamera()">
            📸 اختبار الكاميرا مباشرة
          </button>
        </div>
      </div>
    `;

    // Update the visible state when the camera initialization succeeds or fails.
    this.tracker.onCameraStatusChange = (state) => {
      const startup = document.getElementById('camera-startup-status');
      if (startup) {
        startup.textContent = state.status === 'active'
          ? 'الكاميرا تعمل الآن. ابدأ المعايرة ثم القراءة.'
          : state.status === 'tracking_error'
            ? (state.message || 'الكاميرا تعمل، لكن نموذج تتبع النظر لم يبدأ.')
            : 'تعذر تشغيل الكاميرا: ' + (state.message || 'تحقق من الإذن والجهاز.');
      }
      if (state.status === 'error') {
        const alertBox = document.getElementById('camera-alert-box');
        const errMsg = document.getElementById('camera-err-msg');
        if (alertBox) alertBox.style.display = 'block';
        if (errMsg) errMsg.textContent = state.message || 'تعذر تشغيل الكاميرا.';
      }
    };

    // التحقق الفوري من حالة الكاميرا
    this.checkCameraImmediately();

    this.tracker.onEnvironmentCheck = (env) => {
      const indFace = document.getElementById('ind-face');
      const indLight = document.getElementById('ind-light');
      const indDist = document.getElementById('ind-dist');

      if (!indFace) return;

      if (env.faceDetected) {
        indFace.className = 'status-pill success';
        indFace.innerHTML = '<span class="dot"></span> إشارة النظر: وصلت عينة حديثة';
      } else {
        indFace.className = 'status-pill warning';
        indFace.innerHTML = '<span class="dot"></span> إشارة النظر: بانتظار العينة الأولى';
      }

      if (env.lighting === 'good') {
        indLight.className = 'status-pill success';
        indLight.innerHTML = `<span class="dot"></span> الإضاءة: ممتازة (${env.realLuma || 110}/255) 🟢`;
      } else if (env.lighting === 'moderate') {
        indLight.className = 'status-pill warning';
        indLight.innerHTML = `<span class="dot"></span> الإضاءة: مقبولة (${env.realLuma || 50}/255) 🟡`;
      } else {
        indLight.className = 'status-pill error';
        indLight.innerHTML = `<span class="dot"></span> الإضاءة: خافتة (${env.realLuma || 20}/255) 🔴`;
      }

      indDist.className = 'status-pill';
      indDist.innerHTML = '<span class="dot"></span> تقدير المسافة غير متاح في هذه النسخة';
    };
  }

  async checkCameraImmediately() {
    const alertBox = document.getElementById('camera-alert-box');
    const errMsg = document.getElementById('camera-err-msg');

    if (this.tracker.cameraError) {
      if (alertBox) {
        alertBox.style.display = 'block';
        if (errMsg) errMsg.innerText = this.tracker.cameraError;
      }
    } else {
      setTimeout(() => {
        const active = this.tracker.isCameraActive();
        const startup = document.getElementById('camera-startup-status');
        if (active) {
          if (startup) startup.textContent = 'الكاميرا تعمل الآن. ابدأ المعايرة ثم القراءة.';
          if (alertBox) alertBox.style.display = 'none';
        } else {
          if (alertBox) alertBox.style.display = 'block';
          if (errMsg) errMsg.innerText = this.tracker.cameraError || 'لم يبدأ بث الكاميرا بعد. اسمح بالوصول إليها، ثم اضغط إعادة فحص الكاميرا.';
          if (startup) startup.textContent = 'لم يبدأ بث الكاميرا بعد؛ راجع الرسالة الحمراء وأعد المحاولة.';
        }
      }, 5000);
    }
  }

  async retryCamera() {
    const alertBox = document.getElementById('camera-alert-box');
    const errMsg = document.getElementById('camera-err-msg');
    const retryBtn = document.getElementById('btn-retry-camera');
    if (retryBtn) retryBtn.innerText = 'جاري الفحص... ⏳';

    const res = await this.tracker.initialize();
    if (res && this.tracker.isCameraActive()) {
      if (alertBox) alertBox.style.display = 'none';
      const indFace = document.getElementById('ind-face');
      if (indFace) {
        indFace.className = 'status-pill success';
        indFace.innerHTML = '<span class="dot"></span> الكاميرا متصلة؛ بانتظار إشارة النظر';
      }
    } else {
      if (alertBox) {
        alertBox.style.display = 'block';
        if (errMsg) errMsg.innerText = this.tracker.cameraError || 'تعذر تشغيل الكاميرا؛ يرجى التأكد من إذن المتصفح.';
      }
    }
    if (retryBtn) retryBtn.innerText = '🔄 فحص وإعادة تفعيل الكاميرا الآن';
  }

  // Never treat skipped calibration as valid word-level gaze tracking.
  skipCalibration() {
    this.calibrationCompleted = false;
    this.renderEnvironmentCheck();
  }

  playBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // AudioContext not allowed before user gesture
    }
  }

  // Fail closed if the advanced calibration module did not load.
  // assessment-enhancements.js replaces this method with validated nine-point calibration.
  async startCalibration() {
    this.calibrationCompleted = false;
    const container = document.getElementById('assessment-container');
    if (!container) return;
    container.innerHTML = '<div class="assessment-card fade-in"><h2>تعذر تحميل وحدة معايرة النظر</h2><p>لم تبدأ معايرة تتبع العين؛ لن نعرض تخمينات للنظر على أنها قراءة فعلية. أعد تحميل الصفحة وحاول مجددًا.</p><div class="actions"><button class="btn btn-primary" onclick="window.location.reload()">إعادة تحميل التطبيق</button><button class="btn btn-outline" onclick="window.assessmentManager.renderEnvironmentCheck()">العودة إلى فحص الكاميرا</button></div></div>';
  }

  // المرحلة 3: قراءة النص وتتبع حركة العين
  startReading() {
    this.stage = 'reading';
    this.rawGazeSamples = [];
    this.sessionStartTime = performance.now();
    this.elapsedSeconds = 0;

    const container = document.getElementById('assessment-container');
    container.innerHTML = `
      <div class="reading-stage fade-in">
        <div class="reading-header">
          <div class="title">${this.currentText.title}</div>
          <div class="timer" id="reading-timer-display">⏱️ 00:00</div>
          <button class="btn btn-finish" onclick="window.assessmentManager.finishReading()">أنهيت القراءة ✅</button>
        </div>

        <div class="reading-canvas-wrapper" id="reading-wrapper">
          <div class="arabic-text-content" id="arabic-text-view">${this.currentText.content}</div>
          <canvas id="live-gaze-canvas" class="gaze-overlay-canvas"></canvas>
        </div>

        <div class="reading-footer-hint" style="text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 14px;">
          👁️ تقدير اتجاه النظر عبر الكاميرا — الدقة تتأثر بالإضاءة والجهاز والمعايرة
        </div>
      </div>
    `;

    const wrapper = document.getElementById('reading-wrapper');
    const gazeCanvas = document.getElementById('live-gaze-canvas');

    this.visualizer.canvas = gazeCanvas;
    this.visualizer.ctx = gazeCanvas.getContext('2d');
    this.visualizer.resize(wrapper.clientWidth, wrapper.clientHeight);

    // ربط مخرجات تتبع النظر الحقيقية فقط (العيون فقط - دون أي ربط بالفأرة)
    this.tracker.onGazePoint = (gaze) => {
      if (this.stage !== 'reading') return;

      const rect = wrapper.getBoundingClientRect();
      const relX = gaze.x - rect.left;
      const relY = gaze.y - rect.top;

      // تثبيت الإحداثيات داخل مساحة النص
      const boundedX = Math.max(10, Math.min(wrapper.clientWidth - 10, relX));
      const boundedY = Math.max(10, Math.min(wrapper.clientHeight - 10, relY));

      this.rawGazeSamples.push({
        t: performance.now(),
        x: boundedX,
        y: boundedY,
      });

      // رسم المؤشر المباشر تماشياً مع حركة بؤبؤ العين فقط
      this.visualizer.drawLiveGaze(boundedX, boundedY);
    };

    // عداد القراءة
    const timerDisplay = document.getElementById('reading-timer-display');
    this.readingTimer = setInterval(() => {
      this.elapsedSeconds++;
      const mins = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0');
      const secs = String(this.elapsedSeconds % 60).padStart(2, '0');
      if (timerDisplay) timerDisplay.innerText = `⏱️ ${mins}:${secs}`;
    }, 1000);
  }

  // إنهاء القراءة والانتقال لأسئلة الفهم
  finishReading() {
    clearInterval(this.readingTimer);
    this.sessionEndTime = performance.now();
    this.visualizer.clear();

    this.renderComprehension();
  }

  // المرحلة 4: أسئلة فهم المقروء
  renderComprehension() {
    this.stage = 'comprehension';
    const container = document.getElementById('assessment-container');
    const questions = this.currentText.comprehensionQuestions || [];

    let currentQ = 0;
    this.comprehensionAnswers = [];

    const showQuestion = () => {
      if (currentQ >= questions.length) {
        this.processAndShowResults();
        return;
      }

      const q = questions[currentQ];
      container.innerHTML = `
        <div class="assessment-card fade-in">
          <div class="step-indicator">أسئلة الفهم (${currentQ + 1} من ${questions.length})</div>
          <h2 class="question-title">${q.question}</h2>

          <div class="options-container">
            ${q.options.map((opt, idx) => `
              <button class="btn btn-option-card" onclick="window.assessmentManager.selectAnswer(${currentQ}, ${idx}, ${q.correctIndex})">
                ${opt}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    };

    this.selectAnswer = (qIdx, selectedIdx, correctIdx) => {
      this.comprehensionAnswers.push({
        questionIndex: qIdx,
        selected: selectedIdx,
        isCorrect: selectedIdx === correctIdx
      });
      currentQ++;
      showQuestion();
    };

    showQuestion();
  }

  countWords(text) {
    const normalized = String(text || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
    return (normalized.match(/[\p{L}\p{N}]+/gu) || []).length;
  }

  // المرحلة 5: معالجة النتائج وتصنيف الخطر
  async processAndShowResults() {
    this.stage = 'results';
    const container = document.getElementById('assessment-container');

    container.innerHTML = `
      <div class="assessment-card text-center fade-in">
        <div class="spinner"></div>
        <h2>جاري تجهيز ملخص الجلسة...</h2>
        <p>مراجعة جودة الإشارة وإجابات الفهم. لا يُعد هذا التقييم تشخيصًا لعسر القراءة.</p>
      </div>
    `;

    // Keep the observed duration as-is. Short sessions are marked insufficient rather than inflated.
    const samples = this.rawGazeSamples || [];
    const duration = Math.max(0, this.elapsedSeconds);
    const observedWordCount = this.countWords(this.currentText.content);
    const metrics = this.metricsEngine.processGazeStream(samples);
    const hasValidGaze = !!(
      this.calibrationCompleted &&
      this.tracker.isStreaming &&
      duration >= 10 &&
      samples.length >= 15 &&
      metrics.totalFixations >= 2 &&
      metrics.avgFixationDurationMs > 0
    );

    const correctCount = this.comprehensionAnswers.filter(a => a.isCorrect).length;
    const totalQuestions = Math.max(1, this.comprehensionAnswers.length);

    // تصنيف الخطر بناءً على مؤشرات الصف الدراسي
    const risk = this.metricsEngine.classifyRisk(
      this.currentStudent.grade,
      duration,
      observedWordCount,
      metrics,
      correctCount,
      totalQuestions
    );

    const sessionPayload = {
      id: 'pending-' + Date.now(),
      date: new Date().toISOString(),
      studentId: this.currentStudent.id,
      studentName: this.currentStudent.name,
      grade: this.currentStudent.grade,
      textId: this.currentText.id,
      textTitle: this.currentText.title,
      observedWordCount,
      durationSeconds: duration,
      wpm: risk.wpm,
      comprehensionScore: correctCount,
      comprehensionTotal: totalQuestions,
      metrics: metrics,
      hasValidGaze: hasValidGaze,
      riskClassification: risk,
    };

    // حفظ الجلسة محلياً في الخادم
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload)
      });
      if (!response.ok) throw new Error('تعذر حفظ الجلسة (' + response.status + ')');
      const savedSession = await response.json();
      // Raw fixation coordinates stay in browser memory only; the API stores summaries.
      const observedMetrics = sessionPayload.metrics;
      const observedRisk = sessionPayload.riskClassification;
      Object.assign(sessionPayload, savedSession);
      sessionPayload.metrics = observedMetrics;
      sessionPayload.riskClassification = observedRisk;
      sessionPayload.hasValidGaze = savedSession.hasValidGaze === true;
      sessionPayload.riskClassification.hasValidGaze = sessionPayload.hasValidGaze;
      await window.dashboardModule.loadData();
    } catch (err) {
      console.warn('Session sync warning:', err);
    }

    this.renderResultsSummary(sessionPayload);
  }

  renderResultsSummary(session) {
    const container = document.getElementById('assessment-container');
    const m = session.metrics;
    const r = session.riskClassification;

    container.innerHTML = `
      <div class="results-dashboard fade-in">
        <div class="results-header">
          <div>
            <h2>ملخص جلسة القراءة</h2>
            <p>الطالب: <strong>${session.studentName}</strong> | الصف: <strong>${session.grade} الابتدائي</strong> | مدة القراءة: <strong>${session.durationSeconds} ثانية</strong></p>
          </div>
          <div class="risk-badge-box" style="border-color:${r.color};">
            <span class="risk-title">${r.levelAr}</span>
            <span class="risk-score">ملاحظات وصفية — ليست تشخيصًا</span>
          </div>
        </div>

        ${!session.hasValidGaze ? `
          <div class="diagnostic-alert-banner" style="background:#fffbeb; border:1px solid #f59e0b; padding:16px 20px; border-radius:10px; margin-bottom:20px; color:#92400e; font-size:14px; line-height:1.7;">
            <strong>⚠️ إشعار الشفافية والأمانة العلمية:</strong><br/>
            لم تسجل الكاميرا إشارات كافية لتتبع حركة العين أثناء هذه القراءة (إذن الكاميرا غير مفعل أو غطاء الكاميرا مقفل أو الكاميرا مستخدمة بتطبيق آخر).<br/>
            للحفاظ على الدقة والمصداقية، <strong>لم يتم رسم أي مسار اصطناعي أو توليد أرقام وهمية</strong>. تم احتساب سرعة القراءة المحسوبة (سرعة القراءة المحسوبة: ${session.wpm == null ? 'غير متاحة' : session.wpm + ' ك/د'}) ودرجة الفهم (${session.comprehensionScore} من ${session.comprehensionTotal})، بينما تظل مؤشرات التثبيت والارتداد والمسار البصري بانتظار اتصال كاميرا فعال.<br/>
            <a href="camera_test.html" target="_blank" class="btn btn-sm btn-primary" style="display:inline-block; margin-top:10px; text-decoration:none; padding:8px 16px;">📸 افتح صفحة فحص الكاميرا للتأكد من فتح غطاء العدسة والعتاد ↗️</a>
          </div>
        ` : `
          <div class="diagnostic-alert-banner" style="background:#ecfdf5; border:1px solid #10b981; padding:12px 18px; border-radius:10px; margin-bottom:20px; color:#065f46; font-size:14px;">
            ✅ <strong>تم التقاط إشارات حركة العين الحقيقية بنجاح</strong> (تم رصد ${m.totalFixations} تثبيت بصري حقيقي عبر الكاميرا).
          </div>
        `}

        <!-- بطاقات المؤشرات الأساسية الحقيقية -->
        <div class="metrics-summary-grid">
          <div class="metric-box">
            <div class="title">سرعة القراءة المحسوبة</div>
            <div class="val">${session.wpm == null ? "غير متاحة" : session.wpm} <small>كلمة/د</small></div>
            <div class="sub">سرعة محسوبة من النص والمدة</div>
          </div>
          <div class="metric-box">
            <div class="title">متوسط مدة التثبيت البصري</div>
            <div class="val">${session.hasValidGaze ? `${m.avgFixationDurationMs} <small>ms</small>` : '<span style="font-size:15px; color:#94a3b8;">غير متاح (لا توجد إشارة)</span>'}</div>
            <div class="sub">مؤشر وصفي غير تشخيصي</div>
          </div>
          <div class="metric-box">
            <div class="title">نسبة الارتدادات العكسية</div>
            <div class="val">${session.hasValidGaze ? `${m.regressionRatePercent}%` : '<span style="font-size:15px; color:#94a3b8;">غير متاح (لا توجد إشارة)</span>'}</div>
            <div class="sub">تراجع النظر للخلف (يمين)</div>
          </div>
          <div class="metric-box">
            <div class="title">فهم المقروء</div>
            <div class="val">${session.comprehensionScore} / ${session.comprehensionTotal}</div>
            <div class="sub">دقة الإجابات</div>
          </div>
        </div>

        <!-- مسار القراءة البصري والخريطة الحرارية -->
        <div class="scanpath-section">
          <div class="section-toolbar">
            <h3>👁️ المسار البصري فوق النص العربي (Scanpath & Heatmap)</h3>
            <div class="view-toggles">
              <button class="btn btn-sm active" id="btn-show-scanpath" onclick="window.assessmentManager.toggleVisualMode('scanpath')">مسار القراءة الخطي (Scanpath)</button>
              <button class="btn btn-sm" id="btn-show-heatmap" onclick="window.assessmentManager.toggleVisualMode('heatmap')">الخريطة الحرارية (Heatmap)</button>
            </div>
          </div>

          <div class="replay-wrapper" id="replay-wrapper">
            <div class="arabic-text-content" id="replay-text-view">${this.currentText.content}</div>
            <canvas id="analysis-canvas" class="gaze-overlay-canvas"></canvas>
          </div>
          <div class="scanpath-legend" style="display:flex; gap:16px; margin-top:8px; font-size:12px; color:var(--text-muted);">
            <span>🔵 دوائر التثبيت (الحجم = مدة التثبيت)</span>
            <span>➡️ أسهم زرقاء: قفزات أمامية (يمين لليسار)</span>
            <span>🔴 أسهم حمراء منقطة: ارتداد عكسي للخلف (مؤشر تشتت/تعثر)</span>
          </div>
        </div>

        <!-- أسباب التصنيف والملاحظات -->
        <div class="diagnostic-reasons-card">
          <h4>📌 الأنماط المرصودة وتفسيرها:</h4>
          <ul>
            ${r.reasons.map(res => `<li>${res}</li>`).join('')}
          </ul>
        </div>

        <!-- الإجراءات اللاحقة -->
        <div class="results-actions">
          <button class="btn btn-primary" onclick="window.assessmentManager.openParentReport()">📄 عرض وتصدير تقرير ولي الأمر (PDF)</button>
          <button class="btn btn-secondary" onclick="window.dashboardModule.openInterventionForStudent('saccades')">🎯 بدء تمارين التدخل المقترحة</button>
          <button class="btn btn-outline" onclick="window.appRouter.navigate('dashboard')">العودة للوحة التحكم</button>
        </div>
      </div>
    `;

    // رسم مسار القراءة الفعلي
    const replayWrapper = document.getElementById('replay-wrapper');
    const analysisCanvas = document.getElementById('analysis-canvas');
    analysisCanvas.width = replayWrapper.clientWidth;
    analysisCanvas.height = replayWrapper.clientHeight;

    this.analysisVisualizer = new GazeVisualizer(analysisCanvas);
    this.analysisVisualizer.drawScanpath(session.metrics.fixations);
    this.lastSession = session;
  }

  toggleVisualMode(mode) {
    if (!this.lastSession || !this.analysisVisualizer) return;
    const btnScan = document.getElementById('btn-show-scanpath');
    const btnHeat = document.getElementById('btn-show-heatmap');

    if (mode === 'scanpath') {
      btnScan.classList.add('active');
      btnHeat.classList.remove('active');
      this.analysisVisualizer.drawScanpath(this.lastSession.metrics.fixations);
    } else {
      btnHeat.classList.add('active');
      btnScan.classList.remove('active');
      this.analysisVisualizer.drawHeatmap(this.lastSession.metrics.fixations);
    }
  }

  openParentReport() {
    if (!this.lastSession) return;
    const modal = document.getElementById('app-modal');
    const modalContent = document.getElementById('modal-content');

    modalContent.innerHTML = ParentReportGenerator.generateReportHtml(this.lastSession);
    modal.classList.add('open');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AssessmentSessionManager };
}
