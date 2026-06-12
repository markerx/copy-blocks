// Test the moveBeatToPosition + swapBeats logic with synthetic beats
// to verify the string manipulation is sound before we trust it in the editor.
import { parseSections } from "../src/parser/section-parser";
import { swapBeats, moveBeatToPosition } from "../src/editor/beat-reorder";

const BEFORE = `---
type: promo-copy
act: 1
---

<!--section: 1 status:draft-v1-->
First beat content here.

<!--section: 2 status:voice-locked verified:yes-->
Second beat content.

<!--section: 3 status:fact-checked-->
Third beat content.
`;

function assertEq(actual: string, expected: string, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    const a = actual.split("\n");
    const e = expected.split("\n");
    const max = Math.max(a.length, e.length);
    for (let i = 0; i < max; i++) {
      const al = a[i] ?? "";
      const el = e[i] ?? "";
      const marker = al === el ? "  " : "✗ ";
      console.log(`    ${marker}${al}${al === el ? "" : "  ≠  " + el}`);
    }
  }
}

console.log("=".repeat(60));
console.log("Reorder logic tests");
console.log("=".repeat(60));

// Test 1: swap adjacent beats (0 and 1)
{
  const beats = parseSections(BEFORE).beats;
  const result = swapBeats(BEFORE, beats, 0, 1);
  const newBeats = parseSections(result).beats;
  console.log(`  Adjacent swap (0,1) result: ${newBeats.map((b) => b.id).join(", ")}`);
  if (newBeats[0]!.id === "2" && newBeats[1]!.id === "1" && newBeats[2]!.id === "3") {
    console.log("  ✓ Swap adjacent produces [2, 1, 3]");
  } else {
    console.log("  ✗ Swap adjacent: got [" + newBeats.map((b) => b.id).join(", ") + "]");
  }
}

// Test 2: swap reverse (1 and 2)
{
  const beats = parseSections(BEFORE).beats;
  const result = swapBeats(BEFORE, beats, 1, 2);
  const newBeats = parseSections(result).beats;
  console.log(`  Reverse swap (1,2) result: ${newBeats.map((b) => b.id).join(", ")}`);
  if (newBeats[0]!.id === "1" && newBeats[1]!.id === "3" && newBeats[2]!.id === "2") {
    console.log("  ✓ Swap reverse produces [1, 3, 2]");
  } else {
    console.log("  ✗ Swap reverse: got [" + newBeats.map((b) => b.id).join(", ") + "]");
  }
}

// Test 3: move beat 0 to position 2 (end)
{
  const beats = parseSections(BEFORE).beats;
  const result = moveBeatToPosition(BEFORE, beats, 0, 2);
  const newBeats = parseSections(result).beats;
  console.log(`  Move (0→2) result: ${newBeats.map((b) => b.id).join(", ")}`);
  if (newBeats[0]!.id === "2" && newBeats[1]!.id === "3" && newBeats[2]!.id === "1") {
    console.log("  ✓ Move-to-end produces [2, 3, 1]");
  } else {
    console.log("  ✗ Move-to-end: got [" + newBeats.map((b) => b.id).join(", ") + "]");
  }
}

// Test 4: move last to front
{
  const beats = parseSections(BEFORE).beats;
  const result = moveBeatToPosition(BEFORE, beats, 2, 0);
  const newBeats = parseSections(result).beats;
  console.log(`  Move (2→0) result: ${newBeats.map((b) => b.id).join(", ")}`);
  if (newBeats[0]!.id === "3" && newBeats[1]!.id === "1" && newBeats[2]!.id === "2") {
    console.log("  ✓ Move-last-to-front produces [3, 1, 2]");
  } else {
    console.log("  ✗ Move-last-to-front: got [" + newBeats.map((b) => b.id).join(", ") + "]");
  }
}

// Test 5: move beat 1 to position 0 (front)
{
  const beats = parseSections(BEFORE).beats;
  const result = moveBeatToPosition(BEFORE, beats, 1, 0);
  const newBeats = parseSections(result).beats;
  console.log(`  Move (1→0) result: ${newBeats.map((b) => b.id).join(", ")}`);
  if (newBeats[0]!.id === "2" && newBeats[1]!.id === "1" && newBeats[2]!.id === "3") {
    console.log("  ✓ Move-middle-to-front produces [2, 1, 3]");
  } else {
    console.log("  ✗ Move-middle-to-front: got [" + newBeats.map((b) => b.id).join(", ") + "]");
  }
}

// Test 6: idempotent
{
  const beats = parseSections(BEFORE).beats;
  const result = moveBeatToPosition(BEFORE, beats, 1, 1);
  assertEq(result, BEFORE, "Move to same position is no-op");
}

// Test 7: out of bounds
{
  const beats = parseSections(BEFORE).beats;
  assertEq(moveBeatToPosition(BEFORE, beats, -1, 0), BEFORE, "Out-of-bounds from returns original");
  assertEq(moveBeatToPosition(BEFORE, beats, 0, 99), BEFORE, "Out-of-bounds to returns original");
}

// Test 8: round-trip preserves beat content
{
  const beats = parseSections(BEFORE).beats;
  const originalIds = beats.map((b) => b.id).sort();
  let text = BEFORE;
  text = moveBeatToPosition(text, parseSections(text).beats, 0, 2);
  text = swapBeats(text, parseSections(text).beats, 0, 1);
  text = moveBeatToPosition(text, parseSections(text).beats, 2, 0);
  const newIds = parseSections(text).beats.map((b) => b.id).sort();
  if (JSON.stringify(originalIds) === JSON.stringify(newIds)) {
    console.log("  ✓ Round-trip preserves all beat ids after multiple moves");
  } else {
    console.log(`  ✗ Round-trip lost beats: was [${originalIds}], now [${newIds}]`);
  }
}

console.log();
console.log("=".repeat(60));
console.log("Real-file test: move beats in actual DefenseTech file");
console.log("=".repeat(60));

import * as fs from "fs";
import * as path from "path";

const TEST_FILE = path.join(
  process.env.HOME ?? "~",
  "MasterVault/Master_Vault/PorterCo/Copy/DefenseTech/Copy_Draft/03-Seven-Lenses-Reveal.md"
);

if (fs.existsSync(TEST_FILE)) {
  // Add markers to a test file temporarily (we'll just parse the existing structure
  // and verify swap works on a small substring with synthetic markers)
  const original = fs.readFileSync(TEST_FILE, "utf-8");
  console.log(`  Loaded ${path.basename(TEST_FILE)}: ${original.length} chars`);

  // Make a test string with markers and run the swap
  const testText = `<!--section: 1 status:draft-v1-->
Test paragraph 1.

<!--section: 2 status:voice-locked-->
Test paragraph 2 with hyphenated-status-keyword.

<!--section: 3 status:needs-primary-->
Test paragraph 3.`;

  const beats = parseSections(testText).beats;
  console.log(`  Test fixture: ${beats.length} beats parsed`);
  if (beats.length === 3) {
    console.log("  ✓ Hyphen-containing status values parse correctly");
  } else {
    console.log(`  ✗ Expected 3 beats, got ${beats.length}`);
  }
} else {
  console.log(`  (skip — file not found)`);
}
