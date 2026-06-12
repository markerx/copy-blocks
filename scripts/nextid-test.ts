// Test nextBeatId with various inputs
import { nextBeatId } from "../src/parser/section-parser";
import { Beat } from "../src/types";

const mkBeat = (id: string): Beat => ({
  id,
  status: "draft-v1",
  verification: "unknown",
  sources: [],
  content: "",
  markerStart: 0,
  contentEnd: 0,
  isFirst: false,
});

const cases: Array<{ beats: Beat[]; expected: string; label: string }> = [
  { beats: [], expected: "1", label: "no beats" },
  { beats: [mkBeat("1")], expected: "2", label: "single top-level beat" },
  { beats: [mkBeat("1"), mkBeat("2")], expected: "3", label: "two beats" },
  { beats: [mkBeat("1"), mkBeat("2"), mkBeat("3")], expected: "4", label: "three beats" },
  { beats: [mkBeat("1.1"), mkBeat("1.2")], expected: "1.3", label: "nested under 1" },
  { beats: [mkBeat("4.1.3")], expected: "4.1.4", label: "deep nesting" },
  { beats: [mkBeat("9")], expected: "10", label: "single digit → two digit" },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const got = nextBeatId(c.beats);
  if (got === c.expected) {
    console.log(`  ✓ ${c.label}: ${got}`);
    pass++;
  } else {
    console.log(`  ✗ ${c.label}: expected ${c.expected}, got ${got}`);
    fail++;
  }
}

console.log();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
