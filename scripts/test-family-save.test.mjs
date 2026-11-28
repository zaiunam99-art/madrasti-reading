import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf('document.getElementById("guardianForm").addEventListener("submit", event => {');
const end = html.indexOf("\n});", start);
assert.ok(start >= 0 && end > start, "embedded guardian form save handler must exist");
const handlerSource = html.slice(start + 'document.getElementById("guardianForm").addEventListener("submit", '.length, end);

function invoke({ saveResult = true, subjects = ["القراءة"], existing = [] } = {}) {
  const values = {
    guardianEditId: { value: "" }, guardianName: { value: "طفل تجريبي" },
    guardianGender: { value: "neutral" }, guardianGrade: { value: "الأول الابتدائي" },
    guardianAvatar: { value: "🧒" }, guardianVoice: { value: "default" }, guardianDaily: { value: "2" },
    guardianTitle: { textContent: "" }
  };
  let renders = 0, resets = 0, saves = 0, alerts = [];
  const sandbox = {
    family: existing, active: null,
    document: { getElementById(id) { return values[id]; },
      querySelectorAll() { return subjects.map(value => ({ checked: true, value })); } },
    crypto: { randomUUID: () => "new-child" },
    save() { saves++; return saveResult; }, renderGuardianChildren() { renders++; },
    renderStudentPicker() {}, resetGuardianForm() { resets++; },
    alert(message) { alerts.push(message); }
  };
  const handler = runInNewContext("(" + handlerSource + ")", sandbox);
  handler({ preventDefault() {} });
  return { family: sandbox.family, renders, resets, saves, alerts };
}

test("does not retain a new child when local storage save fails", () => {
  const result = invoke({ saveResult: false });
  assert.equal(result.family.length, 0);
  assert.equal(result.renders, 0);
  assert.equal(result.resets, 0);
  assert.equal(result.saves, 1);
});

test("saves and renders a child when storage succeeds", () => {
  const result = invoke();
  assert.equal(result.family.length, 1);
  assert.equal(result.family[0].id, "new-child");
  assert.equal(result.family[0].name, "طفل تجريبي");
  assert.equal(result.renders, 1);
  assert.equal(result.resets, 1);
});

test("requires at least one selected subject", () => {
  const result = invoke({ subjects: [] });
  assert.equal(result.family.length, 0);
  assert.equal(result.saves, 0);
  assert.equal(result.alerts.length, 1);
});
