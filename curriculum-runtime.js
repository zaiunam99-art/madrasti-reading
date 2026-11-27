/* Madrasti curriculum runtime — free, static-first, no paid API dependency. */
(() => {
  "use strict";
  const ROOT = "/curriculum/grade-1";
  const cache = new Map();
  const escHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const normalizeGrade = value => /الأول|اول|1/.test(String(value || "")) ? "grade-1" : null;
  async function getJson(path) {
    if (cache.has(path)) return cache.get(path);
    const promise = fetch(path, { headers: { "Accept":"application/json" } })
      .then(response => {
        if (!response.ok) throw new Error("تعذر تحميل " + path + " (" + response.status + ")");
        return response.json();
      });
    cache.set(path, promise);
    try { return await promise; } catch (error) { cache.delete(path); throw error; }
  }
  async function loadSubject(subject, grade) {
    if (!normalizeGrade(grade)) return { title:subject, edition:null, units:[], lessons:[], supported:false };
    const isReading = subject === "القراءة" || subject === "قراءتي";
    const base = isReading ? ROOT + "/reading-2025-2026/" : ROOT + "/math-2025-2026/";
    const indexPath = base + (isReading ? "units-index.json" : "chapters-index.json");
    const index = await getJson(indexPath);
    const units = isReading ? index.units : index.chapters;
    const allLessons = [];
    for (const unit of units || []) {
      const files = isReading ? [unit.lessonFile] : (unit.lessonFiles || []);
      for (const file of files.filter(Boolean)) {
        const data = await getJson(base + file);
        const rows = data.lessons || data.sequence || [];
        for (const row of rows) {
          allLessons.push({
            ...row,
            _subject: subject,
            _unitTitle: unit.title || data.unit || data.chapter || "",
            _unitSequence: unit.sequence ?? unit.number ?? 0,
            _edition: data.edition || index.edition || "2025-2026",
            _pages: row.bookPages || row.pages || null,
            _source: file
          });
        }
        const review = data.chapterReview || data.unitReview || data.review;
        const reviewQuestions = review?.assessment || review?.questions || (Array.isArray(review) ? review : []);
        if (Array.isArray(reviewQuestions) && reviewQuestions.length) {
          allLessons.push({
            id: "review-" + (isReading ? "read" : "math") + "-" + (unit.sequence ?? unit.number ?? 0),
            order: 999,
            title: review.title || ("مراجعة " + (unit.title || data.chapter || data.unit || "")),
            objective: "راجع المهارات التي تعلمتها في هذه الوحدة.",
            explanation: ["أجب عن أسئلة المراجعة بهدوء.", "إذا أخطأت، ارجع إلى الدرس المرتبط بالمهارة ثم حاول مرة أخرى."],
            quiz: reviewQuestions,
            _subject: subject,
            _unitTitle: "مراجعة " + (unit.title || data.chapter || data.unit || ""),
            _unitSequence: unit.sequence ?? unit.number ?? 0,
            _edition: data.edition || index.edition || "2025-2026",
            _pages: review.bookPages || review.pages || unit.bookPages || unit.pdfPages || null,
            _source: file,
            _isReview: true
          });
        }
      }
    }
    allLessons.sort((a,b) => (a._unitSequence-b._unitSequence) || ((a.order||0)-(b.order||0)));
    return { title:subject, edition:index.schoolYearLabel || index.edition || "2025-2026", units, lessons:allLessons, supported:true };
  }
  function lessonBody(lesson) {
    const scripts = Array.isArray(lesson.teacherScript) ? lesson.teacherScript.map(x => x.text || "").filter(Boolean) : [];
    const explanations = Array.isArray(lesson.explanation) ? lesson.explanation : [];
    const blocks = scripts.length ? scripts : explanations;
    return blocks.map(x => String(x)).filter(Boolean);
  }
  function questionList(lesson) {
    const quiz = Array.isArray(lesson.quiz) ? lesson.quiz : [];
    const activities = Array.isArray(lesson.activities) ? lesson.activities : [];
    return [
      ...activities.filter(x => Array.isArray(x.choices) && x.answer !== undefined && !Array.isArray(x.answer)),
      ...quiz.filter(x => Array.isArray(x.choices) && x.answer !== undefined && !Array.isArray(x.answer))
    ];
  }
  function answerLabel(choice) {
    if (choice && typeof choice === "object") return choice.label ?? choice.value ?? choice.quantity ?? JSON.stringify(choice);
    return String(choice);
  }
  function normalizedAnswer(value) { return String(value ?? "").replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit)).replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).trim(); }
  function choiceMatches(choice, answer) {
    const values = choice && typeof choice === "object"
      ? [choice.label, choice.value, choice.quantity, choice.id].filter(value => value !== undefined)
      : [choice];
    if (Array.isArray(answer)) return answer.some(item => values.some(value => normalizedAnswer(value) === normalizedAnswer(item)));
    return values.some(value => normalizedAnswer(value) === normalizedAnswer(answer));
  }
  function displayChoice(choice) {
    if (choice && typeof choice === "object") return choice.label ?? choice.value ?? choice.quantity ?? "خيار";
    return String(choice);
  }
  function pagesLabel(pages) {
    if (!Array.isArray(pages) || !pages.length) return "";
    return "صفحات الكتاب: " + (pages.length > 1 ? pages[0] + "–" + pages[1] : pages[0]);
  }
  function makeTeacher() {
    let el = document.getElementById("teacherAvatar");
    if (el) return el;
    const box = document.querySelector("#lessonView .lessonbox");
    if (!box) return null;
    el = document.createElement("div");
    el.id = "teacherAvatar";
    el.className = "teacher";
    el.innerHTML = '<div class="teacher-face" aria-hidden="true"><span class="teacher-eyes">●　●</span><span class="teacher-mouth">●</span></div><div><strong id="teacherName">المعلّم الصغير</strong><div class="muted" id="teacherMood">أنا هنا لأساعدك على التعلّم 🌟</div></div>';
    box.insertBefore(el, box.firstChild);
    return el;
  }
  function setTeacherSpeaking(on) {
    const el = makeTeacher();
    if (el) el.classList.toggle("speaking", Boolean(on));
  }
  let current = null, questionIndex = 0, score = 0, answered = new Set(), utterance = null;
  function renderQuestion() {
    const lesson = current;
    const qs = questionList(lesson);
    const q = qs[questionIndex];
    const qTitle = document.getElementById("questionText");
    const answers = document.getElementById("answers");
    const feedback = document.getElementById("feedback");
    const finish = document.getElementById("finishLesson");
    if (!q) {
      qTitle.textContent = "انتهت أسئلة هذا الدرس";
      answers.innerHTML = '<p class="muted">أحسنت! راجع الشرح والأمثلة، ثم أكمل الدرس.</p>';
      finish.disabled = false;
      finish.textContent = "إكمال الدرس ⭐";
      return;
    }
    qTitle.textContent = q.q || q.prompt || "اختر الإجابة المناسبة";
    answers.innerHTML = q.choices.map((choice, i) =>
      '<button type="button" class="alt" data-choice="' + i + '">' + escHtml(displayChoice(choice)) + '</button>'
    ).join("");
    answers.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        if (answered.has(questionIndex)) return;
        const selected = q.choices[Number(button.dataset.choice)];
        const expected = q.answer;
        const correctAnswer = choiceMatches(selected, expected);
        answered.add(questionIndex);
        if (correctAnswer) {
          score++;
          feedback.textContent = q.feedbackCorrect || "إجابة صحيحة! أحسنت ⭐";
          feedback.style.color = "var(--g)";
          button.style.outline = "3px solid #43a77e";
        } else {
          feedback.textContent = q.feedbackTryAgain || "محاولة جيدة. استمع إلى الشرح وحاول مرة أخرى في المراجعة.";
          feedback.style.color = "#a45a22";
          button.style.outline = "3px solid #e8b46d";
        }
        answers.querySelectorAll("button").forEach(b => b.disabled = true);
        const next = document.createElement("button");
        next.className = "alt";
        next.textContent = questionIndex < qs.length - 1 ? "السؤال التالي ←" : "عرض إكمال الدرس";
        next.addEventListener("click", () => { questionIndex++; renderQuestion(); });
        answers.appendChild(next);
        finish.disabled = questionIndex < qs.length - 1;
      });
    });
    feedback.textContent = "";
    finish.disabled = true;
    finish.textContent = "إكمال الدرس ⭐";
  }
  function openLesson(lesson) {
    current = lesson; activeLesson = lesson;
    questionIndex = 0; score = 0; answered = new Set();
    const title = lesson.title || "درس جديد";
    document.getElementById("lessonHeading").textContent = lesson._unitTitle || "درس تفاعلي";
    document.getElementById("lessonMeta").textContent =
      (active?.name || "الطالب") + " · " + (lesson._edition || "2025-2026") +
      (lesson._pages ? " · " + pagesLabel(lesson._pages) : "");
    document.getElementById("lessonSymbol").textContent = lesson.letter || lesson.symbol || "📚";
    document.getElementById("lessonName").textContent = title;
    const desc = lesson.objective || lesson.desc || "";
    const explanation = lessonBody(lesson);
    const example = lesson.example;
    let content = desc;
    if (explanation.length) content += (content ? "\n\n" : "") + explanation.join("\n");
    if (example) {
      const ex = typeof example === "string" ? example : [example.story, example.equation, example.answer !== undefined ? "الإجابة: " + example.answer : ""].filter(Boolean).join("\n");
      content += (content ? "\n\n" : "") + "مثال:\n" + ex;
    }
    document.getElementById("lessonDesc").textContent = content || "استمع إلى الشرح، ثم أجب عن السؤال.";
    const teacherName = document.getElementById("teacherName");
    const teacherMood = document.getElementById("teacherMood");
    if (teacherName) teacherName.textContent = active?.name ? "مرحباً " + active.name + "!" : "المعلّم الصغير";
    const teacher = makeTeacher();
    if (teacher) teacher.classList.toggle("gender-girl", active?.gender === "girl"), teacher.classList.toggle("gender-boy", active?.gender === "boy");
    if (teacherMood) teacherMood.textContent = "هيا نتعلم معاً 🌟";
    document.getElementById("childView").classList.add("hidden");
    document.getElementById("lessonView").classList.remove("hidden");
    renderQuestion();
  }
  window.MadrastiCurriculum = { loadSubject, lessonBody, questionList };
  window.openSubject = async function(subject) {
    if (!active) return;
    const area = document.getElementById("studentArea");
    area.insertAdjacentHTML("beforeend", '<p id="curriculumLoading" class="muted">جارٍ تحميل دروس المنهج…</p>');
    try {
      const data = await loadSubject(subject, active.grade);
      document.getElementById("curriculumLoading")?.remove();
      if (!data.supported || !data.lessons.length) {
        area.insertAdjacentHTML("beforeend", '<div class="notice">لم يتم إعداد ملف دروس موثّق لهذه المادة والصف بعد. لن نعرض أسئلة مؤلفة على أنها من الكتاب.</div>');
        return;
      }
      const listId = "subjectLessons";
      document.getElementById(listId)?.remove();
      const done = new Set(JSON.parse(localStorage.getItem("madrastiCompletedLessonsV1") || "{}")[active.id] || []);
      const wrap = document.createElement("section");
      wrap.id = listId;
      wrap.className = "panel";
      wrap.innerHTML = '<h3>' + escHtml(subject) + ' · ' + escHtml(data.edition) + '</h3><p class="muted">الدروس مرتبة حسب فهرس الكتاب. عدد الدروس المتاحة: ' + data.lessons.length + '</p><div class="cards">' +
        data.lessons.map((lesson, i) => '<article class="card"><div class="tag">' + escHtml(lesson._unitTitle) + '</div><h3>' + escHtml(lesson.title) + '</h3><p class="muted">' + escHtml(lesson.objective || "") + '</p><div class="progressrow"><span>' + escHtml(pagesLabel(lesson._pages)) + '</span><strong>' + (done.has(lesson.id) ? "مكتمل ✓" : "درس " + (i+1)) + '</strong></div><button type="button" class="alt" data-lesson="' + i + '">' + (done.has(lesson.id) ? "إعادة الدرس" : "ابدأ الدرس") + '</button></article>').join("") + '</div>';
      area.appendChild(wrap);
      wrap.querySelectorAll("[data-lesson]").forEach(button => button.addEventListener("click", () => openLesson(data.lessons[Number(button.dataset.lesson)])));
      wrap.scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) {
      document.getElementById("curriculumLoading")?.remove();
      area.insertAdjacentHTML("beforeend", '<div class="notice">تعذر تحميل المنهج الآن. تحقق من اتصال الإنترنت ثم أعد المحاولة. (' + escHtml(error.message) + ')</div>');
    }
  };
  window.selectChild = function(id) {
    active = family.find(child => child.id === id) || null;
    const area = document.getElementById("studentArea");
    area.classList.toggle("hidden", !active);
    document.getElementById("noStudent").classList.toggle("hidden", !!active || (family || []).length > 0);
    if (!active) return;
    area.innerHTML = '<div class="child" style="margin:16px 0"><div class="avatar">' + escHtml(active.avatar || "🧒") + '</div><div><h2>مرحباً ' + escHtml(active.name || "بطل التعلّم") + ' 🌟</h2><div class="muted">' + escHtml(active.grade) + '</div></div></div><h3>موادي</h3><div class="cards">' +
      (active.subjects || []).map(subject => '<div class="card subject"><span>' + escHtml(subject) + '</span><button class="alt" data-subject="' + escHtml(subject) + '">افتح الدروس</button></div>').join("") + '</div><p class="muted">خطة التعلّم: ' + Number(active.dailyCount || 1) + ' درس يومياً لكل مادة.</p>';
    area.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => window.openSubject(button.dataset.subject)));
  };
  window.answer = function() {};
  window.finishLesson = function() {
    if (!current || !active) return;
    const qs = questionList(current);
    if (qs.length && questionIndex < qs.length) return;
    const all = JSON.parse(localStorage.getItem("madrastiCompletedLessonsV1") || "{}");
    const childId = active.id;
    all[childId] = Array.from(new Set([...(all[childId] || []), current.id]));
    localStorage.setItem("madrastiCompletedLessonsV1", JSON.stringify(all));
    active.completed = (active.completed || 0) + 1;
    if (typeof save === "function") save();
    document.getElementById("lessonView").classList.add("hidden");
    document.getElementById("childView").classList.remove("hidden");
    window.selectChild(childId);
    const note = document.createElement("p");
    note.className = "notice";
    note.textContent = "أحسنت! تم حفظ تقدمك على هذا الجهاز.";
    document.getElementById("studentArea").prepend(note);
  };
  window.stopLessonAudio = function() { if ("speechSynthesis" in window) speechSynthesis.cancel(); setTeacherSpeaking(false); };
  window.playLesson = function() {
    if (!current) return;
    if (active?.voice === "none") { document.getElementById("feedback").textContent = "الصوت مكتوم حسب إعدادات ولي الأمر. يمكنك قراءة الشرح."; return; }
    if (!("speechSynthesis" in window)) {
      document.getElementById("feedback").textContent = "الصوت غير متاح في هذا المتصفح. يمكنك قراءة الشرح المعروض.";
      return;
    }
    speechSynthesis.cancel();
    const parts = [current.title, ...lessonBody(current)];
    if (current.objective) parts.push(current.objective);
    if (current.example) parts.push(typeof current.example === "string" ? current.example : [current.example.story,current.example.equation].filter(Boolean).join(". "));
    utterance = new SpeechSynthesisUtterance(parts.filter(Boolean).join(". "));
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /^ar-IQ/i.test(voice.lang)) || voices.find(voice => /^ar-SA/i.test(voice.lang)) || voices.find(voice => /^ar/i.test(voice.lang)) || null;
    utterance.lang = utterance.voice?.lang || "ar-IQ";
    utterance.rate = active?.voice === "slow" ? 0.72 : 0.88;
    utterance.onstart = () => setTeacherSpeaking(true);
    utterance.onend = utterance.onerror = () => setTeacherSpeaking(false);
    speechSynthesis.speak(utterance);
  };
  window.addEventListener("beforeunload", () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); });
  document.addEventListener("DOMContentLoaded", makeTeacher);
  const style = document.createElement("style");
  style.textContent = ".teacher{display:flex;align-items:center;gap:14px;padding:12px;background:#fff8e8;border:1px solid #f3dfb4;border-radius:18px;margin-bottom:16px}.teacher-face{width:68px;height:68px;border-radius:50%;background:#ffd58c;border:4px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 0 #d7ad67;flex:none}.teacher-eyes{font-size:13px;color:#563c2c}.teacher-mouth{font-size:13px;color:#9d4b38;line-height:1}.teacher.gender-girl .teacher-face{background:#ffd7e5}.teacher.gender-boy .teacher-face{background:#c9e7ff}.teacher.speaking .teacher-mouth{animation:talk .22s infinite alternate}@keyframes talk{from{transform:scaleY(.4)}to{transform:scaleY(1.5)}}.lessonbox #lessonDesc{white-space:pre-line;line-height:2}";
  document.head.appendChild(style);
})();
