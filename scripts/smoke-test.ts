// Smoke test: parse a real DefenseTech copy file using the Copy Blocks parsers.
// Run: cd ~/Projects2026/copy-block && node --experimental-strip-types scripts/smoke-test.ts

import { parseNote } from "../src/parser/note-parser";
import { parseSections } from "../src/parser/section-parser";
import { parseFootnotes } from "../src/parser/footnote-parser";
import { extractFrontmatter } from "../src/parser/frontmatter";
import * as fs from "fs";
import * as path from "path";

const SAMPLE_PATH = path.join(
  process.env.HOME ?? "~",
  "MasterVault/Master_Vault/PorterCo/Copy/DefenseTech/Copy_Draft/04-Big-Idea-Reveal.md"
);

const raw = fs.readFileSync(SAMPLE_PATH, "utf-8");

console.log("=".repeat(70));
console.log("FRONTMATTER");
console.log("=".repeat(70));
const { frontmatter, body } = extractFrontmatter(raw);
console.log(JSON.stringify(frontmatter, null, 2));

console.log();
console.log("=".repeat(70));
console.log("SECTIONS (the current file has NO markers yet — this is expected)");
console.log("=".repeat(70));
const sectionsResult = parseSections(body);
console.log(`Beats found: ${sectionsResult.beats.length}`);
if (sectionsResult.beats.length > 0) {
  sectionsResult.beats.forEach((b, i) => {
    console.log(`  [${i + 1}] id=${b.id} status=${b.status} verification=${b.verification}`);
    console.log(`      sources: ${b.sources.join(", ") || "(none)"}`);
    console.log(`      content length: ${b.content.length} chars`);
  });
}

console.log();
console.log("=".repeat(70));
console.log("FOOTNOTES (the part we want to test — these are real, not markers)");
console.log("=".repeat(70));
const footnotes = parseFootnotes(body);
console.log(`Footnotes found: ${footnotes.length}`);
footnotes.slice(0, 5).forEach((fn) => {
  console.log();
  console.log(`  [^${fn.ref}] verification=${fn.verification} isOpenLoop=${fn.isOpenLoop}`);
  console.log(`    paysOffIn: ${fn.paysOffIn ?? "(none)"}`);
  console.log(`    plantedIn: ${fn.plantedIn ?? "(none)"}`);
  console.log(`    linkedNotes: ${fn.linkedNotes.join(", ") || "(none)"}`);
  console.log(`    text: ${fn.text.slice(0, 120).replace(/\n/g, " ")}...`);
});

console.log();
console.log("=".repeat(70));
console.log("SIMULATED MARKER (how it would look after mark-up)");
console.log("=".repeat(70));
console.log("This file has 1 main prose block plus the footnote section.");
console.log("To use Copy Blocks, you would add a marker like:");
console.log();
console.log("  <!--section: 4.1 status:draft-v2-footnoted verified:unknown");
console.log('    sources:"[[03-Seven-Lenses-Reveal]]","[[Big-Idea]]" label:"Reveal the industry"-->');
console.log("  (above the KIMBERLY/EREZ dialogue)");
console.log();

console.log("=".repeat(70));
console.log("VERIFICATION STATE DISTRIBUTION");
console.log("=".repeat(70));
const stateCounts: Record<string, number> = {};
for (const fn of footnotes) {
  stateCounts[fn.verification] = (stateCounts[fn.verification] ?? 0) + 1;
}
console.log(JSON.stringify(stateCounts, null, 2));

console.log();
console.log("=".repeat(70));
console.log("OPEN LOOPS DETECTED");
console.log("=".repeat(70));
const loops = footnotes.filter((fn) => fn.isOpenLoop);
console.log(`Found ${loops.length} open-loop footnotes:`);
loops.forEach((fn) => {
  const target = fn.paysOffIn ?? fn.plantedIn;
  const kind = fn.paysOffIn ? "pays off in" : "planted in";
  console.log(`  [^${fn.ref}] ${kind} → ${target}`);
});
