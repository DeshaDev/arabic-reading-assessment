/**
 * استخراج مؤشرات وصفية من عينات النظر لأغراض النمذجة الأولية، دون تصنيف تشخيصي.
 * خوارزمية I-VT لتصنيف التثبيت والقفزات، مع مراعاة اتجاه القراءة من اليمين إلى اليسار (RTL)
 */

// Prototype measurements are descriptive only; no clinical or age-grade norms are embedded.

class EyeMetricsEngine {
  constructor() {
    this.velocityThresholdDegSec = 35.0; // عتبة سرعة القفزة بالدرجة/الثانية
    this.minFixationDurationMs = 60;      // الحد الأدنى لاعتبار التوقف تثبيتاً بصرياً (إطارين على الأقل)
    this.maxFixationDurationMs = 1500;    // الحد الأقصى لتفادي احتساب التجمد البصري أو السهو
    this.pixelsPerDegree = 38.0;          // تقدير البكسلات لكل درجة زاوية على مسافة 50-60 سم
  }

  /**
   * تطبيق خوارزمية I-VT على تيار إحداثيات النظر
   * @param {Array} rawGazeSamples: [{t: timestamp, x: screenX, y: screenY, conf: confidence}, ...]
   */
  processGazeStream(rawGazeSamples) {
    if (!rawGazeSamples || rawGazeSamples.length < 5) {
      return this.getEmptyMetrics();
    }

    const filteredSamples = this.filterBlinksAndOutliers(rawGazeSamples);
    if (filteredSamples.length < 5) return this.getEmptyMetrics();

    // 1. حساب السرعة الزاوية بين كل عينتين متتاليتين
    const velocities = [];
    for (let i = 1; i < filteredSamples.length; i++) {
      const prev = filteredSamples[i - 1];
      const curr = filteredSamples[i];
      const dt = (curr.t - prev.t) / 1000.0; // بالثواني

      if (dt > 0.001 && dt < 0.2) {
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distDeg = distPx / this.pixelsPerDegree;
        const vel = distDeg / dt;
        velocities.push({
          t: curr.t,
          x: curr.x,
          y: curr.y,
          dx: dx,
          dy: dy,
          vel: vel,
          isSaccade: vel > this.velocityThresholdDegSec
        });
      }
    }

    // 2. تجميع فترات التثبيت (Fixation Clusters) وفترات القفزات (Saccades)
    const fixations = [];
    const saccades = [];

    let currentFixationPoints = [];

    for (let i = 0; i < velocities.length; i++) {
      const v = velocities[i];
      if (!v.isSaccade) {
        currentFixationPoints.push(v);
      } else {
        if (currentFixationPoints.length > 0) {
          const fixation = this.aggregateFixation(currentFixationPoints);
          if (fixation && fixation.durationMs >= this.minFixationDurationMs && fixation.durationMs <= this.maxFixationDurationMs) {
            fixations.push(fixation);
          }
          currentFixationPoints = [];
        }

        // تسجيل القفزة
        saccades.push(v);
      }
    }

    // إضافة آخر تثبيت إن وجد
    if (currentFixationPoints.length > 0) {
      const fixation = this.aggregateFixation(currentFixationPoints);
      if (fixation && fixation.durationMs >= this.minFixationDurationMs) {
        fixations.push(fixation);
      }
    }

    // 3. تحليل القفزات والارتدادات العكسية (RTL Analysis)
    // في العربية: القراءة من اليمين إلى اليسار.
    // القفزة الأمامية (Forward Saccade): dx < 0 (تتحرك العين لليسار، باتجاه الكلمة التالية).
    // الارتداد العكسي (Regression): dx > 0 (ترتد العين لليمين لإعادة قراءة كلمة سابقة).
    let forwardSaccadesCount = 0;
    let regressionsCount = 0;
    let lineSweepsCount = 0;

    for (let i = 1; i < fixations.length; i++) {
      const prevFix = fixations[i - 1];
      const currFix = fixations[i];

      const dx = currFix.x - prevFix.x;
      const dy = currFix.y - prevFix.y;

      // فحص انتقال السطر (Line Sweep): هبوط رأسي مع قفزة طويلة جداً لليمين
      if (dy > 30 && dx > 200) {
        lineSweepsCount++;
      } else if (dx > 25) {
        // حركة لليمين أثناء قراءة نفس السطر = ارتداد عكسي (Regression)
        regressionsCount++;
      } else if (dx < -20) {
        // حركة لليسار = قفزة للأمام في العربية (Forward Saccade)
        forwardSaccadesCount++;
      }
    }

    const totalFixations = fixations.length;
    const avgFixationDurationMs = totalFixations > 0 
      ? Math.round(fixations.reduce((acc, f) => acc + f.durationMs, 0) / totalFixations) 
      : 0;

    const totalDirectionalMoves = forwardSaccadesCount + regressionsCount;
    const regressionRatePercent = totalDirectionalMoves > 0 
      ? Number(((regressionsCount / totalDirectionalMoves) * 100).toFixed(1)) 
      : 0;

    return {
      fixations,
      totalFixations,
      avgFixationDurationMs,
      forwardSaccadesCount,
      regressionsCount,
      regressionRatePercent,
      lineSweepsCount,
      sampleCount: filteredSamples.length
    };
  }

