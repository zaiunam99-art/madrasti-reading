import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("unified backup exports student profiles and the isolated progress store", () => {
  assert.match(html, /function exportGuardianBackup\(\)/);
  assert.match(html, /format:"madrasti-unified-backup",version:1/);
  assert.match(html, /family,progressRaw:localStorage\.getItem\(STUDENT_PROGRESS_KEY\)/);
});

test("restore validates backup format, child records, and progress before replacement", () => {
  assert.match(html, /async function importGuardianBackup\(event\)/);
  assert.match(html, /data\.format!=="madrasti-unified-backup"/);
  assert.match(html, /data\.version!==1/);
  assert.match(html, /data\.family\.length>100/);
  assert.match(html, /progress\[id\]\.some\(v=>typeof v!=="string"\|\|v\.length>120\)/);
  assert.match(html, /ستُستبدل ملفات الطلاب وسجل التقدم الحاليان/);
});

test("restore attempts to roll back both stores if writing fails", () => {
  assert.match(html, /const oldProfiles=localStorage\.getItem\(STUDENT_PROFILES_KEY\),oldProgress=localStorage\.getItem\(STUDENT_PROGRESS_KEY\)/);
  assert.match(html, /تعذرت الاستعادة؛ أُعيدت البيانات السابقة/);
});
