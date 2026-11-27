import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const start = runtime.indexOf("  window.finishLesson = function() {");
const end = runtime.indexOf("\n  };", start);
assert.ok(start >= 0 && end > start, "finishLesson handler must exist");
const handler = runtime.slice(start, end + 4);

function runFinish({ failFamilySave = false, alreadyCompleted = false } = {}) {
  const previousProgress = JSON.stringify(alreadyCompleted ? { child_a: ["lesson-1"] } : {});
  const values = new Map([["madrastiCompletedLessonsV1", previousProgress]]);
  const messages = [];
  const elements = {
    feedback: { textContent: "" },
    lessonView: { classList: { add() {} } },
    childView: { classList: { remove() {} } },
    studentArea: { prepend(note) { messages.push(note.textContent); } }
  };
  const sandbox = {
    window: { selectChild() {} },
    current: { id: "lesson-1", quiz: [] },
    active: { id: "child_a", completed: 2 },
    questionIndex: 0,
    assessedCount: 1,
    score: 1,
    questionList() { return []; },
    readCompletedMap() { return JSON.parse(values.get("madrastiCompletedLessonsV1") || "{}"); },
    appendCompletedLesson(map, childId, lessonId) {
      const ids = Array.isArray(map[childId]) ? map[childId] : [];
      return { map: { ...map, [childId]: [...new Set([...ids, lessonId])] }, alreadyCompleted: ids.includes(lessonId) };
    },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    save() { return !failFamilySave; },
    document: { getElementById(id) { return elements[id]; }, createElement() { return { className: "", textContent: "" }; } },
    console: { warn() {} }
  };
  runInNewContext(handler + "; window.finishLesson();", sandbox);
  return { sandbox, values, elements, messages };
}

test("rolls back lesson progress and does not leave the lesson when family save fails", () => {
  const result = runFinish({ failFamilySave: true });
  assert.equal(result.values.get("madrastiCompletedLessonsV1"), JSON.stringify({}));
  assert.equal(result.sandbox.active.completed, 2);
  assert.match(result.elements.feedback.textContent, /لم يتم اعتماد إكمال الدرس/);
  assert.equal(result.messages.length, 0);
});

test("commits progress and family counter when both saves succeed", () => {
  const result = runFinish();
  assert.deepEqual(JSON.parse(result.values.get("madrastiCompletedLessonsV1")), { child_a: ["lesson-1"] });
  assert.equal(result.sandbox.active.completed, 3);
  assert.equal(result.messages.length, 1);
});

test("reopening an already completed lesson does not increment the family counter", () => {
  const result = runFinish({ alreadyCompleted: true });
  assert.deepEqual(JSON.parse(result.values.get("madrastiCompletedLessonsV1")), { child_a: ["lesson-1"] });
  assert.equal(result.sandbox.active.completed, 2);
});

test("does not overwrite a malformed saved progress record", () => {
  const malformed = "{broken-progress-json";
  const values = new Map([["madrastiCompletedLessonsV1", malformed]]);
  const feedback = { textContent: "" };
  const sandbox = {
    window: { selectChild() {} },
    current: { id: "lesson-1", quiz: [] },
    active: { id: "child_a", completed: 2 },
    questionIndex: 0,
    assessedCount: 1,
    score: 1,
    questionList() { return []; },
    readCompletedMap() { return null; },
    appendCompletedLesson() { throw new Error("must not append corrupt progress"); },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    save() { throw new Error("family save must not run"); },
    document: { getElementById(id) { return id === "feedback" ? feedback : { classList: { add() {}, remove() {} } }; }, createElement() { return {}; } },
    console: { warn() {} }
  };
  const start = runtime.indexOf("  window.finishLesson = function() {");
  const end = runtime.indexOf("\\n  };", start);
  const handler = runtime.slice(start, end + 4);
  runInNewContext(handler + "; window.finishLesson();", sandbox);
  assert.equal(values.get("madrastiCompletedLessonsV1"), malformed);
  assert.equal(sandbox.active.completed, 2);
  assert.match(feedback.textContent, /تعذر حفظ تقدمك/);
});
