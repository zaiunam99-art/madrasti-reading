import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const student = readFileSync(new URL("../student.html", import.meta.url), "utf8");
const parent = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../student.webmanifest", import.meta.url), "utf8"));
const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("student app has a dedicated standalone entry and manifest", () => {
  assert.match(student, /<title>مدرستي \| مساحة الطالب<\/title>/);
  assert.match(student, /rel="manifest" href="\/student\.webmanifest"/);
  assert.equal(manifest.start_url, "/student.html");
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
});

test("student app does not expose parent account-management controls", () => {
  for (const forbidden of ["guardianView", "familyStats", "openChildForm", "deleteChild", "exportFamilyBackup", "importFamilyBackup"]) {
    assert.equal(student.includes(forbidden), false, "student page must not contain " + forbidden);
  }
  assert.match(student, /إدارة ملفات الطلاب وإعداداتهم تتم من تطبيق ولي الأمر/);
  assert.match(student, /href="\\/index\\.html"/);
});

test("parent app links to the separate student experience", () => {
  assert.match(parent, /href="\/student\.html"/);
  assert.match(parent, /تطبيق الطالب المستقل/);
  assert.doesNotMatch(parent, /onclick="enterChild\(/);
});

test("offline shell caches the student app and preserves its navigation fallback", () => {
  assert.match(worker, /"\/student\.html"/);
  assert.match(worker, /"\/student\.webmanifest"/);
  assert.match(worker, /url\.pathname === "\/student\.html" \? "\/student\.html" : "\/index\.html"/);
});

test("student app uses the parent's local profile store without claiming cross-device sync", () => {
  assert.match(student, /madrastiFamilyDemoV2/);
  assert.match(student, /على هذا الجهاز فقط/);
  assert.doesNotMatch(student, /fetch\s*\([^)]*(?:family|profile|account)/i);
});
