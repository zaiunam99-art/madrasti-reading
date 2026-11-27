import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const html = readFileSync(resolve(here, "../index.html"), "utf8");
const match = html.match(/function saveChild\(e\)\{[^\n]*\}/);
assert.ok(match, "saveChild handler must exist");

function invokeSaveChild({ saveResult, subjects = ["القراءة"], existing = [] }) {
  const fields = {
    editId: { value: "" },
    childName: { value: "طفل تجريبي" },
    gender: { value: "neutral" },
    grade: { value: "الأول الابتدائي" },
    avatar: { value: "🧒" },
    voice: { value: "default" },
    dailyCount: { value: "2" }
  };
  let closed = 0, rendered = 0, saves = 0, alerts = [];
  const sandbox = {
    family: existing,
    document: {
      getElementById(id) { return fields[id]; },
      querySelectorAll() { return subjects.map(value => ({ checked: true, value })); }
    },
    alert(message) { alerts.push(message); },
    save() { saves++; return saveResult; },
    closeForm() { closed++; },
    renderAll() { rendered++; },
    Date: { now: () => 123456 }
  };
  runInNewContext(match[0] + "; saveChild({preventDefault(){}});", sandbox);
  return { family: sandbox.family, closed, rendered, saves, alerts };
}

test("does not close the editor or keep unsaved child changes when storage fails", () => {
  const original = [{ id: "prior", name: "سابق" }];
  const result = invokeSaveChild({ saveResult: false, existing: original });
  assert.deepEqual(JSON.parse(JSON.stringify(result.family)), original);
  assert.equal(result.closed, 0);
  assert.equal(result.rendered, 0);
  assert.equal(result.saves, 1);
});

test("closes the editor and renders after a successful save", () => {
  const result = invokeSaveChild({ saveResult: true });
  assert.equal(result.family.length, 1);
  assert.equal(result.family[0].id, "123456");
  assert.equal(result.family[0].name, "طفل تجريبي");
  assert.equal(result.closed, 1);
  assert.equal(result.rendered, 1);
});

test("keeps the form open when no subject is selected", () => {
  const result = invokeSaveChild({ saveResult: true, subjects: [] });
  assert.equal(result.family.length, 0);
  assert.equal(result.saves, 0);
  assert.equal(result.closed, 0);
  assert.equal(result.alerts.length, 1);
});
