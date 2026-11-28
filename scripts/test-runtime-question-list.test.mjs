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


test("expands picture graph activities into separately answerable subquestions", () => {
  const graph = {
    type: "read_graph",
    data: { "قطط": 3, "طيور": 5 },
    key: 1,
    questions: [
      { q: "أي الحيوانات أكثر؟", answer: "طيور" },
      { q: "كم عدد القطط؟", answer: 3 }
    ]
  };
  const trailingQuiz = { type: "number_entry", answer: 9 };
  const sandbox = { lesson: { activities: [graph], quiz: [trailingQuiz] } };
  const result = runInNewContext(match[0] + "\\nquestionList(lesson);", sandbox);
  const plain = JSON.parse(JSON.stringify(result));
  assert.equal(plain.length, 3);
  assert.deepEqual(plain.slice(0, 2).map(item => item.q), ["أي الحيوانات أكثر؟", "كم عدد القطط؟"]);
  assert.deepEqual(plain.slice(0, 2).map(item => item.answer), ["طيور", 3]);
  assert.deepEqual(plain[0].data, graph.data);
  assert.equal(plain[0].key, 1);
  assert.equal(plain[2].type, "number_entry");
});

test("keeps picture graph activities without subquestions as a single open activity", () => {
  const graph = { type: "read_graph", data: { "تفاح": 2 }, questions: [] };
  const result = runInNewContext(match[0] + "\\nquestionList(lesson);", { lesson: { activities: [graph] } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [graph]);
});
