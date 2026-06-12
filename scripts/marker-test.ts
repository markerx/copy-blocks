// Test that the new "type: copy-blocks" frontmatter marker is detected.
import * as fs from "fs";
import * as path from "path";
import { extractFrontmatter } from "../src/parser/frontmatter";
import { parseSections } from "../src/parser/section-parser";

const FILE = path.join(
  process.env.HOME ?? "~",
  "MasterVault/Master_Vault/PorterCo/Copy/DefenseTech/Copy_Final/Draft2.md"
);

const raw = fs.readFileSync(FILE, "utf-8");
const { frontmatter, body } = extractFrontmatter(raw);
console.log("Frontmatter:", JSON.stringify(frontmatter, null, 2));

const { beats } = parseSections(body);
console.log(`Beats found: ${beats.length}`);
beats.forEach((b) => {
  console.log(`  id=${b.id} status=${b.status} verification=${b.verification}`);
});

const passType = frontmatter["type"] === "copy-blocks" ? "✓" : "✗";
console.log(`${passType} type is "copy-blocks": ${frontmatter["type"] === "copy-blocks"}`);

const passBeats = beats.length === 6 ? "✓" : "✗";
console.log(`${passBeats} beats count is 6: ${beats.length === 6}`);
