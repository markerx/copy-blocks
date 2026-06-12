// Cross-file test using the full parseNote() pipeline.
import { parseNote } from "../src/parser/note-parser";
import * as fs from "fs";
import * as path from "path";
import { TFile } from "obsidian";

// Mock TFile
class MockTFile {
  constructor(public path: string) {}
  get basename(): string {
    return path.basename(this.path, ".md");
  }
}

const FILES = [
  "PorterCo/Copy/DefenseTech/Copy_Draft/01-Host-Monologue.md",
  "PorterCo/Copy/DefenseTech/Copy_Draft/02-Erez-Greeting.md",
  "PorterCo/Copy/DefenseTech/Copy_Draft/03-Seven-Lenses-Reveal.md",
  "PorterCo/Copy/DefenseTech/Copy_Draft/04-Big-Idea-Reveal.md",
  "PorterCo/Copy/DefenseTech/Copy_Draft/05-War-Proof_Why-The-Mandate.md",
];

console.log("=".repeat(70));
console.log("CROSS-FILE LOOP GRAPH — DefenseTech VSL Drafts");
console.log("=".repeat(70));

const allNotes: ReturnType<typeof parseNote>[] = [];

for (const f of FILES) {
  const fullPath = path.join(process.env.HOME ?? "~", "MasterVault/Master_Vault", f);
  if (!fs.existsSync(fullPath)) {
    console.log(`(skip — not found: ${f})`);
    continue;
  }
  const raw = fs.readFileSync(fullPath, "utf-8");
  const mockFile = new MockTFile(fullPath) as unknown as TFile;
  const note = parseNote(mockFile, raw);
  allNotes.push(note);
}

let totalLoops = 0;
for (const note of allNotes) {
  const loops = note.footnotes.filter(
    (fn) => fn.paysOffIn || fn.plantedIn || fn.heldOutOf || fn.citedIn
  );
  if (loops.length === 0) continue;
  totalLoops += loops.length;
  console.log(`\n--- ${note.basename} (${loops.length} loop-bearing footnotes) ---`);
  for (const fn of loops) {
    const targets: string[] = [];
    if (fn.paysOffIn) targets.push(`pays off in [[${fn.paysOffIn}]]`);
    if (fn.plantedIn) targets.push(`planted in [[${fn.plantedIn}]]`);
    if (fn.heldOutOf) targets.push(`held out of [[${fn.heldOutOf}]]`);
    if (fn.citedIn) targets.push(`cited in [[${fn.citedIn}]]`);
    for (const t of targets) {
      console.log(`  [^${fn.ref}] ${t}`);
    }
  }
}

console.log();
console.log(`Total: ${totalLoops} loop-bearing footnotes across ${allNotes.length} files.`);

console.log();
console.log("=".repeat(70));
console.log("VERIFICATION ROLLUP");
console.log("=".repeat(70));

for (const note of allNotes) {
  const states: Record<string, number> = {};
  for (const fn of note.footnotes) {
    states[fn.verification] = (states[fn.verification] ?? 0) + 1;
  }
  const total = Object.values(states).reduce((a, b) => a + b, 0);
  const parts = Object.entries(states)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s}=${n}`)
    .join("  ");
  console.log(`  ${note.basename.padEnd(40)} ${total} footnotes — ${parts}`);
}
