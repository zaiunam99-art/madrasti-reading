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
