import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const renderStart = runtime.indexOf("  function renderQuestion(");
const submitStart = runtime.indexOf("const submit = (value, selectedButton)", renderStart);
const patternStart = runtime.indexOf('else if (q.type === "create_pattern")', renderStart);
assert.ok(renderStart >= 0 && submitStart > renderStart && patternStart > renderStart);

test("pattern activity is rendered before the answer submission handler", () => {
  assert.ok(patternStart < submitStart, "pattern UI must be created during question rendering, not after an answer");
  const renderer = runtime.slice(renderStart, runtime.indexOf("\n  function openLesson", renderStart));
  assert.match(renderer, /q\.type === "trace_numeral" \|\| q\.type === "create_pattern"/);
  assert.match(renderer, /return;/);
  assert.match(renderer, /answers\.append\(palette, preview, status, undo, reset, check\)/);
});

test("pattern validator accepts only complete alternating two-colour patterns", () => {
  const helper = runtime.match(/  function isAlternatingPattern\(pattern, minimumItems = 6\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper);
  const check = runInNewContext(helper + "\nisAlternatingPattern", {});
  assert.equal(check(["أحمر","أصفر","أحمر","أصفر","أحمر","أصفر"]), true);
  assert.equal(check(["أحمر","أصفر","أحمر","أحمر","أحمر","أصفر"]), false);
  assert.equal(check(["أحمر","أحمر","أحمر","أحمر","أحمر","أحمر"]), false);
  assert.equal(check(["أحمر","أصفر","أحمر"]), false);
});

test("pattern activity has distinct colour selection, undo, reset, and check controls", () => {
  const renderer = runtime.slice(renderStart, runtime.indexOf("\n  function openLesson", renderStart));
  assert.match(renderer, /اختيار لونين للنمط/);
  assert.match(renderer, /التراجع عن آخر لون/);
  assert.match(renderer, /إعادة النشاط/);
  assert.match(renderer, /تحقق من النمط/);
  assert.match(renderer, /isAlternatingPattern\(pattern, minimumItems\)/);
  assert.match(renderer, /الانتقال إلى النشاط التالي/);
  assert.match(renderer, /answered\.add\(questionIndex\);\s*questionIndex\+\+;\s*renderQuestion\(\);/);
});