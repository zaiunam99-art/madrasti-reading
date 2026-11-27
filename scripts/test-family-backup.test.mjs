import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
function extractFunction(name, nextName) {
  const start = html.indexOf("function " + name + "(");
  const end = html.indexOf("\nfunction " + nextName + "(", start);
  assert.ok(start >= 0 && end > start, name + " helper must exist");
  return html.slice(start, end);
}
const source = extractFunction("validateFamilyBackup", "applyFamilyBackup") +
  "\n" + extractFunction("applyFamilyBackup", "exportFamilyBackup");

const validChild = {
  id: "child_a", name: "طفل", gender: "neutral", grade: "الأول الابتدائي",
  avatar: "🧒", voice: "default", dailyCount: 2,
  subjects: ["القراءة", "الرياضيات"], completed: 1
};
function helpers(storage) {
  const sandbox = { storage };
  runInNewContext(source + "; globalThis.validateFamilyBackup=validateFamilyBackup; globalThis.applyFamilyBackup=applyFamilyBackup;", sandbox);
  return sandbox;
}
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) {
      if (this.failOn === key) { this.failOn = null; throw new Error("quota"); }
      map.set(key, String(value));
    },
    removeItem(key) { map.delete(key); },
    failOn: null
  };
}
const backup = (overrides = {}) => ({
  format: "madrasti-family-backup", version: 1,
  family: [validChild], progressRaw: JSON.stringify({ child_a: ["lesson-1"] }),
  ...overrides
});

test("accepts a valid family backup and keeps the child progress record", () => {
  const storage = makeStorage();
  const api = helpers(storage);
  const result = api.validateFamilyBackup(backup());
  assert.equal(result.family.length, 1);
  assert.equal(result.family[0].id, "child_a");
  assert.deepEqual(JSON.parse(result.progressRaw), { child_a: ["lesson-1"] });
});

test("rejects duplicate child IDs and unsupported backup versions", () => {
  const api = helpers(makeStorage());
  assert.throws(() => api.validateFamilyBackup(backup({ family: [validChild, validChild] })), /معرّف مكرر/);
  assert.throws(() => api.validateFamilyBackup(backup({ version: 99 })), /غير صالح أو غير مدعوم/);
});

test("rejects unsafe or malformed child records before changing storage", () => {
  const storage = makeStorage({ madrastiFamilyDemoV2: "existing-family" });
  const api = helpers(storage);
  const invalid = { ...validChild, subjects: ["unknown"] };
  assert.throws(() => api.applyFamilyBackup(backup({ family: [invalid] }), storage));
  assert.equal(storage.getItem("madrastiFamilyDemoV2"), "existing-family");
});

test("restores family and progress atomically when both writes succeed", () => {
  const storage = makeStorage({ madrastiFamilyDemoV2: "old-family", madrastiCompletedLessonsV1: "{}" });
  const api = helpers(storage);
  const result = api.applyFamilyBackup(backup(), storage);
  assert.equal(JSON.parse(storage.getItem("madrastiFamilyDemoV2"))[0].id, "child_a");
  assert.deepEqual(JSON.parse(storage.getItem("madrastiCompletedLessonsV1")), { child_a: ["lesson-1"] });
  assert.equal(result.family[0].id, "child_a");
});

test("rolls back both storage keys if the progress write fails", () => {
  const storage = makeStorage({ madrastiFamilyDemoV2: "old-family", madrastiCompletedLessonsV1: "old-progress" });
  storage.failOn = "madrastiCompletedLessonsV1";
  const api = helpers(storage);
  assert.throws(() => api.applyFamilyBackup(backup(), storage), /تمت إعادة البيانات السابقة/);
  assert.equal(storage.getItem("madrastiFamilyDemoV2"), "old-family");
  assert.equal(storage.getItem("madrastiCompletedLessonsV1"), "old-progress");
});
