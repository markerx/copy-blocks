/**
 * Core data types for Copy Blocks.
 *
 * A "beat" is a chunk of copy — one paragraph, one open, one transition, one
 * close — identified by an `<!--section: X.Y.Z status:...-->` marker in the
 * note. The plugin reads these markers, builds a tree, and renders a stage
 * view that shows one beat at a time with its metadata.
 */

/** A single beat parsed from a note. */
export interface Beat {
  /** Hierarchical id parsed from the marker, e.g. "1.2.4" or "1". */
  id: string;
  /** Status taxonomy value, e.g. "draft-v1", "voice-locked", "final". */
  status: string;
  /** Whether the underlying claim is verified, needs primary source, etc. */
  verification: VerificationState;
  /** Wikilink-style source references, e.g. ["[[03-Seven-Lenses-Reveal]]", "[[Big-Idea]]"]. */
  sources: string[];
  /** The raw text content of the beat (markdown body, no marker). */
  content: string;
  /** Byte offset in the note where the marker starts. */
  markerStart: number;
  /** Byte offset in the note where the beat content ends. */
  contentEnd: number;
  /** Whether this is the first beat parsed from the file (used for nav "start"). */
  isFirst: boolean;
}

export type VerificationState =
  | "verified"      // ✅ green
  | "needs-primary" // ⚠️ amber — needs primary-source upgrade
  | "constructed"   // 🚧 purple — needs editor re-voice/approval
  | "gated"         // 🔒 red — locked until prior act unlocks
  | "unknown";      // no verification state inferred

/** Footnote extracted from the bottom of a note. */
export interface Footnote {
  /** The reference label, e.g. "1", "9b", "20". */
  ref: string;
  /** Full text of the footnote, including any embedded sub-references like "(REMOVED 2026-06-08 ...)". */
  text: string;
  /** Inferred verification state from keywords in the text. */
  verification: VerificationState;
  /** Linked beat ids mentioned in the footnote (heuristic: any "[[Name]]" or "Beat X.Y.Z"). */
  linkedBeats: string[];
  /** Linked file notes mentioned, e.g. ["[[03-Seven-Lenses-Reveal]]", "[[Big-Idea]]"]. */
  linkedNotes: string[];
  /** Whether this footnote is a "loop" — planted in one place, pays off in another. */
  isOpenLoop: boolean;
  /** Where the loop is paid off (parsed from "pays off in [[...]]" / "pays off as ... in [[...]]" patterns). */
  paysOffIn?: string;
  /** Where the loop was planted (parsed from "planted in [[...]]" patterns). */
  plantedIn?: string;
  /** Where the footnote's content was "held out of" (deliberately deferred to another act). */
  heldOutOf?: string;
  /** Where the cited source lives (e.g. "same drone cited in [[05-War-Proof_Why-The-Mandate]]"). */
  citedIn?: string;
  /** Whether the footnote references "(see audit)" — an internal audit pointer. */
  hasAuditReference: boolean;
}

/** Per-file parsed structure. */
export interface ParsedNote {
  /** Absolute path to the file in the vault. */
  filePath: string;
  /** TFile basename, e.g. "04-Big-Idea-Reveal". */
  basename: string;
  /** Frontmatter fields. */
  frontmatter: Record<string, string>;
  /** All beats, in order. */
  beats: Beat[];
  /** All footnotes, in order. */
  footnotes: Footnote[];
  /** The deck this note belongs to (parsed from `deck:` frontmatter or path-based inference). */
  deckId?: string;
}

/** Per-deck structure — all files in one promo deck (e.g. DefenseTech VSL). */
export interface Deck {
  /** Deck id, e.g. "DefenseTech VSL". */
  id: string;
  /** All notes in the deck, in act order. */
  notes: ParsedNote[];
  /** Cross-note dependencies inferred from footnotes + wikilinks. */
  dependencies: BeatDependency[];
  /** All open loops across the deck. */
  openLoops: OpenLoop[];
  /** Status rollup across the deck. */
  statusRollup: Record<string, number>;
}

/** A dependency between two beats (one is the setup, the other is the payoff). */
export interface BeatDependency {
  /** Source beat id. */
  from: string;
  /** Target beat id. */
  to: string;
  /** Type of relationship. */
  kind: "open-loop" | "callback" | "reworked-from" | "moved-to";
  /** Optional note explaining the dependency. */
  note?: string;
}

