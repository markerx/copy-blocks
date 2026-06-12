"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/parser/section-parser.ts
var MARKER_PATTERN = /<!--\s*section:\s*([^\s>]+?)(?:\s+([^\-]+?))?\s*-->/g;
var FIELD_PATTERN = /(\w+):(?:"([^"]*)"|'([^']*)'|(\S+))/g;
function parseSections(text) {
  const beats = [];
  const markerOffsets = [];
  const matches = [];
  let m;
  MARKER_PATTERN.lastIndex = 0;
  while ((m = MARKER_PATTERN.exec(text)) !== null) {
    matches.push({ match: m, id: m[1], fields: m[2] ?? "" });
  }
  if (matches.length === 0) {
    return { beats, markerOffsets };
  }
  for (let i = 0; i < matches.length; i++) {
    const { match, id, fields } = matches[i];
    const nextMatch = matches[i + 1];
    const markerEnd = match.index + match[0].length;
    const contentStart = markerEnd;
    const contentEnd = nextMatch ? nextMatch.match.index : text.length;
    const content = text.slice(contentStart, contentEnd);
    const parsed = parseFields(fields);
    const beat = {
      id,
      label: parsed.label,
      status: parsed.status ?? "draft-v1",
      verification: normalizeVerification(parsed.verified, parsed.verification),
      sources: parsed.sources ?? [],
      content,
      markerStart: match.index,
      contentEnd,
      isFirst: i === 0
    };
    beats.push(beat);
    markerOffsets.push(match.index);
  }
  return { beats, markerOffsets };
}
function parseFields(fieldString) {
  const result = {};
  if (!fieldString.trim())
    return result;
  FIELD_PATTERN.lastIndex = 0;
  let m;
  while ((m = FIELD_PATTERN.exec(fieldString)) !== null) {
    const key = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (key === "sources") {
      result.sources = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0).map((s) => s.replace(/^["']|["']$/g, ""));
    } else {
      result[key] = value;
    }
  }
  return result;
}
function normalizeVerification(verifiedRaw, verificationRaw) {
  const raw2 = (verificationRaw ?? verifiedRaw ?? "").toLowerCase().trim();
  switch (raw2) {
    case "yes":
    case "true":
    case "verified":
    case "1":
      return "verified";
    case "no":
    case "needs-primary":
    case "needsprimary":
    case "needs-primary-source":
    case "warn":
    case "warning":
      return "needs-primary";
    case "constructed":
    case "drafted":
    case "tbd":
      return "constructed";
    case "gated":
    case "locked":
    case "blocked":
      return "gated";
    case "":
    case "unknown":
    case "n/a":
    default:
      return "unknown";
  }
}

// src/parser/footnote-parser.ts
var FOOTNOTE_PATTERN = /^\[\^([\w]+)\]:\s*(.+?)(?=^\[\^|$)/gm;
var WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;
var VERIFICATION_MARKERS = [
  { pattern: /✅\s*VERIFIED/i, state: "verified", confidence: 1 },
  { pattern: /❌\s*FAIL/i, state: "needs-primary", confidence: 1 },
  { pattern: /❌\s*UNVERIFIED/i, state: "needs-primary", confidence: 0.9 },
  { pattern: /❌/i, state: "needs-primary", confidence: 0.5 },
  { pattern: /🟡/i, state: "needs-primary", confidence: 0.8 },
  { pattern: /⚠️\s*NEEDS?\s*PRIMARY/i, state: "needs-primary", confidence: 1 },
  { pattern: /⚠️/i, state: "needs-primary", confidence: 0.6 },
  { pattern: /🚧/i, state: "constructed", confidence: 0.7 },
  { pattern: /🔒/i, state: "gated", confidence: 0.8 },
  { pattern: /\bGATED\b/i, state: "gated", confidence: 0.9 },
  { pattern: /\bCONSTRUCTED\b/i, state: "constructed", confidence: 0.9 },
  { pattern: /\bneeds?\s*primary[\s-]?source\b/i, state: "needs-primary", confidence: 0.9 },
  { pattern: /\bverify\b/i, state: "needs-primary", confidence: 0.3 }
];
var OPEN_LOOP_PATTERNS = {
  // "pays off in [[04-Big-Idea-Reveal]]", "pays off as the dry-powder reveal in [[X]]"
  paysOffIn: /\bpays?\s+off\s+(?:in|as|with|at)\s+(?:[^.\n]*?\s+in\s+)?\[\[([^\]]+)\]\]/i,
  // "planted in [[01-Host-Monologue]]", "set up in [[X]]"
  plantedIn: /\b(?:planted|set\s+up|teased|first\s+named|opens)\s+(?:in|at)\s+\[\[([^\]]+)\]\]/i,
  // "MOVED TO [[02-Erez-Greeting]]", "relocated to [[X]]"
  movedTo: /\bMOVED\s+TO\s+\[\[([^\]]+)\]\]/i,
  // "held out of [[02-Erez-Greeting]]", "set up for [[X]]"
  heldOut: /\bheld\s+out\s+of\s+\[\[([^\]]+)\]\]/i,
  // "named in [[04-Big-Idea-Reveal]]", "reworked in [[X]]"
  namedIn: /\b(?:named|first\s+mentioned|introduced)\s+in\s+\[\[([^\]]+)\]\]/i,
  // "same drone cited in [[05-War-Proof_Why-The-Mandate]] [^3]" — citation cross-ref
  citedIn: /\bcited\s+in\s+\[\[([^\]]+)\]\]/i,
  // "(see audit)", "(see X)" — internal audit references
  seeAudit: /\bsee\s+audit\b/i,
  // "→ pays off as the dry-powder reveal in [[X]]" — arrow-followed-by-pattern
  arrowPaysOff: /→\s*pays?\s+off\s+(?:in|as|with|at)\s+(?:[^.\n]*?\s+in\s+)?\[\[([^\]]+)\]\]/i
};
var BEAT_REFERENCE_PATTERN = /\bBeat\s+(\d+(?:\.\d+)*)\b/gi;
function parseFootnotes(text) {
  const footnotes2 = [];
  FOOTNOTE_PATTERN.lastIndex = 0;
  let m;
  while ((m = FOOTNOTE_PATTERN.exec(text)) !== null) {
    const ref = m[1];
    const body2 = m[2].trim();
    const linkedNotes = extractWikilinks(body2);
    const linkedBeats = extractBeatReferences(body2);
    const verification = inferVerification(body2);
    const loopInfo = extractLoopInfo(body2);
    footnotes2.push({
      ref,
      text: body2,
      verification,
      linkedBeats,
      linkedNotes,
      isOpenLoop: Boolean(
        loopInfo.paysOffIn || loopInfo.plantedIn || loopInfo.movedTo || loopInfo.heldOutOf || loopInfo.namedIn || loopInfo.citedIn
      ),
      paysOffIn: loopInfo.paysOffIn,
      plantedIn: loopInfo.plantedIn
    });
  }
  return footnotes2;
}
function extractWikilinks(text) {
  const links = [];
  WIKILINK_PATTERN.lastIndex = 0;
  let m;
  while ((m = WIKILINK_PATTERN.exec(text)) !== null) {
    links.push(m[1]);
  }
  return Array.from(new Set(links));
}
function extractBeatReferences(text) {
  const beats = [];
  BEAT_REFERENCE_PATTERN.lastIndex = 0;
  let m;
  while ((m = BEAT_REFERENCE_PATTERN.exec(text)) !== null) {
    beats.push(m[1]);
  }
  return Array.from(new Set(beats));
}
function inferVerification(text) {
  let best = {
    state: "unknown",
    confidence: 0
  };
  for (const marker of VERIFICATION_MARKERS) {
    if (marker.pattern.test(text)) {
      if (marker.confidence > best.confidence) {
        best = { state: marker.state, confidence: marker.confidence };
      }
    }
  }
  return best.state;
}
function extractLoopInfo(text) {
  const result = {};
  const arrow = text.match(OPEN_LOOP_PATTERNS.arrowPaysOff);
  if (arrow)
    result.paysOffIn = arrow[1];
  if (!result.paysOffIn) {
    const paysOff = text.match(OPEN_LOOP_PATTERNS.paysOffIn);
    if (paysOff)
      result.paysOffIn = paysOff[1];
  }
  const planted = text.match(OPEN_LOOP_PATTERNS.plantedIn);
  if (planted)
    result.plantedIn = planted[1];
  const moved = text.match(OPEN_LOOP_PATTERNS.movedTo);
  if (moved)
    result.movedTo = moved[1];
  const heldOut = text.match(OPEN_LOOP_PATTERNS.heldOut);
  if (heldOut)
    result.heldOutOf = heldOut[1];
  const named = text.match(OPEN_LOOP_PATTERNS.namedIn);
  if (named)
    result.namedIn = named[1];
  const cited = text.match(OPEN_LOOP_PATTERNS.citedIn);
  if (cited)
    result.citedIn = cited[1];
  result.hasAuditReference = OPEN_LOOP_PATTERNS.seeAudit.test(text);
  return result;
}

