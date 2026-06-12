import { Footnote, VerificationState } from "../types";

/**
 * Footnote grammar (matches what we saw in DefenseTech copy):
 *
 *   [^1]: <text>
 *   [^9b]: <text>
 *   [^20]: <text>
 *
 * Footnote text contains rich structure:
 *   - ✅ VERIFIED / ❌ FAIL / ⚠️ / 🟡 — verification markers
 *   - [[Note Name]] — wikilinks to other notes
 *   - "pays off in [[...]]" — open-loop payoff
 *   - "MOVED TO [[...]]" — relocation
 *   - "(REMOVED 2026-06-08 ...)" — historical notes
 *   - **bold** — emphasis
 *   - "Beat X.Y.Z" — beat references (heuristic)
 */

const FOOTNOTE_PATTERN = /^\[\^([\w]+)\]:\s*(.+?)(?=^\[\^|$)/gm;

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

const VERIFICATION_MARKERS: Array<{ pattern: RegExp; state: VerificationState; confidence: number }> = [
  { pattern: /✅\s*VERIFIED/i, state: "verified", confidence: 1.0 },
  { pattern: /❌\s*FAIL/i, state: "needs-primary", confidence: 1.0 },
  { pattern: /❌\s*UNVERIFIED/i, state: "needs-primary", confidence: 0.9 },
  { pattern: /❌/i, state: "needs-primary", confidence: 0.5 },
  { pattern: /🟡/i, state: "needs-primary", confidence: 0.8 },
  { pattern: /⚠️\s*NEEDS?\s*PRIMARY/i, state: "needs-primary", confidence: 1.0 },
  { pattern: /⚠️/i, state: "needs-primary", confidence: 0.6 },
  { pattern: /🚧/i, state: "constructed", confidence: 0.7 },
  { pattern: /🔒/i, state: "gated", confidence: 0.8 },
  { pattern: /\bGATED\b/i, state: "gated", confidence: 0.9 },
  { pattern: /\bCONSTRUCTED\b/i, state: "constructed", confidence: 0.9 },
  { pattern: /\bneeds?\s*primary[\s-]?source\b/i, state: "needs-primary", confidence: 0.9 },
  { pattern: /\bverify\b/i, state: "needs-primary", confidence: 0.3 },
];

const OPEN_LOOP_PATTERNS = {
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
  arrowPaysOff: /→\s*pays?\s+off\s+(?:in|as|with|at)\s+(?:[^.\n]*?\s+in\s+)?\[\[([^\]]+)\]\]/i,
};

const BEAT_REFERENCE_PATTERN = /\bBeat\s+(\d+(?:\.\d+)*)\b/gi;

export function parseFootnotes(text: string): Footnote[] {
  const footnotes: Footnote[] = [];
  FOOTNOTE_PATTERN.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = FOOTNOTE_PATTERN.exec(text)) !== null) {
    const ref = m[1]!;
    const body = m[2]!.trim();

    const linkedNotes = extractWikilinks(body);
    const linkedBeats = extractBeatReferences(body);
    const verification = inferVerification(body);
    const loopInfo = extractLoopInfo(body);

    footnotes.push({
      ref,
      text: body,
      verification,
      linkedBeats,
      linkedNotes,
      isOpenLoop: Boolean(
        loopInfo.paysOffIn ||
          loopInfo.plantedIn ||
          loopInfo.movedTo ||
          loopInfo.heldOutOf ||
          loopInfo.namedIn ||
          loopInfo.citedIn
      ),
      paysOffIn: loopInfo.paysOffIn,
      plantedIn: loopInfo.plantedIn,
      heldOutOf: loopInfo.heldOutOf,
      citedIn: loopInfo.citedIn,
      hasAuditReference: loopInfo.hasAuditReference ?? false,
    });
  }

  return footnotes;
}

function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  WIKILINK_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_PATTERN.exec(text)) !== null) {
    links.push(m[1]!);
  }
  return Array.from(new Set(links));
}

function extractBeatReferences(text: string): string[] {
  const beats: string[] = [];
  BEAT_REFERENCE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BEAT_REFERENCE_PATTERN.exec(text)) !== null) {
    beats.push(m[1]!);
  }
  return Array.from(new Set(beats));
}

function inferVerification(text: string): VerificationState {
  let best: { state: VerificationState; confidence: number } = {
    state: "unknown",
    confidence: 0,
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

function extractLoopInfo(text: string): {
  paysOffIn?: string;
  plantedIn?: string;
  movedTo?: string;
  namedIn?: string;
  citedIn?: string;
  heldOutOf?: string;
  hasAuditReference?: boolean;
} {
  const result: ReturnType<typeof extractLoopInfo> = {};

  // Try arrow-pays-off first (it's the most explicit form)
  const arrow = text.match(OPEN_LOOP_PATTERNS.arrowPaysOff);
  if (arrow) result.paysOffIn = arrow[1];

  // Then standard "pays off in" patterns
  if (!result.paysOffIn) {
    const paysOff = text.match(OPEN_LOOP_PATTERNS.paysOffIn);
    if (paysOff) result.paysOffIn = paysOff[1];
  }

  const planted = text.match(OPEN_LOOP_PATTERNS.plantedIn);
  if (planted) result.plantedIn = planted[1];

  const moved = text.match(OPEN_LOOP_PATTERNS.movedTo);
  if (moved) result.movedTo = moved[1];

  const heldOut = text.match(OPEN_LOOP_PATTERNS.heldOut);
  if (heldOut) result.heldOutOf = heldOut[1];

  const named = text.match(OPEN_LOOP_PATTERNS.namedIn);
  if (named) result.namedIn = named[1];

  const cited = text.match(OPEN_LOOP_PATTERNS.citedIn);
  if (cited) result.citedIn = cited[1];

  result.hasAuditReference = OPEN_LOOP_PATTERNS.seeAudit.test(text);

  return result;
}

/**
 * Heuristic: is this footnote's status "stale" (i.e. needs re-verification)?
 * True if the text contains re-verify language or the most recent date in
 * the text is older than the threshold.
 */
export function isStaleFootnote(text: string, thresholdDays: number, now: Date = new Date()): boolean {
  // Look for ISO dates and pick the latest one.
  const datePattern = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  let latest: Date | null = null;
  let m: RegExpExecArray | null;
  while ((m = datePattern.exec(text)) !== null) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
    if (!isNaN(d.getTime()) && (!latest || d > latest)) {
      latest = d;
    }
  }

  if (!latest) return false;

  const ageMs = now.getTime() - latest.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > thresholdDays;
}
