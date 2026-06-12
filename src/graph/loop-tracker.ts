import { ParsedNote, Footnote, OpenLoop } from "../types";

/**
 * Build the cross-deck open-loop graph.
 *
 * Heuristic: scan every footnote for "pays off in [[X]]" or "planted in [[X]]"
 * patterns, and link the containing beat (or file) to the target.
 *
 * Returns a list of OpenLoops with state: "planted", "paid", or "drifted".
 */
export function buildOpenLoops(notes: ParsedNote[]): OpenLoop[] {
  const loops: OpenLoop[] = [];

  for (const note of notes) {
    for (const fn of note.footnotes) {
      if (fn.paysOffIn) {
        // This is the payoff side of a loop.
        const targetNote = findNoteByBasename(notes, fn.paysOffIn);
        if (targetNote) {
          // Find the corresponding planted side.
          loops.push({
            plantedAt: `${fn.paysOffIn}:?`,
            plantedText: "(inferred from payoff reference)",
            paysOffAt: `${note.basename}:${fn.ref}`,
            state: "paid",
          });
        }
      }
      if (fn.plantedIn) {
        // The loop originates from fn.plantedIn, pays off somewhere — usually
        // implicit in the same footnote ("this is the planted side").
        loops.push({
          plantedAt: fn.plantedIn,
          plantedText: fn.text.slice(0, 200),
          state: "planted",
        });
      }
    }
  }

  return loops;
}

/**
 * Cross-reference: which beats in deck A reference beats in deck B?
 * Useful for spotting cross-deck dependencies.
 */
export function buildBeatDependencies(notes: ParsedNote[]): Array<{
  from: string;
  to: string;
  kind: "open-loop" | "callback" | "reworked-from" | "moved-to";
  note?: string;
}> {
  const deps: Array<{
    from: string;
    to: string;
    kind: "open-loop" | "callback" | "reworked-from" | "moved-to";
    note?: string;
  }> = [];

  for (const note of notes) {
    for (const fn of note.footnotes) {
      if (fn.paysOffIn) {
        deps.push({
          from: `${note.basename}:${fn.ref}`,
          to: fn.paysOffIn,
          kind: "open-loop",
          note: "pays off in",
        });
      }
      // "MOVED TO" / "RELOCATED TO" → reworked-from relationship
      if (fn.text.match(/\bMOVED\s+TO\b|\bRELOCATED\s+TO\b/i)) {
        const match = fn.text.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          deps.push({
            from: `${note.basename}:${fn.ref}`,
            to: match[1]!,
            kind: "moved-to",
            note: "relocated to",
          });
        }
      }
    }
  }

  return deps;
}

/**
 * Find a note by basename match — used to resolve [[Note Name]] refs.
 */
function findNoteByBasename(notes: ParsedNote[], basename: string): ParsedNote | null {
  const cleanBase = basename.replace(/[\[\]]/g, "").trim();
  return notes.find((n) => n.basename === cleanBase) ?? null;
}

/**
 * For a single beat, list any open loops it plants or pays off.
 */
export function loopsForBeat(
  beatId: string,
  fileBasename: string,
  footnotes: Footnote[]
): { planted: Footnote[]; paysOff: Footnote[] } {
  const planted: Footnote[] = [];
  const paysOff: Footnote[] = [];

  for (const fn of footnotes) {
    if (fn.plantedIn && fn.plantedIn.includes(fileBasename)) {
      planted.push(fn);
    }
    if (fn.paysOffIn && fn.paysOffIn.includes(fileBasename)) {
      paysOff.push(fn);
    }
  }

  return { planted, paysOff };
}
