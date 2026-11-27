import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes, source]) => !/\bsrc\s*=/.test(attributes) && source.trim());

if (!scripts.length) {
  console.error("No inline JavaScript blocks were found in index.html");
  process.exit(1);
}

let failed = false;
scripts.forEach(([, attributes, source], index) => {
  const result = spawnSync(process.execPath, ["--check", "--input-type=commonjs"], {
    input: source,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    failed = true;
    console.error("Inline script " + (index + 1) + " has invalid JavaScript:");
    console.error(result.stderr || result.stdout);
  }
});

if (failed) process.exit(1);
console.log("Checked " + scripts.length + " inline JavaScript block(s) in index.html.");
