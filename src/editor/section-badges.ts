/**
 * CodeMirror 6 extension that replaces `<!--section: ...-->` markers with
 * styled inline badges. The underlying text is unchanged; the decoration
 * is purely visual.
 *
 * Implementation strategy:
 *   - Use a `MatchDecorator` that scans the document for the marker regex
 *   - For each match, replace the matched range with a `WidgetType` that
 *     renders the badge HTML
 *   - The widget carries a CSS class derived from the parsed status, so
 *     the same color taxonomy as view mode + dashboard applies
 *
 * The decorator re-runs on every document change, so editing a status
 * field updates the badge live.
 */

import {
  ViewPlugin,
  Decoration,
  WidgetType,
  ViewUpdate,
  EditorView,
  MatchDecorator,
} from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { parseFields, extractBeatTitle } from "../parser/section-parser";
import { StatusConfig } from "../types";

const MARKER_REGEX = /<!--\s*section:\s*([^\s>]+?)\s*([^>]*?)\s*-->/g;

interface ParsedMarker {
  id: string;
  status: string;
  verification: string;
  sources: string[];
  raw: string;
}

function parseMarkerText(raw: string): ParsedMarker | null {
  const inner = raw.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
  const m = inner.match(/^section:\s*([^\s]+?)(?:\s+(.*))?$/);
  if (!m) return null;

  const id = m[1]!;
  const fields = parseFields(m[2] ?? "");
  return {
    id,
    status: (fields.status as string) ?? "draft-v1",
    verification: (fields.verified as string) ?? "unknown",
    sources: (fields.sources as string[]) ?? [],
    raw,
  };
}

/**
 * A widget that displays a status badge in place of a section marker.
 */
class BeatBadgeWidget extends WidgetType {
  constructor(
    readonly parsed: ParsedMarker,
    readonly statusMap: StatusConfig[]
  ) {
    super();
  }

  eq(other: BeatBadgeWidget): boolean {
    return (
      this.parsed.id === other.parsed.id &&
      this.parsed.status === other.parsed.status &&
      this.parsed.verification === other.parsed.verification
    );
  }

  toDOM(): HTMLElement {
    const status = this.statusMap.find((s) => s.key === this.parsed.status);
    const badgeClass = status?.badgeClass ?? "cb-badge-draft";
    const statusLabel = status?.label ?? this.parsed.status;

    const el = document.createElement("span");
    el.className = `cb-inline-badge ${badgeClass}`;
    el.setAttribute("data-cb-beat-id", this.parsed.id);
    el.setAttribute("data-cb-status", this.parsed.status);
    el.setAttribute("data-cb-verification", this.parsed.verification);
    el.title = this.buildTooltip();
    // Make the badge draggable so users can reorder beats by dragging.
    el.draggable = true;

    // Build the visible content
    const idEl = document.createElement("span");
    idEl.className = "cb-inline-badge-id";
    idEl.textContent = this.parsed.id;
    el.appendChild(idEl);

    const statusEl = document.createElement("span");
    statusEl.className = "cb-inline-badge-status";
    statusEl.textContent = statusLabel;
    el.appendChild(statusEl);

    // Small icon indicating verification state
    const verifIcon = verificationIcon(this.parsed.verification);
    if (verifIcon) {
      const verifEl = document.createElement("span");
      verifEl.className = "cb-inline-badge-verif";
      verifEl.textContent = verifIcon;
      el.appendChild(verifEl);
    }

    return el;
  }

  ignoreEvent(): boolean {
    // Let click handlers on the badge work, but ignore other events
    // so the editor's selection model isn't disturbed.
    return false;
  }

  private buildTooltip(): string {
    const lines: string[] = [];
    lines.push(`Beat ${this.parsed.id}`);
    lines.push(`Status: ${this.parsed.status}`);
    lines.push(`Verification: ${this.parsed.verification}`);
    if (this.parsed.sources.length > 0) {
      lines.push(`Sources: ${this.parsed.sources.join(", ")}`);
    }
    return lines.join("\n");
  }
}

function verificationIcon(verif: string): string {
  switch (verif.toLowerCase()) {
    case "yes":
    case "verified":
    case "true":
      return "✓";
    case "no":
    case "needs-primary":
    case "warning":
    case "warn":
      return "⚠";
    case "constructed":
      return "🚧";
    case "gated":
      return "🔒";
    default:
      return "";
  }
}

/**
 * CodeMirror 6 ViewPlugin that wires the MatchDecorator to the document.
 */
function beatBadgePlugin(statusMap: StatusConfig[]) {
  const decorator = new MatchDecorator({
    regexp: MARKER_REGEX,
    decoration: (match) => {
      const parsed = parseMarkerText(match[0]);
      if (!parsed) return null;
      return Decoration.replace({
        widget: new BeatBadgeWidget(parsed, statusMap),
      });
    },
  });

  return ViewPlugin.fromClass(
    class {
      decorations: import("@codemirror/view").DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = decorator.createDeco(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/**
 * Factory: produce an EditorView extension that decorates section markers.
 * Pass the current status map from settings so colors stay in sync.
 */
export function sectionBadgeExtension(
  statusMap: StatusConfig[]
): Extension {
  return beatBadgePlugin(statusMap);
}
