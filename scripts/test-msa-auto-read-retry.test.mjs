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
  const start = runtime.indexOf("  function renderQuestion()");
  const end = runtime.indexOf("\n  function openLesson", start);
  assert.ok(start >= 0 && end > start, "question renderer must exist");
  const renderer = runtime.slice(start, end);
  assert.match(renderer, /speakQuestion\(spokenQuestion\);/);
  assert.ok(renderer.indexOf("answers.appendChild(next);") < renderer.indexOf("speakQuestion(spokenQuestion);"));
});

test("incorrect answers leave the current question available for another attempt", () => {
  const start = runtime.indexOf("  function renderQuestion()");
  const end = runtime.indexOf("\n  function openLesson", start);
  const renderer = runtime.slice(start, end);
  const wrongAnswer = renderer.indexOf("if (!correctAnswer)");
  const retryReturn = renderer.indexOf("return;", wrongAnswer);
  const markAnswered = renderer.indexOf("answered.add(questionIndex)");
  assert.ok(wrongAnswer >= 0 && retryReturn > wrongAnswer, "incorrect answer must return without advancing");
  assert.ok(markAnswered > retryReturn, "question is marked answered only after a correct response");
  assert.ok(renderer.indexOf("answers.querySelectorAll", markAnswered) > markAnswered,
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
