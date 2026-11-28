import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");

test("trace_numeral renders a touch and pointer drawing surface for every numeral", () => {
  assert.match(runtime, /if \(q\.type === "trace_numeral"\)/);
  assert.match(runtime, /document\.createElement\("canvas"\)/);
  assert.match(runtime, /canvas\.addEventListener\("pointerdown"/);
  assert.match(runtime, /canvas\.addEventListener\("pointermove"/);
  assert.match(runtime, /canvas\.addEventListener\("pointerup"/);
  assert.match(runtime, /مسح المحاولة/);
});

test("tracing is honestly described as a practice activity, not automatic handwriting assessment", () => {
  assert.match(runtime, /لا يتعرف إلى جودة الخط آلياً/);
  assert.match(runtime, /لن تُحتسب جودة الكتابة ضمن نتيجة الإتقان الآلية/);
  assert.match(runtime, /المعلم أو ولي الأمر للمراجعة/);
});

test("tracing does not submit an invented answer into the mastery scoring function", () => {
  const start = runtime.indexOf('if (q.type === "trace_numeral")');
  const end = runtime.indexOf('} else if (q.type === "create_pattern")', start);
  assert.ok(start >= 0 && end > start);
  const block = runtime.slice(start, end);
  assert.doesNotMatch(block, /submit\(/);
});
