/* Structured assessment workflow layered onto the base session manager. */
(function () {
  'use strict';
  if (typeof AssessmentSessionManager === 'undefined') return;
  const proto = AssessmentSessionManager.prototype;
  const originalStartSession = proto.startSession;

  proto.escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  proto.formatProtocolDuration = function (seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  };

  proto.startSession = async function (student, text, secondReadingMode) {
    Object.values(this.audioRecords || {}).forEach(record => {
      if (record && record.url) URL.revokeObjectURL(record.url);
    });
    this.audioRecords = {};
    this.audioCaptureErrors = {};
    this.audioSessionToken = (this.audioSessionToken || 0) + 1;
    this.discardAudioOnStop = false;
    this.primaryText = text;
    this.secondText = (window.ARABIC_ALTERNATE_TEXTS || []).find(item => item.grade === text.grade) || text;
    this.secondReadingMode = secondReadingMode || (Number(student.grade) <= 2 ? 'oral' : 'silent');
    this.readingSegments = [];
    this.comprehensionAnswers = { 0: [], 1: [] };
    this.currentSegmentSamples = [];
    this.rawGazeSamples = [];
    this.ranDurationSeconds = null;
    this.ranErrors = 0;
    this.readingIndependently = null;
    this.assistanceType = 'none';
    this.teacherNotes = '';
    this.assessmentStartedAt = performance.now();
    this.lastSession = null;
    await originalStartSession.call(this, student, text);
    this.comprehensionAnswers = { 0: [], 1: [] };
    this.readingSegments = [];
    this.currentSegmentSamples = [];
    this.rawGazeSamples = [];
  };

  proto.skipCalibration = function () {
    this.calibrationCompleted = false;
    this.startRapidNaming();
  };

  proto.startCalibration = async function () {
    if (!this.tracker.isStreaming || !this.tracker.isCameraActive()) {
      const container = document.getElementById('assessment-container');
      if (container) container.innerHTML = '<div class="assessment-card fade-in"><h2>الكاميرا غير جاهزة للمعايرة</h2><p>أعد فحص الكاميرا أو أكمل مهام القراءة دون مؤشرات النظر.</p><div class="actions"><button class="btn btn-primary" onclick="window.assessmentManager.retryCamera()">إعادة فحص الكاميرا</button><button class="btn btn-outline" onclick="window.assessmentManager.skipCalibration()">المتابعة دون معايرة</button></div></div>';
      return;
    }
    this.stage = 'calibration';
    const container = document.getElementById('assessment-container');
    container.innerHTML = '<div class="calibration-stage fade-in" id="calib-stage"><button class="btn btn-outline btn-sm" style="position:absolute;top:18px;left:18px;z-index:10002;background:#fff" onclick="window.assessmentManager.skipCalibration()">المتابعة دون معايرة</button><div class="calib-instructions"><h3>معايرة اتجاه النظر</h3><p>انظر إلى النجمة ثم انقر عليها ثلاث مرات. اكتمال الخطوات لا يعني أن دقة النظر قد تم التحقق منها علميًا.</p><p id="calib-step-hint">النقطة 1 من 5 · المركز</p></div><div class="calib-target" id="calib-target"><span>✦</span><span class="calib-target-counter" id="star-count">0/3</span></div></div>';
    this.tracker.resetCalibration();
    const points = [
      { name: 'المركز', x: 0.50, y: 0.50 }, { name: 'أعلى اليمين', x: 0.84, y: 0.22 },
      { name: 'أسفل اليمين', x: 0.84, y: 0.78 }, { name: 'أعلى اليسار', x: 0.16, y: 0.22 },
      { name: 'أسفل اليسار', x: 0.16, y: 0.78 }
    ].map(point => ({ name: point.name, x: Math.round(window.innerWidth * point.x), y: Math.round(window.innerHeight * point.y) }));
    const target = document.getElementById('calib-target');
    const hint = document.getElementById('calib-step-hint');
    const counter = document.getElementById('star-count');
    for (let i = 0; i < points.length; i++) {
      if (this.stage !== 'calibration') return;
      const point = points[i];
      target.style.left = (point.x - 38) + 'px';
      target.style.top = (point.y - 38) + 'px';
      target.classList.add('pulse');
      await new Promise(resolve => {
        let clicks = 0;
        let pending = false;
        const handler = async event => {
          event.stopPropagation();
          if (pending || this.stage !== 'calibration') return;
          pending = true;
          const success = await this.tracker.addCalibrationSample(point.x, point.y);
          if (success) {
            clicks++;
            if (counter) counter.textContent = clicks + '/3';
            if (hint) hint.textContent = 'النقطة ' + (i + 1) + ' من 5 · ' + point.name + ' · المتبقي ' + (3 - clicks);
          } else if (hint) {
            hint.textContent = 'لم تُسجّل العينة؛ أعد النقر بعد التأكد من تشغيل الكاميرا.';
          }
          pending = false;
          if (clicks >= 3) {
            target.removeEventListener('click', handler);
            resolve();
          }
        };
        target.addEventListener('click', handler);
      });
      target.classList.remove('pulse');
    }
    if (this.stage !== 'calibration') return;
    if (!this.tracker.computeCalibration()) {
      this.stage = 'env_check';
      container.innerHTML = '<div class="assessment-card"><h2>لم تكتمل خطوات المعايرة</h2><p>أعد المحاولة أو تابع المهام دون مؤشرات النظر.</p><div class="actions"><button class="btn btn-primary" onclick="window.assessmentManager.startCalibration()">إعادة المحاولة</button><button class="btn btn-outline" onclick="window.assessmentManager.skipCalibration()">المتابعة دون تتبع</button></div></div>';
      return;
    }
    this.calibrationCompleted = true;
    container.innerHTML = '<div class="assessment-card fade-in text-center"><div class="success-icon" style="font-size:48px;margin-bottom:14px">✓</div><h2>اكتملت خطوات المعايرة</h2><p>تم تسجيل نقاط المعايرة؛ سيظل تقدير النظر تجريبيًا ويعتمد على الجهاز والبيئة.</p><div class="actions"><button class="btn btn-primary btn-lg" onclick="window.assessmentManager.startRapidNaming()">الانتقال إلى تسمية الحروف</button></div></div>';
    const indicator = document.getElementById('ind-calibration');
    if (indicator) indicator.innerHTML = '<span class="dot"></span>المعايرة: سُجلت النقاط';
  };

  proto.startRapidNaming = function () {
    this.stage = 'rapid_naming';
    const protocol = window.ReadingAssessmentProtocol;
    this.ranSequence = protocol ? protocol.createRapidNamingSequence() : Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي').concat(Array.from('ابتثجحخدذرزسشصضط')).slice(0, 36);
    this.ranStartedAt = null;
    if (this.ranTimer) clearInterval(this.ranTimer);
    const container = document.getElementById('assessment-container');
    container.innerHTML = '<div class="assessment-card fade-in"><div class="step-indicator">الخطوة 2 من 7 · تسمية الحروف</div><h2>اقرأ الحروف بصوت واضح وبسرعتك المعتادة</h2><p>يستمع المعلم ويسجل الأخطاء يدويًا؛ لا يحلل النظام النطق تلقائيًا.</p><div class="ran-board" dir="rtl">' +
      this.ranSequence.map(letter => '<span class="ran-letter">' + letter + '</span>').join('') +
      '</div><div class="teacher-marking-grid"><div class="form-group"><label>الزمن</label><div class="timer" id="ran-timer">00:00</div></div><div class="form-group"><label for="ran-errors">أخطاء رصدها المعلم</label><input id="ran-errors" type="number" class="form-control" min="0" max="36" value="0"></div></div><p class="text-muted">ابدأ المؤقت عند بدء تسمية الحروف وأوقفه بعد آخر حرف، دون استعجال الطفل.</p><div class="actions"><button class="btn btn-primary btn-lg" id="ran-start" onclick="window.assessmentManager.startRanTimer()">ابدأ المهمة</button><button class="btn btn-success btn-lg" id="ran-finish" disabled onclick="window.assessmentManager.finishRanTimer()">انتهت المهمة</button></div></div>';
  };

  proto.startRanTimer = function () {
    if (this.ranStartedAt != null) return;
    this.ranStartedAt = performance.now();
    const start = document.getElementById('ran-start');
    const finish = document.getElementById('ran-finish');
    if (start) start.disabled = true;
    if (finish) finish.disabled = false;
    this.ranTimer = setInterval(() => {
      const timer = document.getElementById('ran-timer');
      if (timer) timer.textContent = this.formatProtocolDuration((performance.now() - this.ranStartedAt) / 1000);
    }, 100);
  };

  proto.finishRanTimer = function () {
    if (this.ranStartedAt == null) return;
    if (this.ranTimer) clearInterval(this.ranTimer);
    this.ranTimer = null;
    this.ranDurationSeconds = Math.round((performance.now() - this.ranStartedAt) / 10) / 100;
    this.ranErrors = Math.max(0, Math.min(36, Number(document.getElementById('ran-errors')?.value) || 0));
    this.startReading(0, 0);
  };

  proto.startReading = function (mode, passageIndex) {
    const index = Number(passageIndex) || 0;
    this.activePassageIndex = index;
    this.currentText = index === 0 ? this.primaryText : this.secondText;
    this.currentReadingMode = (mode === 1 || mode === 'silent') ? 'silent' : 'oral';
    this.stage = 'reading_setup';
    this.currentSegmentSamples = [];
    const wrapperMode = this.currentReadingMode === 'oral' ? 'قراءة جهرية' : 'قراءة صامتة';
    const container = document.getElementById('assessment-container');
    container.innerHTML = '<div class="reading-stage fade-in"><div class="step-indicator">الخطوة ' + (index === 0 ? '3' : '6') + ' من 7 · ' + wrapperMode +
      '</div><div class="reading-header"><div class="title">' + this.escapeHtml(this.currentText.title) + '</div><span class="badge-info">' + wrapperMode +
      '</span><div class="timer" id="reading-timer-display">00:00</div></div><div class="reading-canvas-wrapper" id="reading-wrapper"><div class="arabic-text-content" id="arabic-text-view">' +
      this.currentText.content + '</div><canvas id="live-gaze-canvas" class="gaze-overlay-canvas"></canvas></div><div class="reading-footer-hint">اقرأ النص مرة واحدة وبوتيرتك المعتادة؛ لا توجد مهلة زمنية للانتهاء.</div>' +
      (this.currentReadingMode === 'oral' ? '<div class="audio-consent-row"><label><input type="checkbox" id="record-audio-opt-in"> تسجيل الصوت للمراجعة (اختياري، يبقى على هذا الجهاز ولا يُرفع إلى الخادم)</label></div>' : '') +
      '<div class="teacher-marking-grid"><div class="form-group"><label for="segment-errors">أخطاء إضافية غير محددة على الكلمات</label><input id="segment-errors" type="number" min="0" max="200" value="0"></div><div class="form-group"><label for="segment-omissions">حذف إضافي غير محدد</label><input id="segment-omissions" type="number" min="0" max="200" value="0"></div><div class="form-group"><label for="segment-corrections">تصحيحات ذاتية إضافية</label><input id="segment-corrections" type="number" min="0" max="200" value="0"></div></div>' +
      '<p class="text-muted">المعلم هو من يدوّن هذه الملاحظات؛ لا يستنتجها النظام تلقائيًا.</p><div id="audio-recording-status" class="text-muted" role="status"></div><div class="actions"><button class="btn btn-primary btn-lg" id="reading-start-btn" onclick="window.assessmentManager.beginReadingSegment()">ابدأ القراءة</button><button class="btn btn-success btn-lg" id="reading-finish-btn" disabled onclick="window.assessmentManager.finishReadingSegment()">أنهيت القراءة</button></div></div>';
    const wrapper = document.getElementById('reading-wrapper');
    const canvas = document.getElementById('live-gaze-canvas');
    this.visualizer.canvas = canvas;
    this.visualizer.ctx = canvas.getContext('2d');
    this.visualizer.resize(wrapper.clientWidth, wrapper.clientHeight);
    this.tracker.onGazePoint = gaze => {
      if (!this.segmentActive || this.stage !== 'reading') return;
      const rect = wrapper.getBoundingClientRect();
      const x = Math.max(4, Math.min(wrapper.clientWidth - 4, gaze.x - rect.left));
      const y = Math.max(4, Math.min(wrapper.clientHeight - 4, gaze.y - rect.top));
      if (this.currentSegmentSamples.length < 20000) {
        this.currentSegmentSamples.push({ t: performance.now(), x: x, y: y });
        this.visualizer.drawLiveGaze(x, y);
      }
    };
    this.segmentActive = false;
  };

  proto.beginReadingSegment = async function () {
    if (this.segmentActive) return;
    const startButton = document.getElementById('reading-start-btn');
    const finishButton = document.getElementById('reading-finish-btn');
    const audioCheckbox = document.getElementById('record-audio-opt-in');
    if (startButton) startButton.disabled = true;
    if (this.currentReadingMode === 'oral' && audioCheckbox && audioCheckbox.checked) {
      const status = document.getElementById('audio-recording-status');
      if (status) status.textContent = 'بانتظار إذن الميكروفون…';
      const started = await this.startAudioCapture(this.activePassageIndex);
      if (status) status.textContent = started ? 'التسجيل جارٍ محليًا على هذا الجهاز.' : 'تعذر تشغيل التسجيل؛ يمكن متابعة القراءة دون تسجيل صوت.';
    }
    this.segmentActive = true;
    this.stage = 'reading';
    this.segmentStartedAt = performance.now();
    if (finishButton) finishButton.disabled = false;
    const tick = () => {
      const timer = document.getElementById('reading-timer-display');
      if (timer) timer.textContent = this.formatProtocolDuration((performance.now() - this.segmentStartedAt) / 1000);
    };
    tick();
    if (this.readingTimer) clearInterval(this.readingTimer);
    this.readingTimer = setInterval(tick, 100);
  };

  proto.startAudioCapture = async function (passageIndex) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.audioCaptureErrors[passageIndex] = 'التسجيل غير مدعوم في هذا المتصفح.';
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = {};
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options.mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) options.mimeType = 'audio/mp4';
      const recorder = new MediaRecorder(stream, options);
      const captureToken = this.audioSessionToken;
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data && event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        const discardThisRecording = this.discardAudioOnStop || captureToken !== this.audioSessionToken;
        if (!discardThisRecording) {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size > 0) {
            const old = this.audioRecords[passageIndex];
            if (old && old.url) URL.revokeObjectURL(old.url);
            this.audioRecords[passageIndex] = { blob: blob, url: URL.createObjectURL(blob), mimeType: blob.type };
          }
        }
        chunks.length = 0;
        if (this.activeAudioStream) this.activeAudioStream.getTracks().forEach(track => track.stop());
        this.activeAudioStream = null;
        this.activeRecorder = null;
        if (this.audioStopResolve) {
          this.audioStopResolve(discardThisRecording ? null : (this.audioRecords[passageIndex] || null));
          this.audioStopResolve = null;
        }
      };
      this.activeAudioStream = stream;
      this.activeRecorder = recorder;
      recorder.start(250);
      return true;
    } catch (error) {
      this.audioCaptureErrors[passageIndex] = error && error.name === 'NotAllowedError' ? 'لم يُمنح إذن الميكروفون.' : 'تعذر تشغيل الميكروفون.';
      return false;
    }
  };

  proto.stopAudioCapture = async function (passageIndex) {
    const recorder = this.activeRecorder;
    if (!recorder || recorder.state !== 'recording') {
      if (this.activeAudioStream) this.activeAudioStream.getTracks().forEach(track => track.stop());
      this.activeAudioStream = null;
      this.activeRecorder = null;
      return this.audioRecords[passageIndex] || null;
    }
    return await new Promise(resolve => {
      this.audioStopResolve = resolve;
      try { recorder.stop(); }
      catch (_) { this.audioStopResolve = null; resolve(null); }
    });
  };

  proto.finishReadingSegment = async function () {
    if (!this.segmentActive) return;
    this.segmentActive = false;
    if (this.readingTimer) clearInterval(this.readingTimer);
    this.readingTimer = null;
    const durationSeconds = Math.max(0, Math.round((performance.now() - this.segmentStartedAt) / 10) / 100);
    const index = this.activePassageIndex;
    const audio = await this.stopAudioCapture(index);
    const numberFrom = id => Math.max(0, Math.min(200, Number(document.getElementById(id)?.value) || 0));
    const samples = this.currentSegmentSamples.slice();
    const gazeMetrics = this.metricsEngine.processGazeStream(samples);
    const hasValidGaze = !!(this.calibrationCompleted && this.tracker.isStreaming && durationSeconds >= 10 &&
      samples.length >= 15 && gazeMetrics.totalFixations >= 2 && gazeMetrics.avgFixationDurationMs > 0);
    this.readingSegments[index] = {
      passageId: this.currentText.id,
      passageTitle: this.currentText.title,
      content: this.currentText.content,
      mode: this.currentReadingMode,
      durationSeconds: durationSeconds,
      wordCount: window.ReadingAssessmentProtocol.countArabicWords(this.currentText.content),
      baselineErrors: numberFrom('segment-errors'),
      baselineOmissions: numberFrom('segment-omissions'),
      baselineSelfCorrections: numberFrom('segment-corrections'),
      errors: numberFrom('segment-errors'),
      omissions: numberFrom('segment-omissions'),
      selfCorrections: numberFrom('segment-corrections'),
      wordMarks: [],
      hasValidGaze: hasValidGaze,
      metrics: gazeMetrics,
      gazeSamples: samples,
      viewportWidth: document.getElementById('reading-wrapper')?.clientWidth || window.innerWidth,
      viewportHeight: document.getElementById('reading-wrapper')?.clientHeight || 360,
      audioUrl: audio && audio.url ? audio.url : null
    };
    this.rawGazeSamples.push.apply(this.rawGazeSamples, samples);
    this.renderTeacherMarking(index);
  };

  proto.renderTeacherMarking = function (passageIndex) {
    this.stage = 'teacher_marking';
    const segment = this.readingSegments[passageIndex];
    if (!segment) return this.renderComprehension(passageIndex);
    this.selectedTeacherMarkType = this.selectedTeacherMarkType || 'substitution';
    const container = document.getElementById('assessment-container');
    const tokens = String(segment.content || '').match(/\n|[^\s]+/g) || [];
    let wordIndex = 0;
    const tokenMarkup = tokens.map(token => {
      if (token === '\n') return '<br>';
      const currentIndex = wordIndex++;
      return '<button type="button" class="markable-word" data-word-index="' + currentIndex + '" aria-label="تحديد ملاحظة على كلمة ' + this.escapeHtml(token) + '">' +
        this.escapeHtml(token) + '</button>';
    }).join('');
    container.innerHTML = '<div class="assessment-card fade-in"><div class="step-indicator">مراجعة قراءة المقطع ' + (passageIndex + 1) + ' من 2 · ملاحظات المعلم</div>' +
      '<h2>علّم الكلمات التي لاحظت فيها تعثرًا</h2><p>هذه المراجعة اختيارية ويجريها المعلم بعد القراءة؛ لا يحلل النظام نطق الطفل تلقائيًا. اختر نوع الملاحظة ثم انقر الكلمة. الكلمات المعلّمة ليست تشخيصًا.</p>' +
      '<div class="teacher-mark-toolbar"><span>نوع الملاحظة:</span>' +
      '<button type="button" class="btn btn-sm mark-type active" data-mark-type="substitution">خطأ / استبدال</button>' +
      '<button type="button" class="btn btn-sm mark-type" data-mark-type="omission">حذف</button>' +
      '<button type="button" class="btn btn-sm mark-type" data-mark-type="hesitation">تردد</button>' +
      '<button type="button" class="btn btn-sm mark-type" data-mark-type="selfCorrection">تصحيح ذاتي</button>' +
      '<button type="button" class="btn btn-sm btn-outline" id="clear-word-marks">مسح علامات هذا المقطع</button></div>' +
      '<div class="word-mark-legend"><span class="mark-key mark-substitution">خطأ / استبدال</span><span class="mark-key mark-omission">حذف</span><span class="mark-key mark-hesitation">تردد</span><span class="mark-key mark-selfCorrection">تصحيح ذاتي</span></div>' +
      '<div class="teacher-mark-text" id="teacher-mark-text" dir="rtl">' + tokenMarkup + '</div>' +
      '<div class="teacher-mark-summary" id="teacher-mark-summary" role="status"></div>' +
      '<p class="text-muted">الأرقام اليدوية السابقة تمثل أخطاء إضافية غير محددة على الكلمات. اترك الكلمات سليمة إذا لم ترصد ملاحظة.</p>' +
      '<div class="actions"><button class="btn btn-primary btn-lg" onclick="window.assessmentManager.continueAfterTeacherMarking(' + passageIndex + ')">اعتماد الملاحظات والمتابعة إلى الفهم</button>' +
      '<button class="btn btn-outline" onclick="window.assessmentManager.continueAfterTeacherMarking(' + passageIndex + ')">تخطي تعليم الكلمات</button></div></div>';

    const wordsView = document.getElementById('teacher-mark-text');
    const applyMarks = () => {
      const marks = segment.wordMarks || [];
      wordsView.querySelectorAll('[data-word-index]').forEach(button => {
        const index = Number(button.getAttribute('data-word-index'));
        const mark = marks.find(item => item.wordIndex === index);
        button.className = 'markable-word' + (mark ? ' marked mark-' + mark.type : '');
        button.title = mark ? ({
          substitution: 'خطأ / استبدال',
          omission: 'حذف',
          hesitation: 'تردد',
          selfCorrection: 'تصحيح ذاتي'
        }[mark.type] || '') : 'انقر لإضافة ملاحظة';
      });
      const totals = window.ReadingAssessmentProtocol.summarizeWordMarks(marks);
      const summary = document.getElementById('teacher-mark-summary');
      if (summary) summary.textContent = 'الكلمات المعلّمة: ' + totals.total + ' · الأخطاء / الاستبدال: ' + totals.substitution +
        ' · الحذف: ' + totals.omission + ' · التردد: ' + totals.hesitation + ' · التصحيح الذاتي: ' + totals.selfCorrection;
    };
    container.querySelectorAll('[data-mark-type]').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedTeacherMarkType = button.getAttribute('data-mark-type');
        container.querySelectorAll('[data-mark-type]').forEach(item => item.classList.toggle('active', item === button));
      });
    });
    wordsView.addEventListener('click', event => {
      const button = event.target.closest('[data-word-index]');
      if (!button) return;
      const index = Number(button.getAttribute('data-word-index'));
      const marks = segment.wordMarks || (segment.wordMarks = []);
      const existing = marks.findIndex(item => item.wordIndex === index);
      if (existing >= 0) {
        if (marks[existing].type === this.selectedTeacherMarkType) marks.splice(existing, 1);
        else marks[existing].type = this.selectedTeacherMarkType;
      } else {
        marks.push({ wordIndex: index, type: this.selectedTeacherMarkType });
      }
      applyMarks();
    });
    document.getElementById('clear-word-marks').addEventListener('click', () => {
      segment.wordMarks = [];
      applyMarks();
    });
    applyMarks();
  };

  proto.continueAfterTeacherMarking = function (passageIndex) {
    const segment = this.readingSegments[passageIndex];
    if (segment) {
      const counts = window.ReadingAssessmentProtocol.summarizeWordMarks(segment.wordMarks || []);
      segment.errors = (segment.baselineErrors || 0) + counts.substitution + counts.hesitation;
      segment.omissions = (segment.baselineOmissions || 0) + counts.omission;
      segment.selfCorrections = (segment.baselineSelfCorrections || 0) + counts.selfCorrection;
    }
    this.renderComprehension(passageIndex);
  };

  proto.renderComprehension = function (passageIndex) {
    this.stage = 'comprehension';
    const container = document.getElementById('assessment-container');
    const passage = passageIndex === 0 ? this.primaryText : this.secondText;
    const questions = passage.comprehensionQuestions || [];
    let currentQ = 0;
    this.comprehensionAnswers[passageIndex] = [];
    const showQuestion = () => {
      if (currentQ >= questions.length) {
        if (passageIndex === 0) this.renderTeacherCheck();
        else this.processAndShowResults();
        return;
      }
      const q = questions[currentQ];
      container.innerHTML = '<div class="assessment-card fade-in"><div class="step-indicator">الخطوة ' + (passageIndex === 0 ? '4' : '7') +
        ' من 7 · فهم المقروء ' + (currentQ + 1) + ' / ' + questions.length + '</div><p class="text-muted">النص: ' + this.escapeHtml(passage.title) +
        '</p><h2 class="question-title">' + this.escapeHtml(q.question) + '</h2><div class="options-container">' +
        q.options.map((option, idx) => '<button class="btn btn-option-card" onclick="window.assessmentManager.selectAnswer(' + passageIndex + ',' + currentQ + ',' + idx + ',' + q.correctIndex + ')">' + this.escapeHtml(option) + '</button>').join('') +
        '</div></div>';
    };
    this.selectAnswer = (index, questionIndex, selectedIndex, correctIndex) => {
      this.comprehensionAnswers[index].push({ questionIndex: questionIndex, selected: selectedIndex, isCorrect: selectedIndex === correctIndex });
      currentQ++;
      showQuestion();
    };
    showQuestion();
  };

  proto.renderTeacherCheck = function () {
    this.stage = 'teacher_check';
    const mode = this.secondReadingMode || (Number(this.currentStudent.grade) <= 2 ? 'oral' : 'silent');
    const container = document.getElementById('assessment-container');
    container.innerHTML = '<div class="assessment-card fade-in"><div class="step-indicator">الخطوة 5 من 7 · ملاحظة المعلم</div><h2>مراجعة قصيرة قبل النص الثاني</h2><p>سجّل ظروف القراءة كما حدثت؛ هذه معلومات سياقية وليست علامات تشخيصية.</p>' +
      '<div class="form-row"><div class="form-group"><label for="reading-independent">هل قرأ الطالب النص الأول باستقلال؟</label><select id="reading-independent" class="form-control"><option value="">غير محدد</option><option value="yes">نعم</option><option value="no">لا</option></select></div>' +
      '<div class="form-group"><label for="reading-assistance">هل قُدّمت مساعدة؟</label><select id="reading-assistance" class="form-control"><option value="none">لا توجد مساعدة</option><option value="prompt">تلميح بسيط</option><option value="word">مساعدة في كلمة</option><option value="shared">قراءة مشتركة</option></select></div></div>' +
      '<div class="form-group"><label for="second-reading-mode">طريقة قراءة النص الثاني</label><select id="second-reading-mode" class="form-control"><option value="silent" ' + (mode === 'silent' ? 'selected' : '') + '>قراءة صامتة</option><option value="oral" ' + (mode === 'oral' ? 'selected' : '') + '>قراءة جهرية</option></select></div>' +
      '<div class="form-group"><label for="teacher-notes">ملاحظة المعلم (اختياري)</label><textarea id="teacher-notes" rows="3" maxlength="1000" placeholder="مثال: توقفت القراءة بسبب مقاطعة خارجية…"></textarea></div>' +
      '<div class="setup-instructions"><h4>تذكير بالمنهجية</h4><ul><li>لا تستعجل الطفل أو تصحح القراءة أثناء المهمة إلا عند تعذر المتابعة.</li><li>دوّن أي مساعدة قُدّمت، ولا تستخدم الأرقام العامة غير الموثقة كحدود معيارية.</li></ul></div>' +
      '<div class="actions"><button class="btn btn-primary btn-lg" onclick="window.assessmentManager.continueToSecondReading()">متابعة إلى النص الثاني</button></div></div>';
  };

  proto.continueToSecondReading = function () {
    const independent = document.getElementById('reading-independent')?.value || '';
    this.readingIndependently = independent === '' ? null : independent === 'yes';
    this.assistanceType = document.getElementById('reading-assistance')?.value || 'none';
    this.teacherNotes = (document.getElementById('teacher-notes')?.value || '').trim();
    this.secondReadingMode = document.getElementById('second-reading-mode')?.value || 'silent';
    this.startReading(this.secondReadingMode === 'oral' ? 0 : 1, 1);
  };

  proto.processAndShowResults = async function () {
    this.stage = 'results';
    const container = document.getElementById('assessment-container');
    container.innerHTML = '<div class="assessment-card text-center fade-in"><div class="spinner"></div><h2>جارٍ تجهيز ملخص جلسة القراءة…</h2><p>نجمع أزمنة القراءة وملاحظات المعلم وإجابات الفهم دون إنتاج تشخيص.</p></div>';
    const summary = window.ReadingAssessmentProtocol.summarizeReadingSegments(this.readingSegments.map(segment => ({
      durationSeconds: segment.durationSeconds, wordCount: segment.wordCount, mode: segment.mode, errors: segment.errors,
      omissions: segment.omissions, selfCorrections: segment.selfCorrections
    })));
    const allSamples = this.readingSegments.flatMap(segment => segment.gazeSamples || []);
    const combinedMetrics = this.metricsEngine.processGazeStream(allSamples);
    const hasValidGaze = this.readingSegments.some(segment => segment.hasValidGaze);
    const firstAnswers = this.comprehensionAnswers[0] || [];
    const secondAnswers = this.comprehensionAnswers[1] || [];
    const firstCorrect = firstAnswers.filter(answer => answer.isCorrect).length;
    const secondCorrect = secondAnswers.filter(answer => answer.isCorrect).length;
    const correct = firstCorrect + secondCorrect;
    const questionCount = firstAnswers.length + secondAnswers.length;
    const metricInput = hasValidGaze ? combinedMetrics : this.metricsEngine.getEmptyMetrics();
    const risk = this.metricsEngine.classifyRisk(this.currentStudent.grade, summary.durationSeconds, summary.wordCount, metricInput, correct, questionCount, summary.comparableMode);
    risk.hasValidGaze = hasValidGaze;
    const markedCounts = this.readingSegments.reduce((total, segment) => {
      const counts = window.ReadingAssessmentProtocol.summarizeWordMarks(segment.wordMarks || []);
      total.total += counts.total;
      total.substitution += counts.substitution;
      total.omission += counts.omission;
      total.hesitation += counts.hesitation;
      total.selfCorrection += counts.selfCorrection;
      return total;
    }, { total: 0, substitution: 0, omission: 0, hesitation: 0, selfCorrection: 0 });
    if (markedCounts.total) {
      risk.reasons.push('ملاحظات المعلم على الكلمات: ' + markedCounts.total +
        ' علامات (استبدال/خطأ ' + markedCounts.substitution + '، حذف ' + markedCounts.omission +
        '، تردد ' + markedCounts.hesitation + '، تصحيح ذاتي ' + markedCounts.selfCorrection + ').');
    }
    if (!summary.comparableMode) risk.reasons.push('لم تُدمج السرعة بين قراءة جهرية وأخرى صامتة؛ تظهر سرعة كل مقطع بشكل مستقل.');
    if (hasValidGaze && this.readingSegments.some(segment => !segment.hasValidGaze)) risk.reasons.push('اختلفت جودة إشارة النظر بين مقطعي القراءة؛ راجع كل مقطع على حدة.');
    const readingSegments = this.readingSegments.map(segment => ({
      passageId: segment.passageId, passageTitle: segment.passageTitle, mode: segment.mode,
      durationSeconds: segment.durationSeconds, wordCount: segment.wordCount, errors: segment.errors,
      omissions: segment.omissions, selfCorrections: segment.selfCorrections, hasValidGaze: segment.hasValidGaze,
      wordMarks: (segment.wordMarks || []).slice(0, 500).map(mark => ({ wordIndex: mark.wordIndex, type: mark.type })),
      metrics: {
        totalFixations: segment.metrics.totalFixations, avgFixationDurationMs: segment.metrics.avgFixationDurationMs,
        forwardSaccadesCount: segment.metrics.forwardSaccadesCount, regressionsCount: segment.metrics.regressionsCount,
        regressionRatePercent: segment.metrics.regressionRatePercent, sampleCount: segment.metrics.sampleCount
      }
    }));
    const payload = {
      protocolVersion: 'arabic-reading-prototype-2', studentId: this.currentStudent.id, studentName: this.currentStudent.name,
      grade: this.currentStudent.grade, textId: this.primaryText.id, textTitle: this.primaryText.title,
      secondTextId: this.secondText.id, secondTextTitle: this.secondText.title,
      observedWordCount: summary.wordCount, durationSeconds: summary.durationSeconds,
      totalAssessmentDurationSeconds: Math.round((performance.now() - this.assessmentStartedAt) / 100) / 10,
      wpm: summary.wpm, comparableReadingMode: summary.comparableMode, comprehensionScore: correct, comprehensionTotal: questionCount,
      firstComprehensionScore: firstCorrect, firstComprehensionTotal: firstAnswers.length,
      secondComprehensionScore: secondCorrect, secondComprehensionTotal: secondAnswers.length,
      ranDurationSeconds: this.ranDurationSeconds, ranErrors: this.ranErrors, readingSegments: readingSegments,
      teacherMarkedErrors: summary.teacherMarkedErrors, omissions: summary.omissions, selfCorrections: summary.selfCorrections,
      readingIndependently: this.readingIndependently, assistanceType: this.assistanceType, teacherNotes: this.teacherNotes,
      audioRecorded: Object.values(this.audioRecords).some(record => record && record.url),
      metrics: combinedMetrics, hasValidGaze: hasValidGaze, riskClassification: risk
    };
    let saveError = null;
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || ('تعذر حفظ الجلسة (' + response.status + ')'));
      Object.assign(payload, result);
      await window.dashboardModule.loadData();
    } catch (error) {
      console.warn('Session save warning:', error);
      saveError = error.message || 'تعذر حفظ الجلسة على الخادم.';
    }
    payload.visualSegments = this.readingSegments.map((segment, index) => ({
      passageId: segment.passageId, passageTitle: segment.passageTitle, content: segment.content, mode: segment.mode,
      durationSeconds: segment.durationSeconds, wordCount: segment.wordCount, errors: segment.errors, omissions: segment.omissions,
      selfCorrections: segment.selfCorrections, hasValidGaze: segment.hasValidGaze, metrics: segment.metrics,
      viewportWidth: segment.viewportWidth, viewportHeight: segment.viewportHeight, audioUrl: segment.audioUrl, index: index
    }));
    payload.metrics = combinedMetrics;
    payload.riskClassification = risk;
    payload.hasValidGaze = hasValidGaze;
    payload.saveError = saveError;
    this.lastSession = payload;
    this.renderResultsSummary(payload);
  };

  proto.renderResultsSummary = function (session) {
    const container = document.getElementById('assessment-container');
    const metrics = session.metrics || {};
    const risk = session.riskClassification || {};
    const segments = session.visualSegments || [];
    const safe = this.escapeHtml.bind(this);
    const segmentCards = segments.map((segment, index) =>
      '<article class="reading-summary-card"><div class="reading-summary-top"><span class="badge-info">' +
      (segment.mode === 'oral' ? 'قراءة جهرية' : 'قراءة صامتة') + '</span><strong>' + safe(segment.passageTitle) + '</strong></div>' +
      '<div class="reading-summary-stats"><div><span>المدة</span><strong>' + this.formatProtocolDuration(segment.durationSeconds) +
      '</strong></div><div><span>سرعة المقطع</span><strong>' + (window.ReadingAssessmentProtocol.calculateObservedWpm(segment.wordCount, segment.durationSeconds) === null ? 'غير متاحة' : window.ReadingAssessmentProtocol.calculateObservedWpm(segment.wordCount, segment.durationSeconds) + ' ك/د') + '</strong></div><div><span>الكلمات</span><strong>' + segment.wordCount + '</strong></div><div><span>أخطاء مسجلة</span><strong>' +
      segment.errors + '</strong></div><div><span>إشارة النظر</span><strong>' + (segment.hasValidGaze ? 'عينات مبدئية' : 'غير كافية') + '</strong></div></div>' +
      (segment.audioUrl ? '<audio controls preload="none" src="' + segment.audioUrl + '">المتصفح لا يدعم تشغيل الصوت.</audio><p class="text-muted">الصوت مؤقت في هذه الجلسة فقط، ولم يُرسل إلى الخادم.</p>' : '') + '</article>'
    ).join('');
    const visualButtons = segments.map((segment, index) => '<button class="btn btn-sm ' + (index === 0 ? 'active' : '') +
      '" id="visual-segment-' + index + '" onclick="window.assessmentManager.selectVisualSegment(' + index + ')">' + (index + 1) + '. ' + safe(segment.passageTitle) + '</button>').join('');
    const saveMessage = session.saveError
      ? '<div class="diagnostic-alert-banner" style="background:#fff7e7;border:1px solid #efdbad;color:#795a28"><strong>لم تُحفظ الجلسة على الخادم.</strong> ' + safe(session.saveError) + ' احتفظ بهذا الملخص قبل مغادرة الصفحة.</div>'
      : '<div class="diagnostic-alert-banner" style="background:#eaf7f0;border:1px solid #c7e7d7;color:#2d6c56">تم حفظ ملخص الجلسة. لا تُحفظ إحداثيات النظر الخام أو ملفات الصوت.</div>';
    container.innerHTML = '<div class="results-dashboard fade-in"><div class="results-header"><div><div class="eyebrow">اكتملت مهام الجلسة</div><h2>ملخص القراءة العربية</h2><p>' +
      safe(session.studentName) + ' · الصف ' + safe(session.grade) + ' · مقطعا قراءة</p></div><div class="risk-badge-box"><span class="risk-title">' +
      safe(risk.levelAr || 'ملاحظات وصفية') + '</span><span class="risk-score">لا ينتج النظام درجة خطر تشخيصية</span></div></div>' + saveMessage +
      '<div class="metrics-summary-grid"><div class="metric-box"><div class="title">سرعة القراءة المحسوبة</div><div class="val">' +
      (session.wpm == null ? 'غير متاحة' : session.wpm + ' <small>كلمة/د</small>') + '</div><div class="sub">' + (session.comparableReadingMode ? 'عدد الكلمات ÷ زمن القراءة' : 'لم تُدمج قراءة جهرية مع قراءة صامتة') + '</div></div>' +
      '<div class="metric-box"><div class="title">فهم المقروء</div><div class="val">' + (Number(session.comprehensionScore) || 0) + ' / ' +
      (Number(session.comprehensionTotal) || 0) + '</div><div class="sub">إجابات صحيحة عبر النصين</div></div>' +
      '<div class="metric-box"><div class="title">تسمية الحروف</div><div class="val">' + (session.ranDurationSeconds == null ? 'غير مسجلة' : this.formatProtocolDuration(session.ranDurationSeconds)) +
      '</div><div class="sub">' + (Number(session.ranErrors) || 0) + ' أخطاء رصدها المعلم</div></div>' +
      '<div class="metric-box"><div class="title">بيانات النظر</div><div class="val">' + (session.hasValidGaze ? (metrics.totalFixations || 0) + ' <small>تثبيت</small>' : 'غير كافية') +
      '</div><div class="sub">مؤشر تجريبي لا معيار تشخيصي</div></div></div>' +
      '<section class="dashboard-section"><div class="section-head"><div><h2>مقطعا القراءة</h2><p>الأزمنة والملاحظات المسجلة خلال الجلسة</p></div></div><div class="reading-summary-grid">' + segmentCards + '</div></section>' +
      '<section class="scanpath-section"><div class="section-toolbar"><div><h3>مسار النظر لكل مقطع</h3><p class="text-muted">المسارات وصفية وتتأثر بالمعايرة والجهاز؛ لا تُفسَّر بمعزل عن بقية التقييم.</p></div>' +
      '<div class="view-toggles"><button class="btn btn-sm active" id="btn-show-scanpath" onclick="window.assessmentManager.toggleVisualMode(0)">المسار</button><button class="btn btn-sm" id="btn-show-heatmap" onclick="window.assessmentManager.toggleVisualMode(1)">الخريطة الحرارية</button></div></div>' +
      '<div class="view-toggles" style="margin-bottom:12px">' + visualButtons + '</div><div class="replay-wrapper" id="replay-wrapper"><div class="arabic-text-content" id="replay-text-view"></div><canvas id="analysis-canvas" class="gaze-overlay-canvas"></canvas></div>' +
      '<div class="scanpath-legend"><span>دوائر: مواقع التثبيت المقدّر</span><span>الخطوط: انتقالات بين العينات</span><span>لا تعرض الرسوم صوت الطفل</span></div></section>' +
      '<section class="diagnostic-reasons-card"><h4>ما الذي سجلته الجلسة؟</h4><ul>' + (risk.reasons || []).map(reason => '<li>' + safe(reason) + '</li>').join('') + (session.comparableReadingMode ? '' : '<li>لم نحسب سرعة موحدة للمقطعين لاختلاف طريقة القراءة؛ تظهر سرعة كل مقطع على حدة.</li>') +
      '</ul><ul><li>أخطاء القراءة: ' + (Number(session.teacherMarkedErrors) || 0) + ' · الحذف: ' + (Number(session.omissions) || 0) + ' · التصحيح الذاتي: ' +
      (Number(session.selfCorrections) || 0) + '.</li><li>القراءة باستقلال: ' + (session.readingIndependently === true ? 'نعم' : session.readingIndependently === false ? 'لا' : 'غير محدد') +
      ' · المساعدة: ' + safe(session.assistanceType || 'غير محددة') + '.</li></ul>' + (session.teacherNotes ? '<p><strong>ملاحظة المعلم:</strong> ' + safe(session.teacherNotes) + '</p>' : '') + '</section>' +
      '<div class="results-actions"><button class="btn btn-primary" onclick="window.assessmentManager.openParentReport()">عرض / طباعة تقرير الجلسة</button><button class="btn btn-secondary" onclick="window.appRouter.navigate(&quot;intervention&quot;)">أنشطة القراءة</button><button class="btn btn-outline" onclick="window.appRouter.navigate(&quot;dashboard&quot;)">العودة إلى لوحة المدرسة</button></div></div>';
    this.visualPassageIndex = 0;
    this.visualMode = 'scanpath';
    const wrapper = document.getElementById('replay-wrapper');
    const canvas = document.getElementById('analysis-canvas');
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    this.analysisVisualizer = new GazeVisualizer(canvas);
    this.selectVisualSegment(0);
  };

  proto.selectVisualSegment = function (index) {
    const segments = this.lastSession && this.lastSession.visualSegments || [];
    if (!segments[index]) return;
    this.visualPassageIndex = index;
    segments.forEach((_, i) => {
      const button = document.getElementById('visual-segment-' + i);
      if (button) button.classList.toggle('active', i === index);
    });
    const textView = document.getElementById('replay-text-view');
    if (textView) textView.textContent = segments[index].content || '';
    if (!this.analysisVisualizer) return;
    const wrapper = document.getElementById('replay-wrapper');
    if (wrapper) this.analysisVisualizer.resize(wrapper.clientWidth, wrapper.clientHeight);
    if (!segments[index].hasValidGaze) {
      this.analysisVisualizer.clear();
      this.analysisVisualizer.drawEmptyNotice('لا توجد بيانات نظر كافية لهذا المقطع');
      return;
    }
    const widthRatio = (wrapper.clientWidth || 1) / (segments[index].viewportWidth || wrapper.clientWidth || 1);
    const heightRatio = (wrapper.clientHeight || 1) / (segments[index].viewportHeight || wrapper.clientHeight || 1);
    const fixations = (segments[index].metrics.fixations || []).map(fix => Object.assign({}, fix, { x: fix.x * widthRatio, y: fix.y * heightRatio }));
    if (this.visualMode === 'heatmap') this.analysisVisualizer.drawHeatmap(fixations);
    else this.analysisVisualizer.drawScanpath(fixations);
  };

  proto.toggleVisualMode = function (mode) {
    this.visualMode = mode === 1 || mode === 'heatmap' ? 'heatmap' : 'scanpath';
    const scan = document.getElementById('btn-show-scanpath');
    const heat = document.getElementById('btn-show-heatmap');
    if (scan) scan.classList.toggle('active', this.visualMode === 'scanpath');
    if (heat) heat.classList.toggle('active', this.visualMode === 'heatmap');
    this.selectVisualSegment(this.visualPassageIndex || 0);
  };
})();
