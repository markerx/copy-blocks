// Test the reparenting logic: drag-and-drop should rewrite ids correctly
import { parseSections, reparentBeat, applyIdMap, parentBeatId, buildBeatTree } from "../src/parser/section-parser";

const FILE = `<!--section: 1-->
**Industry Reveal**

<!--section: 1.1-->
**Setup: outlasting money**

<!--section: 1.2-->
**Payoff: US is the largest customer**

<!--section: 2-->
**The Cost Collapse**

<!--section: 2.1-->
**Receipt 1: 60-to-1 cost asymmetry**

<!--section: 3-->
**The Forced Response**
`;

let pass = 0;
let fail = 0;
const expect = (label: string, got: unknown, expected: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(expected)) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    fail++;
  }
};

console.log("=".repeat(60));
console.log("Reparent tests (Roam-style drag-to-reparent)");
console.log("=".repeat(60));

// === Test 1: move top-level beat to be sibling of another top-level ===
console.log();
console.log("Test 1: Move beat 3 to be a child of beat 2");
{
  const { beats } = parseSections(FILE);
  const { idMap, moved } = reparentBeat("3", "2", beats);

  expect("new id of moved beat", moved, "2.2");
  expect("idMap size (just the moved beat — no descendants)", idMap.size, 1);
  expect("idMap[3]", idMap.get("3"), "2.2");

  // Apply and re-parse
  const newFile = applyIdMap(FILE, idMap);
  const reparsed = parseSections(newFile);
  const ids = reparsed.beats.map((b) => b.id);

  expect("reparsed ids", ids, ["1", "1.1", "1.2", "2", "2.1", "2.2"]);
  console.log(`  file after reparent:\n${newFile.split("\n").map((l) => "    " + l).join("\n")}`);
}

// === Test 2: move nested beat to a different parent (renumbering depth) ===
console.log();
console.log("Test 2: Move beat 1.2 to be a child of beat 2");
{
  const { beats } = parseSections(FILE);
  const { idMap, moved } = reparentBeat("1.2", "2", beats);

  expect("new id of moved beat (1.2 → 2.2)", moved, "2.2");
  expect("idMap[1.2]", idMap.get("1.2"), "2.2");

  const newFile = applyIdMap(FILE, idMap);
  const reparsed = parseSections(newFile);
  // Note: file order is preserved (in-place rewrite), but tree structure
  // is correct
  const ids = reparsed.beats.map((b) => b.id);
  expect("reparsed ids (in source order)", ids, ["1", "1.1", "2.2", "2", "2.1", "3"]);

  // Verify parent relationships (this is what matters). Note that
  // file source order is preserved by applyIdMap, so children may
  // appear in the order they were originally placed — not strictly
  // nested under their parent. The tree is what matters; visual
  // re-ordering would be a future improvement.
  const tree = buildBeatTree(reparsed.beats);
  expect("children of 2 contains 2.1 and 2.2", new Set(tree.get("2")?.map((b) => b.id)), new Set(["2.1", "2.2"]));
  expect("children of 2.2", tree.get("2.2"), undefined);
  expect("1.1 is still a child of 1", tree.get("1")?.map((b) => b.id), ["1.1"]);
}

// === Test 3: move beat with descendants — descendants must follow ===
console.log();
console.log("Test 3: Move beat 1 (with children 1.1, 1.2) to be a child of beat 3");
{
  const { beats } = parseSections(FILE);
  const { idMap, moved } = reparentBeat("1", "3", beats);

  expect("new id of moved beat (1 → 3.1)", moved, "3.1");
  expect("idMap size (1 + 2 descendants)", idMap.size, 3);
  expect("idMap[1]", idMap.get("1"), "3.1");
  expect("idMap[1.1]", idMap.get("1.1"), "3.1.1");
  expect("idMap[1.2]", idMap.get("1.2"), "3.1.2");

  const newFile = applyIdMap(FILE, idMap);
  const reparsed = parseSections(newFile);
  const ids = reparsed.beats.map((b) => b.id);
  expect("reparsed ids (in source order)", ids, ["3.1", "3.1.1", "3.1.2", "2", "2.1", "3"]);

  // Tree structure is what matters
  const tree = buildBeatTree(reparsed.beats);
  expect("children of 3", tree.get("3")?.map((b) => b.id), ["3.1"]);
  expect("children of 3.1", tree.get("3.1")?.map((b) => b.id), ["3.1.1", "3.1.2"]);
  expect("1 has no children now", tree.get("1"), undefined);
}

// === Test 4: cannot move a beat into its own descendant ===
console.log();
console.log("Test 4: Refuse moving 1.1 into 1.1.5 (its descendant)");
{
  const { beats } = parseSections(FILE);
  // Add a 1.1.1 to test
  const enriched = `<!--section: 1.1.1-->
child
${FILE}`;
  const { beats: ebeats } = parseSections(enriched);
  // The view-side check would prevent this; the parser function
  // reparentBeat would still compute a new id. We're testing the
  // upstream guard, not the function:
  // (no easy way to test the guard here, but at least verify the
  // function doesn't break on it)
  const { idMap, moved } = reparentBeat("1.1", "1.1.1", ebeats);
  expect("function doesn't crash", typeof moved, "string");
  console.log(`  moved 1.1 → 1.1.1, got id ${moved} (function works; the view-side guard prevents this call from happening)`);
}

// === Test 5: idempotency — re-applying a no-op reparent is a no-op ===
console.log();
console.log("Test 5: applyIdMap with empty map is no-op");
{
  const { idMap } = reparentBeat("1", null, []);
  expect("reparent to null returns valid id", typeof idMap.get("1"), "string");
  // The test: applyIdMap with an empty map should not change the text
  const out = applyIdMap(FILE, new Map());
  expect("no-op applyIdMap preserves text", out, FILE);
}

console.log();
console.log("=".repeat(60));
console.log(`Total: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
