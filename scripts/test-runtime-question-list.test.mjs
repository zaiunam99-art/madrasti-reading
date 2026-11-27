import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const runtimeSource = readFileSync(resolve(here, "../curriculum-runtime.js"), "utf8");
const match = runtimeSource.match(/  function questionList\(lesson\) \{[\s\S]*?\n  \}/);

assert.ok(match, "questionList helper must exist");

test("keeps valid activity and quiz objects in curriculum order", () => {
  const activity = { type: "number_entry", answer: 4 };
  const quiz = { type: "multiple_choice", answer: "أ" };
  const sandbox = { lesson: { activities: [activity], quiz: [quiz] } };
  const result = runInNewContext(match[0] + "\nquestionList(lesson);", sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [activity, quiz]);
});

test("ignores null, scalar, and array entries instead of treating them as questions", () => {
  const valid = { type: "number_entry", answer: 3 };
  const sandbox = {
    lesson: {
      activities: [null, "text", 7, ["array"], valid],
      quiz: [false, [], { type: "manual" }]
    }
  };
  const result = runInNewContext(match[0] + "\nquestionList(lesson);", sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [valid, { type: "manual" }]);
});

test("handles missing or non-array question collections safely", () => {
  for (const lesson of [{}, { activities: "bad", quiz: null }, null]) {
    const result = runInNewContext(match[0] + "\nquestionList(lesson);", { lesson });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), []);
  }
});
