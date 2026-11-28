import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const validator = resolve(here, "validate-curriculum.mjs");

function makeFixture(t, { units, chapters = [], lessonData } = {}) {
  const root = mkdtempSync(join(tmpdir(), "madrasti-validator-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const reading = join(root, "grade-1", "reading-2025-2026");
  const math = join(root, "grade-1", "math-2025-2026");
  const grade2Math = join(root, "grade-2", "math-2025-2026");
  mkdirSync(reading, { recursive: true });
  mkdirSync(math, { recursive: true });
  mkdirSync(grade2Math, { recursive: true });
  writeFileSync(join(grade2Math, "chapters-index.json"), JSON.stringify({ chapters: [] }));

  const readingUnits = units ?? (lessonData === undefined ? [] : [
    { sequence: 1, title: "اختبار", lessonFile: "lessons.json" }
  ]);
  writeFileSync(join(reading, "units-index.json"), JSON.stringify({ units: readingUnits }));
  writeFileSync(join(math, "chapters-index.json"), JSON.stringify({ chapters }));
  if (lessonData !== undefined) {
    writeFileSync(join(reading, "lessons.json"), JSON.stringify({ lessons: lessonData }));
  }
  return root;
}

function runValidator(root) {
  const result = spawnSync(process.execPath, [validator, root], { encoding: "utf8" });
  assert.equal(result.error, undefined, result.error?.message);
  const report = JSON.parse(result.stdout);
  return { status: result.status, report, stderr: result.stderr };
}

test("accepts a valid sequence whose item labels intentionally repeat", t => {
  const root = makeFixture(t, {
    lessonData: [{
      id: "sequence-repeat",
      title: "ترتيب",
      objective: "تدريب",
      activities: [{
        type: "sequence_order",
        items: ["أ", "أ", "ب"],
        answer: ["أ", "ب", "أ"]
      }]
    }]
  });
  const { status, report } = runValidator(root);
  assert.equal(status, 0, JSON.stringify(report.errors));
  assert.equal(report.stats.sequenceChecks, 1);
  assert.deepEqual(report.errors, []);
});

test("reports malformed lesson records without crashing", t => {
  const root = makeFixture(t, { lessonData: [null] });
  const { status, report } = runValidator(root);
  assert.equal(status, 1);
  assert.ok(report.errors.some(error => error.message.includes("سجل الدرس")));
});

test("reports a malformed units index without crashing", t => {
  const root = makeFixture(t, { units: { unexpected: true } });
  const { status, report } = runValidator(root);
  assert.equal(status, 1);
  assert.ok(report.errors.some(error => error.message.includes("ليس مصفوفة")));
});

test("reports invalid lesson-file link types", t => {
  const root = makeFixture(t, { units: [{ sequence: 1, lessonFiles: "lessons.json" }] });
  const { status, report } = runValidator(root);
  assert.equal(status, 1);
  assert.ok(report.errors.some(error => error.message.includes("روابط ملفات الدروس")));
});

test("rejects empty and incomplete sequence-order activities", t => {
  const root = makeFixture(t, {
    lessonData: [{
      id: "sequence-empty",
      title: "ترتيب فارغ",
      objective: "تدريب",
      activities: [
        { type: "sequence_order", items: [], answer: [] },
        { type: "sequence_order", items: ["أ", "ب"], answer: ["أ"] }
      ]
    }]
  });
  const { status, report } = runValidator(root);
  assert.equal(status, 1);
  assert.equal(report.errors.filter(error => error.message.includes("مصفوفتين غير فارغتين")).length, 2);
});

test("rejects malformed activity and quiz collections", t => {
  const root = makeFixture(t, {
    lessonData: [{
      id: "bad-questions",
      title: "أسئلة غير صالحة",
      objective: "تدريب",
      activities: [null, ["not", "a", "question"]],
      quiz: "not-an-array"
    }]
  });
  const { status, report } = runValidator(root);
  assert.equal(status, 1);
  assert.ok(report.errors.some(error => error.message.includes("عنصر activities")));
  assert.ok(report.errors.some(error => error.message.includes("حقل quiz")));
});

test("supports legacy sequence lessons with printed pages and teacher scripts", t => {
  const root = makeFixture(t, {
    lessonData: [{
      id: "legacy-sequence",
      title: "درس بصيغة التسلسل",
      objective: "هدف قابل للملاحظة",
      printedPages: [8, 9],
      teacherScript: [
        { role: "welcome", text: "أهلاً بك." },
        { role: "explain", text: "هذا شرح تعليمي." }
      ],
      activities: [{
        type: "multiple_choice",
        prompt: "اختر الإجابة الصحيحة.",
        options: ["أ", "ب"],
        answer: "أ"
      }, {
        type: "listening",
        expected: "إجابة شفوية مناسبة"
      }, {
        type: "count_back",
        start: 7,
        steps: 2,
        answer: 5
      }, {
        type: "unmapped_activity"
      }],
      mastery: { requiredCorrect: 1, totalChecks: 1 }
    }]
  });
  const { status, report } = runValidator(root);
  assert.equal(status, 0, JSON.stringify(report.errors));
  assert.equal(report.stats.lessonsUsingPrintedPages, 1);
  assert.equal(report.stats.lessonsUsingTeacherScript, 1);
  assert.equal(report.stats.lessonsWithoutExplanation, 0);
  assert.equal(report.stats.lessonsWithoutQuiz, 0);
  assert.equal(report.stats.lessonsWithoutBookPages, 0);
  assert.equal(report.stats.lessonsWithoutAutoAssessment, 0);
  assert.equal(report.stats.activitiesWithAnswer, 2);
  assert.equal(report.stats.activitiesWithoutAnswer, 2);
  assert.equal(report.stats.activitiesWithOptions, 1);
  assert.equal(report.stats.activitiesWithoutPrompt, 3);
  assert.equal(report.stats.activitiesUsingFallbackText, 1);
  assert.equal(report.stats.activitiesUsingGeneratedPrompt, 1);
  assert.equal(report.stats.activitiesWithoutDisplayText, 1);
  assert.deepEqual(report.errors, []);
});


test("recognizes curriculum activity types with prompts generated by the runtime", t => {
  const root = makeFixture(t, {
    lessonData: [{
      id: "generated-prompts",
      title: "مهارات عددية",
      objective: "تدريب",
      activities: [
        { type: "place_value", number: 42, expected: { tens: 4, ones: 2 } },
        { type: "compose_number", tens: 5, ones: 3, answer: 53 },
        { type: "complete_pattern", sequence: [10, 20, null], answer: 30 },
        { type: "skip_count", start: 20, step: 2, count: 3, answer: [22, 24, 26] },
        { type: "compare_numbers", a: 36, b: 42, answer: "36 < 42" },
        { type: "previous_next", number: 70, previous: 69, next: 71 },
        { type: "order_numbers", numbers: [3, 1, 2], ascending: [1, 2, 3] },
        { type: "tens_add", a: 40, b: 30, answer: 70 },
        { type: "tens_subtract", a: 80, b: 50, answer: 30 },
        { type: "two_digit_add", a: 43, b: 26, expected: 69 },
        { type: "two_digit_subtract", a: 58, b: 23, expected: 35 }
      ]
    }]
  });
  const { status, report } = runValidator(root);
  assert.equal(status, 0, JSON.stringify(report.errors));
  assert.equal(report.stats.activitiesUsingGeneratedPrompt, 11);
  assert.equal(report.stats.activitiesWithoutDisplayText, 0);
  assert.deepEqual(report.errors, []);
});


test("keeps matching activities visible as unresolved when no matching renderer exists", t => {
  const root = makeFixture(t, {
    lessonData: [{
      id: "unsupported-matching",
      title: "المطابقة",
      objective: "تدريب",
      activities: [
        { type: "match_solid_object", pairs: [["قمع", "مخروط"]] },
        { type: "match_number_words", pairs: [["20", "عشرون"]] }
      ]
    }]
  });
  const { status, report } = runValidator(root);
  assert.equal(status, 0, JSON.stringify(report.errors));
  assert.equal(report.stats.activitiesWithoutDisplayText, 2);
  assert.equal(report.warnings.filter(warning => warning.message.includes("لا يحتوي سؤالاً أو تعليمات")).length, 2);
});
