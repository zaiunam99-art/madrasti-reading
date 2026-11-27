import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const html = readFileSync(resolve(here, "../index.html"), "utf8");
const start = html.indexOf("function deleteChild(id){");
const end = html.indexOf("\n}", start);
assert.ok(start >= 0 && end > start, "deleteChild handler must exist");
const deleteChildSource = html.slice(start, end + 2);

function invokeDelete({ failProgressWrite = false, failFamilyRollback = false, failProgressRollback = false, confirmed = true, rawProgress } = {}) {
  const values = new Map([
    ["madrastiFamilyDemoV2", JSON.stringify([{ id: "child_a" }, { id: "child_b" }])],
    ["madrastiCompletedLessonsV1", rawProgress === undefined ? JSON.stringify({ child_a: ["read-1"], child_b: ["math-1"] }) : rawProgress]
  ]);
  let failed = false, rendered = 0, stopped = 0, alerts = [];
  const sandbox = {
    KEY: "madrastiFamilyDemoV2",
    family: [{ id: "child_a" }, { id: "child_b" }],
    active: { id: "child_a" },
    confirm() { return confirmed; },
    alert(message) { alerts.push(message); },
    console: { warn() {} },
    stopLessonAudio() { stopped++; },
    renderAll() { rendered++; },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) {
        if (failProgressWrite && key === "madrastiCompletedLessonsV1" && !failed) { failed = true; throw new Error("quota"); }
        if (failFamilyRollback && key === "madrastiFamilyDemoV2" && String(value).includes("child_a")) throw new Error("rollback family failed");
        if (failProgressRollback && key === "madrastiCompletedLessonsV1" && String(value).includes("child_a")) throw new Error("rollback progress failed");
        values.set(key, String(value));
      }
    }
  };
  runInNewContext(deleteChildSource + "; deleteChild(\"child_a\");", sandbox);
  return { values, family: sandbox.family, active: sandbox.active, rendered, stopped, alerts };
}

test("deletes the selected child and only that child progress after both writes succeed", () => {
  const result = invokeDelete();
  assert.deepEqual(JSON.parse(result.values.get("madrastiFamilyDemoV2")), [{ id: "child_b" }]);
  assert.deepEqual(JSON.parse(result.values.get("madrastiCompletedLessonsV1")), { child_b: ["math-1"] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.family)), [{ id: "child_b" }]);
  assert.equal(result.active, null);
  assert.equal(result.rendered, 1);
  assert.equal(result.stopped, 1);
});

test("rolls back the family record if progress deletion fails", () => {
  const result = invokeDelete({ failProgressWrite: true });
  assert.deepEqual(JSON.parse(result.values.get("madrastiFamilyDemoV2")), [{ id: "child_a" }, { id: "child_b" }]);
  assert.deepEqual(JSON.parse(result.values.get("madrastiCompletedLessonsV1")), { child_a: ["read-1"], child_b: ["math-1"] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.family)), [{ id: "child_a" }, { id: "child_b" }]);
  assert.equal(result.rendered, 0);
  assert.equal(result.alerts.length, 1);
});

test("does not change storage when deletion is cancelled", () => {
  const result = invokeDelete({ confirmed: false });
  assert.equal(JSON.parse(result.values.get("madrastiFamilyDemoV2")).length, 2);
  assert.equal(JSON.parse(result.values.get("madrastiCompletedLessonsV1")).child_a.length, 1);
  assert.equal(result.rendered, 0);
});

test("refuses deletion when the saved progress JSON is malformed", () => {
  const result = invokeDelete({ rawProgress: "{broken" });
  assert.deepEqual(JSON.parse(result.values.get("madrastiFamilyDemoV2")), [{ id: "child_a" }, { id: "child_b" }]);
  assert.equal(result.rendered, 0);
  assert.equal(result.alerts.length, 1);
});

test("attempts progress rollback even when family rollback itself fails", () => {
  const result = invokeDelete({ failProgressWrite: true, failFamilyRollback: true });
  assert.deepEqual(JSON.parse(result.values.get("madrastiCompletedLessonsV1")), { child_a: ["read-1"], child_b: ["math-1"] });
  assert.match(result.alerts[0], /تعذرت استعادة بعض البيانات/);
  assert.equal(result.rendered, 0);
});

test("reports when both rollback writes fail instead of claiming full recovery", () => {
  const result = invokeDelete({ failProgressWrite: true, failFamilyRollback: true, failProgressRollback: true });
  assert.match(result.alerts[0], /تعذرت استعادة بعض البيانات/);
  assert.equal(result.rendered, 0);
});
