/**
 * WritingView — Branch Writing clone with dynamic-column progressive
 * disclosure.
 *
 * Layout:
 *   - N columns visible, where N = depth of the focused path
 *   - Column 1: top-level cards (children of the file root)
 *   - Column K (K > 1): children of the focused card in column K-1
 *   - The rightmost column is the "content surface" — but actually
 *     EVERY card in EVERY column has its own editable content area.
 *     The columns are just a tree visualization; the cards ARE the
 *     content.
 *
 * Interactions:
 *   - Click a card → focus it, columns to the right reflow
 *   - Click into any card's content area → contenteditable
 *   - Tab in any content → create child, focus it
 *   - Shift+Enter in any content → create sibling, focus it
 *   - Back-arrow on a column (except leftmost) → unfocus that card,
 *     columns to the right collapse
 *   - Drag a card to another → reparent
 *   - Live file sync: edits write to file (throttled to 300ms)
 */

import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { Beat, CopyBlocksSettings } from "../types";
import { parseNote } from "../parser/note-parser";
import {
  beatBreadcrumb,
  buildBeatTree,
  parentBeatId,
  reparentBeat,
  applyIdMap,
  nextBeatId,
  serializeMarker,
  beatDepth,
  extractBeatTitle,
} from "../parser/section-parser";

export const WRITING_VIEW_TYPE = "copy-blocks-writing-view";

/** A path of focused card ids from the root to the active card. */
type FocusPath = string[];

