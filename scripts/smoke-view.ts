// Try to load the writing view and render to find runtime errors.
// We mock the Obsidian app enough to construct a WritingView.
import { JSDOM } from "jsdom";
import { writeFileSync } from "fs";

// Make a JSDOM environment
const dom = new JSDOM("<!DOCTYPE html><html><body><div id='container'></div></body></html>");
const document = dom.window.document;
const container = document.getElementById("container")!;

// We can't easily mock the full Obsidian API, so let's just check the
// file for likely runtime errors by static analysis.

// 1. Find any use of `instanceof` against Obsidian types
// 2. Find any reference to `this.app.setting?.openTabById` etc.
// 3. Find any use of undefined identifiers

import * as fs from "fs";
const src = fs.readFileSync("src/view/writing-view.ts", "utf-8");

// Check for any obvious issues
const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

// 1. MarkdownRenderer is gone
checks.push({
  name: "MarkdownRenderer removed",
  ok: !src.includes("MarkdownRenderer"),
});

// 2. All required imports are there
const hasItemView = src.includes("ItemView");
const hasWorkspaceLeaf = src.includes("WorkspaceLeaf");
const hasTFile = src.includes("TFile");
const hasNotice = src.includes("Notice");
checks.push({ name: "obsidian imports", ok: hasItemView && hasWorkspaceLeaf && hasTFile && hasNotice });

// 3. Constructor matches class signature
checks.push({
  name: "constructor takes (leaf, settings)",
  ok: src.includes("constructor(leaf: WorkspaceLeaf, settings: CopyBlocksSettings)"),
});

// 4. All abstract methods implemented
checks.push({
  name: "getViewType implemented",
  ok: src.includes("getViewType(): string"),
});
checks.push({
  name: "getDisplayText implemented",
  ok: src.includes("getDisplayText(): string"),
});
checks.push({
  name: "getIcon implemented",
  ok: src.includes("getIcon(): string"),
});
checks.push({
  name: "onOpen implemented",
  ok: src.includes("async onOpen()"),
});
checks.push({
  name: "onClose implemented",
  ok: src.includes("async onClose()"),
});

// 5. No use of `setIcon` (we removed it but let me check)
checks.push({
  name: "setIcon not imported (unused)",
  ok: !src.includes("setIcon"),
});

for (const c of checks) {
  console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ": " + c.detail : ""}`);
}

if (checks.some((c) => !c.ok)) {
  console.log("\nSome checks failed. Likely source of the blank screen:");
  for (const c of checks.filter((x) => !x.ok)) {
    console.log(`  - ${c.name}`);
  }
} else {
  console.log("\nAll static checks pass. The bug is likely runtime — need actual execution.");
}
