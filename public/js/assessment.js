/**
 * مدير جلسة التقييم الكاملة:
 * فحص البيئة -> المعايرة الخماسية -> قراءة النص وتتبع النظر -> أسئلة الفهم -> النتائج والتحليلات
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

  startSession(student, text) {
    this.currentStudent = student;
    this.currentText = text;
    this.rawGazeSamples = [];
    this.comprehensionAnswers = [];
    this.elapsedSeconds = 0;

    if (!this.tracker.isStreaming) {
      this.tracker.initialize();
    }

    this.renderEnvironmentCheck();
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

        <div id="camera-alert-box" style="display: none; margin: 20px 0; padding: 16px 20px; border-radius: 10px; background: #fef2f2; border: 1px solid #f87171; color: #991b1b; text-align: right; line-height: 1.6;">
          <strong>⚠️ الكاميرا غير مفعلة أو محجوبة بالعتاد:</strong>
          <p id="camera-err-msg" style="margin: 6px 0 10px 0; font-size: 13px;">جاري فحص الكاميرا...</p>
          <ol style="margin: 0 20px 12px 0; padding: 0; font-size: 13px;">
            <li><strong>غطاء الكاميرا المنزلق (Shutter):</strong> إذا كان اللابتوب به غطاء بلاستيكي صغير فوق العدسة، تأكد من فتحه.</li>
            <li><strong>زر الكاميرا في لوحة المفاتيح:</strong> اضغط <code>Fn + F8</code> أو <code>Fn + F10</code> لإلغاء كتم الكاميرا في ويندوز.</li>
            <li><strong>إذن المتصفح:</strong> اضغط على أيقونة الإعدادات 🔒 بجانب <code>localhost:3000</code> وتأكد من اختيار <strong>Allow</strong>.</li>
          </ol>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" id="btn-retry-camera" onclick="window.assessmentManager.retryCamera()">🔄 فحص وتفعيل الكاميرا هنا</button>
            <a href="/camera_test.html" target="_blank" class="btn btn-sm btn-outline" style="text-decoration:none; color:#1e293b; border-color:#cbd5e1; background:#fff;">🛠️ فتح صفحة فحص الكاميرا والعتاد مباشرة ↗️</a>
          </div>
        </div>

        <div class="env-status-indicators" style="margin-top: 26px;">
          <div class="status-pill" id="ind-face">
            <span class="dot"></span> كشف الوجه: جاري الاتصال بالكاميرا...
          </div>
          <div class="status-pill" id="ind-light">
            <span class="dot"></span> الإضاءة: جاري قياس السطوع...
          </div>
          <div class="status-pill" id="ind-dist">
            <span class="dot"></span> المسافة: جاري تقدير المسافة...
          </div>
        </div>

        <div class="setup-instructions" style="margin: 28px 0;">
          <h4>🔍 تعليمات المعايرة الحقيقية:</h4>
          <ul>
            <li>تأكد من إعطاء إذن الكاميرا عند طلبه في المتصفح لرصد حركة العين بدقة.</li>
            <li>في شاشة المعايرة، ستظهر نجمة؛ انقر عليها 3 مرات وأنت تنظر إليها بعينيك لتدريب نموذج الذكاء الاصطناعي.</li>
            <li>يمكنك النقر على "تخطي المعايرة" للبدء في القراءة مباشرة إن رغبت.</li>
          </ul>
        </div>

        <div class="actions" style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary btn-lg" id="btn-start-calib" onclick="window.assessmentManager.startCalibration()">
            الانتقال للعبة المعايرة الخماسية ⭐
          </button>
          <button class="btn btn-outline btn-lg" onclick="window.assessmentManager.skipCalibration()">
            تخطي المعايرة والبدء في القراءة فوراً ⏭️
          </button>
          <button class="btn btn-sm btn-secondary" onclick="window.assessmentManager.retryCamera()">
            📸 اختبار الكاميرا مباشرة
          </button>
        </div>
      </div>
    `;

    // التحقق الفوري من حالة الكاميرا
    this.checkCameraImmediately();

    this.tracker.onEnvironmentCheck = (env) => {
      const indFace = document.getElementById('ind-face');
      const indLight = document.getElementById('ind-light');
      const indDist = document.getElementById('ind-dist');

      if (!indFace) return;

      if (env.faceDetected) {
        indFace.className = 'status-pill success';
        indFace.innerHTML = '<span class="dot"></span> كشف الوجه: تم الرصد بنجاح 🟢';
      } else {
        indFace.className = 'status-pill error';
        indFace.innerHTML = '<span class="dot"></span> كشف الوجه: لم يتم رصد وجه (يرجى مواجهة الكاميرا) 🔴';
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

      indDist.className = 'status-pill success';
      indDist.innerHTML = `<span class="dot"></span> المسافة: ~${env.distanceCm} سم (تتغير مع حركتك) 📏`;
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
        if (!this.tracker.isCameraActive()) {
          if (alertBox) {
            alertBox.style.display = 'block';
            if (errMsg) errMsg.innerText = 'نافذة الكاميرا لا تستقبل بث فيديو حالياً. تأكد من إذن المتصفح للكاميرا.';
          }
        }
      }, 1800);
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
        indFace.innerHTML = '<span class="dot"></span> كشف الوجه: الكاميرا متصلة وتبث بنجاح 🟢';
      }
    } else {
      if (alertBox) {
        alertBox.style.display = 'block';
        if (errMsg) errMsg.innerText = this.tracker.cameraError || 'تعذر تشغيل الكاميرا؛ يرجى التأكد من إذن المتصفح.';
      }
    }
    if (retryBtn) retryBtn.innerText = '🔄 فحص وإعادة تفعيل الكاميرا الآن';
  }

  // تخطي المعايرة والانتقال للنص مباشرة
  skipCalibration() {
    this.startReading();
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

  // المرحلة 2: المعايرة التفاعلية (5 نقاط)
  async startCalibration() {
    this.stage = 'calibration';
    const container = document.getElementById('assessment-container');

    container.innerHTML = `
      <div class="calibration-stage fade-in" id="calib-stage">
        <button class="btn btn-outline btn-sm" style="position: absolute; top: 20px; left: 20px; z-index: 10002; background: #fff;" onclick="window.assessmentManager.skipCalibration()">
          تخطي المعايرة والبدء في القراءة فوراً ⏭️
        </button>

        <div class="calib-instructions">
          <h3>🌟 لعبة النجم السحري: تابع النجم وانقر عليه 3 مرات لتدريب الذكاء الاصطناعي</h3>
          <p id="calib-step-hint">النقطة 1 من 5: المركز - انقر فوق النجمة ⭐ (المتبقي: 3)</p>
        </div>
        <div class="calib-target" id="calib-target" title="انقر هنا">
          <span>⭐</span>
          <span class="calib-target-counter" id="star-count">0/3</span>
        </div>
      </div>
    `;

    this.tracker.resetCalibration();

    const points = [
      { name: 'المركز', x: window.innerWidth * 0.50, y: window.innerHeight * 0.50 },
      { name: 'أعلى اليمين', x: window.innerWidth * 0.85, y: window.innerHeight * 0.20 },
      { name: 'أسفل اليمين', x: window.innerWidth * 0.85, y: window.innerHeight * 0.80 },
      { name: 'أعلى اليسار', x: window.innerWidth * 0.15, y: window.innerHeight * 0.20 },
      { name: 'أسفل اليسار', x: window.innerWidth * 0.15, y: window.innerHeight * 0.80 }
    ];

    const targetEl = document.getElementById('calib-target');
    const hintEl = document.getElementById('calib-step-hint');
    const counterEl = document.getElementById('star-count');

    for (let i = 0; i < points.length; i++) {
      if (this.stage !== 'calibration') return; // إذا تم التخطي

      const pt = points[i];
      targetEl.style.left = `${pt.x - 38}px`;
      targetEl.style.top = `${pt.y - 38}px`;
      targetEl.classList.add('pulse');

      await new Promise(resolve => {
        let clicksDone = 0;
        if (counterEl) counterEl.innerText = `${clicksDone}/3`;
        if (hintEl) hintEl.innerText = `النقطة ${i + 1} من 5: ${pt.name} (انقر فوق النجمة ⭐ المتبقي: ${3 - clicksDone})`;

        const handleClick = (e) => {
          e.stopPropagation();
          clicksDone++;
          this.playBeep();
          this.tracker.addCalibrationSample(pt.x, pt.y);

          if (counterEl) counterEl.innerText = `${clicksDone}/3`;
          if (hintEl) hintEl.innerText = `النقطة ${i + 1} من 5: ${pt.name} (أحسنت! انقر ثانية ⭐ المتبقي: ${3 - clicksDone})`;

          if (clicksDone >= 3) {
            targetEl.removeEventListener('click', handleClick);
            clearTimeout(autoAdvanceTimeout);
            resolve();
          }
        };

        targetEl.addEventListener('click', handleClick);

        // انتقال تلقائي بعد 4 ثوانٍ إذا كان المستخدم ينظر فقط دون نقر
        const autoAdvanceTimeout = setTimeout(() => {
          targetEl.removeEventListener('click', handleClick);
          this.tracker.addCalibrationSample(pt.x, pt.y);
          resolve();
        }, 4000);
      });

      targetEl.classList.remove('pulse');
    }

    this.tracker.computeCalibration();

    container.innerHTML = `
      <div class="assessment-card fade-in text-center">
        <div class="success-icon" style="font-size: 54px; margin-bottom: 16px;">🎉</div>
        <h2>رائع جداً! تم تدريب ومعايرة نموذج النظر بنجاح</h2>
        <p>الآن ستقرأ قصة <strong>"${this.currentText.title}"</strong>.</p>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 24px;">
          اقرأ بعينيك بهدوء وبسرعتك الطبيعية. النقطة الزرقاء ستتحرك مع بؤبؤ عينيك فوق الكلمات.
        </p>
        <div class="actions">
          <button class="btn btn-primary btn-lg" onclick="window.assessmentManager.startReading()">
            ابدأ قراءة القصة الآن 📖
          </button>
        </div>
      </div>
    `;
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
          👁️ تتبع حركة العين حقيقي عبر الكاميرا | النقطة الزرقاء تتحرك مع بؤبؤ عينيك فقط
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
        conf: gaze.conf || 0.95
      });

      // رسم المؤشر المباشر تماشياً مع حركة بؤبؤ العين فقط
      this.visualizer.drawLiveGaze(boundedX, boundedY, gaze.conf || 0.95);
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

  // المرحلة 5: معالجة النتائج وتصنيف الخطر
  async processAndShowResults() {
    this.stage = 'results';
    const container = document.getElementById('assessment-container');

    container.innerHTML = `
      <div class="assessment-card text-center fade-in">
        <div class="spinner"></div>
        <h2>جاري استخراج مؤشرات حركة العين وتوليد التقرير المبدئي...</h2>
        <p>تحليل فترات التثبيت البصري والارتدادات العكسية وفق المعايير المرجعية للصف الدراسي.</p>
      </div>
    `;

    // استخدام عينات حركة العين الفعلية الملتقطة من الكاميرا فقط دون أي تزييف
    const samples = this.rawGazeSamples || [];
    const duration = Math.max(3, this.elapsedSeconds);

    // حساب المقاييس الحقيقية عبر محرك I-VT المعتمد
    const metrics = this.metricsEngine.processGazeStream(samples);
    const hasValidGaze = !!(samples.length >= 8 && metrics.totalFixations >= 2 && metrics.avgFixationDurationMs > 0);

    const correctCount = this.comprehensionAnswers.filter(a => a.isCorrect).length;
    const totalQuestions = Math.max(1, this.comprehensionAnswers.length);

    // تصنيف الخطر بناءً على مؤشرات الصف الدراسي
    const risk = this.metricsEngine.classifyRisk(
      this.currentStudent.grade,
      duration,
      this.currentText.wordsCount,
      metrics,
      correctCount,
      totalQuestions
    );

    const sessionPayload = {
      studentId: this.currentStudent.id,
      studentName: this.currentStudent.name,
      grade: this.currentStudent.grade,
      textId: this.currentText.id,
      textTitle: this.currentText.title,
      durationSeconds: duration,
      wpm: risk.wpm,
      comprehensionScore: correctCount,
      comprehensionTotal: totalQuestions,
      metrics: metrics,
      hasValidGaze: hasValidGaze,
      riskClassification: risk,
      gazeData: metrics.fixations
    };

    // حفظ الجلسة محلياً في الخادم
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload)
      });
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
            <h2>تقرير الفرز المبدئي لمهارات القراءة وتتبع النظر</h2>
            <p>الطالب: <strong>${session.studentName}</strong> | الصف: <strong>${session.grade} الابتدائي</strong> | مدة القراءة: <strong>${session.durationSeconds} ثانية</strong></p>
          </div>
          <div class="risk-badge-box" style="border-color:${r.color};">
            <span class="risk-title" style="color:${r.color};">${r.levelAr}</span>
            <span class="risk-score">مؤشر الخطر: ${r.score} / 100</span>
          </div>
        </div>

        ${!session.hasValidGaze ? `
          <div class="diagnostic-alert-banner" style="background:#fffbeb; border:1px solid #f59e0b; padding:16px 20px; border-radius:10px; margin-bottom:20px; color:#92400e; font-size:14px; line-height:1.7;">
            <strong>⚠️ إشعار الشفافية والأمانة العلمية:</strong><br/>
            لم تسجل الكاميرا إشارات كافية لتتبع حركة العين أثناء هذه القراءة (إذن الكاميرا غير مفعل أو غطاء الكاميرا مقفل أو الكاميرا مستخدمة بتطبيق آخر).<br/>
            للحفاظ على الدقة والمصداقية، <strong>لم يتم رسم أي مسار اصطناعي أو توليد أرقام وهمية</strong>. تم احتساب سرعة القراءة الفعلية (WPM: ${session.wpm} ك/د) ودرجة الفهم (${session.comprehensionScore} من ${session.comprehensionTotal})، بينما تظل مؤشرات التثبيت والارتداد والمسار البصري بانتظار اتصال كاميرا فعال.<br/>
            <a href="/camera_test.html" target="_blank" class="btn btn-sm btn-primary" style="display:inline-block; margin-top:10px; text-decoration:none; padding:8px 16px;">📸 افتح صفحة فحص الكاميرا للتأكد من فتح غطاء العدسة والعتاد ↗️</a>
          </div>
        ` : `
          <div class="diagnostic-alert-banner" style="background:#ecfdf5; border:1px solid #10b981; padding:12px 18px; border-radius:10px; margin-bottom:20px; color:#065f46; font-size:14px;">
            ✅ <strong>تم التقاط إشارات حركة العين الحقيقية بنجاح</strong> (تم رصد ${m.totalFixations} تثبيت بصري حقيقي عبر الكاميرا).
          </div>
        `}

        <!-- بطاقات المؤشرات الأساسية الحقيقية -->
        <div class="metrics-summary-grid">
          <div class="metric-box">
            <div class="title">سرعة القراءة الفعلية</div>
            <div class="val">${session.wpm} <small>كلمة/د</small></div>
            <div class="sub">المعيار لصفه: ${r.normWpm} ك/د</div>
          </div>
          <div class="metric-box">
            <div class="title">متوسط مدة التثبيت البصري</div>
            <div class="val">${session.hasValidGaze ? `${m.avgFixationDurationMs} <small>ms</small>` : '<span style="font-size:15px; color:#94a3b8;">غير متاح (لا توجد إشارة)</span>'}</div>
            <div class="sub">المعيار لصفه: ${r.normFixationMs} ms</div>
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
          <button class="btn btn-secondary" onclick="window.dashboardModule.openInterventionForStudent('${r.level === 'high' ? 'dots' : 'saccades'}')">🎯 بدء تمارين التدخل المقترحة</button>
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
