import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function showView(){");
const end = html.indexOf("\n", start);
assert.ok(start >= 0 && end > start, "parent-only showView handler must exist");
const source = html.slice(start, end);

test("parent navigation exposes only the guardian workspace", () => {
  const classes = new Set(["hidden"]);
  const elements = new Map([
    ["guardianView", { classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    }}],
    ["hello", { textContent: "" }]
  ]);
  let rendered = 0;
  const sandbox = {
    document: { getElementById(id) { return elements.get(id); } },
    renderAll() { rendered++; }
  };
  runInNewContext(source + "; showView();", sandbox);
  assert.equal(classes.has("hidden"), false);
  assert.equal(elements.get("hello").textContent, "لوحة ولي الأمر");
  assert.equal(rendered, 1);
});

test("parent page has no child lesson navigation or student runtime", () => {
  for (const forbidden of ['id="childView"', 'id="lessonView"', 'function enterChild(', "window.selectChild", "stopLessonAudio"]) {
    assert.equal(html.includes(forbidden), false, "parent page must not contain " + forbidden);
  }
});
