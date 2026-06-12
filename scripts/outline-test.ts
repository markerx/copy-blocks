// Test the outline-view tree-building logic
import { parseSections, beatDepth, beatBreadcrumb, buildBeatTree, parentBeatId, extractBeatTitle, nextBeatId } from "../src/parser/section-parser";

const FILE = `---
type: promo-copy
act: 1
---

<!--section: 1-->
**The Industry Reveal — the oldest industry in the world**

The defense industry is older than agriculture. It's older than money.

<!--section: 1.1-->
**Setup: outlasting money, outlasting nations**

Defense is older than money itself. Pre-coin economies were already funding standing armies.

<!--section: 1.2-->
**Payoff: the US is the largest customer**

Last year, the US alone spent more than a trillion dollars on defense. More than the next nine countries combined.

<!--section: 2-->
**The Cost Collapse — defense's DeepSeek moment**

For seventy years, expensive platforms dominated. Aircraft carriers, stealth fighters, Arleigh Burkes. The math no longer works.

<!--section: 2.1-->
**Receipt 1: 60-to-1 cost asymmetry**

A $20,000 drone can take out a $1.2M tank.

<!--section: 2.2-->
**Receipt 2: the mandate**

Pentagon autonomous warfare budget jumped from $225.9M to $54.6B in one cycle. That's 24,000%.

<!--section: 3-->
**The Forced Global Response — every NATO budget recalibrates**

Every NATO country must buy in or become militarily irrelevant. Poland 4% of GDP. Germany suspended the debt brake. Taiwan $40B.
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
console.log("Outline view tests — Branch Writing style hierarchy");
console.log("=".repeat(60));

const { beats } = parseSections(FILE);

console.log();
console.log(`Parsed ${beats.length} beats from realistic DefenseTech content`);

// Depth tests
console.log();
console.log("Depth:");
expect("1 has depth 1", beatDepth("1"), 1);
expect("1.1 has depth 2", beatDepth("1.1"), 2);
expect("2.2 has depth 2", beatDepth("2.2"), 2);
expect("1.2.4 has depth 3", beatDepth("1.2.4"), 3);

// Parent tests
console.log();
console.log("Parent IDs:");
expect("1.1 parent is 1", parentBeatId("1.1"), "1");
expect("1.2 parent is 1", parentBeatId("1.2"), "1");
expect("2.2 parent is 2", parentBeatId("2.2"), "2");
expect("1 has no parent", parentBeatId("1"), null);

// Breadcrumb tests
console.log();
console.log("Breadcrumbs:");
expect("1.2.4 breadcrumb", beatBreadcrumb("1.2.4"), ["1", "1.2", "1.2.4"]);
expect("2 breadcrumb", beatBreadcrumb("2"), ["2"]);

// Tree tests
console.log();
console.log("Tree:");
const tree = buildBeatTree(beats);
expect("Top-level beats count", tree.get("")?.length, 3);
expect("Children of 1", tree.get("1")?.map((b) => b.id), ["1.1", "1.2"]);
expect("Children of 2", tree.get("2")?.map((b) => b.id), ["2.1", "2.2"]);
expect("Children of 3", tree.get("3"), undefined);

// Title extraction tests
console.log();
console.log("Title extraction (first bold line as label):");
expect(
  "1.1 title",
  extractBeatTitle(beats.find((b) => b.id === "1.1")!.content, "1.1"),
  "Setup: outlasting money, outlasting nations"
);
expect(
  "2.1 title",
  extractBeatTitle(beats.find((b) => b.id === "2.1")!.content, "2.1"),
  "Receipt 1: 60-to-1 cost asymmetry"
);
expect(
  "3 title",
  extractBeatTitle(beats.find((b) => b.id === "3")!.content, "3"),
  "The Forced Global Response — every NATO budget recalibrates"
);

// nextBeatId tests for siblings
console.log();
console.log("nextBeatId (siblings):");
const topLevel = beats.filter((b) => beatDepth(b.id) === 1);
expect("after 3, top-level, next is 4", nextBeatId(topLevel), "4");
const childrenOf1 = beats.filter((b) => parentBeatId(b.id) === "1");
expect("after 1.2, children of 1, next is 1.3", nextBeatId(childrenOf1), "1.3");

console.log();
console.log("=".repeat(60));
console.log(`Total: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
