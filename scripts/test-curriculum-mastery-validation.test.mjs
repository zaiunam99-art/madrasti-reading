import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const validator = new URL("./validate-curriculum.mjs", import.meta.url);

async function fixture(lesson) {
  const root = await mkdtemp(join(tmpdir(), "madrasti-curriculum-"));
  const dirs = [
    "grade-1/reading-2025-2026",
    "grade-1/math-2025-2026",
    "grade-2/math-2025-2026"
  ];
  for (const dir of dirs) {
    await mkdir(join(root, dir), { recursive: true });
    const field = dir.includes("reading") ? "units" : "chapters";
    await writeFile(join(root, dir, dir.includes("reading") ? "units-index.json" : "chapters-index.json"),
      JSON.stringify({ [field]: [] }));
  }
  await writeFile(join(root, "grade-1/math-2025-2026/fixture.json"),
    JSON.stringify({ lessons: [lesson] }));
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [validator.pathname, root], { encoding: "utf8" });
}

test("curriculum validator rejects mastery thresholds that exceed assessable questions", async () => {
  const root = await fixture({
    id: "bad-mastery", title: "درس تجريبي", objective: "هدف",
    mastery: { requiredCorrect: 2, totalChecks: 2 },
    activities: [{ type: "multiple_choice", choices: ["أ", "ب"], answer: "أ" }]
  });
  try {
    const result = run(root);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.ok(report.errors.some(error => /متطلبات mastery غير متوافقة/.test(error.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("curriculum validator accepts consistent mastery thresholds", async () => {
  const root = await fixture({
    id: "valid-mastery", title: "درس تجريبي", objective: "هدف",
    mastery: { requiredCorrect: 1, totalChecks: 1 },
    activities: [{ type: "multiple_choice", choices: ["أ", "ب"], answer: "أ" }]
  });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.stats.masteryConfigured, 1);
    assert.equal(report.stats.lessonsWithoutAutoAssessment, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("curriculum validator rejects string and null mastery values without coercion", async () => {
  for (const mastery of [
    { requiredCorrect: "1", totalChecks: 1 },
    { requiredCorrect: 1, totalChecks: null }
  ]) {
    const root = await fixture({
      id: "invalid-mastery-type", title: "درس تجريبي", objective: "هدف",
      mastery, activities: [{ type: "multiple_choice", choices: ["أ", "ب"], answer: "أ" }]
    });
    try {
      const result = run(root);
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.ok(report.errors.some(error => /متطلبات mastery غير متوافقة/.test(error.message)));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
