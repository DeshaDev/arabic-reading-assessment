/**
 * تقدير اتجاه النظر عبر كاميرا الويب باستخدام WebGazer.js.
 * يلتقط عينات النظر ويقدّر سطوع صورة الكاميرا؛ لا يدّعي قياس المسافة أو اتجاه الرأس أو التشخيص.
 */

class ArabicEyeTracker {
  constructor() {
    this.isStreaming = false;
    this.isTracking = false;
    this.onGazePoint = null;
    this.onEnvironmentCheck = null;

    this.currentGaze = { x: window.innerWidth / 2, y: window.innerHeight / 2, conf: 0 };
    this.environment = { faceDetected: false, lighting: 'good', realLuma: 110, distanceCm: 52 };
    this.calibrationClicks = 0;
    this.envInterval = null;
    this.styleInterval = null;
  }

  async initialize() {
    if (this.isStreaming && this.isCameraActive()) return true;
    if (typeof webgazer === 'undefined') {
      console.error('WebGazer library not loaded');
      this.cameraError = 'مكتبة WebGazer غير متوفرة';
      return false;
    }

    try {
      this.cameraError = null;

      webgazer.params.showVideoPreview = true;
      webgazer.params.showFaceOverlay = true;
      webgazer.params.showFaceFeedbackBox = false;

      // ضبط مستمع تيار النظر اللحظي
      webgazer
        .setRegression('ridge')
        .setGazeListener((data, clock) => {
          if (data == null) return;
          this.handleRawGaze(data.x, data.y);
        })
        .saveDataAcrossSessions(false);

      // بدء تشغيل الكاميرا وتيار الفيديو مباشرة دون إغلاق مسبق
      await webgazer.begin();

      // تفعيل مرشح كالمـان المدمج لإزالة الارتعاش
      if (webgazer.applyKalmanFilter) {
        webgazer.applyKalmanFilter(true);
      }

      webgazer.showVideoPreview(true);
      webgazer.showPredictionPoints(false); // إخفاء النقطة الحمراء، نستخدم المؤشر المتوهج

      // تنسيق موقع نافذة كاميرا WebGazer لتظهر في أسفل يسار الشاشة بأناقة دون حجب الأزرار
      this.styleWebGazerElements();
      if (this.styleInterval) clearInterval(this.styleInterval);
      this.styleInterval = setInterval(() => this.styleWebGazerElements(), 1000);

      this.isStreaming = true;
      this.isTracking = true;

      // تشغيل فاحص البيئة الحي الذي يقرأ بكسلات الفيديو ويحسب المسافة والإضاءة الفعلية
      this.startEnvironmentAnalyzer();

      console.log('[EyeTracker] WebGazer engine started successfully with real-time video analyzer!');
      if (this.onCameraStatusChange) {
        this.onCameraStatusChange({ status: 'active', message: 'الكاميرا متصلة وتبث بنجاح' });
      }
      return true;
    } catch (err) {
      console.error('WebGazer initialization error:', err);
      this.cameraError = this.formatCameraError(err);
      if (this.onCameraStatusChange) {
        this.onCameraStatusChange({ status: 'error', message: this.cameraError });
      }
      return false;
    }
  }

