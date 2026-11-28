import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const helper = runtime.match(/  function isAlternatingPattern\(pattern, minimumItems = 6\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(helper, "pattern validation helper must exist");

function valid(pattern, minimumItems = 6) {
  return runInNewContext(helper + "\nisAlternatingPattern(pattern, minimumItems)", { pattern, minimumItems });
}

test("accepts a two-colour alternating pattern repeated three times", () => {
  assert.equal(valid(["أحمر", "أصفر", "أحمر", "أصفر", "أحمر", "أصفر"]), true);
});

test("rejects a pattern that changes its repeating unit", () => {
  assert.equal(valid(["أحمر", "أصفر", "أحمر", "أزرق", "أحمر", "أصفر"]), false);
});

test("rejects a one-colour sequence because the selected unit must contain two colours", () => {
  assert.equal(valid(["أحمر", "أحمر", "أحمر", "أحمر", "أحمر", "أحمر"]), false);
});

test("rejects incomplete patterns and invalid minimum lengths", () => {
  assert.equal(valid(["أحمر", "أصفر", "أحمر", "أصفر", "أحمر"]), false);
  assert.equal(valid(["أحمر", "أصفر", "أحمر", "أصفر", "أحمر", "أصفر"], 0), false);
});

test("pattern activity is implemented as an interactive student activity", () => {
  assert.match(runtime, /if \(q\.type === "create_pattern"\)/);
  assert.match(runtime, /اختر لونين مختلفين/);
  assert.match(runtime, /تحقق من النمط/);
  assert.match(runtime, /isAlternatingPattern\(pattern, minimumItems\)/);
});
