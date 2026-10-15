/**
 * وحدة تمارين التدخل والتدريب العلاجي التفاعلي المبني على أنماط صعوبات القراءة المرصودة
 */

class ReadingInterventionModule {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentScore = 0;
  }

  renderMenu(recommendationPattern = 'dots') {
    this.container.innerHTML = `
      <div class="intervention-hub fade-in">
        <div class="intervention-header">
          <h2>🎯 تمارين التدخل والتدريب القرائي المخصص</h2>
          <p>ألعاب تفاعلية قصيرة مصممة لتقوية المسار البصري وتدريب عضلات العين على التتبع العربي السلس.</p>
        </div>

        <div class="games-grid">
          <div class="game-card ${recommendationPattern === 'dots' ? 'recommended' : ''}" onclick="window.interventionModule.startDotHunterGame()">
            ${recommendationPattern === 'dots' ? '<span class="badge-rec">⭐ موصى به لطفلك</span>' : ''}
            <div class="game-icon">🎯</div>
            <h3>لعبة صياد النقاط</h3>
            <p>تدريب مكثف للتمييز البصري بين الحروف المتشابهة رسمياً والمختلفة نقطاً (ب، ت، ث، ن، ي / ج، ح، خ).</p>
            <button class="btn btn-primary">ابدأ اللعبة</button>
          </div>

          <div class="game-card ${recommendationPattern === 'saccades' ? 'recommended' : ''}" onclick="window.interventionModule.startRhythmicSaccadeGame()">
            ${recommendationPattern === 'saccades' ? '<span class="badge-rec">⭐ موصى به لطفلك</span>' : ''}
            <div class="game-icon">🦅</div>
            <h3>قفزات الصقر الإيقاعية</h3>
            <p>تدريب العين على القفزات السلسة من اليمين إلى اليسار وتقليل الارتدادات العكسية المشتتة.</p>
            <button class="btn btn-primary">ابدأ اللعبة</button>
          </div>

          <div class="game-card ${recommendationPattern === 'tashkeel' ? 'recommended' : ''}" onclick="window.interventionModule.startTashkeelDecoderGame()">
            <div class="game-icon">✨</div>
            <h3>كاشف الحركات والتشكيل</h3>
            <p>تدريب سريع على فك التشفير الصوتي والبصري للفتحة والضمة والكسرة والتنوين.</p>
            <button class="btn btn-primary">ابدأ اللعبة</button>
          </div>
        </div>
      </div>
    `;
  }

  // لعبة 1: صياد النقاط
  startDotHunterGame() {
    const questions = [
      { prompt: 'اختر الحرف الذي يحتوي على **نقطتين في الأعلى**:', options: ['ت', 'ب', 'ث', 'ن'], correct: 'ت' },
      { prompt: 'أي من هذه الكلمات تبدأ بحرف **الثاء (ث)**؟', options: ['ثَعْلَبٌ', 'بَيْتٌ', 'تَمْرٌ', 'نَمْلَةٌ'], correct: 'ثَعْلَبٌ' },
      { prompt: 'أي كلمة تحتوي على حرف **الجيم (ج)** بنقطة في بطنه؟', options: ['جَمَلٌ', 'حِمَارٌ', 'خَرُوفٌ'], correct: 'جَمَلٌ' },
      { prompt: 'أين الكلمة التي تنتهي بحرف **الياء (ي)**؟', options: ['كِتَابِي', 'بَابٌ', 'شَجَرَةٌ'], correct: 'كِتَابِي' }
    ];

    let currentQ = 0;
    let score = 0;

    const renderQuestion = () => {
      if (currentQ >= questions.length) {
        this.renderCompletionScreen('صياد النقاط', score, questions.length);
        return;
      }

      const q = questions[currentQ];
      this.container.innerHTML = `
        <div class="game-play-area fade-in">
          <div class="game-top-bar">
            <span>🎯 لعبة صياد النقاط</span>
            <span>السؤال ${currentQ + 1} من ${questions.length}</span>
            <span>النقاط: ${score}</span>
          </div>

          <div class="game-challenge-card">
            <h3>${q.prompt}</h3>
            <div class="options-row">
              ${q.options.map(opt => `
                <button class="btn btn-option" onclick="window.interventionModule.handleAnswer('${opt}', '${q.correct}')">${opt}</button>
              `).join('')}
            </div>
            <div id="game-feedback" class="game-feedback"></div>
          </div>
        </div>
      `;
    };

    this.handleAnswer = (selected, correct) => {
      const feedback = document.getElementById('game-feedback');
      if (selected === correct) {
        score++;
        feedback.innerHTML = '<span class="text-success">🎉 ممتاز يا بطل! إجابة صحيحة!</span>';
      } else {
        feedback.innerHTML = `<span class="text-error">💡 حاول ثانية، الإجابة الصحيحة كانت (${correct})</span>`;
      }
      setTimeout(() => {
        currentQ++;
        renderQuestion();
      }, 1000);
    };

    renderQuestion();
  }

  // لعبة 2: قفزات الصقر الإيقاعية
  startRhythmicSaccadeGame() {
    const words = ['فِي', 'الصَّبَاحِ', 'الجَمِيلِ', 'يَطِيرُ', 'الصَّقْرُ', 'فَوْقَ', 'الجَبَلِ', 'العَالِي'];
    let currentIndex = 0;

    this.container.innerHTML = `
      <div class="game-play-area fade-in">
        <div class="game-top-bar">
          <span>🦅 قفزات الصقر الإيقاعية</span>
          <span>تتبع الصقر بعينيك وهو يقفز من كلمة لأخرى (من اليمين إلى اليسار)</span>
        </div>

        <div class="saccade-stage" id="saccade-stage">
          <div class="words-track">
            ${words.map((w, idx) => `
              <div class="track-word ${idx === 0 ? 'active' : ''}" id="tw_${idx}">${w}</div>
            `).join('')}
          </div>
          <div class="falcon-indicator" id="falcon-ind">🦅</div>
        </div>

        <div class="game-controls">
          <button class="btn btn-primary" id="btn-start-jump" onclick="window.interventionModule.runJumpingSequence()">ابدأ تمرين القفز</button>
        </div>
      </div>
    `;

    this.runJumpingSequence = () => {
      document.getElementById('btn-start-jump').style.display = 'none';
      currentIndex = 0;

      const interval = setInterval(() => {
        if (currentIndex >= words.length) {
          clearInterval(interval);
          this.renderCompletionScreen('قفزات الصقر الإيقاعية', words.length, words.length);
          return;
        }

        words.forEach((_, i) => {
          const el = document.getElementById(`tw_${i}`);
          if (el) el.classList.remove('active');
        });

        const activeEl = document.getElementById(`tw_${currentIndex}`);
        if (activeEl) {
          activeEl.classList.add('active');
          const falcon = document.getElementById('falcon-ind');
          if (falcon) {
            falcon.style.left = (activeEl.offsetLeft + activeEl.offsetWidth / 2 - 20) + 'px';
          }
        }

        currentIndex++;
      }, 700); // 700ms لكل قفزة
    };
  }

  // لعبة 3: كاشف التشكيل
  startTashkeelDecoderGame() {
    this.startDotHunterGame(); // مبدئياً لإتاحة التدريب السريع
  }

  renderCompletionScreen(gameName, score, total) {
    this.container.innerHTML = `
      <div class="game-completion-card fade-in">
        <div class="trophy-icon">🏆</div>
        <h2>أحسنت يا بطل القراءة!</h2>
        <p>لقد أتممت بنجاح تمرين <strong>${gameName}</strong></p>
        <div class="score-pill">النتيجة: ${score} من ${total}</div>
        <div class="actions">
          <button class="btn btn-primary" onclick="window.interventionModule.renderMenu()">العودة لقائمة التمارين</button>
        </div>
      </div>
    `;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReadingInterventionModule };
}
