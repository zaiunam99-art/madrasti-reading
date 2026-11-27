import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const root = process.argv[2] || "curriculum";
const errors = [];
const warnings = [];
const globalLessonIds = new Map();
const stats = { jsonFiles: 0, lessons: 0, answerChecks: 0, unitsOrChapters: 0, indexFiles: 0, linkedLessonFiles: 0, sequenceChecks: 0 };

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
    const groups = index.units || index.chapters || [];
    if (!Array.isArray(groups)) {
      errors.push({ file: relative(".", indexPath), message: "حقل الوحدات أو الفصول ليس مصفوفة" });
      continue;
    }
    for (const group of groups) {
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        errors.push({ file: relative(".", indexPath), message: "عنصر الوحدة أو الفصل ليس كائناً صالحاً" });
        continue;
      }
      const linked = group.lessonFiles || (group.lessonFile ? [group.lessonFile] : []);
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
    if (!lesson.objective) warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا هدف معلن" });
  }

  inspect(data, file);
}

await verifyIndexes();
stats.uniqueLessonIds = globalLessonIds.size;
console.log(JSON.stringify({ stats, errors, warnings }, null, 2));
if (errors.length) process.exitCode = 1;