  formatCameraError(err) {
    if (!err) return 'خطأ غير معروف في الكاميرا';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'تم رفض إذن الكاميرا من المتصفح. يرجى النقر على أيقونة الكاميرا/القفل بجوار الرابط والسماح بها.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'لم يتم العثور على أي كاميرا متصلة بالجهاز.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'الكاميرا قيد الاستخدام بواسطة تطبيق آخر (مثل Zoom أو Teams أو تطبيق كاميرا ويندوز). يرجى إغلاقه أولاً.';
    }
    return `تعذر تشغيل الكاميرا: ${err.message || err.name}`;
  }

  isCameraActive() {
    const video = document.getElementById('webgazerVideoFeed') || document.querySelector('video');
    return !!(video && video.readyState >= 2 && video.videoWidth > 0 && !video.paused && !video.ended);
  }

  /**
   * محلل الكاميرا الحي: يقرأ بكسلات الكاميرا كل 150ms لحساب الإضاءة والمسافة الحقيقية وحركة الرأس
   */
  startEnvironmentAnalyzer() {
    if (this.envInterval) clearInterval(this.envInterval);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 160;
    offCanvas.height = 120;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    this.envInterval = setInterval(() => {
      const video = document.getElementById('webgazerVideoFeed') || document.querySelector('video');
      if (!video || video.readyState < 2) return;

      offCtx.drawImage(video, 0, 0, 160, 120);
      const img = offCtx.getImageData(0, 0, 160, 120);
      const data = img.data;

      // 1. حساب الإضاءة الحقيقية للغرفة من بكسلات الفيديو الفعلية
      let sumLuma = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 16 * 4) {
        sumLuma += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        count++;
      }
      const realLuma = Math.round(sumLuma / count);

      // لا نستنتج الوجه أو المسافة من لون البشرة؛ ذلك غير موثوق عبر الكاميرات والإضاءات.
      // نعرض فقط وجود عينة نظر حديثة، وسطوع الصورة التقريبي.
      const recentGazeSignal = Boolean(this.currentGaze && performance.now() - (this.currentGaze.t || 0) < 2000);
      this.environment = {
        gazeSignalAvailable: recentGazeSignal,
        lighting: realLuma > 65 ? 'good' : (realLuma > 30 ? 'moderate' : 'poor'),
        realLuma
      };

      if (this.onEnvironmentCheck) {
        this.onEnvironmentCheck(this.environment);
      }
    }, 150);
  }

  styleWebGazerElements() {
    const videoContainer = document.getElementById('webgazerVideoContainer');
    const videoFeed = document.getElementById('webgazerVideoFeed');
    const overlay = document.getElementById('webgazerFaceOverlay');
    const box = document.getElementById('webgazerFaceFeedbackBox');

    [videoContainer, videoFeed, overlay, box].forEach(el => {
      if (el) {
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('bottom', '20px', 'important');
        el.style.setProperty('left', '20px', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('z-index', '1000', 'important');
      }
    });

    if (videoFeed) {
      videoFeed.style.setProperty('width', '180px', 'important');
      videoFeed.style.setProperty('height', '135px', 'important');
      videoFeed.style.setProperty('border-radius', '12px', 'important');
      videoFeed.style.setProperty('border', '2px solid #2563eb', 'important');
      videoFeed.style.setProperty('box-shadow', '0 8px 24px rgba(0,0,0,0.3)', 'important');
      videoFeed.style.setProperty('background', '#0f172a', 'important');
    }
    if (overlay) {
      overlay.style.setProperty('width', '180px', 'important');
      overlay.style.setProperty('height', '135px', 'important');
      overlay.style.setProperty('border-radius', '12px', 'important');
    }
    if (box) {
      box.style.setProperty('display', 'none', 'important');
    }
  }

  handleRawGaze(x, y) {
    if (isNaN(x) || isNaN(y)) return;

    this.currentGaze = {
      x: Math.round(x),
      y: Math.round(y),
      t: performance.now()
    };

    if (this.onGazePoint) {
      this.onGazePoint(this.currentGaze);
    }
  }

  addCalibrationSample(targetX, targetY) {
    return new Promise(resolve => {
      if (!this.isStreaming || typeof webgazer === 'undefined' || typeof webgazer.recordScreenPosition !== 'function') {
        resolve(false);
        return;
      }
      try {
        const gazeIsRecent = this.currentGaze && Number.isFinite(this.currentGaze.t) &&
          performance.now() - this.currentGaze.t < 500;
        if (!gazeIsRecent) {
          resolve(false);
          return;
        }
        // One physical click contributes one labelled sample. Do not duplicate samples
        // to make calibration look more complete than it is.
        webgazer.recordScreenPosition(targetX, targetY, 'click');
        this.calibrationClicks++;
        setTimeout(() => resolve(true), 150);
      } catch (err) {
        console.warn('Calibration sample was not recorded:', err);
        resolve(false);
      }
    });
  }

  computeCalibration() {
    // Five distinct targets × three deliberate clicks. No automatic pass-through.
    return this.calibrationClicks >= 15;
  }

  resetCalibration() {
    if (typeof webgazer !== 'undefined' && webgazer.clearData) {
      webgazer.clearData();
    }
    this.calibrationClicks = 0;
  }

  shutdown() {
    if (this.envInterval) clearInterval(this.envInterval);
    if (this.styleInterval) clearInterval(this.styleInterval);
    this.envInterval = null;
    this.styleInterval = null;
    this.onGazePoint = null;
    this.onEnvironmentCheck = null;
    this.isTracking = false;
    this.isStreaming = false;
    try {
      if (typeof webgazer !== 'undefined' && typeof webgazer.end === 'function') {
        const result = webgazer.end();
        if (result && typeof result.catch === 'function') result.catch(err => console.warn('WebGazer shutdown warning:', err));
      } else if (typeof webgazer !== 'undefined' && typeof webgazer.pause === 'function') {
        webgazer.pause();
      }
    } catch (err) {
      console.warn('WebGazer shutdown warning:', err);
    }
    const video = document.getElementById('webgazerVideoFeed');
    if (video && video.srcObject && typeof video.srcObject.getTracks === 'function') {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
  }

  pause() {
    if (typeof webgazer !== 'undefined' && webgazer.pause) {
      webgazer.pause();
    }
    this.isTracking = false;
  }

  resume() {
    if (typeof webgazer !== 'undefined' && webgazer.resume) {
      webgazer.resume();
    }
    this.isTracking = true;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ArabicEyeTracker };
}
