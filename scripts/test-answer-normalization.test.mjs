import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(resolve(here, "../curriculum-runtime.js"), "utf8");

function extract(name, signature) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp("  function " + escaped + "\\(" + signature + "\\) \\{[\\s\\S]*?\\n  \\}"));
  assert.ok(match, name + " helper must exist");
  return match[0];
}

const helpers = [
  extract("normalizedAnswer", "value"),
  extract("choiceMatches", "choice, answer")
].join("\n");

function evaluate(expression, values) {
  return runInNewContext(helpers + "\n" + expression, values);
}

test("normalizes Arabic and Persian digits to western digits", () => {
  assert.equal(evaluate('normalizedAnswer("١٢٣")', {}), "123");
  assert.equal(evaluate('normalizedAnswer("۱۲۳")', {}), "123");
});

test("normalizes Arabic letter variants, diacritics, and spacing", () => {
  assert.equal(evaluate('normalizedAnswer("إِلَىٰ")', {}), "الي");
  assert.equal(evaluate('normalizedAnswer("  مُدَرِّسَةٌ  ")', {}), "مدرسة");
});

test("matches object choices through their supported answer fields", () => {
  const choice = { label: "أربعة", value: 4, quantity: "٤", id: "four" };
  assert.equal(evaluate('choiceMatches(choice, "4")', { choice }), true);
  assert.equal(evaluate('choiceMatches(choice, "four")', { choice }), true);
});

test("matches array answers without depending on letter or digit presentation", () => {
  assert.equal(evaluate('choiceMatches("١٠", ["10", "عشرة"])', {}), true);
  assert.equal(evaluate('choiceMatches("ب", ["أ", "ج"])', {}), false);
});
