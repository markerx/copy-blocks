/**
 * OutlineView — roam-style nested writing tool.
 *
 * Two modes:
 *   - "outline" mode: hierarchy from id, columns per depth (legacy)
 *   - "stack" mode: free-form nested cards, drag-to-reparent, id is
 *     metadata not structure
 *
 * The mode toggle lives in the bottom-right (next to the settings gear).
 * Both modes share the same data (parsed beats) and the same UI shell
 * (cards with status dot + id + title, prose pane on the right, breadcrumb
 * up top, search/prev/next at the bottom).
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
  reparentBeat,
  applyIdMap,
  nextBeatId,
  serializeMarker,
} from "../parser/section-parser";

export const OUTLINE_VIEW_TYPE = "copy-blocks-outline-view";

type ViewMode = "outline" | "stack";

export class OutlineView extends ItemView {
  private currentFile: TFile | null = null;
  private parsed: ReturnType<typeof parseNote> | null = null;
  private activeBeatId: string | null = null;
  private settings: CopyBlocksSettings;
  private searchQuery: string = "";
  private mode: ViewMode = "stack";
  private collapsed: Set<string> = new Set();

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
    this.activeBeatId = this.parsed.beats[0]?.id ?? null;
    this.collapsed.clear();
    this.render();
  }

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

  toggleMode(): void {
    this.mode = this.mode === "stack" ? "outline" : "stack";
    this.render();
  }

  toggleCollapsed(beatId: string): void {
    if (this.collapsed.has(beatId)) {
      this.collapsed.delete(beatId);
    } else {
      this.collapsed.add(beatId);
    }
    this.render();
  }

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
   * Reparent a beat: drag-and-drop target is a different beat. The
   * moved beat becomes a child of the target. Ids are rewritten.
   */
  async reparentBeat(movedId: string, newParentId: string | null): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    if (movedId === newParentId) return;

    // Don't allow moving a beat into its own descendant
    if (newParentId && newParentId.startsWith(movedId + ".")) return;

    const { idMap, moved } = reparentBeat(movedId, newParentId, this.parsed.beats);

    // Rewrite the file
    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = applyIdMap(raw, idMap);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.setActiveBeat(moved);
  }

  /**
   * Top-level render orchestrator.
   */
  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("cb-outline-view");
    root.addClass(`cb-mode-${this.mode}`);

    if (!this.parsed || this.parsed.beats.length === 0) {
      this.renderEmpty(root);
      return;
    }

    const activeBeat = this.parsed.beats.find((b) => b.id === this.activeBeatId);
    const tree = buildBeatTree(this.parsed.beats);

    // === Main area: outline (left) + prose (right) ===
    const main = root.createDiv({ cls: "cb-main" });

    // Outline / stack container
    const outline = main.createDiv({ cls: `cb-outline cb-outline-${this.mode}` });

    if (this.mode === "stack") {
      this.renderStack(outline, tree);
    } else {
      this.renderOutline(outline, activeBeat, tree);
    }

    // Prose pane (right)
    if (activeBeat) {
      this.renderProsePane(main, activeBeat);
    }

    // === Bottom nav + mode toggle + settings ===
    this.renderNavBar(root);
    this.renderModeToggle(root);
    this.renderSettingsButton(root);
  }

  /**
   * STACK MODE: render the entire beat tree as nested cards. A beat
   * can contain any number of child beats, regardless of the id
   * hierarchy. Cards are indented to show nesting.
   *
   * This is the roam / branch-writing / logseq paradigm.
   */
  private renderStack(parent: HTMLElement, tree: Map<string, Beat[]>): void {
    const stack = parent.createDiv({ cls: "cb-stack" });
    const rootBeats = tree.get("") ?? [];

    for (const beat of rootBeats) {
      this.renderStackNode(stack, beat, tree, 0);
    }
  }

  private renderStackNode(
    parent: HTMLElement,
    beat: Beat,
    tree: Map<string, Beat[]>,
    depth: number
  ): void {
    const children = tree.get(beat.id) ?? [];
    const isCollapsed = this.collapsed.has(beat.id);

    const card = parent.createDiv({ cls: "cb-stack-card" });
    card.style.marginLeft = `${depth * 24}px`;
    if (this.activeBeatId === beat.id) card.addClass("cb-card-active");

    // Make the card a drop target
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.addClass("cb-card-drop-target");
    });
    card.addEventListener("dragleave", () => {
      card.removeClass("cb-card-drop-target");
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.removeClass("cb-card-drop-target");
      const movedId = e.dataTransfer?.getData("text/x-copy-blocks-beat");
      if (movedId && movedId !== beat.id) {
        void this.reparentBeat(movedId, beat.id);
      }
    });

    // Card header: status dot + id + collapse toggle
    const header = card.createDiv({ cls: "cb-stack-card-header" });

    const status = this.settings.statuses.find((s) => s.key === beat.status);
    const dot = header.createSpan({ cls: "cb-card-dot" });
    if (status) dot.style.backgroundColor = status.color;

    const idEl = header.createSpan({ cls: "cb-card-id", text: beat.id });
    if (status) idEl.style.color = status.color;

    const title = extractBeatTitle(beat.content, beat.id);
    const titleEl = header.createDiv({ cls: "cb-card-title", text: title });
    titleEl.addEventListener("click", () => this.setActiveBeat(beat.id));

    // Make the header draggable
    header.draggable = true;
    header.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/x-copy-blocks-beat", beat.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    // Collapse toggle
    if (children.length > 0) {
      const toggle = header.createSpan({
        cls: "cb-card-toggle",
        text: isCollapsed ? "▶" : "▼",
      });
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCollapsed(beat.id);
      });
    }

    // Render children if not collapsed
    if (!isCollapsed && children.length > 0) {
      const childContainer = card.createDiv({ cls: "cb-stack-children" });
      for (const child of children) {
        this.renderStackNode(childContainer, child, tree, depth + 1);
      }
    }
  }

  /**
   * OUTLINE MODE: legacy column-per-depth view. Kept for users who
   * prefer the explicit depth-based layout.
   */
  private renderOutline(
    parent: HTMLElement,
    activeBeat: Beat | undefined,
    tree: Map<string, Beat[]>
  ): void {
    const columnsEl = parent.createDiv({ cls: "cb-columns" });
    const maxDepth = Math.max(...this.parsed!.beats.map((b) => beatDepth(b.id)));
    const visibleDepths = activeBeat
      ? this.computeVisibleDepths(activeBeat, maxDepth)
      : Array.from({ length: maxDepth }, (_, i) => i + 1);

    for (const depth of visibleDepths) {
      const parentId = this.findParentAtDepth(activeBeat, depth);
      const children = tree.get(parentId ?? "") ?? [];
      if (children.length === 0 && depth > 1) continue;
      this.renderColumn(columnsEl, depth, parentId, children, tree);
    }
  }

  private renderColumn(
    parent: HTMLElement,
    depth: number,
    parentId: string | null,
    children: Beat[],
    tree: Map<string, Beat[]>
  ): void {
    const col = parent.createDiv({ cls: `cb-column cb-column-depth-${depth}` });
    const header = col.createDiv({ cls: "cb-column-header" });
    header.createSpan({ text: `Depth ${depth}`, cls: "cb-column-label" });
    const addBtn = header.createEl("button", { text: "+", cls: "cb-column-add" });
    addBtn.title = `Insert a new beat at depth ${depth}`;
    addBtn.addEventListener("click", () => this.insertBeatAtDepth(depth, parentId));

    for (const beat of children) {
      this.renderCard(col, beat);
    }
  }

  private renderCard(parent: HTMLElement, beat: Beat): void {
    const card = parent.createDiv({ cls: "cb-card" });
    if (this.activeBeatId === beat.id) card.addClass("cb-card-active");

    const status = this.settings.statuses.find((s) => s.key === beat.status);
    if (status) {
      const dot = card.createSpan({ cls: "cb-card-dot" });
      dot.style.backgroundColor = status.color;
    }

    const title = extractBeatTitle(beat.content, beat.id);
    card.createDiv({ cls: "cb-card-title", text: title });

    const idEl = card.createDiv({ cls: "cb-card-id", text: beat.id });
    if (status) idEl.style.color = status.color;

    card.addEventListener("click", () => this.setActiveBeat(beat.id));
  }

  private computeVisibleDepths(activeBeat: Beat, maxDepth: number): number[] {
    const activeDepth = beatDepth(activeBeat.id);
    const depths: number[] = [];
    for (let d = 1; d <= activeDepth; d++) depths.push(d);
    if (activeDepth < maxDepth) depths.push(activeDepth + 1);
    return depths;
  }

  private findParentAtDepth(activeBeat: Beat | undefined, depth: number): string | null {
    if (!activeBeat) return null;
    if (depth === 1) return null;
    const crumbs = beatBreadcrumb(activeBeat.id);
    return depth <= crumbs.length ? crumbs[depth - 2] ?? null : null;
  }

  private renderProsePane(parent: HTMLElement, activeBeat: Beat): void {
    const pane = parent.createDiv({ cls: "cb-prose-pane" });

    // Breadcrumb
    const crumbs = beatBreadcrumb(activeBeat.id);
    const breadcrumb = pane.createDiv({ cls: "cb-breadcrumb" });
    crumbs.forEach((crumbId, i) => {
      breadcrumb.createSpan({ text: crumbId, cls: "cb-breadcrumb-crumb" });
      if (i < crumbs.length - 1) {
        breadcrumb.createSpan({ text: " › ", cls: "cb-breadcrumb-sep" });
      }
    });

    // Status badge
    const status = this.settings.statuses.find((s) => s.key === activeBeat.status);
    if (status) {
      pane.createSpan({ cls: `cb-badge ${status.badgeClass}`, text: status.label });
    }

    pane.createEl("h2", { text: `Beat ${activeBeat.id}`, cls: "cb-prose-id" });

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

  private renderModeToggle(root: HTMLElement): void {
    const btn = root.createEl("button", { cls: "cb-mode-toggle" });
    btn.textContent = this.mode === "stack" ? "⊞ Stack" : "▤ Outline";
    btn.title = `Currently: ${this.mode} mode. Click to switch.`;
    btn.addEventListener("click", () => this.toggleMode());
  }

  private renderSettingsButton(root: HTMLElement): void {
    const gear = root.createEl("button", { text: "⚙", cls: "cb-settings-button" });
    gear.title = "Copy Blocks settings";
    gear.addEventListener("click", () => {
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

  private async insertBeatAtDepth(depth: number, parentId: string | null): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    const siblings = parentId === null
      ? this.parsed.beats.filter((b) => beatDepth(b.id) === 1)
      : this.parsed.beats.filter((b) => parentBeatId(b.id) === parentId);
    const newId = nextBeatId(siblings);
    const newMarker = serializeMarker({ id: newId, status: "draft-v1" });
    const newBlock = `\n${newMarker}\n\n`;

    let insertOffset: number;
    if (siblings.length > 0) {
      insertOffset = siblings[siblings.length - 1]!.contentEnd;
    } else if (this.activeBeatId) {
      const active = this.parsed.beats.find((b) => b.id === this.activeBeatId);
      insertOffset = active
        ? active.contentEnd
        : this.parsed.beats[this.parsed.beats.length - 1]?.contentEnd ?? 0;
    } else {
      insertOffset = 0;
    }

    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = raw.slice(0, insertOffset) + newBlock + raw.slice(insertOffset);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.setActiveBeat(newId);
  }
}
