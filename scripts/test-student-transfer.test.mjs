import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const parent = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const student = readFileSync(new URL("../student.html", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");

test("parent exports one validated child profile and only that child's progress", () => {
  assert.match(parent, /function exportStudentProfile\(id\)/);
  assert.match(parent, /format:'madrasti-student-transfer',version:1/);
  assert.match(parent, /\[id\]:Array\.isArray\(all\[id\]\)/);
  assert.match(parent, /function validateStudentTransfer\(data\)/);
  assert.match(parent, /Object\.keys\(progress\)\.some\(key=>key!==child\.id\)/);
});

test("student imports a validated profile into its separate local store", () => {
  assert.match(student, /function importStudentProfile\(event\)/);
  assert.match(student, /STUDENT_PROFILES_KEY/);
  assert.match(student, /STUDENT_PROGRESS_KEY/);
  assert.match(student, /previousProfiles/);
  assert.match(student, /previousProgress/);
  assert.match(student, /تعذر حفظ الملف على هذا الجهاز/);
});

test("student exports progress and parent imports it only for a matching child", () => {
  assert.match(student, /function exportStudentProgress\(\)/);
  assert.match(parent, /function importStudentProgress\(input\)/);
  assert.match(parent, /if\(!existing\)throw new Error/);
  assert.match(parent, /const merged=\[\.\.\.new Set/);
});

test("lesson runtime reads and writes the isolated student progress store", () => {
  assert.match(runtime, /localStorage\.getItem\("madrastiStudentProgressV1"\)/);
  assert.match(runtime, /const progressKey = "madrastiStudentProgressV1"/);
  assert.doesNotMatch(runtime, /madrastiCompletedLessonsV1/);
});
