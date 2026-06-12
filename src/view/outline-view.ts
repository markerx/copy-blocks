/**
 * OutlineView — the Branch-Writing-style multi-column outline editor.
 *
 * Layout:
 *   - One column per depth level of the beat hierarchy
 *   - Each column shows a vertical stack of cards (one per beat at that depth)
 *   - Clicking a card updates the prose pane on the right
 *   - The prose pane shows the current beat's full content + breadcrumb
 *   - Bottom: prev/next + search bar
 *   - Bottom-right: settings gear
 *
 * Data model: a markdown file with `<!--section: X.Y.Z-->` markers.
 * The depth of a beat (count of dots in its id) determines which column
 * it appears in. Top-level beats (depth 1) appear in column 1, etc.
 */

import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer } from "obsidian";
import { Beat, CopyBlocksSettings } from "../types";
import { parseNote } from "../parser/note-parser";
import {
  extractBeatTitle,
  beatDepth,
  beatBreadcrumb,
  buildBeatTree,
  parentBeatId,
  serializeMarker,
  setBeatTitleInContent,
  nextBeatId,
} from "../parser/section-parser";

export const OUTLINE_VIEW_TYPE = "copy-blocks-outline-view";

export class OutlineView extends ItemView {
  private currentFile: TFile | null = null;
  private parsed: ReturnType<typeof parseNote> | null = null;
  private activeBeatId: string | null = null;
  private settings: CopyBlocksSettings;
  private searchQuery: string = "";

  constructor(leaf: WorkspaceLeaf, settings: CopyBlocksSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return OUTLINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentFile
      ? `Outline — ${this.currentFile.basename}`
      : "Copy Blocks Outline";
  }

  getIcon(): string {
    return "layout-list";
  }

  async onOpen(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (file) await this.loadFile(file);
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async loadFile(file: TFile): Promise<void> {
    this.currentFile = file;
    const raw = await this.app.vault.cachedRead(file);
    this.parsed = parseNote(file, raw);
    // Default to the first beat
    this.activeBeatId = this.parsed.beats[0]?.id ?? null;
    this.render();
  }

  /**
   * Set the active beat by id and update the prose pane.
   */
  setActiveBeat(beatId: string): void {
    this.activeBeatId = beatId;
    this.render();
  }

  prevBeat(): void {
    if (!this.parsed || !this.activeBeatId) return;
    const idx = this.parsed.beats.findIndex((b) => b.id === this.activeBeatId);
    if (idx > 0) {
      this.activeBeatId = this.parsed.beats[idx - 1]!.id;
      this.render();
    }
  }

  nextBeat(): void {
    if (!this.parsed || !this.activeBeatId) return;
    const idx = this.parsed.beats.findIndex((b) => b.id === this.activeBeatId);
    if (idx < this.parsed.beats.length - 1) {
      this.activeBeatId = this.parsed.beats[idx + 1]!.id;
      this.render();
    }
  }

  /**
   * Re-parse the file. Called when the underlying file changes.
   */
  async refresh(): Promise<void> {
    if (!this.currentFile) return;
    const raw = await this.app.vault.cachedRead(this.currentFile);
    this.parsed = parseNote(this.currentFile, raw);
    if (this.activeBeatId && !this.parsed.beats.find((b) => b.id === this.activeBeatId)) {
      this.activeBeatId = this.parsed.beats[0]?.id ?? null;
    }
    this.render();
  }

  /**
   * Build the full DOM for the view.
   */
  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("cb-outline-view");

    if (!this.parsed || this.parsed.beats.length === 0) {
      this.renderEmpty(root);
      return;
    }

    const tree = buildBeatTree(this.parsed.beats);
    const activeBeat = this.parsed.beats.find((b) => b.id === this.activeBeatId);

    // === Columns container (horizontal flex) ===
    const columnsEl = root.createDiv({ cls: "cb-columns" });

    // Render columns starting from the depth of the active beat's parent
    // (or all columns if no active beat). Each column shows children of
    // a particular beat id.
    const maxDepth = Math.max(...this.parsed.beats.map((b) => beatDepth(b.id)));
    const visibleDepths = activeBeat
      ? this.computeVisibleDepths(activeBeat, maxDepth)
      : Array.from({ length: maxDepth }, (_, i) => i + 1);

    // For each visible depth, render a column
    for (const depth of visibleDepths) {
      const parentId = this.findParentAtDepth(activeBeat, depth);
      const children = tree.get(parentId ?? "") ?? [];
      if (children.length === 0 && depth > 1) continue;

      this.renderColumn(columnsEl, depth, parentId, children, tree);
    }

    // === Prose pane (rightmost) ===
    if (activeBeat) {
      this.renderProsePane(root, activeBeat);
    }

    // === Bottom nav bar ===
    this.renderNavBar(root);

    // === Bottom-right settings gear ===
    this.renderSettingsButton(root);
  }

