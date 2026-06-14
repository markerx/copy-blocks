// Static check: look for likely runtime errors in the writing view
import * as fs from "fs";
const src = fs.readFileSync("src/view/writing-view.ts", "utf-8");

// Look for `instanceof` against classes that may not exist
const instanceofChecks: Array<[string, number]> = [];
const lines = src.split("\n");
lines.forEach((line, i) => {
  const m = line.match(/instanceof\s+(\w+)/);
  if (m) instanceofChecks.push([m[1]!, i + 1]);
});
console.log("instanceof usages:", instanceofChecks);

// Look for any TypeScript-like syntax errors by trying to compile
import { execSync } from "child_process";
try {
  const out = execSync("npx tsc --noEmit --target es2020 --module esnext --moduleResolution node --skipLibCheck src/view/writing-view.ts 2>&1", { encoding: "utf-8" });
  console.log("tsc output:");
  console.log(out);
} catch (e: any) {
  console.log("tsc errors:");
  console.log(e.stdout || e.message);
}
