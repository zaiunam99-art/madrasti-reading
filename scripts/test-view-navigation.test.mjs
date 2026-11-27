import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function showView(v){");
const end = html.indexOf("\n", start);
assert.ok(start >= 0 && end > start, "showView handler must exist");
const source = html.slice(start, end);

function runShowView({ view, lessonOpen = false } = {}) {
  const calls = [];
  const elements = new Map();
  for (const id of ["guardianView", "childView", "lessonView", "guardianTab", "childTab", "hello"]) {
    const classes = new Set(id === "lessonView" && lessonOpen ? [] : ["hidden"]);
    elements.set(id, {
      classList: {
        contains(name) { return classes.has(name); },
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        toggle(name, force) {
          const enabled = force === undefined ? !classes.has(name) : Boolean(force);
          if (enabled) classes.add(name); else classes.delete(name);
          return enabled;
        }
      },
      textContent: ""
    });
  }
  const sandbox = {
    window: {
      selectChild(id) { calls.push(["selectChild", id]); },
      stopLessonAudio() { calls.push(["stopLessonAudio"]); }
    },
    active: { id: "child_a" },
    document: { getElementById(id) { return elements.get(id); } },
    renderAll() { calls.push(["renderAll"]); }
  };
  runInNewContext(source + "; showView(" + JSON.stringify(view) + ");", sandbox);
  return { calls, elements };
}

test("leaving an open lesson for the guardian view resets the active lesson context", () => {
  const result = runShowView({ view: "guardian", lessonOpen: true });
  assert.ok(result.calls.some(call => call[0] === "selectChild" && call[1] === "child_a"));
  assert.equal(result.elements.get("lessonView").classList.contains("hidden"), true);
  assert.equal(result.elements.get("guardianView").classList.contains("hidden"), false);
});

test("returning to the child view from an open lesson restores the selected child workspace", () => {
  const result = runShowView({ view: "child", lessonOpen: true });
  assert.ok(result.calls.some(call => call[0] === "selectChild" && call[1] === "child_a"));
  assert.equal(result.elements.get("childView").classList.contains("hidden"), false);
  assert.equal(result.elements.get("lessonView").classList.contains("hidden"), true);
});

test("switching to guardian view outside a lesson still stops any lesson audio", () => {
  const result = runShowView({ view: "guardian", lessonOpen: false });
  assert.ok(result.calls.some(call => call[0] === "stopLessonAudio"));
  assert.ok(!result.calls.some(call => call[0] === "selectChild"));
});
