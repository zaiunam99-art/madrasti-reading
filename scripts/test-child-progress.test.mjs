import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(resolve(here, "../curriculum-runtime.js"), "utf8");

function extract(name, signature) {
  const match = source.match(new RegExp("  function " + name + "\\(" + signature + "\\) \\{[\\s\\S]*?\\n  \\}"));
  assert.ok(match, name + " helper must exist");
  return match[0];
}

const helpers = [
  extract("completedLessonIds", "progress, childId"),
  extract("appendCompletedLesson", "progress, childId, lessonId")
].join("\\n");

function evaluate(expression, values = {}) {
  return runInNewContext(helpers + "\\n" + expression, values);
}

test("keeps progress isolated by child profile", () => {
  const progress = { child_a: ["read-1"], child_b: ["math-1"] };
  assert.deepEqual(JSON.parse(JSON.stringify(evaluate('completedLessonIds(progress, "child_a")', { progress }))), ["read-1"]);
  assert.deepEqual(JSON.parse(JSON.stringify(evaluate('completedLessonIds(progress, "child_b")', { progress }))), ["math-1"]);
});

test("adds a lesson once and reports whether it was already complete", () => {
  const progress = { child_a: ["read-1"] };
  const first = evaluate('appendCompletedLesson(progress, "child_a", "read-2")', { progress });
  assert.equal(first.alreadyCompleted, false);
  assert.deepEqual(JSON.parse(JSON.stringify(first.map.child_a)), ["read-1", "read-2"]);
  const again = evaluate('appendCompletedLesson(first.map, "child_a", "read-2")', { first });
  assert.equal(again.alreadyCompleted, true);
  assert.deepEqual(JSON.parse(JSON.stringify(again.map.child_a)), ["read-1", "read-2"]);
});

test("repairs malformed per-child records without changing other children", () => {
  const progress = { child_a: "invalid", child_b: ["math-1"] };
  const result = evaluate('appendCompletedLesson(progress, "child_a", "read-1")', { progress });
  assert.deepEqual(JSON.parse(JSON.stringify(result.map)), { child_a: ["read-1"], child_b: ["math-1"] });
  assert.deepEqual(JSON.parse(JSON.stringify(progress)), { child_a: "invalid", child_b: ["math-1"] });
});
