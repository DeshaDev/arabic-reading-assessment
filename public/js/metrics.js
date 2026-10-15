/**
 * محرك قياسات حركة العين وتصنيف مخاطر عسر القراءة للغة العربية
 * خوارزمية I-VT لتصنيف التثبيت والقفزات، مع مراعاة اتجاه القراءة من اليمين إلى اليسار (RTL)
 */

// المعايير المرجعية لمؤشرات القراءة باللغة العربية حسب الصف الدراسي
const ARABIC_READING_NORMS = {
  1: { avgWpm: 40, stdWpm: 12, avgFixationMs: 270, stdFixationMs: 40, maxNormalRegressionRate: 22 },
  2: { avgWpm: 60, stdWpm: 14, avgFixationMs: 250, stdFixationMs: 35, maxNormalRegressionRate: 19 },
  3: { avgWpm: 75, stdWpm: 15, avgFixationMs: 235, stdFixationMs: 30, maxNormalRegressionRate: 17 },
  4: { avgWpm: 92, stdWpm: 16, avgFixationMs: 220, stdFixationMs: 28, maxNormalRegressionRate: 15 },
  5: { avgWpm: 112, stdWpm: 18, avgFixationMs: 210, stdFixationMs: 25, maxNormalRegressionRate: 14 },
  6: { avgWpm: 135, stdWpm: 20, avgFixationMs: 200, stdFixationMs: 22, maxNormalRegressionRate: 12 }
};

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
    const estimatedDuration = points.length * 33.3; // تقدير الإطارات بمعدل 30 إطار/ث
    const durationMs = Math.max(measuredDuration, estimatedDuration);

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
   * حساب تقييم وتصنيف المخاطر المرجعي بناءً على مؤشرات الصف الدراسي
   */
  classifyRisk(grade, durationSeconds, wordsCount, metrics, comprehensionScore, comprehensionTotal) {
    const norm = ARABIC_READING_NORMS[grade] || ARABIC_READING_NORMS[3];

    // 1. حساب سرعة القراءة بالكلمة في الدقيقة (WPM)
    const effectiveMinutes = Math.max(0.05, durationSeconds / 60.0);
    const calculatedWpm = Math.round(wordsCount / effectiveMinutes);

    // 2. التحقق من توفر بيانات حركة العين الحقيقية
    const hasValidGaze = metrics && metrics.totalFixations >= 3 && metrics.avgFixationDurationMs > 0;

    const reasons = [];
    let riskScore = 20; // قاعدة الانطلاق

    // تقييم سرعة القراءة WPM (مقياس ثابت وموثوق)
    const wpmZ = (norm.avgWpm - calculatedWpm) / norm.stdWpm;
    if (wpmZ > 1.8) {
      riskScore += 30;
      reasons.push(`سرعة القراءة منخفضة بشكل ملحوظ (${calculatedWpm} كلمة/دقيقة مقابل المعدل الطبيعي ${norm.avgWpm} ك/د لصفه).`);
    } else if (wpmZ > 0.8) {
      riskScore += 15;
      reasons.push(`سرعة القراءة (${calculatedWpm} ك/د) أقل من متوسط أقرانه (${norm.avgWpm} ك/د).`);
    }

    // تقييم الفهم القرائي (مقياس سلوكي موثوق)
    const compPercent = (comprehensionScore / Math.max(1, comprehensionTotal)) * 100;
    if (compPercent < 50) {
      riskScore += 25;
      reasons.push(`درجة استيعاب منخفضة للنص (${comprehensionScore} من ${comprehensionTotal}) تشير لصعوبة استيعاب المقروء.`);
    }

    // تقييم مؤشرات حركة العين فقط إذا كانت البيانات حقيقية وملتقطة من الكاميرا
    if (hasValidGaze) {
      const fixZ = (metrics.avgFixationDurationMs - norm.avgFixationMs) / norm.stdFixationMs;
      const regDiff = metrics.regressionRatePercent - norm.maxNormalRegressionRate;

      if (metrics.avgFixationDurationMs > (norm.avgFixationMs + 1.5 * norm.stdFixationMs)) {
        riskScore += 25;
        reasons.push(`طول غير معتاد في مدة التثبيت البصري (${metrics.avgFixationDurationMs} مللي ثانية مقارنة بالمعدل الطبيعي ${norm.avgFixationMs}ms)، مما يشير لبطء فك شفرة الكلمة.`);
      } else if (metrics.avgFixationDurationMs > norm.avgFixationMs) {
        riskScore += 10;
      }

      if (regDiff > 12) {
        riskScore += 25;
        reasons.push(`نسبة ارتداد بصري مرتفعة جداً (${metrics.regressionRatePercent}% مقارنة بالحد الأقصى لصفه ${norm.maxNormalRegressionRate}%)، مما يعكس ارتباكاً وتشتتاً عند تتبع النص العربي.`);
      } else if (regDiff > 4) {
        riskScore += 10;
        reasons.push(`تكرار ارتداد النظر للخلف أعلى من المتوسط لصفه الدراسي.`);
      }
    } else {
      reasons.push('⚠️ لم تتوفر إشارات حركة عين كافية من الكاميرا في هذه الجلسة؛ اعتمد التقييم على زمن القراءة وأسئلة الفهم فقط كفرز مبدئي سلوكي.');
    }

    // تصنيف مستوى الخطر النهائي
    let level = 'low';
    let levelAr = 'مؤشر خطر منخفض (ضمن النطاق الطبيعي)';
    let color = '#10b981'; // أخضر

    if (riskScore >= 65) {
      level = 'high';
      levelAr = 'مؤشر خطر مرتفع (مؤشرات قوية لصعوبة القراءة)';
      color = '#ef4444'; // أحمر
    } else if (riskScore >= 40) {
      level = 'moderate';
      levelAr = 'مؤشر خطر متوسط (يحتاج متابعة وتدريب)';
      color = '#f59e0b'; // أصفر برتقالي
    } else {
      if (hasValidGaze) {
        reasons.push('حركات العين وسرعة القراءة تتبع نمطاً طبيعياً وسلساً لعمره وصفه الدراسي.');
      }
    }

    return {
      level,
      levelAr,
      score: Math.min(100, riskScore),
      color,
      wpm: calculatedWpm,
      normWpm: norm.avgWpm,
      normFixationMs: norm.avgFixationMs,
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
  module.exports = { EyeMetricsEngine, ARABIC_READING_NORMS };
}