  aggregateFixation(points) {
    if (!points || points.length === 0) return null;
    const startT = points[0].t;
    const endT = points[points.length - 1].t;
    const measuredDuration = endT - startT;
    // Use observed timestamps only. A fixed frame-rate estimate would inflate short fixations.
    const durationMs = Math.max(0, measuredDuration);

    const avgX = points.reduce((acc, p) => acc + p.x, 0) / points.length;
    const avgY = points.reduce((acc, p) => acc + p.y, 0) / points.length;

    return {
      startTime: startT,
      endTime: endT,
      durationMs: Math.round(durationMs),
      x: Math.round(avgX),
      y: Math.round(avgY)
    };
  }

  filterBlinksAndOutliers(samples) {
    // إزالة النقاط التي تفقد الثقة أو تقفز فجأة خارج الشاشة
    return samples.filter(s => {
      const isInside = s.x >= -50 && s.x <= (window.innerWidth + 50) && s.y >= -50 && s.y <= (window.innerHeight + 50);
      const hasConfidence = s.conf === undefined || s.conf > 0.3;
      return isInside && hasConfidence;
    });
  }

  /**
   * فحص جودة الجلسة وإنشاء ملخص وصفي؛ لا يُنتج تشخيصًا أو درجة خطر.
   */
  classifyRisk(grade, durationSeconds, wordsCount, metrics, comprehensionScore, comprehensionTotal, comparableReadingMode = true) {
    const duration = Number(durationSeconds);
    const wordCount = Number(wordsCount);
    const validDuration = Number.isFinite(duration) && duration >= 0;
    const validWords = Number.isFinite(wordCount) && wordCount > 0;
    const rawWpm = comparableReadingMode && validDuration && duration >= 15 && validWords
      ? Math.round((wordCount / duration) * 60)
      : null;
    const paceLooksPlausible = rawWpm !== null && rawWpm > 0 && rawWpm <= 240;
    const hasValidGaze = !!(
      metrics &&
      Number(metrics.totalFixations) >= 3 &&
      Number(metrics.avgFixationDurationMs) > 0
    );
    const reasons = [];

    if (!validDuration || duration < 15) {
      reasons.push('مدة القراءة أقل من 15 ثانية؛ لا نحسب سرعة قراءة قابلة للتفسير من هذه الجلسة.');
    }
    if (!validWords) {
      reasons.push('لم نتمكن من حساب عدد كلمات صالح من النص المعروض.');
    }
    if (!comparableReadingMode) {
      reasons.push('لم نحسب سرعة موحدة لأن مقطعي القراءة استخدما طريقتين مختلفتين (جهرية وصامتة).');
    }
    if (rawWpm !== null && rawWpm > 240) {
      reasons.push('السرعة المحسوبة أعلى من نطاق فحص الجودة التقني؛ تحقق من مدة الجلسة وعدد الكلمات قبل تفسيرها.');
    }
    if (hasValidGaze) {
      reasons.push('تم تسجيل عينات نظر كافية مبدئيًا بعد المعايرة؛ هذه القياسات الوصفية ليست معيارًا تشخيصيًا.');
    } else {
      reasons.push('بيانات النظر غير كافية أو لم تكتمل معايرتها؛ لم تُستخدم مؤشرات التثبيت والارتداد في هذا الملخص.');
    }

    const score = Number(comprehensionScore);
    const total = Number(comprehensionTotal);
    if (Number.isFinite(score) && Number.isFinite(total) && total > 0) {
      reasons.push('إجابات فهم المقروء: ' + score + ' من ' + total + '. راجع الإجابات مع ملاحظة المعلم والسياق التعليمي.');
    } else {
      reasons.push('لم تتوفر إجابات فهم مقروء مكتملة لهذه الجلسة.');
    }

    const sufficient = validDuration && duration >= 15 && validWords && paceLooksPlausible;
    return {
      level: sufficient ? 'observations' : 'insufficient',
      levelAr: sufficient ? 'مؤشرات وصفية — لا تصنيف تشخيصي' : 'بيانات غير كافية للتفسير',
      score: null,
      color: '#356f60',
      wpm: paceLooksPlausible ? rawWpm : null,
      observedWordCount: validWords ? wordCount : 0,
      hasValidGaze,
      reasons
    };
  }

  getEmptyMetrics() {
    return {
      fixations: [],
      totalFixations: 0,
      avgFixationDurationMs: 0,
      forwardSaccadesCount: 0,
      regressionsCount: 0,
      regressionRatePercent: 0,
      lineSweepsCount: 0,
      sampleCount: 0
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EyeMetricsEngine };
}
