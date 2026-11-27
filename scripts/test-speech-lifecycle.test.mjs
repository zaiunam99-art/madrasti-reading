import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const start = source.indexOf("  function createSpeechLifecycle()");
const end = source.indexOf("\n  const speechLifecycle", start);
assert.ok(start >= 0 && end > start, "speech lifecycle helper must exist");
const helper = source.slice(start, end).replace(/^  /gm, "");

test("a cancelled utterance can no longer update the speaking indicator", () => {
  const lifecycle = runInNewContext(helper + "; createSpeechLifecycle()");
  const first = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(first), true);
  lifecycle.cancel();
  assert.equal(lifecycle.isCurrent(first), false);
});

test("a newer utterance invalidates callbacks from the previous utterance", () => {
  const lifecycle = runInNewContext(helper + "; createSpeechLifecycle()");
  const oldUtterance = lifecycle.begin();
  const newUtterance = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(oldUtterance), false);
  assert.equal(lifecycle.isCurrent(newUtterance), true);
});

test("the latest utterance remains current until cancellation or replacement", () => {
  const lifecycle = runInNewContext(helper + "; createSpeechLifecycle()");
  const token = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(token), true);
  assert.equal(lifecycle.isCurrent(token), true);
  lifecycle.cancel();
  assert.equal(lifecycle.isCurrent(token), false);
});
