import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = new URL("../curriculum/grade-2/math-2025-2026/chapters-index.json", import.meta.url);
const index = JSON.parse(readFileSync(path, "utf8"));

test("grade 2 mathematics outline has ten ordered chapters and 58 indexed lessons", () => {
  assert.equal(index.grade, 2);
  assert.equal(index.subject, "الرياضيات");
  assert.equal(index.chapters.length, 10);
  assert.deepEqual(index.chapters.map(chapter => chapter.number), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(index.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0), 58);
});

test("every indexed lesson has a title and an increasing source page", () => {
  let previousPage = 0;
  for (const chapter of index.chapters) {
    assert.ok(Array.isArray(chapter.lessons) && chapter.lessons.length > 0);
    assert.equal(chapter.status, "outline_verified_lesson_content_not_created");
    for (const lesson of chapter.lessons) {
      assert.ok(lesson.title.trim());
      assert.ok(Number.isInteger(lesson.page) && lesson.page > previousPage);
      previousPage = lesson.page;
    }
  }
});

test("the index clearly distinguishes source verification from authored lesson content", () => {
  assert.match(index.source.verification, /لم يُنزّل الملف/);
  assert.ok(index.notes.some(note => note.includes("لم تُنشأ ملفات دروس")));
});
