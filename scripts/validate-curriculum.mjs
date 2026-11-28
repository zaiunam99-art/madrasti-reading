import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const root = process.argv[2] || "curriculum";
const errors = [];
const warnings = [];
const globalLessonIds = new Map();
const generatedPromptTypes = new Set([
  "make_number", "remove_objects", "count_back", "count_forward",
  "number_line_add", "number_line_subtract", "fact_family",
  "double_plus_minus_one", "make_ten_add", "before_after", "sequence_days",
  "read_clock", "clock_reading", "set_clock", "shade_fraction",
  "identify_fraction", "make_ten", "draw_model", "build_picture_graph", "sequence_order", "create_pattern",
  "collect_and_graph", "read_graph", "visual_representation", "trace_numeral",
  "picture_talk", "listening", "picture_observation",
  "place_value", "compose_number", "complete_pattern",
  "skip_count", "compare_numbers", "previous_next", "order_numbers", "tens_add",
  "tens_subtract", "two_digit_add", "two_digit_subtract"
]);
const stats = { jsonFiles: 0, lessons: 0, answerChecks: 0, unitsOrChapters: 0, indexFiles: 0, linkedLessonFiles: 0, sequenceChecks: 0, masteryConfigured: 0, lessonsWithoutAutoAssessment: 0, lessonsWithoutExplanation: 0, lessonsWithoutActivities: 0, lessonsWithoutQuiz: 0, lessonsWithoutBookPages: 0, lessonsUsingPrintedPages: 0, lessonsUsingTeacherScript: 0, lessonsWithoutObjective: 0, lessonsWithoutExamples: 0, activityTypes: {}, activitiesWithAnswer: 0, activitiesWithoutAnswer: 0, activitiesWithOptions: 0, activitiesWithoutPrompt: 0, activitiesUsingFallbackText: 0, activitiesUsingGeneratedPrompt: 0, activitiesWithoutDisplayText: 0, activitiesWithoutType: 0, duplicateLessonOrders: 0, indexGroups: 0, groupsWithoutTitle: 0, groupsWithoutSourcePages: 0, groupsWithoutLinkedLessons: 0, indexesWithoutSourceTitle: 0, indexesWithoutSourcePageCount: 0, duplicateIndexGroupNumbers: 0 };

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

function optionsOf(choices) {
  return choices.map(choice => {
    if (choice && typeof choice === "object") {
      return [choice.label, choice.value, choice.quantity, choice.id]
        .filter(value => value !== undefined)
        .map(String);
    }
    return [String(choice)];
  }).flat();
}

function inspect(node, file, path = "root") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, index) => inspect(item, file, `${path}[${index}]`));
    return;
  }

  for (const key of ["activities", "quiz"]) {
    if (Object.hasOwn(node, key) && !Array.isArray(node[key])) {
      errors.push({ file: relative(".", file), path: `${path}.${key}`, message: `حقل ${key} يجب أن يكون مصفوفة` });
    } else if (Array.isArray(node[key])) {
      node[key].forEach((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          errors.push({ file: relative(".", file), path: `${path}.${key}[${index}]`, message: `عنصر ${key} يجب أن يكون كائناً صالحاً` });
        }
      });
    }
  }

  const choices = Array.isArray(node.choices) ? node.choices :
    (Array.isArray(node.options) ? node.options : null);
  if (choices && Object.hasOwn(node, "answer")) {
    stats.answerChecks++;
    const options = optionsOf(choices);
    const answers = Array.isArray(node.answer) ? node.answer.map(String) : [String(node.answer)];
    const valid = Array.isArray(node.answer)
      ? answers.every(answer => options.includes(answer))
      : options.includes(answers[0]);
    if (!valid) errors.push({
      file: relative(".", file), path, answer: node.answer, options,
      message: "الإجابة المحددة غير موجودة ضمن الخيارات"
    });
  }
  if (node.type === "sequence_order") {
    stats.sequenceChecks++;
    if (!Array.isArray(node.items) || !Array.isArray(node.answer) ||
        node.items.length === 0 || node.items.length !== node.answer.length) {
      errors.push({ file: relative(".", file), path, message: "نشاط الترتيب يحتاج items و answer كمصفوفتين غير فارغتين ومتساويتين في الطول" });
    } else {
      const itemCounts = new Map();
      for (const item of node.items) itemCounts.set(String(item), (itemCounts.get(String(item)) || 0) + 1);
      const answerCounts = new Map();
      for (const item of node.answer) answerCounts.set(String(item), (answerCounts.get(String(item)) || 0) + 1);
      const sameItems = itemCounts.size === answerCounts.size &&
        [...itemCounts].every(([item, count]) => answerCounts.get(item) === count);
      if (!sameItems) errors.push({
        file: relative(".", file), path,
        message: "إجابة الترتيب يجب أن تحتوي العناصر نفسها دون حذف أو إضافة أو تكرار زائد"
      });
    }
  }
  if (node.type === "number_entry" && !Object.hasOwn(node, "answer")) {
    errors.push({ file: relative(".", file), path, message: "نشاط الإجابة العددية بلا إجابة مرجعية" });
  }

  for (const [key, value] of Object.entries(node)) {
    inspect(value, file, `${path}.${key}`);
  }
}


