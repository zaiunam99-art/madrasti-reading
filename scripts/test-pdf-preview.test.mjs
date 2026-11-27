import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("let previewPdfUrl = null;");
const end = html.indexOf("\n}", html.indexOf("async function previewPdf", start)) + 2;
assert.ok(start >= 0 && end > start, "local PDF preview handler must exist");
const source = html.slice(start, end);

function setup(file) {
  const links = [];
  const revoked = [];
  const info = {
    textContent: "",
    children: [],
    appendChild(node) { this.children.push(node); }
  };
  const sandbox = {
    document: {
      getElementById(id) { return id === "pdfInfo" ? info : null; },
      createElement(tag) { const node = { tag }; links.push(node); return node; }
    },
    URL: {
      createObjectURL() { return "blob:local-preview"; },
      revokeObjectURL(url) { revoked.push(url); }
    }
  };
  runInNewContext(source + "; globalThis.previewPdf = previewPdf; globalThis.getPreviewUrl = () => previewPdfUrl;", sandbox);
  return { sandbox, info, links, revoked, input: { files: file ? [file] : [] } };
}

test("validates a PDF signature and creates a local preview link", async () => {
  const file = { name: "book.pdf", type: "application/pdf", slice() { return { async text() { return "%PDF-"; } }; } };
  const result = setup(file);
  await result.sandbox.previewPdf(result.input);
  assert.match(result.info.textContent, /لم يُرفع الملف/);
  assert.equal(result.links[0].href, "blob:local-preview");
  assert.equal(result.links[0].target, "_blank");
  assert.equal(result.sandbox.getPreviewUrl(), "blob:local-preview");
});

test("rejects a file whose content does not have a PDF signature", async () => {
  const file = { type: "application/pdf", slice() { return { async text() { return "hello"; } }; } };
  const result = setup(file);
  await result.sandbox.previewPdf(result.input);
  assert.match(result.info.textContent, /لا يبدو أنه ملف PDF صالح/);
  assert.equal(result.links.length, 0);
});

test("releases the previous local preview URL when a new file is selected", async () => {
  const file = { type: "application/pdf", slice() { return { async text() { return "%PDF-"; } }; } };
  const result = setup(file);
  await result.sandbox.previewPdf(result.input);
  await result.sandbox.previewPdf({ files: [] });
  assert.deepEqual(result.revoked, ["blob:local-preview"]);
  assert.equal(result.sandbox.getPreviewUrl(), null);
  assert.equal(result.info.textContent, "لم يتم اختيار ملف.");
});
