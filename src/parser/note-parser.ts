import { TFile, Vault } from "obsidian";
import { extractFrontmatter } from "./frontmatter";
import { parseSections } from "./section-parser";
import { parseFootnotes } from "./footnote-parser";
import { ParsedNote, Footnote, Beat } from "../types";

/**
 * Parse a full note into a ParsedNote structure: frontmatter + beats +
 * footnotes. Beats and footnotes are extracted from the body (after
 * frontmatter is stripped).
 */
export function parseNote(file: TFile, rawText: string, deckId?: string): ParsedNote {
  const { frontmatter, body } = extractFrontmatter(rawText);

  // Parse sections from the full body (beats live anywhere in the file).
  const { beats } = parseSections(body);

  // Footnotes come from a section under a "## Source Footnotes" header,
  // OR from the bottom of the file. The pattern `^[^N]: ...` only matches
  // at line-start, so we look for the whole footnote block.
  const footnotes = extractFootnotesFromBody(body);

  // Infer deck id from frontmatter if not passed.
  const inferredDeckId =
    deckId ??
    frontmatter["deck"] ??
    inferDeckFromPath(file.path);

  return {
    filePath: file.path,
    basename: file.basename,
    frontmatter,
    beats,
    footnotes,
    deckId: inferredDeckId,
  };
}

function extractFootnotesFromBody(body: string): Footnote[] {
  // Find the footnotes section. Common patterns:
  //   "## Source Footnotes"
  //   "## Footnotes"
  //   "## Citations"
  //   "## Compliance"
  // Otherwise fall back to "last block of [^N]: lines at end of file".
  const sectionHeaderPattern = /^##\s+(?:Source\s+)?(?:Footnotes|Citations|Compliance|Sources)/im;
  const sectionMatch = body.match(sectionHeaderPattern);

  let footnoteBlock: string;
  if (sectionMatch) {
    footnoteBlock = body.slice((sectionMatch.index ?? 0) + sectionMatch[0].length);
  } else {
    // Take last 50% of file as a heuristic for "the bottom".
    footnoteBlock = body.slice(Math.floor(body.length / 2));
  }

  const footnotes = parseFootnotes(footnoteBlock);

  // ALSO scan the whole body for free-form loop-tracker sections, e.g.
  //   ## Open loops planted (pay off later)
  //   - "X" → pays off in [[Y]]
  // These aren't proper footnotes but they encode the same relationship.
  // The lookahead is `^## ` (with literal space, not \s+) to avoid the
  // regex eating the newline boundary before the next header.
  const loopTrackerPattern =
    /^##\s+Open\s+loops\s+planted[\s\S]*?(?=^## |\Z)/gm;
  const loopTrackerMatch = body.match(loopTrackerPattern);
  if (loopTrackerMatch) {
    const syntheticFootnote = synthesizeLoopTrackerFootnote(loopTrackerMatch[0]);
    if (syntheticFootnote) {
      footnotes.push(syntheticFootnote);
    }
  }

  return footnotes;
}

/**
 * Convert a free-form "## Open loops planted" section into a synthetic
 * footnote with multiple linked-note entries. Returned as a single
 * Footnote object with the loop targets encoded in the text.
 */
function synthesizeLoopTrackerFootnote(sectionText: string): Footnote | null {
  // Extract each loop line: `→ pays off in [[X]]` or `paid off in [[X]]`
  const lines = sectionText.split(/\r?\n/);
  const targets: string[] = [];

  for (const line of lines) {
    // Match `→ pays off as the X reveal in [[Y]]` — the most common form
    // in `01-Host-Monologue.md`. The text between "as" and "[[X]]" can
    // contain markdown bold markers (`**word**`) that we tolerate by
    // stripping them via a non-greedy match that allows asterisks.
    const arrowMatch = line.match(
      /→\s*pays?\s+off\s+(?:as|in|with|at)\s+[\s\S]*?\[\[([^\]]+)\]\]/i
    );
    if (arrowMatch) targets.push(arrowMatch[1]!);

    // "(named in [[X]])" — parenthetical reference
    const namedInMatch = line.match(/\(?named\s+in\s+\[\[([^\]]+)\]\]\)?/i);
    if (namedInMatch) targets.push(namedInMatch[1]!);

    // Bare arrow target: "loop text → Act 3 reveal" (without explicit [[X]])
    // — these we don't capture as wikilink targets but they still represent
    // a planted loop. Left as text-only for now; future enhancement: parse
    // "Act 3" → file basename using a deck mapping.
  }

  if (targets.length === 0) return null;

  return {
    ref: "loops",
    text: sectionText.slice(0, 500),
    verification: "unknown",
    linkedBeats: [],
    linkedNotes: Array.from(new Set(targets)),
    isOpenLoop: true,
    paysOffIn: targets[0],
    hasAuditReference: /\bsee\s+audit\b/i.test(sectionText),
  };
}

function inferDeckFromPath(path: string): string | undefined {
  // Look for patterns like "PorterCo/Copy/DefenseTech/" → "DefenseTech"
  // or "PorterCo/Copy/LNG/" → "LNG"
  const copyMatch = path.match(/\/Copy\/([^/]+)\//);
  if (copyMatch) {
    return `${copyMatch[1]} VSL`;
  }

  // Look for patterns like "Copy_Draft/" → infer from the directory name.
  const draftMatch = path.match(/Copy_Draft/);
  if (draftMatch) {
    // The deck is probably the parent — handle this case via frontmatter
    // or settings.
    return undefined;
  }

  return undefined;
}

/**
 * Index the entire vault for promo-copy notes. Returns a Map keyed by
 * deck id → list of parsed notes. Used by the deck dashboard.
 */
export async function indexVault(
  vault: Vault,
  markerKey: string,
  deckIdKey: string
): Promise<Map<string, ParsedNote[]>> {
  const decks = new Map<string, ParsedNote[]>();

  for (const file of vault.getMarkdownFiles()) {
    let raw: string;
    try {
      raw = await vault.cachedRead(file);
    } catch {
      continue;
    }

    const { frontmatter } = extractFrontmatter(raw);
    if (frontmatter[markerKey] !== "promo-copy") continue;

    const deckId =
      frontmatter[deckIdKey] ??
      inferDeckFromPath(file.path) ??
      "Unfiled";

    const parsed = parseNote(file, raw, deckId);

    if (!decks.has(deckId)) {
      decks.set(deckId, []);
    }
    decks.get(deckId)!.push(parsed);
  }

  return decks;
}
