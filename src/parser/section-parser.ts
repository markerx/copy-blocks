/**
 * Core section-marker parser.
 *
 * Marker grammar:
 *
 *   <!--section: 1.2.4 status:voice-locked verified:yes sources:"[[Big-Idea]]", "[[03-Seven-Lenses-Reveal]]"-->
 *
 * All fields are optional except `id`. The parser is permissive — unknown
 * fields are preserved as raw key/value pairs on the beat.
 *
 * We deliberately do NOT match the older "<!--section: 1.2.4-->" style
 * used by Branch Writing unless it has no other fields; if the user just
 * writes that bare form, we still parse it (with empty status + sources +
 * default verification). Both styles work.
 *
 * The "label" / display title of a beat is NOT a marker field — it's the
 * first line of bold text in the beat's content (see extractBeatTitle).
 */

import { Beat, VerificationState } from "../types";

// Match a section marker: <!--section: ID [fields...]-->
// We match the whole comment to avoid the non-greedy issues with dots in IDs.
// The body of the comment (between <!-- and -->) is captured as one group;
// the ID and fields are extracted from it in code.
const MARKER_PATTERN = /<!--\s*section:(\s+|\s*-->)([\s\S]*?)-->/g;

const FIELD_PATTERN = /(\w+):(?:"([^"]*)"|'([^']*)'|(\S+))/g;

export interface ParseResult {
  beats: Beat[];
  /** Offsets in the source text for each marker's start, in order. */
  markerOffsets: number[];
}

export function parseSections(text: string): ParseResult {
  const beats: Beat[] = [];
  const markerOffsets: number[] = [];

  // Find all markers
  const matches: { match: RegExpExecArray; id: string; fields: string }[] = [];
  let m: RegExpExecArray | null;
  // Reset regex state — important if the regex has the /g flag and we re-use it.
  MARKER_PATTERN.lastIndex = 0;
  while ((m = MARKER_PATTERN.exec(text)) !== null) {
    // The first group is the separator after "section:" (whitespace or end).
    // The second group is the body. If body is empty, this is a bare marker.
    const body = m[2] ?? "";
    const idMatch = body.match(/^(\S+)(?:\s+(.*))?$/);
    if (!idMatch) continue;
    matches.push({
      match: m,
      id: idMatch[1]!,
      fields: idMatch[2] ?? "",
    });
  }

  if (matches.length === 0) {
    return { beats, markerOffsets };
  }

  for (let i = 0; i < matches.length; i++) {
    const { match, id, fields } = matches[i]!;
    const nextMatch = matches[i + 1];
    const markerEnd = match.index + match[0].length;

    // Content runs from end-of-this-marker to start-of-next-marker.
    const contentStart = markerEnd;
    const contentEnd = nextMatch ? nextMatch.match.index : text.length;
    const content = text.slice(contentStart, contentEnd);

    const parsed = parseFields(fields);

    const beat: Beat = {
      id,
      status: parsed.status ?? "draft-v1",
      verification: normalizeVerification(parsed.verified, parsed.verification),
      sources: parsed.sources ?? [],
      content,
      markerStart: match.index,
      contentEnd,
      isFirst: i === 0,
    };

    beats.push(beat);
    markerOffsets.push(match.index);
  }

  return { beats, markerOffsets };
}

interface ParsedFields {
  status?: string;
  verified?: string;
  verification?: string;
  sources?: string[];
  [key: string]: string | string[] | undefined;
}

