import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const questionList = runtime.match(/  function questionList\(lesson\) \{[\s\S]*?\n  \}/)?.[0];
const masteryRequirement = runtime.match(/  function masteryRequirement\(lesson\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(questionList && masteryRequirement, "question and mastery helpers must exist");

function requirementFor(lesson) {
  return runInNewContext(questionList + "\n" + masteryRequirement + "\nmasteryRequirement(lesson)", { lesson });
}

test("uses curriculum mastery thresholds when present", () => {
  const result = requirementFor({
    mastery: { requiredCorrect: 2, totalChecks: 3 },
    activities: [{ answer: 1 }, { answer: 2 }],
    quiz: [{ answer: 3 }]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requiredCorrect: 2, totalChecks: 3, evaluableCount: 3, valid: true
  });
});

test("defaults to requiring every assessable question when mastery is not specified", () => {
  const result = requirementFor({ activities: [{ answer: "أ" }, { prompt: "نشاط عملي" }], quiz: [{ answer: "ب" }] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    requiredCorrect: 2, totalChecks: 2, evaluableCount: 2, valid: true
  });
});

test("does not allow completion when a lesson has no assessable questions", () => {
  const result = requirementFor({ activities: [{ type: "trace_numeral", prompt: "تتبّع العدد" }] });
  assert.equal(result.valid, false);
});

test("flags curriculum thresholds that exceed the available assessable questions", () => {
  const result = requirementFor({
    mastery: { requiredCorrect: 3, totalChecks: 3 },
    activities: [{ answer: 1 }, { answer: 2 }]
  });
  assert.equal(result.valid, false);
});

test("completion handler refuses to save progress when mastery is unmet", () => {
  const start = runtime.indexOf("  window.finishLesson = function() {");
  const end = runtime.indexOf("\n  };", start);
  assert.ok(start >= 0 && end > start, "finish handler must exist");
  const handler = runtime.slice(start, end + 4);
  const writes = [];
  const feedback = { textContent: "" };
  const sandbox = {
    window: {},
    current: { id: "lesson-1" },
    active: { id: "child-1", completed: 0 },
    questionIndex: 1, score: 0, assessedCount: 0,
    questionList() { return [{ answer: 1 }]; },
    masteryRequirement() { return { requiredCorrect: 1, totalChecks: 1, evaluableCount: 1, valid: true }; },
    document: { getElementById() { return feedback; } },
    localStorage: { getItem() { return "{}"; }, setItem() { writes.push("set"); } }
  };
  runInNewContext(handler + "; window.finishLesson();", sandbox);
  assert.deepEqual(writes, []);
  assert.match(feedback.textContent, /لم يُعتمد إكمال الدرس/);
});

test("manual activities are not presented as self-certified completion or counted as mastery", () => {
  assert.match(runtime, /هذا تدريب عملي لا يُقيّم آلياً حالياً/);
  assert.match(runtime, /لن يُحتسب ضمن نتيجة الإتقان/);
  assert.match(runtime, /أنشطة عملية تحتاج إلى تنفيذ ومراجعة مع المعلم أو ولي الأمر/);
  assert.doesNotMatch(runtime, /أنهيت النشاط، تابع/);
});

test("rejects impossible mastery configurations where correct answers exceed checks", () => {
  const result = requirementFor({
    mastery: { requiredCorrect: 2, totalChecks: 1 },
    activities: [{ answer: 1 }, { answer: 2 }]
  });
  assert.equal(result.valid, false);
});

test("rejects zero required checks even when the lesson has assessable questions", () => {
  const result = requirementFor({
    mastery: { requiredCorrect: 0, totalChecks: 0 },
    activities: [{ answer: 1 }]
  });
  assert.equal(result.valid, false);
});

test("counts each attempted assessment once while allowing a retry or a move forward", () => {
  assert.match(runtime, /let current = null, questionIndex = 0, score = 0, assessedCount = 0, answered = new Set\(\), resolved = new Set\(\)/);
  assert.match(runtime, /if \(!resolved\.has\(questionIndex\)\) \{\s*resolved\.add\(questionIndex\);\s*assessedCount\+\+;/);
  assert.match(runtime, /متابعة إلى السؤال التالي/);
  assert.match(runtime, /لا نمنع إعادة المحاولة/);
  assert.match(runtime, /score\+\+;/);
  assert.match(runtime, /answered\.add\(questionIndex\);\s*questionIndex\+\+;\s*renderQuestion\(\);/);
});

test("rejects string and null mastery values instead of coercing them to zero", () => {
  for (const mastery of [
    { requiredCorrect: "1", totalChecks: 1 },
    { requiredCorrect: 1, totalChecks: null }
  ]) {
    const result = requirementFor({
      mastery,
      activities: [{ answer: 1 }, { answer: 2 }]
    });
    assert.equal(result.valid, false);
  }
});
