import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const alias = readFileSync(new URL("../student.html", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");

test("unified app exports one validated child profile and only that child's progress", () => {
  assert.match(app, /function exportGuardianChild\(id\)/);
  assert.match(app, /format:"madrasti-student-transfer",version:1/);
  assert.match(app, /\[id\]:Array\.isArray\(all\[id\]\)/);
  assert.match(app, /function validateStudentTransfer\(data\)/);
  assert.match(app, /Object\.keys\(incoming\)\.some\(key => key !== child\.id\)/);
});

test("unified app imports student profiles into the shared local profile store", () => {
  assert.match(app, /function importStudentProfile\(event\)/);
  assert.match(app, /STUDENT_PROFILES_KEY/);
  assert.match(app, /STUDENT_PROGRESS_KEY/);
  assert.match(app, /previousProfiles/);
  assert.match(app, /previousProgress/);
  assert.match(app, /تعذر حفظ الملف على هذا الجهاز/);
});

test("guardian management and student experience share the same profile store", () => {
  assert.match(app, /function renderGuardianChildren\(\)/);
  assert.match(app, /function startStudent\(\)/);
  assert.match(app, /function exportStudentProgress\(\)/);
  assert.match(app, /madrastiStudentProfilesV1/);
  assert.match(app, /madrastiStudentProgressV1/);
  assert.match(alias, /location\.replace\("\/"\)/);
});

test("lesson runtime reads and writes the isolated student progress store", () => {
  assert.match(runtime, /localStorage\.getItem\("madrastiStudentProgressV1"\)/);
  assert.match(runtime, /const progressKey = "madrastiStudentProgressV1"/);
  assert.doesNotMatch(runtime, /madrastiCompletedLessonsV1/);
});