  /**
   * Which depth columns should be visible given the active beat.
   * The active beat's depth is the rightmost column. Columns to the
   * left show ancestors; if an ancestor is selected, the columns to
   * its right show its children. If no active beat, show all.
   */
  private computeVisibleDepths(activeBeat: Beat, maxDepth: number): number[] {
    const activeDepth = beatDepth(activeBeat.id);
    // Show depths 1..activeDepth, with the rightmost being the active
    // beat's own depth. Plus, if the active beat has children, show
    // the next depth.
    const depths: number[] = [];
    for (let d = 1; d <= activeDepth; d++) depths.push(d);
    if (activeDepth < maxDepth) depths.push(activeDepth + 1);
    return depths;
  }

  /**
   * Find the parent id at the given depth, walking from the active beat
   * up the breadcrumb chain. Returns "" for top-level.
   */
  private findParentAtDepth(activeBeat: Beat | undefined, depth: number): string | null {
    if (!activeBeat) return null;
    if (depth === 1) return null;
    const crumbs = beatBreadcrumb(activeBeat.id);
    return depth <= crumbs.length ? crumbs[depth - 2] ?? null : null;
  }

  private renderColumn(
    parent: HTMLElement,
    depth: number,
    parentId: string | null,
    children: Beat[],
    tree: Map<string, Beat[]>
  ): void {
    const col = parent.createDiv({ cls: `cb-column cb-column-depth-${depth}` });

    // Column header with "+" button
    const header = col.createDiv({ cls: "cb-column-header" });
    const label = header.createSpan({ text: `Depth ${depth}` });
    label.addClass("cb-column-label");
    const addBtn = header.createEl("button", { text: "+", cls: "cb-column-add" });
    addBtn.title = `Insert a new beat at depth ${depth}`;
    addBtn.addEventListener("click", () => this.insertBeatAtDepth(depth, parentId));

    // Cards
    for (const beat of children) {
      this.renderCard(col, beat);
    }

    // If this column's children have grandchildren, show nested cards
    if (children.length > 0) {
      const anyGrandchildren = children.some((c) => (tree.get(c.id) ?? []).length > 0);
      if (anyGrandchildren) {
        for (const beat of children) {
          const grandchildren = tree.get(beat.id) ?? [];
          if (grandchildren.length === 0) continue;
          const nested = col.createDiv({ cls: "cb-column-nested" });
          for (const grandchild of grandchildren) {
            this.renderCard(nested, grandchild, true);
          }
        }
      }
    }
  }

  private renderCard(parent: HTMLElement, beat: Beat, isNested: boolean = false): void {
    const card = parent.createDiv({ cls: "cb-card" });
    if (this.activeBeatId === beat.id) {
      card.addClass("cb-card-active");
    }
    if (isNested) card.addClass("cb-card-nested");

    // Status dot
    const status = this.settings.statuses.find((s) => s.key === beat.status);
    const statusColor = status?.color ?? "#888888";
    const dot = card.createSpan({ cls: "cb-card-dot" });
    dot.style.backgroundColor = statusColor;

    // Title (first bold line of beat content)
    const title = extractBeatTitle(beat.content, beat.id);
    const titleEl = card.createDiv({ cls: "cb-card-title", text: title });

    // Id label
    const idEl = card.createDiv({ cls: "cb-card-id", text: beat.id });
    idEl.style.color = statusColor;

    // Click to set active
    card.addEventListener("click", () => this.setActiveBeat(beat.id));
  }

