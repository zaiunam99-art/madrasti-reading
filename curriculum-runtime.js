/* Madrasti curriculum runtime — free, static-first, no paid API dependency. */
(() => {
  "use strict";
  const ROOT = "/curriculum/grade-1";
  const cache = new Map();
  function readCompletedMap() {
    try {
      const raw = localStorage.getItem("madrastiStudentProgressV1");
      if (!raw) return {};
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        console.warn("بنية سجل التقدم المحلي غير صالحة؛ تم تعطيل الكتابة لحماية البيانات.");
        return null;
      }
      return value;
    } catch (error) {
      console.warn("تعذر قراءة سجل التقدم المحلي؛ تم تعطيل الكتابة لحماية البيانات:", error);
      return null;
    }
  }
  function completedLessonIds(progress, childId) {
    const ids = progress && typeof progress === "object" && !Array.isArray(progress)
      ? progress[childId] : null;
    return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : [];
  }
  function appendCompletedLesson(progress, childId, lessonId) {
    const previous = completedLessonIds(progress, childId);
    return {
      map: { ...(progress && typeof progress === "object" && !Array.isArray(progress) ? progress : {}),
        [childId]: Array.from(new Set([...previous, lessonId])) },
      alreadyCompleted: previous.includes(lessonId)
    };
  }
  const escHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const normalizeGrade = value => {
    const grade = String(value ?? "").trim()
      .replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
      .replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");
    return /^(?:(?:الصف)\s*)?(?:الأول|الاول|اول|1)(?:\s*(?:الابتدائي|ابتدائي))?$/.test(grade)
      ? "grade-1" : null;
  };
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
  function isAlternatingPattern(pattern, minimumItems = 6) {
    return Array.isArray(pattern) && Number.isInteger(minimumItems) &&
      minimumItems >= 4 && pattern.length >= minimumItems &&
      pattern[0] !== pattern[1] &&
      pattern.every((color, index) => color === pattern[index % 2]);
  }
  function questionList(lesson) {
    const quiz = Array.isArray(lesson?.quiz) ? lesson.quiz : [];
    const activities = Array.isArray(lesson?.activities) ? lesson.activities : [];
    return [...activities, ...quiz].filter(item => item && typeof item === "object" && !Array.isArray(item));
  }
  function masteryRequirement(lesson) {
    const questions = questionList(lesson);
    const evaluableCount = questions.filter(item =>
      Object.prototype.hasOwnProperty.call(item, "answer") && item.answer !== undefined && item.answer !== null
    ).length;
    const mastery = lesson?.mastery && typeof lesson.mastery === "object" ? lesson.mastery : {};
    const configuredRequired = mastery.requiredCorrect;
    const configuredChecks = mastery.totalChecks;
    const requiredCorrect = Number.isInteger(configuredRequired) && configuredRequired >= 0
      ? configuredRequired : (configuredRequired === undefined ? evaluableCount : -1);
    const totalChecks = Number.isInteger(configuredChecks) && configuredChecks >= 0
      ? configuredChecks : (configuredChecks === undefined ? requiredCorrect : -1);
    return { requiredCorrect, totalChecks, evaluableCount,
      valid: evaluableCount > 0 && requiredCorrect >= 0 && totalChecks >= 1 && requiredCorrect <= totalChecks && totalChecks <= evaluableCount };
  }
  function questionPrompt(item) {
    const explicit = item.q || item.prompt || item.question || item.instruction || item.task;
    if (explicit) return String(explicit);
    const value = key => item[key] === undefined || item[key] === null ? "" : String(item[key]);
    switch (item.type) {
      case "make_number": return "كوّن العدد " + value("target") + " بطرق مختلفة، ثم اذكر عمليات الجمع المناسبة.";
      case "remove_objects": return "ابدأ بالعدد " + value("start") + "، ثم أزل " + value("remove") + " أشياء. كم يتبقى؟";
      case "count_back": return "ابدأ من " + value("start") + " وعدّ إلى الخلف " + value("steps") + " خطوات. إلى أي عدد تصل؟";
      case "count_forward": return "ابدأ من " + value("start") + " وعدّ إلى الأمام " + value("steps") + " خطوات.";
      case "number_line_add": return "ابدأ من " + value("start") + " على خط الأعداد، وتقدّم " + value("steps") + " خطوات. ما العدد الذي تصل إليه؟";
      case "number_line_subtract": return "ابدأ من " + value("start") + " على خط الأعداد، وارجع " + value("steps") + " خطوات. ما العدد الذي تصل إليه؟";
      case "fact_family": return "استخدم الأعداد " + (Array.isArray(item.numbers) ? item.numbers.join("، ") : "") + " لتكوين حقائق الجمع والطرح المترابطة.";
      case "double_plus_minus_one": return "للعدد " + value("n") + "، أوجد العدد الأقل بواحد، والضعف، والعدد الأكبر بواحد.";
      case "make_ten_add": return "أوجد ناتج " + value("a") + " + " + value("b") + " باستعمال استراتيجية تكوين العشرة.";
      case "before_after": return "اليوم هو " + value("day") + ". ما اليوم الذي يسبقه وما اليوم الذي يليه؟";
      case "sequence_days": return "رتّب أيام الأسبوع ترتيباً صحيحاً، وابدأ بيوم السبت.";
      case "read_clock": case "clock_reading": return "تدرّب على قراءة الساعة التعليمية، ثم اكتب الوقت الذي تشير إليه.";
      case "set_clock": return "استخدم ساعة تعليمية لتمثيل الوقت المطلوب، مع وضع عقربي الساعات والدقائق في موضعيهما.";
      case "shade_fraction": return "قسّم الشكل إلى " + value("parts") + " أجزاء متساوية، ولوّن " + value("shade") + " جزءاً لتمثيل الكسر " + value("fraction") + ".";
      case "identify_fraction": return "انظر إلى الأجزاء الممثلة، ثم حدّد الكسر الذي يعبّر عن الجزء المطلوب.";
      case "make_ten": return "استخدم تكوين العشرة لتسهيل عملية الجمع.";
      case "draw_model": return "مثّل المسألة بالرسم أو باستعمال أشياء محسوسة، ثم اشرح كيف وصلت إلى الإجابة.";
      case "build_picture_graph": case "collect_and_graph": return "نظّم البيانات في مخطط صور، ثم اقرأ النتائج وقارن بينها.";
      case "read_graph": return "اقرأ مخطط الصور، ثم أجب عن الأسئلة المتعلقة بالبيانات.";
      case "visual_representation": return "مثّل الكمية بالرسم أو بأشياء محسوسة، ثم وضّح ما تلاحظه.";
      case "trace_numeral": return "تتبّع كتابة الرقم بهدوء، ثم اكتبه بنفسك.";
      case "picture_talk": return "تأمّل الصورة، واذكر ما تراه، ثم كوّن جملة تصفها.";
      case "listening": return "استمع جيداً إلى المعلم أو ولي الأمر، ثم أجب عمّا فهمته.";
      case "picture_observation": return "لاحظ تفاصيل الصورة، واذكر الأشياء أو الاختلافات التي تلاحظها.";
      default:
        if (item.expected !== undefined) return "المطلوب: " + value("expected") + ". نفّذ النشاط واشرح طريقتك.";
        if (item.goal !== undefined) return "حاول الوصول إلى الهدف: " + value("goal") + "، ثم اشرح إجابتك.";
        return "نفّذ النشاط مع المعلم أو ولي الأمر، ثم اشرح ما تعلمته.";
    }
  }
  function answerLabel(choice) {
    if (choice && typeof choice === "object") return choice.label ?? choice.value ?? choice.quantity ?? JSON.stringify(choice);
    return String(choice);
  }
  function normalizedAnswer(value) {
    return String(value ?? "")
      .replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
      .replace(/[۰-۹]/g, digit => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
      .replace(/[\u064B-\u065F\u0670ـ]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
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
    el.innerHTML = `<div class="teacher-character" role="img" aria-label="شخصية المعلم التعليمية">
      <svg viewBox="0 0 160 200" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="teacher-shirt" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#69c6a0"/><stop offset="1" stop-color="#247a60"/></linearGradient>
          <linearGradient id="teacher-face" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="#ffe1b7"/><stop offset="1" stop-color="#e9ad7d"/></linearGradient>
        </defs>
        <ellipse cx="80" cy="190" rx="42" ry="7" fill="#173e3020"/>
        <path d="M56 143 51 177q-1 8 7 9h13l8-36M91 150l8 36h13q8-1 6-9l-9-39" fill="#355b91"/>
        <path d="M48 181q-7 4-4 10h29q4-8-4-11M98 190h30q4-8-5-11l-17-1Z" fill="#f4c76f" stroke="#b78039" stroke-width="2"/>
        <path d="M43 83q-9 5-12 27l-8 25q-2 8 6 11 7 2 10-6l13-26M117 83q9 5 12 27l8 25q2 8-6 11-7 2-10-6l-13-26" fill="url(#teacher-shirt)" stroke="#1c684f" stroke-width="3" stroke-linejoin="round"/>
        <path class="teacher-clothes" d="M52 78q28-18 56 0l10 65q-38 19-76 0Z" fill="url(#teacher-shirt)" stroke="#1c684f" stroke-width="3"/>
        <path d="M70 73h20v16H70z" fill="#e7ad7e"/>
        <path d="M45 46q0-35 35-35t35 35v20q0 36-35 36T45 66Z" fill="url(#teacher-face)" stroke="#b97b56" stroke-width="2"/>
        <path d="M43 51q-7-40 37-43 43 2 39 42-8-9-15-24-16 16-52 17l-9 8Z" fill="#563b31"/>
        <path d="M58 58q8-7 16 0M88 58q8-7 16 0" fill="none" stroke="#51372e" stroke-width="3" stroke-linecap="round"/>
        <circle cx="67" cy="62" r="3.5" fill="#273b42"/><circle cx="96" cy="62" r="3.5" fill="#273b42"/>
        <path class="teacher-mouth" d="M72 78q8 8 16 0" fill="none" stroke="#9b4d43" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M62 111q18 11 36 0" fill="none" stroke="#f5d27e" stroke-width="4" stroke-linecap="round"/>
        <path d="M69 123h22v20H69z" fill="#f5d27e" stroke="#c79543" stroke-width="2"/>
        <path d="M74 128h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <path d="M34 120q-8 6-8 15M126 120q8 6 8 15" fill="none" stroke="#f4c76f" stroke-width="5" stroke-linecap="round"/>
      </svg>
    </div><div class="teacher-copy"><strong id="teacherName">المعلّم الصغير</strong><div class="muted" id="teacherMood">أنا هنا لأساعدك على التعلّم 🌟</div></div>`;
    box.insertBefore(el, box.firstChild);
    return el;
  }
  function setTeacherSpeaking(on) {
    const el = makeTeacher();
    if (el) el.classList.toggle("speaking", Boolean(on));
  }
  function setTeacherMood(mood, message) {
    const el = makeTeacher();
    const label = document.getElementById("teacherMood");
    if (el) {
      el.classList.remove("mood-happy", "mood-encourage", "mood-ready");
      el.classList.add("mood-" + (["happy", "encourage", "ready"].includes(mood) ? mood : "ready"));
    }
    if (label && message) label.textContent = message;
  }
  function createSpeechLifecycle() {
    let generation = 0;
    return {
      begin() { return ++generation; },
      cancel() { return ++generation; },
      isCurrent(token) { return token === generation; }
    };
  }
  const speechLifecycle = createSpeechLifecycle();
  function cancelSpeech() {
    speechLifecycle.cancel();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setTeacherSpeaking(false);
  }
  function selectArabicVoice(voices) {
    const arabicVoices = (Array.isArray(voices) ? voices : [])
      .filter(voice => /^ar(?:-|$)/i.test(String(voice.lang || "")) &&
        !/^ar-IQ(?:-|$)/i.test(String(voice.lang || "")));
    return arabicVoices.find(voice => /^ar-SA(?:-|$)/i.test(voice.lang)) ||
      arabicVoices.find(voice => /^ar$/i.test(voice.lang)) ||
      arabicVoices[0] || null;
  }
  function speakQuestion(text) {
    const feedback = document.getElementById("feedback");
    cancelSpeech();
    if (active?.voice === "none") {
      if (feedback) feedback.textContent = "الصوت مكتوم حسب إعدادات ولي الأمر. يمكنك قراءة السؤال.";
      return;
    }
    if (!("speechSynthesis" in window)) {
      if (feedback) feedback.textContent = "الصوت غير متاح في هذا المتصفح. اقرأ السؤال المعروض ثم تابع.";
      return;
    }
    const generation = speechLifecycle.begin();
    utterance = new SpeechSynthesisUtterance(String(text || ""));
    const voices = speechSynthesis.getVoices();
    utterance.voice = selectArabicVoice(voices);
    utterance.lang = utterance.voice?.lang || "ar-SA";
    utterance.rate = active?.voice === "slow" ? 0.72 : 0.88;
    utterance.onstart = () => { if (speechLifecycle.isCurrent(generation)) setTeacherSpeaking(true); };
    utterance.onend = utterance.onerror = () => { if (speechLifecycle.isCurrent(generation)) setTeacherSpeaking(false); };
    speechSynthesis.speak(utterance);
  }
  let current = null, questionIndex = 0, score = 0, assessedCount = 0, answered = new Set(), resolved = new Set(), utterance = null;
  function renderQuestion(autoSpeak = true) {
    cancelSpeech();
    setTeacherMood("ready", "هيا نكتشف الإجابة معاً! ✨");
    const lesson = current;
    const qs = questionList(lesson);
    const q = qs[questionIndex];
    const qTitle = document.getElementById("questionText");
    const answers = document.getElementById("answers");
    const feedback = document.getElementById("feedback");
    const finish = document.getElementById("finishLesson");
    const progressLabel = document.getElementById("questionProgressLabel");
    const progressBar = document.getElementById("questionProgressBar");
    if (progressLabel) progressLabel.textContent = q ? "السؤال " + (questionIndex + 1) + " من " + qs.length : "أكملت أنشطة هذا الدرس";
    if (progressBar) progressBar.style.width = (qs.length ? Math.min(100, questionIndex / qs.length * 100) : 100) + "%";
    answers.innerHTML = "";
    if (!q) {
      const requirement = masteryRequirement(lesson);
      qTitle.textContent = "انتهت أنشطة هذا الدرس";
      answers.innerHTML = '<p class="muted">أحسنت! راجع الشرح والأمثلة، ثم تحقق من إتقان المهارات المطلوبة.</p>';
      const masteryMet = requirement.valid && score >= requirement.requiredCorrect && assessedCount >= requirement.totalChecks;
      finish.disabled = !masteryMet;
      finish.textContent = masteryMet ? "إكمال الدرس ⭐" : "لم يكتمل الإتقان بعد";
      if (!requirement.valid) {
        feedback.textContent = "توجد مشكلة في إعداد تقييم هذا الدرس؛ عدد الأسئلة القابلة للتقييم أقل من متطلبات الإتقان. لن نسجل إكماله قبل مراجعة المحتوى.";
        feedback.style.color = "#a45a22";
      } else if (!masteryMet) {
        feedback.textContent = "تحتاج إلى الإجابة الصحيحة عن " + requirement.requiredCorrect +
          " أسئلة على الأقل، وإكمال " + requirement.totalChecks + " من فحوص الدرس قبل اعتماده.";
        feedback.style.color = "#a45a22";
      } else {
        feedback.textContent = "أحسنت! حققت متطلبات الإتقان لهذا الدرس.";
        feedback.style.color = "var(--g)";
      }
      return;
    }
    const questionText = questionPrompt(q);
    qTitle.textContent = questionText;
    feedback.textContent = "";
    finish.disabled = true;
    const options = Array.isArray(q.choices) ? q.choices : (Array.isArray(q.options) ? q.options : []);
    const spokenQuestion = [questionText, options.length ? "الخيارات: " + options.map(displayChoice).join("، ") : ""]
      .filter(Boolean).join(". ");
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "alt";
    listen.textContent = "🔊 استمع إلى السؤال";
    listen.setAttribute("aria-label", "استمع إلى السؤال والخيارات");
    listen.addEventListener("click", () => speakQuestion(spokenQuestion));
    answers.appendChild(listen);
    finish.textContent = "إكمال الدرس ⭐";
if (q.type === "trace_numeral") {
      const numerals = Array.isArray(q.numerals) ? q.numerals.map(String).slice(0, 6) : [];
      const instructions = document.createElement("p");
      instructions.className = "muted";
      instructions.textContent = "اتبع شكل الرقم بإصبعك أو بالفأرة، ثم أعد المحاولة إذا رغبت. هذا تدريب كتابي لا يتعرف إلى جودة الخط آلياً.";
      answers.appendChild(instructions);
      numerals.forEach((numeral, index) => {
        const card = document.createElement("section");
        card.className = "trace-card";
        const heading = document.createElement("h4");
        heading.textContent = "تتبّع العدد " + numeral;
        const canvas = document.createElement("canvas");
        canvas.width = 360;
        canvas.height = 170;
        canvas.style.width = "min(100%, 360px)";
        canvas.style.height = "170px";
        canvas.style.border = "2px dashed #9aa8b8";
        canvas.style.borderRadius = "14px";
        canvas.style.background = "#fff";
        canvas.style.touchAction = "none";
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "مساحة تدريب لتتبّع الرقم " + numeral + "، استخدم إصبعك أو الفأرة للرسم");
        const context = canvas.getContext("2d");
        const drawGuide = () => {
          if (!context) return;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.save();
          context.globalAlpha = 0.18;
          context.fillStyle = "#52657a";
          context.font = "bold 118px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(numeral, canvas.width / 2, canvas.height / 2 + 2);
          context.restore();
        };
        drawGuide();
        let drawing = false;
        const point = event => {
          const rect = canvas.getBoundingClientRect();
          return {
            x: (event.clientX - rect.left) * canvas.width / rect.width,
            y: (event.clientY - rect.top) * canvas.height / rect.height
          };
        };
        canvas.addEventListener("pointerdown", event => {
          if (!context) return;
          event.preventDefault();
          drawing = true;
          if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
          const p = point(event);
          context.beginPath();
          context.moveTo(p.x, p.y);
        });
        canvas.addEventListener("pointermove", event => {
          if (!drawing || !context) return;
          event.preventDefault();
          const p = point(event);
          context.lineWidth = 7;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.strokeStyle = "#2877c7";
          context.lineTo(p.x, p.y);
          context.stroke();
        });
        const stopDrawing = () => { drawing = false; if (context) context.closePath(); };
        canvas.addEventListener("pointerup", stopDrawing);
        canvas.addEventListener("pointercancel", stopDrawing);
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "alt";
        clear.textContent = "مسح المحاولة";
        clear.addEventListener("click", drawGuide);
        card.append(heading, canvas, clear);
        answers.appendChild(card);
      });
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "عند الانتهاء، اعرض كتابتك على المعلم أو ولي الأمر للمراجعة. لن تُحتسب جودة الكتابة ضمن نتيجة الإتقان الآلية.";
      answers.appendChild(note);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "alt";
      next.textContent = questionIndex < qs.length - 1 ? "الانتقال إلى النشاط التالي ←" : "الانتقال إلى نهاية الدرس";
      next.addEventListener("click", () => { questionIndex++; renderQuestion(); });
      answers.appendChild(next);
    } else if (q.type === "create_pattern") {
      const suppliedColors = Array.isArray(q.colors)
        ? Array.from(new Set(q.colors.map(String))).slice(0, 6) : [];
      const colors = suppliedColors.length >= 2
        ? suppliedColors : ["أحمر", "أصفر", "أزرق", "أخضر"];
      const minimumItems = Number.isInteger(q.minimumItems) && q.minimumItems >= 4
        ? Math.min(q.minimumItems, 12) : 6;
      const chosenColors = [];
      const pattern = [];
      const palette = document.createElement("div");
      palette.className = "pattern-palette";
      palette.setAttribute("role", "group");
      palette.setAttribute("aria-label", "اختيار لونين للنمط");
      const preview = document.createElement("div");
      preview.className = "pattern-preview";
      preview.setAttribute("role", "list");
      preview.setAttribute("aria-label", "معاينة النمط الذي أنشأه الطالب");
      preview.setAttribute("aria-live", "polite");
      const status = document.createElement("p");
      status.className = "muted";
      status.textContent = "اختر لونين مختلفين، ثم كوّن نمطاً يتكرر ثلاث مرات.";
      const renderPattern = () => {
        preview.innerHTML = "";
        pattern.forEach((color, index) => {
          const token = document.createElement("span");
          token.textContent = color;
          token.setAttribute("aria-label", "العنصر " + (index + 1) + ": " + color);
          token.className = "pattern-token";
          token.style.display = "inline-block";
          token.style.margin = "4px";
          token.style.padding = "8px 12px";
          token.style.border = "2px solid #7b8aa0";
          token.style.borderRadius = "12px";
          preview.appendChild(token);
        });
        status.textContent = "العناصر المختارة: " + pattern.length + " من " + minimumItems +
          (chosenColors.length ? " · اللونان: " + chosenColors.join(" و") : "");
      };
      colors.forEach((color, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "alt";
        button.textContent = color;
        button.addEventListener("click", () => {
          if (chosenColors.length < 2 && !chosenColors.includes(color)) {
            chosenColors.push(color);
            if (chosenColors.length === 2) {
              palette.querySelectorAll("button").forEach(control => {
                control.disabled = !chosenColors.includes(control.textContent);
              });
              status.textContent = "أحسنت! ابدأ بتكرار اللونين بالتناوب حتى تكوّن " + minimumItems + " عناصر.";
            }
          }
          if (chosenColors.includes(color) && pattern.length < minimumItems) {
            pattern.push(color);
            renderPattern();
          }
        });
        palette.appendChild(button);
      });
      const undo = document.createElement("button");
      undo.type = "button"; undo.className = "alt"; undo.textContent = "التراجع عن آخر لون";
      undo.addEventListener("click", () => { pattern.pop(); renderPattern(); });
      const reset = document.createElement("button");
      reset.type = "button"; reset.className = "alt"; reset.textContent = "إعادة النشاط";
      reset.addEventListener("click", () => {
        chosenColors.length = 0; pattern.length = 0;
        palette.querySelectorAll("button").forEach(control => control.disabled = false);
        renderPattern();
      });
      const check = document.createElement("button");
      check.type = "button"; check.textContent = "تحقق من النمط";
      check.addEventListener("click", () => {
        if (chosenColors.length !== 2 || pattern.length < minimumItems) {
          feedback.textContent = "اختر لونين مختلفين، وأكمل " + minimumItems + " عناصر أولاً.";
          feedback.style.color = "#a45a22";
          return;
        }
        const valid = isAlternatingPattern(pattern, minimumItems);
        if (valid) {
          feedback.textContent = "رائع! أنشأت نمطاً صحيحاً يتكرر بانتظام. ⭐";
          feedback.style.color = "var(--g)";
          check.disabled = true;
          undo.disabled = true;
          reset.disabled = true;
          palette.querySelectorAll("button").forEach(control => control.disabled = true);
          const next = document.createElement("button");
          next.type = "button";
          next.className = "alt";
          next.textContent = questionIndex < qs.length - 1 ? "الانتقال إلى النشاط التالي ←" : "الانتقال إلى نهاية الدرس";
          next.addEventListener("click", () => {
            answered.add(questionIndex);
            questionIndex++;
            renderQuestion();
          });
          answers.appendChild(next);
        } else {
          feedback.textContent = "اقتربت من الحل! راجع ترتيب اللونين، واجعل النمط نفسه يتكرر دون تغيير.";
          feedback.style.color = "#a45a22";
        }
      });
      answers.append(palette, preview, status, undo, reset, check);
    }
    if (q.type === "trace_numeral" || q.type === "create_pattern") {
      if (autoSpeak) speakQuestion(spokenQuestion);
      return;
    }
    const submit = (value, selectedButton) => {
      if (answered.has(questionIndex)) return;
      cancelSpeech();
      let correctAnswer = false;
      if (Array.isArray(q.answer)) {
        correctAnswer = Array.isArray(value) && value.length === q.answer.length &&
          value.every((item, i) => normalizedAnswer(item) === normalizedAnswer(q.answer[i]));
      } else {
        correctAnswer = choiceMatches(value, q.answer);
      }
      if (!correctAnswer) {
        if (!resolved.has(questionIndex)) {
          resolved.add(questionIndex);
          assessedCount++;
        }
        feedback.textContent = q.feedbackTryAgain || "لا بأس، يمكنك المحاولة مرة أخرى، أو الانتقال إلى السؤال التالي.";
        feedback.style.color = "#a45a22";
        setTeacherMood("encourage", "لا بأس! أنت تتعلّم مع كل محاولة. جرّب مرة أخرى 🌱");
        if (selectedButton) selectedButton.style.outline = "3px solid #e8b46d";
        // لا نمنع إعادة المحاولة، لكن نتيح متابعة الاختبار دون إجبار الطالب على تكرار السؤال إلى ما لا نهاية.
        if (!answers.querySelector("[data-continue-after-error]")) {
          const continueButton = document.createElement("button");
          continueButton.type = "button";
          continueButton.className = "alt";
          continueButton.dataset.continueAfterError = "true";
          continueButton.textContent = questionIndex < qs.length - 1 ? "متابعة إلى السؤال التالي ←" : "عرض نتيجة الدرس";
          continueButton.addEventListener("click", () => {
            answered.add(questionIndex);
            questionIndex++;
            renderQuestion();
          });
          answers.appendChild(continueButton);
        }
        return;
      }
      answered.add(questionIndex);
      if (!resolved.has(questionIndex)) {
        resolved.add(questionIndex);
        assessedCount++;
      }
      score++;
      feedback.textContent = q.feedbackCorrect || "إجابة صحيحة! أحسنت ⭐";
      feedback.style.color = "var(--g)";
      setTeacherMood("happy", "رائع! إجابة صحيحة، لقد أبدعت! ⭐");
      if (selectedButton) selectedButton.style.outline = "3px solid #43a77e";
      answers.querySelectorAll("button,input,select").forEach(el => el.disabled = true);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "alt";
      next.textContent = questionIndex < qs.length - 1 ? "السؤال التالي ←" : "عرض إكمال الدرس";
      next.addEventListener("click", () => { questionIndex++; renderQuestion(); });
      answers.appendChild(next);
    };
    if (q.type === "sequence_order") {
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
          items.map((item, itemIndex) => '<option value="' + itemIndex + '">' + escHtml(item) + '</option>').join("");
        select.addEventListener("change", () => {
          const chosen = selects.map(control => control.value).filter(value => value !== "");
          selects.forEach(control => Array.from(control.options).forEach(option => {
            if (!option.value) { option.disabled = false; return; }
            option.disabled = option.value !== control.value && chosen.includes(option.value);
          }));
        });
        selects.push(select); answers.appendChild(select);
      });
      const check = document.createElement("button");
      check.type = "button"; check.textContent = "تحقق من الترتيب";
      check.addEventListener("click", () => {
        const selectedIndexes = selects.map(select => select.value);
        if (selectedIndexes.some(value => value === "")) { feedback.textContent = "أكمل جميع المواقع أولاً."; return; }
        submit(selectedIndexes.map(value => items[Number(value)]));
      });
      answers.appendChild(check);
    } else if (options.length && q.answer !== undefined &&
      (typeof q.answer === "string" || typeof q.answer === "number")) {
      options.forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "alt";
        button.textContent = displayChoice(choice);
        button.addEventListener("click", () => submit(choice, button));
        answers.appendChild(button);
      });
    } else if (typeof q.answer === "string" || typeof q.answer === "number") {
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = typeof q.answer === "number" ? "decimal" : "text";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "اكتب إجابتك");
      input.placeholder = "اكتب الإجابة هنا";
      input.style.maxWidth = "260px";
      const check = document.createElement("button");
      check.type = "button"; check.textContent = "تحقق من الإجابة";
      check.addEventListener("click", () => {
        if (!input.value.trim()) { feedback.textContent = "اكتب إجابتك أولاً."; return; }
        submit(input.value);
      });
      input.addEventListener("keydown", event => { if (event.key === "Enter") check.click(); });
      answers.append(input, check);
    } else if (Array.isArray(q.answer)) {
      const inputs = q.answer.map((_, index) => {
        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.placeholder = "الإجابة " + (index + 1);
        input.setAttribute("aria-label", "الإجابة " + (index + 1));
        input.style.maxWidth = "260px";
        answers.appendChild(input);
        return input;
      });
      const check = document.createElement("button");
      check.type = "button"; check.textContent = "تحقق من الإجابات";
      check.addEventListener("click", () => {
        const values = inputs.map(input => input.value.trim());
        if (values.some(value => !value)) { feedback.textContent = "أكمل جميع الإجابات أولاً."; return; }
        submit(values);
      });
      answers.appendChild(check);
    } else {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = questionText + " هذا تدريب عملي لا يُقيّم آلياً حالياً. نفّذه مع المعلم أو ولي الأمر، ثم انتقل إلى النشاط التالي. لن يُحتسب ضمن نتيجة الإتقان.";
      answers.appendChild(note);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "alt";
      next.textContent = questionIndex < qs.length - 1 ? "الانتقال إلى النشاط التالي ←" : "الانتقال إلى نهاية الدرس";
      next.addEventListener("click", () => { questionIndex++; renderQuestion(); });
      answers.appendChild(next);
    }
    // ابدأ بقراءة السؤال وخياراته فور ظهوره، إلا عند دمجه مع ترحيب بداية الدرس.
    if (autoSpeak) speakQuestion(spokenQuestion);
  }
  function openLesson(lesson) {
    current = lesson; activeLesson = lesson;
    questionIndex = 0; score = 0; assessedCount = 0; answered = new Set(); resolved = new Set();
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
    renderQuestion(false);
    const firstQuestion = questionList(lesson)[0];
    const firstOptions = Array.isArray(firstQuestion?.choices) ? firstQuestion.choices :
      (Array.isArray(firstQuestion?.options) ? firstQuestion.options : []);
    const openingParts = [
      active?.name ? "مرحباً " + active.name + "، أنا معلّمك، وسنتعلم اليوم معاً." : "مرحباً بك! أنا معلّمك، وسنتعلم اليوم معاً.",
      title, desc, ...explanation, ...examples,
      firstQuestion ? questionPrompt(firstQuestion) : "",
      firstOptions.length ? "الخيارات: " + firstOptions.map(displayChoice).join("، ") : ""
    ];
    speakQuestion(openingParts.filter(Boolean).join(". "));
  }
  window.MadrastiCurriculum = { loadSubject, lessonBody, questionList };
  let subjectRequestId = 0;
  window.openSubject = async function(subject) {
    if (!active) return;
    const requestedChildId = active.id;
    const requestId = ++subjectRequestId;
    const area = document.getElementById("studentArea");
    document.getElementById("curriculumLoading")?.remove();
    document.getElementById("subjectLessons")?.remove();
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
      const progressMap = readCompletedMap();
      const progressUnavailable = progressMap === null;
      const done = new Set(completedLessonIds(progressMap, active.id));
      const dailyCount = Math.max(1, Math.min(10, Number(active.dailyCount) || 1));
      const dailyPlan = data.lessons.map((lesson, index) => ({ lesson, index }))
        .filter(item => !done.has(item.lesson.id)).slice(0, dailyCount);
      const dailyMarkup = dailyPlan.length
        ? '<div class="game-hero quest-card"><span class="tag">🎯 مهمة اليوم</span><h3>هل أنت مستعد لمغامرة جديدة؟</h3><p class="muted">اختر حتى ' + dailyCount + ' دروس جديدة اليوم، واجمع نجوم المعرفة مع كل إنجاز.</p><div class="cards">' +
          dailyPlan.map(item => '<article class="card quest-card"><div class="tag">🗺️ ' + escHtml(item.lesson._unitTitle) + '</div><h3>' + escHtml(item.lesson.title) + '</h3><p class="muted">' + escHtml(item.lesson.objective || "") + '</p><button type="button" data-daily-lesson="' + item.index + '">انطلق! 🚀</button></article>').join("") + '</div></div>'
        : '<div class="game-hero"><span class="tag">🏆 إنجاز رائع</span><h3>لقد أنهيت مهام هذه المادة المتاحة!</h3><p class="muted">يمكنك إعادة أي درس لتثبيت ما تعلمته.</p></div>';
      const wrap = document.createElement("section");
      wrap.id = listId;
      wrap.className = "panel";
      wrap.innerHTML = '<div class="game-hero"><span class="tag">🌈 عالم ' + escHtml(subject) + '</span><h3>كل درس خطوة جديدة في مغامرتك!</h3><p class="muted">أنجزت ' + data.lessons.filter(lesson => done.has(lesson.id)).length + ' من ' + data.lessons.length + ' دروس متاحة في هذه المادة.</p><div class="lesson-path">' + data.lessons.map((lesson, i) => '<span class="path-dot ' + (done.has(lesson.id) ? 'done' : '') + '" title="' + escHtml(lesson.title) + '">' + (done.has(lesson.id) ? '✓' : (i+1)) + '</span>').join('') + '</div></div>' +
        (progressUnavailable ? '<div class="notice">تعذر قراءة سجل التقدم المحفوظ على هذا الجهاز. لم نحذف البيانات، لكننا أوقفنا تسجيل الإنجاز لحمايتها. قد لا تظهر الدروس المكتملة بدقة حتى تتم معالجة سجل التخزين.</div>' : '') +
        dailyMarkup + '<hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><h3>🧩 اختر مغامرتك التالية</h3><div class="cards">' +
        data.lessons.map((lesson, i) => '<article class="card"><div class="tag">' + (done.has(lesson.id) ? '🏅 مرحلة مكتملة' : '⭐ المرحلة ' + (i+1)) + ' · ' + escHtml(lesson._unitTitle) + '</div><h3>' + escHtml(lesson.title) + '</h3><p class="muted">' + escHtml(lesson.objective || "") + '</p><div class="progressrow"><span>' + escHtml(pagesLabel(lesson._pages)) + '</span><strong>' + (done.has(lesson.id) ? "نجمة محفوظة ✓" : "بانتظارك ✨") + '</strong></div><button type="button" class="alt" data-lesson="' + i + '">' + (done.has(lesson.id) ? "العب مرة أخرى ↻" : "ابدأ المغامرة 🚀") + '</button></article>').join("") + '</div>';
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
    subjectRequestId++;
    // Switching profiles (or returning from a lesson) must invalidate the old lesson
    // so its completion can never be written to a different child's progress.
    window.stopLessonAudio();
    current = null;
    activeLesson = null;
    document.getElementById("lessonView").classList.add("hidden");
    active = family.find(child => child.id === id) || null;
    const area = document.getElementById("studentArea");
    area.classList.toggle("hidden", !active);
    document.getElementById("noStudent").classList.toggle("hidden", !!active || (family || []).length > 0);
    if (!active) {
      area.innerHTML = "";
      document.getElementById("curriculumLoading")?.remove();
      document.getElementById("subjectLessons")?.remove();
      return;
    }
    const completedTotal = completedLessonIds(readCompletedMap(), active.id).length;
    const learningLevel = completedTotal >= 10 ? "مستكشف متميز" : completedTotal >= 5 ? "مغامر نشيط" : completedTotal >= 1 ? "متعلم واعد" : "بداية المغامرة";
    const subjectEmoji = subject => ({ "القراءة":"📖", "الرياضيات":"🧩", "العلوم":"🔬", "اللغة الإنجليزية":"🔤" }[subject] || "🎨");
    area.innerHTML = '<div class="game-hero"><div class="row"><div style="font-size:54px" aria-hidden="true">' + escHtml(active.avatar || "🧒") + '</div><div><span class="tag">✨ ' + learningLevel + '</span><h2>أهلاً يا ' + escHtml(active.name || "بطل التعلّم") + '!</h2><p class="muted">' + escHtml(active.grade) + ' · هيا نكتشف شيئاً جديداً اليوم!</p></div></div><div class="game-stats"><span class="game-stat">⭐ ' + completedTotal + ' نجوم إنجاز</span><span class="game-stat">🎯 ' + Number(active.dailyCount || 1) + ' درس يومياً لكل مادة</span></div></div><h3>🗺️ اختر عالمك</h3><div class="cards">' +
      (active.subjects || []).map(subject => '<div class="card subject"><span><span style="font-size:27px" aria-hidden="true">' + subjectEmoji(subject) + '</span> <strong>' + escHtml(subject) + '</strong></span><button class="alt" data-subject="' + escHtml(subject) + '">هيا نلعب! 🎮</button></div>').join("") + '</div><p class="muted">كل درس تنجزه يضيف نجمة إلى سجل رحلتك. يمكنك العودة إلى أي مادة في أي وقت.</p>';
    area.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => window.openSubject(button.dataset.subject)));
  };
  window.answer = function() {};
  window.finishLesson = function() {
    if (!current || !active) return;
    const qs = questionList(current);
    if (qs.length && questionIndex < qs.length) return;
    const requirement = masteryRequirement(current);
    if (!requirement.valid || score < requirement.requiredCorrect || assessedCount < requirement.totalChecks) {
      const feedback = document.getElementById("feedback");
      if (feedback) feedback.textContent = !requirement.valid
        ? "لم يُعتمد إكمال الدرس: إعداد متطلبات الإتقان في ملف هذا الدرس يحتاج إلى مراجعة."
        : "لم يُعتمد إكمال الدرس بعد؛ أكمل متطلبات الإتقان المحددة ثم حاول مجدداً.";
      return;
    }
    const progressKey = "madrastiStudentProgressV1";
    const childId = active.id;
    let previousProgress;
    try {
      previousProgress = localStorage.getItem(progressKey);
      const progressMap = readCompletedMap();
      if (!progressMap) throw new Error("سجل التقدم المحلي تالف أو غير قابل للقراءة؛ أوقفنا الحفظ حتى لا نفقد بيانات الأبناء.");
      const update = appendCompletedLesson(progressMap, childId, current.id);
      localStorage.setItem(progressKey, JSON.stringify(update.map));
      if (!update.alreadyCompleted) {
        const previousCompleted = Number(active.completed) || 0;
        active.completed = previousCompleted + 1;
        if (typeof save === "function" && !save()) {
          active.completed = previousCompleted;
          try {
            if (previousProgress === null) localStorage.removeItem(progressKey);
            else localStorage.setItem(progressKey, previousProgress);
          } catch (rollbackError) {
            console.warn("تعذر التراجع عن سجل تقدم الدرس بعد فشل حفظ ملف الأسرة:", rollbackError);
          }
          const feedback = document.getElementById("feedback");
          if (feedback) feedback.textContent = "تعذر حفظ ملف الطالب؛ لم يتم اعتماد إكمال الدرس. أعد المحاولة بعد التأكد من مساحة التخزين.";
          return;
        }
      }
    } catch (error) {
      const feedback = document.getElementById("feedback");
      if (feedback) feedback.textContent = "تعذر حفظ تقدمك على هذا الجهاز. لم يتم اعتماد إكمال الدرس؛ حاول مجدداً.";
      console.warn("تعذر حفظ تقدم الدرس:", error);
      return;
    }
    document.getElementById("lessonView").classList.add("hidden");
    document.getElementById("childView").classList.remove("hidden");
    window.selectChild(childId);
    const note = document.createElement("p");
    note.className = "notice celebration";
    const unassessedCount = qs.filter(item =>
      !Object.prototype.hasOwnProperty.call(item, "answer") || item.answer === undefined || item.answer === null
    ).length;
    note.textContent = assessedCount
      ? "أحسنت! نتيجتك: " + score + " من " + assessedCount + " سؤالاً قابلاً للتقييم. " +
        (unassessedCount ? "تذكّر أن هناك " + unassessedCount + " أنشطة عملية تحتاج إلى تنفيذ ومراجعة مع المعلم أو ولي الأمر؛ لم تدخل في نتيجة الإتقان. " : "") +
        "تم حفظ تقدمك على هذا الجهاز."
      : "تم حفظ إنهاء الجزء العملي، لكن هذا الدرس لا يحتوي على أسئلة قابلة للتقييم الآلي.";
    document.getElementById("studentArea").prepend(note);
  };
  window.stopLessonAudio = cancelSpeech;
  window.playLesson = function() {
    if (!current) return;
    cancelSpeech();
    if (active?.voice === "none") { document.getElementById("feedback").textContent = "الصوت مكتوم حسب إعدادات ولي الأمر. يمكنك قراءة الشرح."; return; }
    if (!("speechSynthesis" in window)) {
      document.getElementById("feedback").textContent = "الصوت غير متاح في هذا المتصفح. يمكنك قراءة الشرح المعروض.";
      return;
    }
    const generation = speechLifecycle.begin();
    const parts = [current.title, ...lessonBody(current)];
    if (current.objective) parts.push(current.objective);
    parts.push(...lessonExamples(current));
    utterance = new SpeechSynthesisUtterance(parts.filter(Boolean).join(". "));
    const voices = speechSynthesis.getVoices();
    utterance.voice = selectArabicVoice(voices);
    utterance.lang = utterance.voice?.lang || "ar-SA";
    utterance.rate = active?.voice === "slow" ? 0.72 : 0.88;
    utterance.onstart = () => { if (speechLifecycle.isCurrent(generation)) setTeacherSpeaking(true); };
    utterance.onend = utterance.onerror = () => { if (speechLifecycle.isCurrent(generation)) setTeacherSpeaking(false); };
    speechSynthesis.speak(utterance);
  };
  window.addEventListener("beforeunload", cancelSpeech);
  document.addEventListener("DOMContentLoaded", makeTeacher);
  const style = document.createElement("style");
  style.textContent = ".teacher{display:flex;align-items:center;gap:14px;padding:12px;background:#fff8e8;border:1px solid #f3dfb4;border-radius:18px;margin-bottom:16px}.teacher-face{width:68px;height:68px;border-radius:50%;background:#ffd58c;border:4px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 0 #d7ad67;flex:none}.teacher-eyes{font-size:13px;color:#563c2c}.teacher-mouth{font-size:13px;color:#9d4b38;line-height:1}.teacher.gender-girl .teacher-face{background:#ffd7e5}.teacher.gender-boy .teacher-face{background:#c9e7ff}.teacher.speaking .teacher-mouth{animation:talk .22s infinite alternate}@keyframes talk{from{transform:scaleY(.4)}to{transform:scaleY(1.5)}}.lessonbox #lessonDesc{white-space:pre-line;line-height:2}";
  document.head.appendChild(style);
})();
