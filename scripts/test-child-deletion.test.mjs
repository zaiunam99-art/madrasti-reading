import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function deleteGuardianChild(id) {");
const end = html.indexOf("\nfunction exportGuardianChild", start);
assert.ok(start >= 0 && end > start, "unified guardian deletion handler must exist");
const source = html.slice(start, end);

function runDelete({ failProgress = false, confirmed = true, selected = false } = {}) {
  const original = [{id:"child_a"},{id:"child_b"}];
  const values = new Map([
    ["madrastiStudentProfilesV1",JSON.stringify(original)],
    ["madrastiStudentProgressV1",JSON.stringify({child_a:["read-1"],child_b:["math-1"]})]
  ]);
  let fail = failProgress, renders = 0, switches = 0, alerts = [];
  const sandbox = {
    family: original, active: selected ? {id:"child_a"} : null,
    STUDENT_PROFILES_KEY: "madrastiStudentProfilesV1", STUDENT_PROGRESS_KEY: "madrastiStudentProgressV1",
    confirm() { return confirmed; }, alert(message) { alerts.push(message); },
    renderGuardianChildren() { renders++; }, renderStudentPicker() {},
    showStudentGate() { switches++; }, loadFamily() { return original; },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key,value) {
        if (fail && key==="madrastiStudentProgressV1") { fail=false; throw new Error("quota"); }
        values.set(key,String(value));
      },
      removeItem(key) { values.delete(key); }
    }
  };
  runInNewContext(source + "; deleteGuardianChild('child_a');", sandbox);
  return { values, family:sandbox.family, renders, switches, alerts };
}

test("deletes only the selected child's profile and progress", () => {
  const result = runDelete();
  assert.deepEqual(JSON.parse(result.values.get("madrastiStudentProfilesV1")),[{id:"child_b"}]);
  assert.deepEqual(JSON.parse(result.values.get("madrastiStudentProgressV1")),{child_b:["math-1"]});
  assert.equal(result.renders,1);
});

test("rolls back the profile if progress deletion fails", () => {
  const result = runDelete({failProgress:true});
  assert.equal(JSON.parse(result.values.get("madrastiStudentProfilesV1")).length,2);
  assert.deepEqual(JSON.parse(result.values.get("madrastiStudentProgressV1")),{child_a:["read-1"],child_b:["math-1"]});
  assert.equal(result.renders,0);
  assert.equal(result.alerts.length,1);
});

test("cancelled deletion leaves all data unchanged", () => {
  const result = runDelete({confirmed:false});
  assert.equal(JSON.parse(result.values.get("madrastiStudentProfilesV1")).length,2);
  assert.equal(result.renders,0);
});

test("switches to student selection if the active profile is deleted", () => {
  const result = runDelete({selected:true});
  assert.equal(result.switches,1);
});