async function verifyIndexes() {
  const indexes = [
    join(root, "grade-1/reading-2025-2026/units-index.json"),
    join(root, "grade-1/math-2025-2026/chapters-index.json"),
    join(root, "grade-2/math-2025-2026/chapters-index.json")
  ];
  for (const indexPath of indexes) {
    let index;
    try {
      index = JSON.parse(await readFile(indexPath, "utf8"));
      stats.indexFiles++;
    } catch (error) {
      errors.push({ file: relative(".", indexPath), message: `تعذر قراءة فهرس المنهج: ${error.message}` });
      continue;
    }
    const sourceTitle = index.source?.title || index.source?.file;
    if (typeof sourceTitle !== "string" || !sourceTitle.trim()) {
      stats.indexesWithoutSourceTitle++;
      warnings.push({ file: relative(".", indexPath), message: "فهرس المنهج لا يحدد عنوان المصدر الأصلي" });
    }
    if (!Number.isInteger(index.source?.pages) || index.source.pages < 1) {
      stats.indexesWithoutSourcePageCount++;
      warnings.push({ file: relative(".", indexPath), message: "عدد صفحات المصدر غير موثق برقم صحيح موجب" });
    }

    const groups = index.units || index.chapters || [];
    if (!Array.isArray(groups)) {
      errors.push({ file: relative(".", indexPath), message: "حقل الوحدات أو الفصول ليس مصفوفة" });
      continue;
    }
    const seenGroupNumbers = new Set();
    let previousGroupNumber = null;
    for (const [groupIndex, group] of groups.entries()) {
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        errors.push({ file: relative(".", indexPath), message: "عنصر الوحدة أو الفصل ليس كائناً صالحاً" });
        continue;
      }

      const groupNumber = group.sequence ?? group.number;
      if (groupNumber !== undefined) {
        if (!Number.isInteger(groupNumber) || groupNumber < 0) {
          errors.push({ file: relative(".", indexPath), group: groupIndex,
            message: "رقم أو ترتيب الوحدة أو الفصل يجب أن يكون عدداً صحيحاً غير سالب" });
        } else {
          if (seenGroupNumbers.has(groupNumber)) {
            stats.duplicateIndexGroupNumbers++;
            errors.push({ file: relative(".", indexPath), group: groupIndex, groupNumber,
              message: "رقم أو ترتيب الوحدة أو الفصل مكرر داخل الفهرس" });
          }
          if (previousGroupNumber !== null && groupNumber <= previousGroupNumber) {
            warnings.push({ file: relative(".", indexPath), group: groupIndex, groupNumber,
              message: "ترتيب الوحدات أو الفصول ليس تصاعدياً" });
          }
          seenGroupNumbers.add(groupNumber);
          previousGroupNumber = groupNumber;
        }
      }

      // Grade-one indexes are the currently active content scope. Report incomplete
      // source metadata as warnings, while malformed supplied page ranges are errors.
      if (indexPath.includes("grade-1/")) {
        stats.indexGroups++;
        if (typeof group.title !== "string" || !group.title.trim()) {
          stats.groupsWithoutTitle++;
          warnings.push({ file: relative(".", indexPath), group: groupIndex,
            message: "الوحدة أو الفصل بلا عنوان واضح" });
        }
        const pageRange = group.bookPages ?? group.pdfPages;
        if (!Array.isArray(pageRange) || pageRange.length !== 2 ||
            !pageRange.every(page => Number.isInteger(page) && page > 0) ||
            pageRange[0] > pageRange[1]) {
          stats.groupsWithoutSourcePages++;
          warnings.push({ file: relative(".", indexPath), group: groupIndex,
            message: "نطاق صفحات مصدر الوحدة أو الفصل مفقود أو غير صالح" });
        } else if (Number.isInteger(index.source?.pages) && pageRange[1] > index.source.pages) {
          errors.push({ file: relative(".", indexPath), group: groupIndex, pageRange,
            sourcePages: index.source.pages,
            message: "نطاق صفحات الوحدة أو الفصل يتجاوز عدد صفحات المصدر المعلن" });
        }
      }

      const linked = group.lessonFiles || (group.lessonFile ? [group.lessonFile] : []);
      if (indexPath.includes("grade-1/") && Array.isArray(linked) && linked.length === 0) {
        stats.groupsWithoutLinkedLessons++;
        warnings.push({ file: relative(".", indexPath), group: groupIndex,
          message: "الوحدة أو الفصل غير مرتبط بملفات دروس" });
      }
      if (!Array.isArray(linked)) {
        errors.push({ file: relative(".", indexPath), message: "روابط ملفات الدروس يجب أن تكون مصفوفة" });
        continue;
      }
      for (const entry of linked) {
        if (typeof entry !== "string" || !entry.trim()) {
          errors.push({ file: relative(".", indexPath), message: "مسار ملف الدرس فارغ أو ليس نصاً" });
          continue;
        }
        const target = join(dirname(indexPath), entry);
        try {
          const data = JSON.parse(await readFile(target, "utf8"));
          stats.linkedLessonFiles++;
          const rows = data.lessons || data.sequence || [];
          if (!Array.isArray(rows)) errors.push({
            file: relative(".", target), message: "حقل الدروس ليس مصفوفة"
          });
        } catch (error) {
          errors.push({
            file: relative(".", target),
            message: `رابط ملف الدروس غير صالح أو JSON غير قابل للقراءة: ${error.message}`
          });
        }
      }
    }
  }
}

