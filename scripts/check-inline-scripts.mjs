import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pages = ["index.html", "student.html"];
let checked = 0;
let failed = false;

for (const page of pages) {
  const html = readFileSync(new URL("../" + page, import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, source]) => !/\bsrc\s*=/.test(attributes) && source.trim());

  if (!scripts.length) {
    failed = true;
    console.error("No inline JavaScript blocks were found in " + page);
    continue;
  }

  scripts.forEach(([, attributes, source], index) => {
    const result = spawnSync(process.execPath, ["--check", "--input-type=commonjs"], {
      input: source,
      encoding: "utf8"
    });
    checked++;
    if (result.status !== 0) {
      failed = true;
      console.error("Inline script " + (index + 1) + " in " + page + " has invalid JavaScript:");
      console.error(result.stderr || result.stdout);
    }
  });
}

if (failed) process.exit(1);
console.log("Checked " + checked + " inline JavaScript block(s) across " + pages.join(" and ") + ".");
