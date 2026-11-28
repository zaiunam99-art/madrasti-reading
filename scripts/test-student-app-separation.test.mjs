import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const alias = readFileSync(new URL("../student.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("the root entry is the single unified student-first application", () => {
  assert.match(app, /<title>مدرستي \| التعلّم<\/title>/);
  assert.match(app, /href="\/manifest\.webmanifest"/);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.id, "/index.html");
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.icons[0].src, "/student-icon.svg");
  assert.match(app, /id="studentGate"/);
  assert.match(app, /id="childView"/);
  assert.match(app, /id="lessonView"/);
});

test("guardian management is embedded in the same app and locally PIN-gated", () => {
  for (const marker of ['id="openGuardian"','id="guardianPanel"','id="guardianForm"','id="guardianChildren"','id="changeGuardianPin"']) assert.ok(app.includes(marker), marker);
  assert.match(app, /madrastiGuardianPinHashV1/);
  assert.match(app, /madrasti-unified-backup/);
  assert.match(app, /madrastiStudentProfilesV1/);
  assert.match(app, /madrastiStudentProgressV1/);
  assert.match(app, /madrastiFamilyDemoV2/);
  assert.match(app, /madrastiCompletedLessonsV1/);
});

test("legacy student URL forwards to the unified root application", () => {
  assert.match(alias, /location\.replace\("\/"\)/);
});

test("offline shell caches the unified application and curriculum resources", () => {
  assert.match(worker, /"\/index\.html"/);
  assert.match(worker, /"\/student-icon\.svg"/);
  assert.match(worker, /madrasti-shell-v10/);
  assert.match(worker, /caches\.match\("\/index\.html"\)/);
  assert.match(worker, /"\/curriculum\/grade-1\/reading-2025-2026\/lessons\/unit-01-my-family\.json"/);
  assert.match(worker, /"\/curriculum\/grade-1\/math-2025-2026\/lessons\/chapter-09-lessons-01-04\.json"/);
});

test("the student learning engine remains integrated", () => {
  assert.match(app, /curriculum-runtime\.js/);
  assert.match(app, /function importStudentProfile/);
  assert.match(app, /function exportStudentProgress/);
  assert.match(app, /function startStudent/);
});


test("student entry explains that guardian profiles can be created in the same app", () => {
  assert.match(app, /يستطيع ولي الأمر إنشاء ملف من زر «ولي الأمر» أعلى الصفحة/);
  assert.doesNotMatch(app, /استورد ملفاً يصدره ولي الأمر/);
  assert.match(app, /id="openGuardian"/);
});


test("student interface uses a playful game-like visual identity", () => {
  for (const className of [".game-hero", ".game-stats", ".game-stat", ".quest-card", ".lesson-path", ".path-dot"]) {
    assert.ok(app.includes(className), className);
  }
  assert.match(app, /linear-gradient\\(120deg,#6755d5,#8b67df 58%,#ed83ae\\)/);
  assert.match(app, /prefers-reduced-motion:reduce/);
  assert.match(rt, /نجوم إنجاز/);
  assert.match(rt, /هيا نلعب!/);
  assert.match(rt, /ابدأ المغامرة/);
  assert.match(rt, /مهمة اليوم/);
});
