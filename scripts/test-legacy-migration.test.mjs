import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const match = app.match(/function migrateLegacyParentData\(\) \{[\s\S]*?\n\}/);
assert.ok(match, "legacy data migration function must exist");
const source = match[0];

function runMigration(seed) {
  const store = new Map(Object.entries(seed));
  const warnings = [];
  const sandbox = {
    STUDENT_PROFILES_KEY: "madrastiStudentProfilesV1",
    STUDENT_PROGRESS_KEY: "madrastiStudentProgressV1",
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key,value) { store.set(key,String(value)); },
      removeItem(key) { store.delete(key); }
    },
    console: { warn(...args) { warnings.push(args); } }
  };
  const migrate = runInNewContext("(" + source + ")", sandbox);
  return { store, warnings, migrate };
}

test("migration merges old profiles and progress without deleting legacy records", () => {
  const legacyProfiles = JSON.stringify([{id:"child_a",name:"أ"},{id:"child_b",name:"ب"}]);
  const currentProfiles = JSON.stringify([{id:"child_a",name:"أحدث"},{id:"child_c",name:"ج"}]);
  const legacyProgress = JSON.stringify({child_a:["read-1","read-1"],child_b:["read-2"],orphan:["ghost-lesson"],child_c:["x".repeat(121)]});
  const currentProgress = JSON.stringify({child_a:["read-0"],child_c:["math-1"]});
  const {store,migrate} = runMigration({
    madrastiFamilyDemoV2:legacyProfiles,
    madrastiCompletedLessonsV1:legacyProgress,
    madrastiStudentProfilesV1:currentProfiles,
    madrastiStudentProgressV1:currentProgress
  });
  migrate();
  assert.deepEqual(JSON.parse(store.get("madrastiStudentProfilesV1")).map(x=>x.id),["child_a","child_c","child_b"]);
  assert.equal(JSON.parse(store.get("madrastiStudentProfilesV1"))[0].name,"أحدث");
  assert.deepEqual(JSON.parse(store.get("madrastiStudentProgressV1")),{
    child_a:["read-0","read-1"],child_c:["math-1"],child_b:["read-2"]
  });
  assert.equal(JSON.parse(store.get("madrastiStudentProgressV1")).orphan,undefined);
  assert.equal(store.get("madrastiFamilyDemoV2"),legacyProfiles);
  assert.equal(store.get("madrastiCompletedLessonsV1"),legacyProgress);
  assert.equal(store.get("madrastiLegacyMigrationV1"),"done");
});

test("migration marker makes the operation idempotent", () => {
  const {store,migrate} = runMigration({
    madrastiLegacyMigrationV1:"done",
    madrastiStudentProfilesV1:JSON.stringify([{id:"child_a"}])
  });
  migrate();
  assert.deepEqual(JSON.parse(store.get("madrastiStudentProfilesV1")),[{id:"child_a"}]);
});

test("malformed legacy progress does not mark migration complete or overwrite profiles", () => {
  const currentProfiles = JSON.stringify([{id:"child_current"}]);
  const {store,migrate,warnings} = runMigration({
    madrastiFamilyDemoV2:JSON.stringify([{id:"child_old"}]),
    madrastiCompletedLessonsV1:"{broken",
    madrastiStudentProfilesV1:currentProfiles
  });
  migrate();
  assert.equal(store.get("madrastiStudentProfilesV1"),currentProfiles);
  assert.equal(store.has("madrastiLegacyMigrationV1"),false);
  assert.ok(warnings.length>0);
});