// src/parser/frontmatter.ts
function parseFrontmatter(raw2) {
  const result = {};
  const lines = raw2.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#"))
      continue;
    const colonMatch = line.match(/^([\w-]+):\s*(.*)$/);
    if (!colonMatch)
      continue;
    const key = colonMatch[1];
    let value = colonMatch[2].trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
function extractFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }
  const frontmatter2 = parseFrontmatter(match[1]);
  const body2 = text.slice(match[0].length);
  return { frontmatter: frontmatter2, body: body2 };
}

// scripts/smoke-test.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var SAMPLE_PATH = path.join(
  process.env.HOME ?? "~",
  "MasterVault/Master_Vault/PorterCo/Copy/DefenseTech/Copy_Draft/04-Big-Idea-Reveal.md"
);
var raw = fs.readFileSync(SAMPLE_PATH, "utf-8");
console.log("=".repeat(70));
console.log("FRONTMATTER");
console.log("=".repeat(70));
var { frontmatter, body } = extractFrontmatter(raw);
console.log(JSON.stringify(frontmatter, null, 2));
console.log();
console.log("=".repeat(70));
console.log("SECTIONS (the current file has NO markers yet \u2014 this is expected)");
console.log("=".repeat(70));
var sectionsResult = parseSections(body);
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
console.log("FOOTNOTES (the part we want to test \u2014 these are real, not markers)");
console.log("=".repeat(70));
var footnotes = parseFootnotes(body);
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
var stateCounts = {};
for (const fn of footnotes) {
  stateCounts[fn.verification] = (stateCounts[fn.verification] ?? 0) + 1;
}
console.log(JSON.stringify(stateCounts, null, 2));
console.log();
console.log("=".repeat(70));
console.log("OPEN LOOPS DETECTED");
console.log("=".repeat(70));
var loops = footnotes.filter((fn) => fn.isOpenLoop);
console.log(`Found ${loops.length} open-loop footnotes:`);
loops.forEach((fn) => {
  console.log(`  [^${fn.ref}] \u2192 ${fn.paysOffIn ?? fn.plantedIn}`);
});
