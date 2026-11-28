import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../curriculum-runtime.js", import.meta.url), "utf8");

test("Arabic narration prefers a non-Iraqi Arabic voice and defaults safely", () => {
  const start = runtime.indexOf("  function selectArabicVoice(voices)");
  const end = runtime.indexOf("\n  function speakQuestion", start);
  assert.ok(start >= 0 && end > start, "Arabic voice selector must exist");
  const helper = runtime.slice(start, end).replace(/^  /gm, "");
  const select = runInNewContext(helper + "; selectArabicVoice");
  const iraqi = { lang: "ar-IQ" };
  const saudi = { lang: "ar-SA" };
  const generic = { lang: "ar" };
  assert.equal(select([iraqi, saudi, generic]), saudi);
  assert.equal(select([iraqi, generic]), generic);
  assert.equal(select([iraqi]), null);
  assert.equal(select([{ lang: "en-US" }]), null);
});

test("every rendered question is spoken automatically after its controls are created", () => {
  const start = runtime.indexOf("  function renderQuestion(");
  const end = runtime.indexOf("\n  function openLesson", start);
  assert.ok(start >= 0 && end > start, "question renderer must exist");
  const renderer = runtime.slice(start, end);
  assert.match(renderer, /speakQuestion\(spokenQuestion\);/);
  assert.ok(renderer.indexOf("answers.appendChild(next);") < renderer.indexOf("speakQuestion(spokenQuestion);"));
});

test("incorrect answers allow retries and offer an explicit continue action", () => {
  const start = runtime.indexOf("  function renderQuestion(");
  const end = runtime.indexOf("\n  function openLesson", start);
  const renderer = runtime.slice(start, end);
  const wrongAnswer = renderer.indexOf("if (!correctAnswer)");
  const retryReturn = renderer.indexOf("return;", wrongAnswer);
  const continueAction = renderer.indexOf('continueButton.addEventListener("click"', wrongAnswer);
  const correctMark = renderer.indexOf("answered.add(questionIndex);", retryReturn);
  assert.ok(wrongAnswer >= 0 && retryReturn > wrongAnswer, "incorrect answer must not advance automatically");
  assert.ok(continueAction > wrongAnswer && continueAction < retryReturn, "wrong answer must offer an explicit continue action");
  assert.ok(renderer.indexOf("questionIndex++;", continueAction) > continueAction, "continue action advances only when selected");
  assert.ok(correctMark > retryReturn, "correct response marks the question answered");
  assert.ok(renderer.indexOf("answers.querySelectorAll", correctMark) > correctMark,
    "controls are disabled only after a correct response");
});

test("opening a lesson speaks a welcome, explanation, and the first question in order", () => {
  const start = runtime.indexOf("  function openLesson(lesson)");
  const end = runtime.indexOf("\n  window.MadrastiCurriculum", start);
  assert.ok(start >= 0 && end > start, "lesson opener must exist");
  const opener = runtime.slice(start, end);
  assert.match(opener, /renderQuestion\(false\)/);
  assert.match(opener, /مرحباً بك! أنا معلّمك/);
  assert.match(opener, /\.\.\.explanation/);
  assert.match(opener, /firstQuestion \? questionPrompt\(firstQuestion\)/);
  assert.match(opener, /speakQuestion\(openingParts\.filter\(Boolean\)\.join\("\. "\)\)/);
});

test("legacy page and affected curriculum metadata contain no Iraqi-only locale preference", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const mathA = readFileSync(new URL("../curriculum/grade-1/math-2025-2026/lessons/chapter-01-lessons-01-02.json", import.meta.url), "utf8");
  const mathB = readFileSync(new URL("../curriculum/grade-1/math-2025-2026/lessons/chapter-01-lessons-03-05.json", import.meta.url), "utf8");
  assert.doesNotMatch(index, /ar-IQ/i);
  assert.ok(runtime.includes("!/^ar-IQ"), "student voice selector must exclude Iraqi-only voices");
  assert.doesNotMatch(mathA, /ar-IQ/);
  assert.doesNotMatch(mathB, /ar-IQ/);
});


test("student teacher uses a full-body accessible mascot with speech animation", () => {
  const student = readFileSync(new URL("../student.html", import.meta.url), "utf8");
  const start = runtime.indexOf("  function makeTeacher()");
  const end = runtime.indexOf("\n  function setTeacherSpeaking", start);
  const maker = runtime.slice(start, end);
  assert.match(maker, /teacher-character/);
  assert.match(maker, /viewBox="0 0 160 200"/);
  assert.match(maker, /teacher-mouth/);
  assert.match(maker, /role="img"/);
  assert.match(student, /\.teacher-character/);
  assert.match(student, /teacher-bob/);
  assert.match(student, /\.teacher\.speaking \.teacher-mouth/);
  assert.match(student, /teacher\.gender-girl \.teacher-clothes/);
  assert.match(student, /teacher\.gender-boy \.teacher-clothes/);
});