/** A planted-but-not-paid-off open loop across the deck. */
export interface OpenLoop {
  /** Where the loop is planted, e.g. "01-Host-Monologue:96". */
  plantedAt: string;
  /** What the loop says (the planted claim). */
  plantedText: string;
  /** Where it pays off, if known, e.g. "04-Big-Idea-Reveal:??". */
  paysOffAt?: string;
  /** Status: "planted" | "paid" | "drifted" (planted, paid, but text changed). */
  state: "planted" | "paid" | "drifted";
}

/** A single status taxonomy entry configured in settings. */
export interface StatusConfig {
  /** The canonical key, e.g. "draft-v1", "voice-locked", "final". */
  key: string;
  /** Human label, e.g. "Draft v1", "Voice-locked". */
  label: string;
  /** CSS class for the badge, e.g. "cb-badge-draft". */
  badgeClass: string;
  /** Hex color, used for sidebar indicators. */
  color: string;
  /** Order in the dashboard rollup (lowest = first). */
  order: number;
}

/** Plugin settings. */
export interface CopyBlocksSettings {
  /** Status taxonomy, in display order. */
  statuses: StatusConfig[];
  /** Default verification state for new beats. */
  defaultVerification: VerificationState;
  /** Days before a claim is considered "stale" and flagged in the drift tracker. */
  driftThresholdDays: number;
  /** Color scheme: "default" or "high-contrast". */
  colorScheme: "default" | "high-contrast";
  /** Whether to show the metadata sidebar by default in view mode. */
  showSidebar: boolean;
  /** Frontmatter key that identifies a note as a deck file. */
  deckMarkerKey: string;
  /** Frontmatter key that identifies the deck the file belongs to. */
  deckIdKey: string;
  /** Value the deck marker key must equal for a note to be treated as a deck file. */
  deckMarkerValue: string;
  /** Writing-view theme settings. */
  theme: WritingTheme;
}

/**
 * Theme settings for the writing view.
 *
 * Every color, padding, and font is exposed so users can fully customize
 * the look of the roam-style writing view. Light/dark/match-obsidian
 * determines the base palette; everything else overrides.
 */
export interface WritingTheme {
  /** Theme mode: "light", "dark", or "match-obsidian" (inherit from active Obsidian theme). */
  mode: "light" | "dark" | "match-obsidian";
  /** Card background colors, indexed by depth (0 = root, 1 = depth 2, etc.). */
  cardBgByDepth: [string, string, string, string];
  /** Card border color (default, not active). */
  cardBorder: string;
  /** Card border color when active. */
  cardBorderActive: string;
  /** Card border color on hover. */
  cardBorderHover: string;
  /** Card border color when a drag is hovering over it. */
  cardBorderDrop: string;
  /** Card body text color. */
  cardText: string;
  /** Muted text color (id labels, status labels). */
  cardMuted: string;
  /** Editor background (the writing view's main background). */
  editorBg: string;
  /** Card padding: "compact", "cozy", or "spacious". */
  padding: "compact" | "cozy" | "spacious";
  /** Card border radius: "none", "small", or "round". */
  borderRadius: "none" | "small" | "round";
  /** Body font size in pixels. */
  fontSize: number;
  /** Body font family, e.g. "Inter, system-ui, sans-serif" or "Courier New". */
  fontFamily: string;
}

