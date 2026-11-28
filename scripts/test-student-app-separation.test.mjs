import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const student = readFileSync(new URL("../student.html", import.meta.url), "utf8");
const parent = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../student.webmanifest", import.meta.url), "utf8"));
const parentManifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("student app has a dedicated standalone entry and manifest", () => {
  assert.match(student, /<title>مدرستي \| مساحة الطالب<\/title>/);
  assert.match(student, /rel="manifest" href="\/student\.webmanifest"/);
  assert.equal(manifest.start_url, "/student.html");
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.id, "/student.html");
  assert.equal(parentManifest.start_url, "/index.html");
  assert.equal(parentManifest.id, "/index.html");
  assert.notEqual(parentManifest.id, manifest.id);
  assert.equal(parentManifest.icons[0].src, "/parent-icon.svg");
  assert.equal(manifest.icons[0].src, "/student-icon.svg");
  assert.match(parent, /parent-icon\.svg/);
  assert.match(student, /student-icon\.svg/);
});

test("student app does not expose parent account-management controls", () => {
  for (const forbidden of ["guardianView", "familyStats", "openChildForm", "deleteChild", "exportFamilyBackup", "importFamilyBackup"]) {
    assert.equal(student.includes(forbidden), false, "student page must not contain " + forbidden);
  }
  assert.match(student, /إدارة ملفات الطلاب وإعداداتهم تتم من تطبيق ولي الأمر/);
  assert.match(student, /href="\/index\.html"/);
});

test("parent app links to the separate student experience", () => {
  assert.match(parent, /href="\/student\.html"/);
  assert.match(parent, /تطبيق الطالب المستقل/);
  assert.doesNotMatch(parent, /onclick="enterChild\(/);
});

test("offline shell caches both applications and preserves navigation fallbacks", () => {
  assert.match(worker, /"\/student\.html"/);
  assert.match(worker, /"\/student\.webmanifest"/);
  assert.match(worker, /"\/parent-icon\.svg"/);
  assert.match(worker, /"\/student-icon\.svg"/);
  assert.match(worker, /madrasti-shell-v8/);
  assert.match(worker, /url\.pathname === "\/student\.html" \? "\/student\.html" : "\/index\.html"/);
});

test("student app uses separate local profile and progress stores", () => {
  assert.match(student, /madrastiStudentProfilesV1/);
  assert.match(student, /madrastiStudentProgressV1/);
  assert.doesNotMatch(student, /madrastiFamilyDemoV2/);
  assert.match(student, /function importStudentProfile/);
  assert.match(student, /function exportStudentProgress/);
  assert.match(student, /madrasti-student-transfer/);
});

test("parent app contains no embedded student learning screens or runtime", () => {
  for (const legacy of ['id="childView"', 'id="lessonView"', 'id="childPicker"', "function selectChild(", "function openSubject(", "curriculum-runtime.js"]) {
    assert.equal(parent.includes(legacy), false, "parent app must not contain " + legacy);
  }
  assert.match(parent, /href="\/student\.html"/);
  assert.match(parent, /id="guardianView"/);
  assert.match(parent, /id="children"/);
});
