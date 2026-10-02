// Copy lint: user-facing text uses typographic quotes (’ “ ”), never typewriter ' or ", and never
// the word "verify". Scans the UI components with comments stripped. Run: node scripts/check-copy.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/components", import.meta.url).pathname;
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) && files.push(join(d, f))));
walk(root);

const rules = [
  [/[A-Za-z]'[a-z]/, "typewriter apostrophe (use ’)"],
  [/&apos;|&quot;/, "HTML quote entity (use ’ or “ ”)"],
  [/>[^<{]*\bverify\b/i, "the word “verify” in copy"],
];
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  src.split("\n").forEach((line, i) => {
    for (const [re, why] of rules)
      if (re.test(line)) {
        bad++;
        console.log(`${f.replace(root + "/", "components/")}:${i + 1}: ${why}\n    ${line.trim()}`);
      }
  });
}
if (bad) {
  console.log(`\n${bad} copy issue(s).`);
  process.exit(1);
}
console.log("copy ok");
