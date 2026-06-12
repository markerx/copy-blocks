import { Beat } from "../types";
import { extractBeatTitle } from "../parser/section-parser";

/**
 * Strip markers and frontmatter, output clean prose.
 * Used for the reading view (export-to-clipboard or new note).
 */
export function beatsToReadingView(beats: Beat[]): string {
  return beats
    .map((beat) => beat.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n");
}

/**
 * Stage mode — same as reading view but includes a single line header
 * for each beat (id + label). Used for presenter mode.
 */
export function beatsToStageView(beats: Beat[]): string {
  return beats
    .map((beat) => {
      const title = extractBeatTitle(beat.content, beat.id);
      const header = `### ${beat.id} — ${title}\n\n`;
      return header + beat.content.trim();
    })
    .filter((content) => content.length > 0)
    .join("\n\n---\n\n");
}

/**
 * Compliance view — only the footnotes + verification status, no prose.
 * Useful for fact-checkers.
 */
export function footnotesToComplianceView(
  footnoteTexts: Array<{ ref: string; text: string }>
): string {
  return footnoteTexts
    .map((fn) => `[^${fn.ref}]: ${fn.text}`)
    .join("\n\n");
}