export class WritingView extends ItemView {
  private currentFile: TFile | null = null;
  private parsed: ReturnType<typeof parseNote> | null = null;
  /** Path of focused card ids, e.g. ["1", "1.2", "1.2.3"] */
  private focusPath: FocusPath = [];
  private settings: CopyBlocksSettings;
  /** Map of beatId → latest edited content (for live file sync) */
  private edits: Map<string, string> = new Map();
  /** Throttled save timer */
  private saveTimer: number | null = null;
  /** Currently focused contenteditable element (for keyboard shortcuts) */
  private activeEditable: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, settings: CopyBlocksSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return WRITING_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.currentFile
      ? `Writing — ${this.currentFile.basename}`
      : "Copy Blocks Writing";
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
    this.focusPath = this.parsed.beats[0]?.id ? [this.parsed.beats[0].id] : [];
    this.edits.clear();
    this.applyTheme(this.contentEl);
    this.render();
  }

  /**
   * Apply the current theme to the root element via CSS custom properties.
   */
  applyTheme(root: HTMLElement): void {
    const t = this.settings.theme;
    root.style.setProperty("--cb-card-bg-depth-0", t.cardBgByDepth[0]);
    root.style.setProperty("--cb-card-bg-depth-1", t.cardBgByDepth[1]);
    root.style.setProperty("--cb-card-bg-depth-2", t.cardBgByDepth[2]);
    root.style.setProperty("--cb-card-bg-depth-3", t.cardBgByDepth[3]);
    root.style.setProperty("--cb-card-border", t.cardBorder);
    root.style.setProperty("--cb-card-border-active", t.cardBorderActive);
    root.style.setProperty("--cb-card-border-hover", t.cardBorderHover);
    root.style.setProperty("--cb-card-border-drop", t.cardBorderDrop);
    root.style.setProperty("--cb-card-text", t.cardText);
    root.style.setProperty("--cb-card-muted", t.cardMuted);
    root.style.setProperty("--cb-editor-bg", t.editorBg);
    root.style.setProperty("--cb-font-size", `${t.fontSize}px`);
    root.style.setProperty("--cb-font-family", t.fontFamily);
    root.style.setProperty("--cb-card-padding",
      t.padding === "compact" ? "6px 10px" :
      t.padding === "spacious" ? "14px 18px" :
      "10px 14px"
    );
    root.style.setProperty("--cb-card-radius",
      t.borderRadius === "none" ? "0" :
      t.borderRadius === "round" ? "12px" :
      "6px"
    );
  }

  // === File sync (throttled) ===

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => this.flushEdits(), 300);
  }

  private async flushEdits(): Promise<void> {
    if (!this.currentFile || this.edits.size === 0) return;
    const raw = await this.app.vault.cachedRead(this.currentFile);
    let text = raw;
    for (const [beatId, content] of this.edits) {
      // Find the marker for beatId, replace its content section
      const re = new RegExp(
        `(<!--\\s*section:\\s*${beatId.replace(/\./g, "\\.")}\\s+[^>]*?-->)([\\s\\S]*?)(?=<!--\\s*section:|\\Z)`,
        "m"
      );
      text = text.replace(re, (full, marker, _old) => `${marker}\n${content}`);
    }
    if (text !== raw) {
      await this.app.vault.modify(this.currentFile, text);
    }
    this.edits.clear();
    this.saveTimer = null;
  }

  // === Focus path operations ===

  private focusCard(beatId: string): void {
    if (this.focusPath[this.focusPath.length - 1] === beatId) return;
    this.focusPath = beatBreadcrumb(beatId);
    this.render();
  }

  private unfocusLast(): void {
    if (this.focusPath.length > 1) {
      this.focusPath.pop();
      this.render();
    }
  }

  private async createChildBeat(): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    const activeId = this.focusPath[this.focusPath.length - 1] ?? null;
    const siblings = activeId === null
      ? this.parsed.beats.filter((b) => beatDepth(b.id) === 1)
      : this.parsed.beats.filter((b) => parentBeatId(b.id) === activeId);
    const newId = nextBeatId(siblings);
    const newMarker = serializeMarker({ id: newId, status: "draft-v1" });
    const newBlock = `\n${newMarker}\n`;

    // Find where to insert: after the active beat's content, or at the
    // end of the file
    let insertOffset: number;
    if (activeId) {
      const active = this.parsed.beats.find((b) => b.id === activeId);
      if (active) {
        insertOffset = active.contentEnd;
      } else {
        insertOffset = this.parsed.beats[this.parsed.beats.length - 1]?.contentEnd ?? 0;
      }
    } else {
      insertOffset = this.parsed.beats[this.parsed.beats.length - 1]?.contentEnd ?? 0;
    }

    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = raw.slice(0, insertOffset) + newBlock + raw.slice(insertOffset);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.focusPath = [...this.focusPath, newId];
    this.render();
  }

  private async createSiblingBeat(): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    const activeId = this.focusPath[this.focusPath.length - 1] ?? null;
    if (!activeId) return;
    const parent = parentBeatId(activeId);
    const siblings = parent === null
      ? this.parsed.beats.filter((b) => beatDepth(b.id) === 1)
      : this.parsed.beats.filter((b) => parentBeatId(b.id) === parent);
    const newId = nextBeatId(siblings);
    const newMarker = serializeMarker({ id: newId, status: "draft-v1" });
    const newBlock = `\n${newMarker}\n`;

    const active = this.parsed.beats.find((b) => b.id === activeId);
    if (!active) return;
    const insertOffset = active.contentEnd;

    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = raw.slice(0, insertOffset) + newBlock + raw.slice(insertOffset);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.focusPath = [...this.focusPath.slice(0, -1), newId];
    this.render();
  }

  private async reparentBeat(movedId: string, newParentId: string | null): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    if (movedId === newParentId) return;
    if (newParentId && newParentId.startsWith(movedId + ".")) return;

    const { idMap, moved } = reparentBeat(movedId, newParentId, this.parsed.beats);
    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = applyIdMap(raw, idMap);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    // Update focus path if the moved beat was in it
    this.focusPath = beatBreadcrumb(moved);
    this.render();
  }

  async refresh(): Promise<void> {
    if (!this.currentFile) return;
    const raw = await this.app.vault.cachedRead(this.currentFile);
    this.parsed = parseNote(this.currentFile, raw);
    // Restore focus path if possible
    if (this.focusPath.length > 0) {
      const tip = this.focusPath[this.focusPath.length - 1]!;
      if (!this.parsed.beats.find((b) => b.id === tip)) {
        this.focusPath = this.parsed.beats[0]?.id ? [this.parsed.beats[0].id] : [];
      }
    }
    this.render();
  }

  // === Render ===

  private render(): void {
    const root = this.contentEl;
    root.empty();
    this.applyTheme(root);
    root.addClass("cb-writing-view");

    if (!this.parsed) {
      this.renderToolbar(root, "Untitled");
      const main = root.createDiv({ cls: "cb-writing-main" });
      main.createDiv({ cls: "cb-empty-state", text: "No file loaded." });
      return;
    }

    if (this.parsed.beats.length === 0) {
      this.renderToolbar(root, this.currentFile?.basename ?? "Untitled");
      const main = root.createDiv({ cls: "cb-writing-main" });
      const empty = main.createDiv({ cls: "cb-empty-state" });
      empty.createEl("h2", { text: "No beats yet" });
      empty.createEl("p", {
        text: 'Add a <!--section: ...--> marker, or run the "Insert new beat" command. Once you have beats, this view will render them as a tree.',
      });
      // Quick-action: insert first beat
      const insert = empty.createEl("button", { text: "Insert first beat", cls: "cb-empty-action" });
      insert.addEventListener("click", () => this.createChildBeat());
      return;
    }

    // Top toolbar
    this.renderToolbar(root, this.currentFile?.basename ?? "Untitled");

    // Breadcrumb
    this.renderBreadcrumb(root);

    // The columns
    const main = root.createDiv({ cls: "cb-writing-main" });
    this.renderColumns(main);
  }

  // === Toolbar ===

  private renderToolbar(root: HTMLElement, filename: string): void {
    const toolbar = root.createDiv({ cls: "cb-writing-toolbar" });
    const fileName = toolbar.createDiv({ cls: "cb-toolbar-filename" });
    fileName.textContent = filename;

    const themeLabel = toolbar.createSpan({ cls: "cb-toolbar-theme" });
    themeLabel.textContent = `Theme: ${this.settings.theme.mode === "match-obsidian" ? "obsidian" : this.settings.theme.mode}`;

    const rightGroup = toolbar.createDiv({ cls: "cb-toolbar-right" });

    // Edit toggle
    const editBtn = rightGroup.createEl("button", { text: "Edit", cls: "cb-toolbar-btn" });
    editBtn.addEventListener("click", () => this.toggleToEdit());

    // Settings
    const settings = rightGroup.createEl("button", { text: "⚙", cls: "cb-toolbar-btn" });
    settings.title = "Copy Blocks settings";
    settings.addEventListener("click", () => {
      // @ts-ignore
      this.app.setting?.open();
      // @ts-ignore
      this.app.setting?.openTabById("copy-blocks");
    });
  }

  private async toggleToEdit(): Promise<void> {
    if (!this.currentFile) return;
    const activeLeaf = this.app.workspace.getLeaf(false);
    await activeLeaf.setViewState({
      type: "markdown",
      state: { mode: "source", file: this.currentFile.path },
      active: true,
    });
  }

  // === Breadcrumb ===

  private renderBreadcrumb(root: HTMLElement): void {
    const bc = root.createDiv({ cls: "cb-breadcrumb-bar" });
    const root1 = bc.createSpan({ text: "📁", cls: "cb-breadcrumb-root" });
    root1.style.cursor = "pointer";
    root1.addEventListener("click", () => {
      this.focusPath = [];
      this.render();
    });

    for (let i = 0; i < this.focusPath.length; i++) {
      const id = this.focusPath[i]!;
      const beat = this.parsed?.beats.find((b) => b.id === id);
      const title = beat ? extractBeatTitle(beat.content, id) : id;
      const crumb = bc.createSpan({ text: title, cls: "cb-breadcrumb-crumb" });
      crumb.style.cursor = "pointer";
      crumb.addEventListener("click", () => {
        this.focusPath = beatBreadcrumb(id);
        this.render();
      });
      if (i < this.focusPath.length - 1) {
        bc.createSpan({ text: "›", cls: "cb-breadcrumb-sep" });
      }
    }
  }

  // === Columns (the heart of the view) ===

  private renderColumns(main: HTMLElement): void {
    if (!this.parsed) return;
    const tree = buildBeatTree(this.parsed.beats);

    // The root column (column 1) shows the file's top-level cards
    // The next column (column 2) shows children of the focused card in column 1
    // Etc.
    const root = main.createDiv({ cls: "cb-columns-canvas" });

    // Column 1: children of "" (the file root)
    const topLevelBeats = tree.get("") ?? [];
    this.renderColumn(root, topLevelBeats, "Top level", null, 0);

    // Subsequent columns: each one shows children of the focused beat
    // in the previous column
    for (let i = 0; i < this.focusPath.length; i++) {
      const parentId = this.focusPath[i]!;
      const children = tree.get(parentId) ?? [];
      const parentBeat = this.parsed.beats.find((b) => b.id === parentId);
      const parentTitle = parentBeat ? extractBeatTitle(parentBeat.content, parentId) : parentId;
      this.renderColumn(root, children, parentTitle, parentId, i + 1);
    }
  }

  private renderColumn(
    parent: HTMLElement,
    beats: Beat[],
    title: string,
    parentId: string | null,
    level: number
  ): void {
    const col = parent.createDiv({ cls: "cb-column" });
    col.style.setProperty("--cb-col-level", String(level));

    // Column header
    const header = col.createDiv({ cls: "cb-column-header" });
    const back = header.createSpan({ text: "←", cls: "cb-column-back" });
    if (parentId === null) {
      back.style.opacity = "0.3";
      back.style.cursor = "default";
    } else {
      back.style.cursor = "pointer";
      back.addEventListener("click", () => this.unfocusLast());
    }
    header.createSpan({ text: title, cls: "cb-column-title" });
    const add = header.createSpan({ text: "+", cls: "cb-column-add" });
    add.style.cursor = "pointer";
    add.title = "Create a new beat at this level";
    add.addEventListener("click", async () => {
      // Add a sibling at this level (use the parent)
      if (parentId === null) {
        // Top-level: create top-level beat
        await this.createChildBeat();
        // refocus to first top-level
        if (this.parsed?.beats[0]) this.focusPath = [this.parsed.beats[0].id];
        this.render();
      } else {
        // Create sibling of parentId
        const siblings = this.parsed?.beats.filter((b) => parentBeatId(b.id) === parentId) ?? [];
        const newId = nextBeatId(siblings);
        if (!this.currentFile || !this.parsed) return;
        const active = this.parsed.beats.find((b) => b.id === parentId);
        if (!active) return;
        const newBlock = `\n${serializeMarker({ id: newId, status: "draft-v1" })}\n`;
        const raw = await this.app.vault.cachedRead(this.currentFile);
        const newText = raw.slice(0, active.contentEnd) + newBlock + raw.slice(active.contentEnd);
        await this.app.vault.modify(this.currentFile, newText);
        await this.refresh();
        this.focusPath = [...this.focusPath.slice(0, -1), newId];
        this.render();
      }
    });

    // Cards
    if (beats.length === 0) {
      const empty = col.createDiv({ cls: "cb-column-empty" });
      empty.textContent = "No beats here yet.";
      const insert = empty.createEl("button", { text: "Add one", cls: "cb-column-insert" });
      insert.addEventListener("click", () => add.click());
      return;
    }

    for (const beat of beats) {
      this.renderCard(col, beat, level);
    }
  }

  private renderCard(parent: HTMLElement, beat: Beat, level: number): void {
    const isActive = this.focusPath[this.focusPath.length - 1] === beat.id;
    const card = parent.createDiv({ cls: "cb-card" });
    if (isActive) card.addClass("cb-card-active");
    card.setAttribute("data-cb-beat-id", beat.id);

    // Drop target for reparenting
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.addClass("cb-card-drop");
    });
    card.addEventListener("dragleave", () => {
      card.removeClass("cb-card-drop");
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.removeClass("cb-card-drop");
      const movedId = e.dataTransfer?.getData("text/x-copy-blocks-beat");
      if (movedId && movedId !== beat.id) {
        void this.reparentBeat(movedId, beat.id);
      }
    });

    // Header (clickable to focus, draggable to reparent)
    const header = card.createDiv({ cls: "cb-card-header" });
    const status = this.settings.statuses.find((s) => s.key === beat.status);
    if (status) {
      const dot = header.createSpan({ cls: "cb-card-dot" });
      dot.style.backgroundColor = status.color;
    }
    const idEl = header.createSpan({ cls: "cb-card-id", text: beat.id });
    if (status) idEl.style.color = status.color;
    header.draggable = true;
    header.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/x-copy-blocks-beat", beat.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    header.addEventListener("click", () => this.focusCard(beat.id));

    // Editable content area
    const content = card.createDiv({ cls: "cb-card-content" });
    content.setAttribute("data-cb-beat-id", beat.id);
    content.contentEditable = "true";
    content.spellcheck = false;
    content.textContent = beat.content;
    content.addEventListener("focus", () => {
      this.activeEditable = content;
    });
    content.addEventListener("blur", () => {
      this.edits.set(beat.id, content.textContent ?? "");
      this.scheduleSave();
      if (this.activeEditable === content) this.activeEditable = null;
    });
    content.addEventListener("input", () => {
      this.edits.set(beat.id, content.textContent ?? "");
      this.scheduleSave();
    });
    content.addEventListener("keydown", (e) => this.handleContentKeydown(e, beat.id));
  }

  /**
   * Keyboard shortcuts inside any card's content:
   *   - Tab → create child, focus it
   *   - Shift+Enter → create sibling, focus it
   *   - Escape → blur (return to navigation mode)
   */
  private async handleContentKeydown(e: KeyboardEvent, beatId: string): Promise<void> {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      await this.createChildBeat();
      // Find the new beat (last in focusPath) and focus its content
      setTimeout(() => {
        const lastId = this.focusPath[this.focusPath.length - 1];
        if (!lastId) return;
        const next = this.contentEl.querySelector<HTMLElement>(
          `.cb-card-content[data-cb-beat-id="${lastId}"]`
        );
        next?.focus();
      }, 50);
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      await this.createSiblingBeat();
      setTimeout(() => {
        const lastId = this.focusPath[this.focusPath.length - 1];
        if (!lastId) return;
        const next = this.contentEl.querySelector<HTMLElement>(
          `.cb-card-content[data-cb-beat-id="${lastId}"]`
        );
        next?.focus();
      }, 50);
    } else if (e.key === "Escape") {
      (e.target as HTMLElement).blur();
    }
  }
}
