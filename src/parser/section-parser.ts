import { Beat, VerificationState } from "../types";

/**
 * Marker grammar:
 *
 *   <!--section: 1.2.4 status:voice-locked verified:yes sources:"[[Big-Idea]]", "[[03-Seven-Lenses-Reveal]]" label:"Big Idea Reveal"-->
 *
 * All fields are optional except `id`. The parser is permissive — unknown
 * fields are preserved as raw key/value pairs on the beat.
 *
 * We deliberately do NOT match the older "<!--section: 1.2.4-->" style
 * used by Branch Writing unless it has no other fields; if the user just
 * writes that bare form, we still parse it (with empty status + sources +
 * default verification). Both styles work.
 */

const MARKER_PATTERN =
  /<!--\s*section:\s*([^\s>]+?)(?:\s+([^\-]+?))?\s*-->/g;

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
    matches.push({ match: m, id: m[1], fields: m[2] ?? "" });
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
      label: parsed.label,
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
  label?: string;
  sources?: string[];
  [key: string]: string | string[] | undefined;
}

function parseFields(fieldString: string): ParsedFields {
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
 * Serialize a beat back to a marker string. Used by reorder, status-change,
 * and split/merge commands.
 */
export function serializeMarker(beat: {
  id: string;
  status?: string;
  verification?: VerificationState;
  sources?: string[];
  label?: string;
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

  if (beat.label) {
    parts.push(`label:"${beat.label}"`);
  }

  return `<!-- ${parts.join(" ")} -->`;
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
