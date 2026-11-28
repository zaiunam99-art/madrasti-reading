import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");
const start = runtime.indexOf("  function completedLessonIds(");
const end = runtime.indexOf("  function appendCompletedLesson(", start);
assert.ok(start >= 0 && end > start, "per-student reward helpers must exist");
const helpers = runtime.slice(start, end);
const rewardStart = helpers.indexOf("  function rewardSummary(");
const rewardEnd = helpers.indexOf("  function renderRewardJourney(", rewardStart);
assert.ok(rewardStart >= 0 && rewardEnd > rewardStart, "reward summary helper must exist");
const rewardSource = helpers.slice(rewardStart, helpers.indexOf("\n  }", rewardStart) + 4);

function summarize(ids) {
  return runInNewContext(rewardSource + "\nrewardSummary(ids);", { ids });
}

test("rewards are earned only from unique completed lesson identifiers", () => {
  assert.equal(summarize(["a", "a", "b"]).stars, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(summarize(["a", "a"]).earned.map(item => item.id))), ["first"]);
});

test("badge milestones unlock at one, five and ten completed lessons", () => {
  assert.equal(summarize([]).earned.length, 0);
  assert.equal(summarize(["a"]).earned.length, 1);
  assert.equal(summarize(["a","b","c","d","e"]).earned.length, 2);
  assert.equal(summarize(["a","b","c","d","e","f","g","h","i","j"]).earned.length, 3);
  assert.equal(summarize(["a","b","c","d","e","f","g","h","i","j"]).next, null);
});

test("student progress is isolated by child identifier", () => {
  const source = helpers.slice(0, helpers.indexOf("  function rewardSummary("));
  const result = runInNewContext(source + "\n({a:completedLessonIds({child_a:['read-1'],child_b:['math-1','math-2']},'child_a'),b:completedLessonIds({child_a:['read-1'],child_b:['math-1','math-2']},'child_b')});");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {a:["read-1"],b:["math-1","math-2"]});
});

test("student home renders an earned-badge journey from the existing progress record", () => {
  assert.match(runtime, /renderRewardJourney\(rewards\)/);
  assert.match(runtime, /أوسمة رحلتك/);
  assert.match(runtime, /المستكشف الصغير/);
  assert.match(runtime, /بطل المعرفة/);
  assert.match(runtime, /madrastiStudentProgressV1/);
});

test("reward journey displays four visual stations with locked and unlocked states", () => {
  const renderStart = runtime.indexOf("  function renderRewardJourney(summary) {");
  const renderEnd = runtime.indexOf("  function appendCompletedLesson(", renderStart);
  const renderer = runtime.slice(renderStart, renderEnd);
  const render = (stars) => runInNewContext(
    renderer + "\\nrenderRewardJourney({stars, earned:[], next:null});",
    { escHtml: value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])) }
  );
  const fresh = render(0);
  assert.match(fresh, /خريطة مغامرتك/);
  assert.match(fresh, /قائد الرحلة/);
  assert.match(fresh, /عند إكمال 20 درساً/);
  assert.match(fresh, /aria-valuenow="0"/);
  const midway = render(7);
  assert.match(midway, /تم فتح الوسام/);
  assert.match(midway, /المحطة التالية: بطل المعرفة/);
  assert.match(midway, /aria-valuenow="40"/);
  const finished = render(20);
  assert.match(finished, /وصلت إلى نهاية هذه الرحلة/);
  assert.match(finished, /aria-valuenow="100"/);
});
