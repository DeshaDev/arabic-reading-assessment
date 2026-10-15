/* GitHub Pages adapter: local-only demo storage. Real server deployments are untouched. */
(function () {
  'use strict';
  const host = String(window.location.hostname || '').toLowerCase();
  const isPagesHost = host.endsWith('.github.io');
  const forceDemo = new URLSearchParams(window.location.search).get('demo') === '1';
  if (!isPagesHost && !forceDemo) return;

  window.NEBRAS_DEMO_MODE = true;
  const STUDENTS_KEY = 'nebras-arabic-reading-assessment-pages-demo-v1:students';
  const SESSIONS_KEY = 'nebras-arabic-reading-assessment-pages-demo-v1:sessions';
  const memoryStore = {};
  const originalFetch = window.fetch.bind(window);

  function storageGet(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : fallback;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      memoryStore[key] = value;
    }
  }

  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function demoStudent() {
    return {
      id: 'pages-demo-student-1',
      name: 'طالب تجريبي',
      grade: 1,
      classroom: 'صف تجريبي',
      age: 7,
      gender: 'غير محدد',
      notes: 'سجل تجريبي افتراضي — ليس طفلًا حقيقيًا.',
      createdAt: new Date().toISOString(),
      lastAssessment: null,
      avgWpm: null,
      riskLevel: 'none'
    };
  }

  function getStudents() {
    const students = storageGet(STUDENTS_KEY, null);
    if (Array.isArray(students)) return students;
    const initial = [demoStudent()];
    storageSet(STUDENTS_KEY, initial);
    return initial;
  }

  function getSessions() {
    const sessions = storageGet(SESSIONS_KEY, []);
    return Array.isArray(sessions) ? sessions : [];
  }

  function stats() {
    const students = getStudents();
    const sessions = getSessions();
    const withWpm = sessions.filter(s => Number.isFinite(Number(s.wpm)) && Number(s.wpm) > 0);
    return {
      totalStudents: students.length,
      studentsWithSessions: new Set(sessions.map(s => s.studentId).filter(Boolean)).size,
      totalSessions: sessions.length,
      sessionsMissingGaze: sessions.filter(s => s.hasValidGaze !== true).length,
      avgWpm: withWpm.length ? Math.round(withWpm.reduce((sum, s) => sum + Number(s.wpm), 0) / withWpm.length) : null
    };
  }

  function jsonResponse(value, status) {
    return new Response(JSON.stringify(value), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  function bodyJson(init) {
    try {
      if (!init || typeof init.body !== 'string') return {};
      return JSON.parse(init.body);
    } catch (_) {
      return {};
    }
  }

  function apiResponse(apiPath, method, body) {
    if (apiPath === '/api/health' && method === 'GET') {
      return jsonResponse({
        status: 'ok',
        service: 'Nebras GitHub Pages demo',
        mode: 'github-pages-demo',
        version: 'pages-demo-1.0',
        automaticSpeechAnalysisEnabled: false,
        notice: 'Static demo mode: API-shaped actions use browser-local storage only.'
      });
    }

    if (apiPath === '/api/students' && method === 'GET') return jsonResponse(getStudents());
    if (apiPath === '/api/sessions' && method === 'GET') {
      return jsonResponse(getSessions().slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
    }
    if (apiPath === '/api/stats' && method === 'GET') return jsonResponse(stats());

    if (apiPath === '/api/students' && method === 'POST') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const classroom = typeof body.classroom === 'string' ? body.classroom.trim() : '';
      const grade = Number(body.grade);
      const age = Number(body.age);
      if (!name || name.length > 100) return jsonResponse({ error: 'اسم الطالب مطلوب ويجب ألا يتجاوز 100 حرف.' }, 400);
      if (!Number.isInteger(grade) || grade < 1 || grade > 6) return jsonResponse({ error: 'الصف يجب أن يكون بين 1 و6.' }, 400);
      if (!classroom || classroom.length > 40) return jsonResponse({ error: 'الفصل مطلوب ويجب ألا يتجاوز 40 حرفًا.' }, 400);
      if (!Number.isFinite(age) || age < 5 || age > 15) return jsonResponse({ error: 'العمر يجب أن يكون بين 5 و15 سنة.' }, 400);
      const students = getStudents();
      const student = {
        id: makeId('pages-demo-student'),
        name: name,
        classroom: classroom,
        grade: grade,
        age: age,
        gender: typeof body.gender === 'string' ? body.gender.slice(0, 40) : 'غير محدد',
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 1000) : '',
        createdAt: new Date().toISOString(),
        lastAssessment: null,
        avgWpm: null,
        riskLevel: 'none'
      };
      students.push(student);
      storageSet(STUDENTS_KEY, students);
      return jsonResponse(student, 201);
    }

    if (apiPath === '/api/sessions' && method === 'POST') {
      const students = getStudents();
      const student = students.find(s => s.id === body.studentId);
      if (!student) return jsonResponse({ error: 'لم يُعثر على سجل الطالب في بيانات هذا المتصفح.' }, 400);
      const session = Object.assign({}, body, {
        id: makeId('pages-demo-session'),
        date: typeof body.date === 'string' ? body.date : new Date().toISOString(),
        studentName: student.name,
        grade: student.grade,
        hasValidGaze: body.hasValidGaze === true,
        riskLevel: 'none',
        mode: 'github-pages-demo'
      });
      const sessions = getSessions();
      sessions.unshift(session);
      storageSet(SESSIONS_KEY, sessions);
      student.lastAssessment = session.date.slice(0, 10);
      student.avgWpm = Number.isFinite(Number(session.wpm)) ? session.wpm : null;
      storageSet(STUDENTS_KEY, students);
      return jsonResponse(session, 201);
    }

    if (/^\/api\/sessions\/[^/]+\/reading-analysis$/.test(apiPath) && method === 'PATCH') {
      return jsonResponse({ error: 'حفظ تحليل الصوت غير متاح على GitHub Pages؛ استخدم الخادم المحلي مع مفتاح API.' }, 503);
    }

    if (apiPath === '/api/analyze-reading' && method === 'POST') {
      return jsonResponse({
        error: 'التحليل الصوتي الآلي غير متاح في GitHub Pages لأنه يحتاج خادمًا خاصًا يحتفظ بمفتاح API. جرّب الواجهة وبقية التقييمات هنا، وشغّل الخادم المحلي لتجربة تفريغ الصوت.'
      }, 503);
    }

    return jsonResponse({ error: 'المسار غير مدعوم في وضع Pages التجريبي: ' + apiPath }, 404);
  }

  window.fetch = async function (input, init) {
    let url;
    try {
      url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch (_) {
      return originalFetch(input, init);
    }
    const match = url.pathname.match(/(?:^|\/)api\/(.+)$/);
    if (!match) return originalFetch(input, init);
    const apiPath = '/api/' + match[1];
    const method = String((init && init.method) || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = bodyJson(init);
    // Avoid buffering or forwarding any recording in Pages mode.
    if (apiPath === '/api/analyze-reading') {
      return apiResponse(apiPath, method, {});
    }
    return apiResponse(apiPath, method, body);
  };

  window.NEBRAS_PAGES_DEMO = {
    reset: function () {
      try {
        window.localStorage.removeItem(STUDENTS_KEY);
        window.localStorage.removeItem(SESSIONS_KEY);
      } catch (_) {
        delete memoryStore[STUDENTS_KEY];
        delete memoryStore[SESSIONS_KEY];
      }
      window.location.reload();
    }
  };

  function insertDemoNotice() {
    const main = document.querySelector('.main-content');
    const content = document.getElementById('main-view-container');
    if (!main || !content || document.getElementById('pages-demo-notice')) return;
    const notice = document.createElement('section');
    notice.id = 'pages-demo-notice';
    notice.className = 'pages-demo-notice';
    notice.setAttribute('role', 'note');
    notice.innerHTML =
      '<div class="pages-demo-notice-copy"><strong>نسخة GitHub Pages للتجربة فقط</strong>' +
      '<span>تُحفظ السجلات في هذا المتصفح فقط. لا تدخل أسماء أو بيانات أطفال حقيقيين. تحليل الصوت الآلي يحتاج خادم API منفصلًا.</span></div>' +
      '<button type="button" class="pages-demo-reset" onclick="window.NEBRAS_PAGES_DEMO.reset()">مسح بيانات التجربة</button>';
    main.insertBefore(notice, content);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertDemoNotice, { once: true });
  } else {
    insertDemoNotice();
  }
})();