const files = await walk(root);
for (const file of files) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
    stats.jsonFiles++;
  } catch (error) {
    errors.push({ file: relative(".", file), message: `JSON غير صالح: ${error.message}` });
    continue;
  }

  const lessons = data.lessons ?? data.sequence ?? [];
  if (!Array.isArray(lessons)) {
    errors.push({ file: relative(".", file), message: "حقل lessons أو sequence ليس مصفوفة" });
  }
  const lessonRows = Array.isArray(lessons) ? lessons : [];
  stats.lessons += lessonRows.length;
  const groups = data.units ?? data.chapters;
  if (groups !== undefined) {
    if (Array.isArray(groups)) stats.unitsOrChapters += groups.length;
    else errors.push({ file: relative(".", file), message: "حقل units أو chapters ليس مصفوفة" });
  }

  const ids = new Set();
  for (const [index, lesson] of lessonRows.entries()) {
    if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) {
      errors.push({ file: relative(".", file), lesson: index, message: "سجل الدرس ليس كائناً صالحاً" });
      continue;
    }
    if (!lesson.id) warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا id" });
    else if (ids.has(lesson.id)) errors.push({ file: relative(".", file), lesson: lesson.id, message: "معرف درس مكرر داخل الملف" });
    else ids.add(lesson.id);
    if (lesson.id) {
      const prior = globalLessonIds.get(lesson.id);
      if (prior && prior !== relative(".", file)) errors.push({ file: relative(".", file), lesson: lesson.id, previousFile: prior, message: "معرف درس مكرر عبر ملفات المناهج" });
      else globalLessonIds.set(lesson.id, relative(".", file));
    }

    if (!lesson.title) warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا عنوان" });
    if (!lesson.objective) {
      stats.lessonsWithoutObjective++;
      warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا هدف معلن" });
    }
    if (!Array.isArray(lesson.examples) && !lesson.example) stats.lessonsWithoutExamples++;

    const hasExplanation = (Array.isArray(lesson.explanation) && lesson.explanation.length > 0) ||
      (Array.isArray(lesson.teacherScript) && lesson.teacherScript.some(line => line && typeof line.text === "string" && line.text.trim()));
    if (Array.isArray(lesson.teacherScript) && lesson.teacherScript.length > 0) stats.lessonsUsingTeacherScript++;
    if (!hasExplanation) {
      stats.lessonsWithoutExplanation++;
      warnings.push({ file: relative(".", file), lesson: lesson.id || index,
        message: "الدرس بلا شرح تعليمي منظم؛ يلزم التحقق من وجود شرح مناسب قبل اعتماده" });
    }
    if (!Array.isArray(lesson.activities) || lesson.activities.length === 0) {
      stats.lessonsWithoutActivities++;
      warnings.push({ file: relative(".", file), lesson: lesson.id || index,
        message: "الدرس بلا أنشطة؛ قد لا يقدم ممارسة تفاعلية كافية" });
    }
    const hasAssessableActivity = Array.isArray(lesson.activities) && lesson.activities.some(item =>
      item && typeof item === "object" && Object.hasOwn(item, "answer") && item.answer !== undefined && item.answer !== null);
    if ((!Array.isArray(lesson.quiz) || lesson.quiz.length === 0) && !hasAssessableActivity) {
      stats.lessonsWithoutQuiz++;
      warnings.push({ file: relative(".", file), lesson: lesson.id || index,
        message: "الدرس بلا أسئلة تقييمية؛ لا يمكن التحقق من فهم الطالب بهذا الاختبار" });
    }
    const lessonPages = lesson.bookPages ?? lesson.printedPages;
    if (lesson.bookPages === undefined && Array.isArray(lesson.printedPages)) stats.lessonsUsingPrintedPages++;
    if (!Array.isArray(lessonPages) || lessonPages.length !== 2 ||
        !lessonPages.every(page => Number.isInteger(page) && page > 0) ||
        lessonPages[0] > lessonPages[1]) {
      stats.lessonsWithoutBookPages++;
      warnings.push({ file: relative(".", file), lesson: lesson.id || index,
        message: "نطاق صفحات المصدر مفقود أو غير صالح؛ يلزم ربط الدرس بموضعه في الكتاب" });
    }
    if (index > 0 && Number.isFinite(lesson.order) && Number.isFinite(lessonRows[index - 1]?.order) &&
        lesson.order <= lessonRows[index - 1].order) {
      stats.duplicateLessonOrders++;
      warnings.push({ file: relative(".", file), lesson: lesson.id || index,
        message: "ترتيب الدرس ليس تصاعدياً مقارنة بالدرس السابق؛ راجع تسلسل العرض" });
    }

    for (const [activityIndex, activity] of (Array.isArray(lesson.activities) ? lesson.activities : []).entries()) {
      if (!activity || typeof activity !== "object" || Array.isArray(activity)) continue;
      if (typeof activity.type === "string" && activity.type.trim()) {
        stats.activityTypes[activity.type] = (stats.activityTypes[activity.type] || 0) + 1;
      } else {
        stats.activitiesWithoutType++;
      }
      if (Object.hasOwn(activity, "answer") && activity.answer !== undefined && activity.answer !== null) {
        stats.activitiesWithAnswer++;
      } else {
        stats.activitiesWithoutAnswer++;
      }
      if (Array.isArray(activity.choices) || Array.isArray(activity.options)) stats.activitiesWithOptions++;
      if (![activity.q, activity.prompt, activity.question, activity.instruction, activity.task]
        .some(value => typeof value === "string" && value.trim())) {
        stats.activitiesWithoutPrompt++;
        if ([activity.expected, activity.goal].some(value => typeof value === "string" && value.trim())) {
          stats.activitiesUsingFallbackText++;
        } else if (generatedPromptTypes.has(activity.type)) {
          stats.activitiesUsingGeneratedPrompt++;
        } else {
          stats.activitiesWithoutDisplayText++;
          warnings.push({
            file: relative(".", file), lesson: lesson.id || index,
            activity: activityIndex, type: activity.type,
            message: "النشاط لا يحتوي سؤالاً أو تعليمات أو نصاً مولداً معروفاً؛ راجع وضوح المهمة المعروضة للطالب"
          });
        }
      }
    }
    const assessable = [
      ...(Array.isArray(lesson.activities) ? lesson.activities : []),
      ...(Array.isArray(lesson.quiz) ? lesson.quiz : [])
    ].filter(item => item && typeof item === "object" &&
      Object.hasOwn(item, "answer") && item.answer !== undefined && item.answer !== null).length;
    if (!assessable) {
      stats.lessonsWithoutAutoAssessment++;
      warnings.push({ file: relative(".", file), lesson: lesson.id || index,
        message: "لا يحتوي الدرس على أسئلة ذات إجابات مرجعية؛ لا يمكن اعتماد إتقانه آلياً حالياً" });
    }
    if (lesson.mastery !== undefined) {
      stats.masteryConfigured++;
      const mastery = lesson.mastery;
      if (!mastery || typeof mastery !== "object" || Array.isArray(mastery)) {
        errors.push({ file: relative(".", file), lesson: lesson.id || index,
          message: "إعداد mastery يجب أن يكون كائناً" });
      } else {
        const required = mastery.requiredCorrect;
        const checks = mastery.totalChecks;
        const validInteger = value => Number.isInteger(value) && value >= 0;
        if (!validInteger(required) || !validInteger(checks) || checks < 1 ||
            required > checks || checks > assessable) {
          errors.push({ file: relative(".", file), lesson: lesson.id || index,
            requiredCorrect: mastery.requiredCorrect, totalChecks: mastery.totalChecks,
            assessable, message: "متطلبات mastery غير متوافقة: يجب أن تكون أعداداً صحيحة، وأن يكون 1 ≤ totalChecks ≤ عدد الأسئلة القابلة للتقييم، وrequiredCorrect ≤ totalChecks" });
        }
      }
    }
  }

  inspect(data, file);
}

await verifyIndexes();
stats.uniqueLessonIds = globalLessonIds.size;
console.log(JSON.stringify({ stats, errors, warnings }, null, 2));
if (errors.length) process.exitCode = 1;