  private renderProsePane(root: HTMLElement, activeBeat: Beat): void {
    const pane = root.createDiv({ cls: "cb-prose-pane" });

    // Breadcrumb
    const crumbs = beatBreadcrumb(activeBeat.id);
    const breadcrumb = pane.createDiv({ cls: "cb-breadcrumb" });
    crumbs.forEach((crumbId, i) => {
      const crumbSpan = breadcrumb.createSpan({
        text: crumbId,
        cls: "cb-breadcrumb-crumb",
      });
      if (i < crumbs.length - 1) {
        const sep = breadcrumb.createSpan({ text: " › ", cls: "cb-breadcrumb-sep" });
      }
    });

    // Status badge
    const status = this.settings.statuses.find((s) => s.key === activeBeat.status);
    if (status) {
      const badge = pane.createSpan({
        cls: `cb-badge ${status.badgeClass}`,
        text: status.label,
      });
    }

    // Beat id
    pane.createEl("h2", {
      text: `Beat ${activeBeat.id}`,
      cls: "cb-prose-id",
    });

    // Prose content (rendered as markdown)
    const contentEl = pane.createDiv({ cls: "cb-prose-content" });
    MarkdownRenderer.render(
      this.app,
      activeBeat.content.trim(),
      contentEl,
      this.currentFile?.path ?? "",
      this
    );
  }

  private renderNavBar(root: HTMLElement): void {
    const nav = root.createDiv({ cls: "cb-nav-bar" });

    // Prev/next/search buttons
    const prev = nav.createEl("button", { text: "←", cls: "cb-nav-button" });
    prev.title = "Previous beat";
    prev.addEventListener("click", () => this.prevBeat());

    const next = nav.createEl("button", { text: "→", cls: "cb-nav-button" });
    next.title = "Next beat";
    next.addEventListener("click", () => this.nextBeat());

    const search = nav.createEl("input", {
      type: "text",
      placeholder: "Search beats…",
      cls: "cb-nav-search",
    });
    search.value = this.searchQuery;
    search.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
    });
  }

  private renderSettingsButton(root: HTMLElement): void {
    const gear = root.createEl("button", { text: "⚙", cls: "cb-settings-button" });
    gear.title = "Copy Blocks settings";
    gear.addEventListener("click", () => {
      // Open the settings tab for this plugin
      // @ts-ignore - accessing private API
      this.app.setting?.open();
      // @ts-ignore
      this.app.setting?.openTabById("copy-blocks");
    });
  }

  private renderEmpty(root: HTMLElement): void {
    const empty = root.createDiv({ cls: "cb-outline-empty" });
    empty.createEl("h2", { text: "No beats yet" });
    empty.createEl("p", {
      text:
        "This file doesn't contain any <!--section: ...--> markers. " +
        "Add a marker, or run the 'Insert new beat' command to get started.",
    });
  }

  /**
   * Insert a new beat at the given depth, sibling to the active beat's
   * appropriate parent.
   */
  private async insertBeatAtDepth(depth: number, parentId: string | null): Promise<void> {
    if (!this.parsed || !this.currentFile) return;

    // Compute new id
    let siblings: Beat[];
    if (parentId === null) {
      // Top-level: siblings are beats with no parent
      siblings = this.parsed.beats.filter((b) => beatDepth(b.id) === 1);
    } else {
      siblings = this.parsed.beats.filter((b) => parentBeatId(b.id) === parentId);
    }
    const newId = nextBeatId(siblings);
    const newMarker = serializeMarker({ id: newId, status: "draft-v1" });
    const newBlock = `\n${newMarker}\n\n`;

    // Find the right insertion point: after the last sibling, or at the
    // end of the active beat's content, or at the end of the document.
    let insertOffset: number;
    if (siblings.length > 0) {
      insertOffset = siblings[siblings.length - 1]!.contentEnd;
    } else if (this.activeBeatId) {
      const active = this.parsed.beats.find((b) => b.id === this.activeBeatId);
      insertOffset = active ? active.contentEnd : this.parsed.beats[this.parsed.beats.length - 1]?.contentEnd ?? 0;
    } else {
      insertOffset = 0;
    }

    // Mutate the file
    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = raw.slice(0, insertOffset) + newBlock + raw.slice(insertOffset);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.setActiveBeat(newId);
  }
}