/** Default status taxonomy — derived from the patterns observed in DefenseTech copy. */
export const DEFAULT_STATUSES: StatusConfig[] = [
  { key: "draft-v1", label: "Draft v1", badgeClass: "cb-badge-draft", color: "#888888", order: 0 },
  { key: "draft-v2-footnoted", label: "Draft v2 (footnoted)", badgeClass: "cb-badge-draft", color: "#888888", order: 1 },
  { key: "voice-locked", label: "Voice-locked", badgeClass: "cb-badge-voice-locked", color: "#4a7c59", order: 2 },
  { key: "fact-checked", label: "Fact-checked", badgeClass: "cb-badge-fact-checked", color: "#2d5a8e", order: 3 },
  { key: "verified", label: "Verified", badgeClass: "cb-badge-verified", color: "#1a7f5a", order: 4 },
  { key: "needs-primary", label: "Needs primary", badgeClass: "cb-badge-needs-primary", color: "#b8860b", order: 5 },
  { key: "constructed", label: "Constructed", badgeClass: "cb-badge-constructed", color: "#8b5cf6", order: 6 },
  { key: "gated", label: "Gated", badgeClass: "cb-badge-gated", color: "#dc2626", order: 7 },
  { key: "compliance-passed", label: "Compliance-passed", badgeClass: "cb-badge-compliance-passed", color: "#059669", order: 8 },
  { key: "final", label: "Final", badgeClass: "cb-badge-final", color: "#1a1a1a", order: 9 },
  { key: "final", label: "Final", badgeClass: "cb-badge-final", color: "#1a1a1a", order: 9 },
];

/** Default writing-view theme — light mode, gentle tints, comfortable spacing. */
export const DEFAULT_THEME: WritingTheme = {
  mode: "match-obsidian",
  cardBgByDepth: [
    "rgba(99, 102, 241, 0.04)",  // depth 1: faint indigo
    "rgba(139, 92, 246, 0.04)",  // depth 2: faint violet
    "rgba(34, 197, 94, 0.04)",   // depth 3: faint green
    "rgba(234, 179, 8, 0.04)",   // depth 4: faint amber
  ],
  cardBorder: "var(--background-modifier-border)",
  cardBorderActive: "var(--interactive-accent)",
  cardBorderHover: "var(--interactive-accent)",
  cardBorderDrop: "var(--interactive-accent)",
  cardText: "var(--text-normal)",
  cardMuted: "var(--text-muted)",
  editorBg: "var(--background-primary)",
  padding: "cozy",
  borderRadius: "small",
  fontSize: 15,
  fontFamily: "var(--font-interface)",
};

/** A second preset: "Typewriter" — cream paper, dark ink, monospace. */
export const TYPEWRITER_THEME: WritingTheme = {
  mode: "light",
  cardBgByDepth: [
    "rgba(252, 248, 237, 1)",
    "rgba(248, 244, 230, 1)",
    "rgba(244, 240, 224, 1)",
    "rgba(240, 236, 218, 1)",
  ],
  cardBorder: "rgba(120, 100, 80, 0.3)",
  cardBorderActive: "rgba(80, 60, 40, 1)",
  cardBorderHover: "rgba(80, 60, 40, 0.6)",
  cardBorderDrop: "rgba(80, 60, 40, 1)",
  cardText: "rgba(40, 30, 20, 1)",
  cardMuted: "rgba(100, 80, 60, 1)",
  editorBg: "rgba(252, 248, 237, 1)",
  padding: "spacious",
  borderRadius: "none",
  fontSize: 16,
  fontFamily: "'Courier New', 'IBM Plex Mono', monospace",
};

/** A third preset: "Dark" — comfortable for night writing. */
export const DARK_THEME: WritingTheme = {
  mode: "dark",
  cardBgByDepth: [
    "rgba(99, 102, 241, 0.06)",
    "rgba(139, 92, 246, 0.06)",
    "rgba(34, 197, 94, 0.06)",
    "rgba(234, 179, 8, 0.06)",
  ],
  cardBorder: "rgba(255, 255, 255, 0.08)",
  cardBorderActive: "rgba(129, 140, 248, 1)",
  cardBorderHover: "rgba(129, 140, 248, 0.6)",
  cardBorderDrop: "rgba(129, 140, 248, 1)",
  cardText: "rgba(230, 230, 235, 1)",
  cardMuted: "rgba(150, 150, 160, 1)",
  editorBg: "rgba(20, 20, 25, 1)",
  padding: "cozy",
  borderRadius: "small",
  fontSize: 15,
  fontFamily: "var(--font-interface)",
};

export const DEFAULT_SETTINGS: CopyBlocksSettings = {
  statuses: DEFAULT_STATUSES,
  defaultVerification: "unknown",
  driftThresholdDays: 7,
  colorScheme: "default",
  showSidebar: true,
  deckMarkerKey: "type",
  deckIdKey: "deck",
  deckMarkerValue: "copy-blocks",
  theme: DEFAULT_THEME,
};
