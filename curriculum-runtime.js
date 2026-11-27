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
    const isReading = ["القراءة", "قراءتي"].includes(String(subject || "").trim());
    const isMath = ["الرياضيات", "رياضيات"].includes(String(subject || "").trim());
    if (!normalizeGrade(grade) || (!isReading && !isMath)) {
      return { title:subject, edition:null, units:[], lessons:[], supported:false };
    }
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
    const scripts = typeof lesson.teacherScript === "string" ? [lesson.teacherScript] :
      (Array.isArray(lesson.teacherScript) ? lesson.teacherScript.map(x => typeof x === "string" ? x : (x?.text || "")) : []);
    const explanations = typeof lesson.explanation === "string" ? [lesson.explanation] :
      (Array.isArray(lesson.explanation) ? lesson.explanation.map(x => typeof x === "string" ? x : (x?.text || "")) : []);
    return (scripts.filter(Boolean).length ? scripts : explanations).map(String).filter(Boolean);
  }
  function lessonExamples(lesson) {
    const rows = Array.isArray(lesson.examples) ? lesson.examples : (lesson.example ? [lesson.example] : []);
    return rows.map(item => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      return [item.story, item.word, item.equation, item.question, item.focus ? "نركز على: " + item.focus : "",
        item.answer !== undefined ? "الإجابة: " + item.answer : ""].filter(Boolean).join(" — ");
    }).filter(Boolean);
  }
  function questionList(lesson) {
    const quiz = Array.isArray(lesson.quiz) ? lesson.quiz : [];
    const activities = Array.isArray(lesson.activities) ? lesson.activities : [];
    const isAssessable = item => item && item.answer !== undefined &&
      (Array.isArray(item.choices) || Array.isArray(item.options) ||
       (item.type === "number_entry") ||
       (item.type === "sequence_order" && Array.isArray(item.items)));
    return [...activities, ...quiz].filter(isAssessable);
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
    answers.innerHTML = "";
    if (!q) {
      qTitle.textContent = "انتهت أسئلة هذا الدرس";
      answers.innerHTML = '<p class="muted">أحسنت! راجع الشرح والأمثلة، ثم أكمل الدرس.</p>';
      finish.disabled = false;
      finish.textContent = "إكمال الدرس ⭐";
      return;
    }
    qTitle.textContent = q.q || q.prompt || "أجب عن السؤال";
    feedback.textContent = "";
    finish.disabled = true;
    finish.textContent = "إكمال الدرس ⭐";
    const options = Array.isArray(q.choices) ? q.choices : (Array.isArray(q.options) ? q.options : []);
    const submit = (value, selectedButton) => {
      if (answered.has(questionIndex)) return;
      let correctAnswer = false;
      if (q.type === "sequence_order") {
        const expected = Array.isArray(q.answer) ? q.answer : [];
        correctAnswer = Array.isArray(value) && value.length === expected.length &&
          value.every((item, i) => normalizedAnswer(item) === normalizedAnswer(expected[i]));
      } else {
        correctAnswer = choiceMatches(value, q.answer);
      }
      answered.add(questionIndex);
      if (correctAnswer) {
        score++;
        feedback.textContent = q.feedbackCorrect || "إجابة صحيحة! أحسنت ⭐";
        feedback.style.color = "var(--g)";
        if (selectedButton) selectedButton.style.outline = "3px solid #43a77e";
      } else {
        feedback.textContent = q.feedbackTryAgain || "محاولة جيدة. راجع الشرح ثم حاول مرة أخرى في المراجعة.";
        feedback.style.color = "#a45a22";
        if (selectedButton) selectedButton.style.outline = "3px solid #e8b46d";
      }
      answers.querySelectorAll("button,input,select").forEach(el => el.disabled = true);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "alt";
      next.textContent = questionIndex < qs.length - 1 ? "السؤال التالي ←" : "عرض إكمال الدرس";
      next.addEventListener("click", () => { questionIndex++; renderQuestion(); });
      answers.appendChild(next);
    };
    if (q.type === "number_entry") {
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "اكتب إجابتك");
      input.placeholder = "اكتب الإجابة هنا";
      input.style.maxWidth = "260px";
      const check = document.createElement("button");
      check.type = "button"; check.textContent = "تحقق من الإجابة";
      check.addEventListener("click", () => submit(input.value));
      input.addEventListener("keydown", event => { if (event.key === "Enter") check.click(); });
      answers.append(input, check);
    } else if (q.type === "sequence_order") {
      const items = Array.isArray(q.items) ? q.items : [];
      const selects = [];
      const pool = document.createElement("div");
      pool.className = "muted";
      pool.textContent = "اختر العناصر بالترتيب الصحيح:";
      answers.appendChild(pool);
      items.forEach((_, index) => {
        const select = document.createElement("select");
        select.setAttribute("aria-label", "الموقع " + (index + 1));
        select.innerHTML = '<option value="">الاختيار ' + (index + 1) + '</option>' +
          items.map(item => '<option value="' + escHtml(item) + '">' + escHtml(item) + '</option>').join("");
        selects.push(select); answers.appendChild(select);
      });
      const check = document.createElement("button");
      check.type = "button"; check.textContent = "تحقق من الترتيب";
      check.addEventListener("click", () => {
        const values = selects.map(select => select.value);
        if (values.some(value => !value)) { feedback.textContent = "أكمل جميع المواقع أولاً."; return; }
        submit(values);
      });
      answers.appendChild(check);
    } else if (options.length) {
      options.forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "alt";
        button.textContent = displayChoice(choice);
        button.addEventListener("click", () => submit(choice, button));
        answers.appendChild(button);
      });
    } else {
      answers.innerHTML = '<p class="muted">هذا النشاط يحتاج تفاعلاً خاصاً، لذلك لن نقيّمه آلياً في هذه النسخة.</p>';
      finish.disabled = false;
    }
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
    const examples = lessonExamples(lesson);
    let content = desc;
    if (explanation.length) content += (content ? "\n\n" : "") + explanation.join("\n");
    if (examples.length) content += (content ? "\n\n" : "") + "أمثلة:\n" + examples.join("\n");
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
  let subjectRequestId = 0;
  window.openSubject = async function(subject) {
    if (!active) return;
    const requestedChildId = active.id;
    const requestId = ++subjectRequestId;
    const area = document.getElementById("studentArea");
    document.getElementById("curriculumLoading")?.remove();
    area.insertAdjacentHTML("beforeend", '<p id="curriculumLoading" class="muted">جارٍ تحميل دروس المنهج…</p>');
    try {
      const data = await loadSubject(subject, active.grade);
      if (requestId !== subjectRequestId || !active || active.id !== requestedChildId) return;
      document.getElementById("curriculumLoading")?.remove();
      if (!data.supported || !data.lessons.length) {
        area.insertAdjacentHTML("beforeend", '<div class="notice">لم يتم إعداد ملف دروس موثّق لهذه المادة والصف بعد. لن نعرض أسئلة مؤلفة على أنها من الكتاب.</div>');
        return;
      }
      const listId = "subjectLessons";
      document.getElementById(listId)?.remove();
      const done = new Set(JSON.parse(localStorage.getItem("madrastiCompletedLessonsV1") || "{}")[active.id] || []);
      const dailyCount = Math.max(1, Math.min(10, Number(active.dailyCount) || 1));
      const dailyPlan = data.lessons.map((lesson, index) => ({ lesson, index }))
        .filter(item => !done.has(item.lesson.id)).slice(0, dailyCount);
      const dailyMarkup = dailyPlan.length
        ? '<h3>⭐ خطة اليوم</h3><p class="muted">اختر حتى ' + dailyCount + ' دروس جديدة لهذا اليوم. يمكنك متابعة بقية الدروس متى شئت.</p><div class="cards">' +
          dailyPlan.map(item => '<article class="card"><div class="tag">خطة اليوم · ' + escHtml(item.lesson._unitTitle) + '</div><h3>' + escHtml(item.lesson.title) + '</h3><p class="muted">' + escHtml(item.lesson.objective || "") + '</p><button type="button" class="alt" data-daily-lesson="' + item.index + '">ابدأ درس اليوم</button></article>').join("") + '</div>'
        : '<div class="notice">أكملت جميع دروس هذه المادة المتاحة حالياً. يمكنك إعادة أي درس من القائمة أدناه.</div>';
      const wrap = document.createElement("section");
      wrap.id = listId;
      wrap.className = "panel";
      wrap.innerHTML = '<h3>' + escHtml(subject) + ' · ' + escHtml(data.edition) + '</h3><p class="muted">الدروس مرتبة حسب فهرس الكتاب. عدد الدروس المتاحة: ' + data.lessons.length + ' · المكتمل: ' + data.lessons.filter(lesson => done.has(lesson.id)).length + '</p>' +
        dailyMarkup + '<hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><h3>📚 جميع دروس المادة</h3><div class="cards">' +
        data.lessons.map((lesson, i) => '<article class="card"><div class="tag">' + escHtml(lesson._unitTitle) + '</div><h3>' + escHtml(lesson.title) + '</h3><p class="muted">' + escHtml(lesson.objective || "") + '</p><div class="progressrow"><span>' + escHtml(pagesLabel(lesson._pages)) + '</span><strong>' + (done.has(lesson.id) ? "مكتمل ✓" : "درس " + (i+1)) + '</strong></div><button type="button" class="alt" data-lesson="' + i + '">' + (done.has(lesson.id) ? "إعادة الدرس" : "ابدأ الدرس") + '</button></article>').join("") + '</div>';
      area.appendChild(wrap);
      wrap.querySelectorAll("[data-lesson]").forEach(button => button.addEventListener("click", () => openLesson(data.lessons[Number(button.dataset.lesson)])));
      wrap.querySelectorAll("[data-daily-lesson]").forEach(button => button.addEventListener("click", () => openLesson(data.lessons[Number(button.dataset.dailyLesson)])));
      wrap.scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) {
      if (requestId !== subjectRequestId || !active || active.id !== requestedChildId) return;
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
    parts.push(...lessonExamples(current));
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
