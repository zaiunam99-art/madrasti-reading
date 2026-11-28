import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function showStudentGate()");
const end = html.indexOf("\ndocument.getElementById(\"startStudent\")", start);
assert.ok(start >= 0 && end > start, "student gate navigation handler must exist");
const source = html.slice(start, end);

test("switching student returns safely to the student picker", () => {
  const states = new Map([
    ["lessonView", new Set()], ["childView", new Set()], ["studentGate", new Set(["hidden"])]
  ]);
  const elements = new Map([
    ...[...states].map(([id, classes]) => [id, {classList:{
      add(name){classes.add(name);}, remove(name){classes.delete(name);}, contains(name){return classes.has(name);}
    }}]),
    ["studentPicker", {value:"child-a"}]
  ]);
  let stopped = 0;
  const sandbox = {
    active: {id:"child-a"}, activeLesson: {id:"lesson-a"},
    window: {stopLessonAudio(){stopped++;}},
    document: {getElementById(id){return elements.get(id);}}
  };
  runInNewContext(source + "; showStudentGate();", sandbox);
  assert.equal(sandbox.active, null);
  assert.equal(sandbox.activeLesson, null);
  assert.equal(states.get("lessonView").has("hidden"), true);
  assert.equal(states.get("childView").has("hidden"), true);
  assert.equal(states.get("studentGate").has("hidden"), false);
  assert.equal(elements.get("studentPicker").value, "");
  assert.equal(stopped, 1);
});

test("student learning and guardian controls are contained in one page", () => {
  for (const required of ['id="studentGate"','id="childView"','id="lessonView"','id="guardianPanel"','id="openGuardian"']) {
    assert.ok(html.includes(required), "unified page must contain " + required);
  }
  assert.doesNotMatch(html, /href="\/student\.html"/);
  assert.doesNotMatch(html, /href="\/index\.html">افتح تطبيق ولي الأمر/);
});
