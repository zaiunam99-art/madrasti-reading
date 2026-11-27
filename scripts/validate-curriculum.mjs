import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.argv[2] || "curriculum";
const errors = [];
const warnings = [];
const stats = { jsonFiles: 0, lessons: 0, answerChecks: 0, unitsOrChapters: 0 };

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

  if (Array.isArray(node.choices) && Object.hasOwn(node, "answer")) {
    stats.answerChecks++;
    const options = optionsOf(node.choices);
    const answers = Array.isArray(node.answer) ? node.answer.map(String) : [String(node.answer)];
    const valid = Array.isArray(node.answer)
      ? answers.every(answer => options.includes(answer))
      : options.includes(answers[0]);
    if (!valid) errors.push({
      file: relative(".", file), path, answer: node.answer, options,
      message: "الإجابة المحددة غير موجودة ضمن الخيارات"
    });
  }

  for (const [key, value] of Object.entries(node)) {
    inspect(value, file, `${path}.${key}`);
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

  const lessons = data.lessons || data.sequence || [];
  stats.lessons += lessons.length;
  if (data.units || data.chapters) stats.unitsOrChapters += (data.units || data.chapters).length;

  const ids = new Set();
  for (const [index, lesson] of lessons.entries()) {
    if (!lesson.id) warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا id" });
    else if (ids.has(lesson.id)) errors.push({ file: relative(".", file), lesson: lesson.id, message: "معرف درس مكرر داخل الملف" });
    else ids.add(lesson.id);

    if (!lesson.title) warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا عنوان" });
    if (!lesson.objective) warnings.push({ file: relative(".", file), lesson: index, message: "الدرس بلا هدف معلن" });
  }

  inspect(data, file);
}

console.log(JSON.stringify({ stats, errors, warnings }, null, 2));
if (errors.length) process.exitCode = 1;
