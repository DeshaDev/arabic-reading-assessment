/**
 * وحدة الرسم البياني البصري: مسار القراءة (Scanpath) والخريطة الحرارية (Heatmap)
 * ومحاذاة كتل الكلمات العربية مع حركة العين.
 */

class GazeVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * رسم مؤشر النظر اللحظي (نقطة لطيفة متوهجة)
   */
  drawLiveGaze(x, y, conf = 1.0) {
    this.clear();
    const ctx = this.ctx;

    // هالة متوهجة خارجية
    const grad = ctx.createRadialGradient(x, y, 4, x, y, 22);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.85)'); // أزرق مريح
    grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.35)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    // نقطة المركز الدقيقة
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawEmptyNotice(message) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '14px Tajawal, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    ctx.restore();
  }

  /**
   * رسم مسار القراءة البصري الكامل (Scanpath) مع تمييز الارتدادات باللون الأحمر
   */
  drawScanpath(fixations) {
    this.clear();
    if (!fixations || fixations.length < 2) {
      this.drawEmptyNotice('⚠️ لا تتوفر إحداثيات نظر كافية لرسم مسار القراءة البصري لهذه الجلسة');
      return;
    }

    const ctx = this.ctx;
    ctx.save();

    // 1. رسم خطوط القفزات والارتدادات بين التثبيتات المتتالية
    for (let i = 1; i < fixations.length; i++) {
      const p1 = fixations[i - 1];
      const p2 = fixations[i];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;

      const isLineSweep = (dy > 30 && dx > 180);
      const isRegression = !isLineSweep && (dx > 20); // ارتداد لليمين في العربية

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      if (isRegression) {
        // خط أحمر للارتداد العكسي
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
      } else if (isLineSweep) {
        // خط أصفر منقط لانتقال السطر
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 6]);
      } else {
        // خط أزرق/أخضر للقفزة الأمامية الطبيعية (لليسار)
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
      }
      ctx.stroke();

      // رسم رأس سهم صغير يوضح اتجاه الحركة
      this.drawArrowHead(ctx, p1.x, p1.y, p2.x, p2.y, isRegression ? '#ef4444' : '#0284c7');
    }

    // 2. رسم دوائر التثبيت (حجم الدائرة يتناسب مع مدة التثبيت)
    fixations.forEach((fix, index) => {
      // نصف القطر يتراوح بين 12 إلى 35 بكسل حسب مدة التثبيت
      const radius = Math.min(35, Math.max(12, Math.sqrt(fix.durationMs) * 1.15));

      // تعبئة الدائرة بشفافية
      ctx.setLineDash([]);
      ctx.fillStyle = fix.durationMs > 320 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(14, 165, 233, 0.45)';
      ctx.beginPath();
      ctx.arc(fix.x, fix.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // حدود الدائرة
      ctx.strokeStyle = fix.durationMs > 320 ? '#dc2626' : '#0369a1';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // كتابة رقم التثبيت المتسلسل
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Tajawal, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), fix.x, fix.y);
    });

    ctx.restore();
  }

  drawArrowHead(ctx, fromX, fromY, toX, toY, color) {
    const headLength = 9;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;

    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX - headLength * Math.cos(angle - Math.PI / 6), midY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(midX - headLength * Math.cos(angle + Math.PI / 6), midY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * رسم الخريطة الحرارية البصرية (Heatmap) لتحديد مواضع الإجهاد والتركيز
   */
  drawHeatmap(fixations) {
    this.clear();
    if (!fixations || fixations.length === 0) {
      this.drawEmptyNotice('⚠️ لا تتوفر إحداثيات نظر كافية لتوليد الخريطة الحرارية لهذه الجلسة');
      return;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    // رسم تراكم كثافة التثبيتات بتدرج شعاعي
    ctx.save();
    fixations.forEach(fix => {
      const radius = Math.min(65, Math.max(30, Math.sqrt(fix.durationMs) * 2.2));
      const intensity = Math.min(1.0, fix.durationMs / 500);

      const radGrad = ctx.createRadialGradient(fix.x, fix.y, 0, fix.x, fix.y, radius);
      radGrad.addColorStop(0, `rgba(0, 0, 0, ${0.7 * intensity})`);
      radGrad.addColorStop(0.5, `rgba(0, 0, 0, ${0.3 * intensity})`);
      radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(fix.x, fix.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // تلوين خريطة الكثافة بالألوان الحرارية (Cyan -> Yellow -> Red)
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        // تدرج لوني يعتمد على الشفافية المتراكمة
        const heat = alpha / 255;
        let r = 0, g = 0, b = 0;

        if (heat < 0.25) {
          // أزرق إلى سماوي
          r = 0;
          g = Math.floor(heat * 4 * 255);
          b = 255;
        } else if (heat < 0.6) {
          // سماوي إلى أخضر/أصفر
          r = Math.floor((heat - 0.25) * 2.85 * 255);
          g = 255;
          b = Math.floor(255 * (1 - (heat - 0.25) * 2.85));
        } else {
          // أصفر إلى أحمر حار
          r = 255;
          g = Math.floor(255 * (1 - (heat - 0.6) * 2.5));
          b = 0;
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = Math.floor(alpha * 0.72); // شفافية ناعمة لظهور النص خلف الخريطة
      }
    }

    ctx.putImageData(imgData, 0, 0);
    ctx.restore();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GazeVisualizer };
}