export function parseFields(fieldString: string): ParsedFields {
  const result: ParsedFields = {};
  if (!fieldString.trim()) return result;

  // Reset state — important.
  FIELD_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIELD_PATTERN.exec(fieldString)) !== null) {
    const key = m[1]!;
    const value = m[2] ?? m[3] ?? m[4] ?? "";

    if (key === "sources") {
      // Sources is a comma-separated list of wikilink-style refs in quotes.
      // Split on commas, trim, strip any outer quotes.
      result.sources = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.replace(/^["']|["']$/g, ""));
    } else {
      result[key] = value;
    }
  }

  return result;
}

function normalizeVerification(
  verifiedRaw: string | undefined,
  verificationRaw: string | undefined
): VerificationState {
  const raw = (verificationRaw ?? verifiedRaw ?? "").toLowerCase().trim();
  switch (raw) {
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

/**
 * Serialize a beat back to a marker string.
 */
export function serializeMarker(beat: {
  id: string;
  status?: string;
  verification?: VerificationState;
  sources?: string[];
}): string {
  const parts: string[] = [`section: ${beat.id}`];

  if (beat.status) {
    parts.push(`status:${beat.status}`);
  }

  if (beat.verification && beat.verification !== "unknown") {
    parts.push(`verified:${verificationToShortForm(beat.verification)}`);
  }

  if (beat.sources && beat.sources.length > 0) {
    const srcs = beat.sources.map((s) => `"${s}"`).join(", ");
    parts.push(`sources:${srcs}`);
  }

  return `<!-- ${parts.join(" ")} -->`;
}

/**
 * Extract a beat's display title from its content.
 *
 * The title is the FIRST non-empty line of the beat's content, with
 * markdown markers stripped (heading hashes, blockquote, list, bold).
 * Falls back to "Beat {id}" if no non-empty line is found.
 *
 * Matches the Branch Writing convention where the first bold/heading
 * line of a section is treated as its display title.
 */
export function extractBeatTitle(content: string, fallbackId: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line
      .replace(/^#+\s*/, "")
      .replace(/^>\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\*\*|\*\*$/g, "")
      .replace(/^`|`$/g, "")
      .trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 60) {
        return trimmed.slice(0, 57) + "…";
      }
      return trimmed;
    }
  }
  return `Beat ${fallbackId}`;
}

/**
 * Replace the first non-empty line of a beat's content with a bolded
 * title. Used by the click-to-rename interaction.
 */
export function setBeatTitleInContent(content: string, title: string): string {
  const stripped = content.replace(/^\s+/, "");
  if (stripped.length === 0) {
    return `**${title}**\n\n`;
  }
  const lines = stripped.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim().length > 0) {
      lines[i] = `**${title}**`;
      return lines.join("\n");
    }
  }
  return `**${title}**\n\n${stripped}`;
}

/**
 * Compute the next beat id given the existing beats in the file.
 * Increments the rightmost numeric component; if no beats exist,
 * returns "1".
 */
export function nextBeatId(beats: Beat[]): string {
  if (beats.length === 0) return "1";
  const last = beats[beats.length - 1]!;
  const parts = last.id.split(".");
  const tail = parts[parts.length - 1]!;
  const n = parseInt(tail, 10);
  if (isNaN(n)) return "1";
  parts[parts.length - 1] = String(n + 1);
  return parts.join(".");
}

function verificationToShortForm(v: VerificationState): string {
  switch (v) {
    case "verified":
      return "yes";
    case "needs-primary":
      return "no";
    case "constructed":
      return "constructed";
    case "gated":
      return "gated";
    case "unknown":
      return "unknown";
  }
}

/**
 * Get the depth of a beat id (count of dots + 1).
 * "1" → 1, "1.2" → 2, "1.2.4" → 3, "1.2.4.3" → 4
 */
export function beatDepth(beatId: string): number {
  return beatId.split(".").length;
}

/**
 * Get the parent id of a beat, or null for top-level beats.
 * "1.2.4" → "1.2", "1.2" → "1", "1" → null
 */
export function parentBeatId(beatId: string): string | null {
  const parts = beatId.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

/**
 * Group beats by their parent id, producing a tree structure.
 * Returns a map: parentId → list of child beats (in document order).
 * Top-level beats have parent id of "".
 */
export function buildBeatTree(beats: Beat[]): Map<string, Beat[]> {
  const tree = new Map<string, Beat[]>();
  for (const beat of beats) {
    const parent = parentBeatId(beat.id) ?? "";
    if (!tree.has(parent)) tree.set(parent, []);
    tree.get(parent)!.push(beat);
  }
  return tree;
}

/**
 * Compute the breadcrumbs for a beat id: the chain of ancestor ids.
 * "1.2.4" → ["1", "1.2", "1.2.4"]
 */
export function beatBreadcrumb(beatId: string): string[] {
  const parts = beatId.split(".");
  const crumbs: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    crumbs.push(parts.slice(0, i).join("."));
  }
  return crumbs;
}
