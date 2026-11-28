import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const renderStart = runtime.indexOf("  function renderQuestion(");
const submitStart = runtime.indexOf("const submit = (value, selectedButton)", renderStart);
const traceStart = runtime.indexOf('if (q.type === "trace_numeral")', renderStart);
assert.ok(renderStart >= 0 && submitStart > renderStart && traceStart > renderStart);

test("numeral tracing UI is rendered before answer submission", () => {
  assert.ok(traceStart < submitStart, "tracing canvas must appear as soon as the activity opens");
  const renderer = runtime.slice(renderStart, runtime.indexOf("\n  function openLesson", renderStart));
  assert.match(renderer, /q\.type === "trace_numeral" \|\| q\.type === "create_pattern"/);
  assert.match(renderer, /canvas\.getContext\("2d"\)/);
  assert.match(renderer, /canvas\.addEventListener\("pointerdown"/);
  assert.match(renderer, /canvas\.addEventListener\("pointermove"/);
  assert.match(renderer, /canvas\.addEventListener\("pointerup"/);
  assert.match(renderer, /canvas\.addEventListener\("pointercancel"/);
});

test("tracing activity offers reset and honest manual-review messaging", () => {
  const renderer = runtime.slice(renderStart, runtime.indexOf("\n  function openLesson", renderStart));
  assert.match(renderer, /مسح المحاولة/);
  assert.match(renderer, /لا يتعرف إلى جودة الخط آلياً/);
  assert.match(renderer, /لن تُحتسب جودة الكتابة ضمن نتيجة الإتقان الآلية/);
  assert.match(renderer, /الانتقال إلى النشاط التالي/);
});