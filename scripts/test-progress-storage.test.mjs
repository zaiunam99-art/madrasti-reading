import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const runtimePath = resolve(here, "../curriculum-runtime.js");
const runtimeSource = readFileSync(runtimePath, "utf8");
const helperMatch = runtimeSource.match(/  function readCompletedMap\(\) \{[\s\S]*?\n  \}/);

assert.ok(helperMatch, "readCompletedMap helper must exist");
const helperSource = helperMatch[0];

function readWith(raw, { throwOnRead = false } = {}) {
  let calls = 0;
  const sandbox = {
    localStorage: {
      getItem(key) {
        calls++;
        assert.equal(key, "madrastiCompletedLessonsV1");
        if (throwOnRead) throw new Error("storage unavailable");
        return raw;
      }
    },
    console: { warn() {} }
  };
  const result = runInNewContext(helperSource + "\nreadCompletedMap();", sandbox);
  return { result, calls };
}

test("reads a valid per-child progress object from localStorage", () => {
  const expected = { child_a: ["lesson-1", "lesson-2"] };
  const { result, calls } = readWith(JSON.stringify(expected));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), expected);
  assert.equal(calls, 1);
});

test("returns an empty object when no progress has been saved", () => {
  const { result, calls } = readWith(null);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
  assert.equal(calls, 1);
});

test("returns a protective null sentinel for malformed JSON and malformed top-level values", () => {
  for (const raw of ["{broken", "[]", '"text"', "42", "null"]) {
    const { result, calls } = readWith(raw);
    assert.equal(result, null);
    assert.equal(calls, 1);
  }
});

test("returns a protective null sentinel when localStorage cannot be read", () => {
  const { result, calls } = readWith(null, { throwOnRead: true });
  assert.equal(result, null);
  assert.equal(calls, 1);
});
