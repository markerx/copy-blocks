/**
 * WritingView — full-screen roam-style writing tool with theming.
 *
 * Replaces the markdown editor when active. Layout:
 *   - Top: a thin toolbar (file name, mode toggle, theme indicator)
 *   - Main: roam-style nested cards (left rail TOC) + editable prose pane
 *   - Bottom: status bar
 *
 * Theme: all colors / padding / fonts come from settings.theme. The view
 * applies the theme as CSS custom properties on the root element, so
 * changes to settings take effect live (no re-render needed).
 */

import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, setIcon } from "obsidian";
import { Beat, CopyBlocksSettings, WritingTheme } from "../types";
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

export const WRITING_VIEW_TYPE = "copy-blocks-writing-view";

export class WritingView extends ItemView {
  private currentFile: TFile | null = null;
  private parsed: ReturnType<typeof parseNote> | null = null;
  private activeBeatId: string | null = null;
  private settings: CopyBlocksSettings;
  private collapsed: Set<string> = new Set();
  /** Throttled file-save timer to coalesce rapid edits. */
  private saveTimer: number | null = null;

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
    this.activeBeatId = this.parsed.beats[0]?.id ?? null;
    this.collapsed.clear();
    this.applyTheme(this.contentEl);
    this.render();
  }

  /**
   * Apply the current theme to the root element via CSS custom
   * properties. Updates live without a re-render.
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

  toggleCollapsed(beatId: string): void {
    if (this.collapsed.has(beatId)) this.collapsed.delete(beatId);
    else this.collapsed.add(beatId);
    this.render();
  }

  /**
   * Insert a new beat at the given parent (null = top-level) and make it
   * the active beat.
   */
  async insertBeat(parentId: string | null = null): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    const siblings = parentId === null
      ? this.parsed.beats.filter((b) => beatDepth(b.id) === 1)
      : this.parsed.beats.filter((b) => parentBeatId(b.id) === parentId);
    const newId = nextBeatId(siblings);
    const newMarker = serializeMarker({ id: newId, status: "draft-v1" });
    const newBlock = `\n${newMarker}\n`;

    // Append at the end of the file (simplest, avoids offset math)
    const raw = await this.app.vault.cachedRead(this.currentFile);
    const sep = raw.endsWith("\n") ? "" : "\n";
    const newText = raw + sep + newBlock;
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.setActiveBeat(newId);
  }

  async reparentBeat(movedId: string, newParentId: string | null): Promise<void> {
    if (!this.parsed || !this.currentFile) return;
    if (movedId === newParentId) return;
    if (newParentId && newParentId.startsWith(movedId + ".")) return;

    const { idMap, moved } = reparentBeat(movedId, newParentId, this.parsed.beats);
    const raw = await this.app.vault.cachedRead(this.currentFile);
    const newText = applyIdMap(raw, idMap);
    await this.app.vault.modify(this.currentFile, newText);
    await this.refresh();
    this.setActiveBeat(moved);
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

  // === Top-level render ===

  private render(): void {
    const root = this.contentEl;
    root.empty();
    this.applyTheme(root);
    root.addClass("cb-writing-view");

    if (!this.parsed || this.parsed.beats.length === 0) {
      this.renderEmpty(root);
      return;
    }

    // Top toolbar with file name + mode toggle
    this.renderToolbar(root);

    // Main: cards (left rail) + prose pane (right)
    const main = root.createDiv({ cls: "cb-writing-main" });
    const rail = main.createDiv({ cls: "cb-writing-rail" });
    this.renderRail(rail);
    const proseContainer = main.createDiv({ cls: "cb-writing-prose" });
    const activeBeat = this.parsed.beats.find((b) => b.id === this.activeBeatId);
    if (activeBeat) {
      this.renderProse(proseContainer, activeBeat);
    }

    // Bottom status bar
    this.renderStatusBar(root);
  }

  // === Toolbar ===

  private renderToolbar(root: HTMLElement): void {
    const toolbar = root.createDiv({ cls: "cb-writing-toolbar" });
    const fileName = toolbar.createDiv({ cls: "cb-toolbar-filename" });
    fileName.textContent = this.currentFile?.basename ?? "Untitled";

    const themeLabel = toolbar.createSpan({ cls: "cb-toolbar-theme" });
    themeLabel.textContent = this.settings.theme.mode === "match-obsidian"
      ? `Theme: ${this.getObsidianThemeName()}`
      : `Theme: ${this.settings.theme.mode}`;

    const rightGroup = toolbar.createDiv({ cls: "cb-toolbar-right" });

    // Edit toggle
    const editBtn = rightGroup.createEl("button", {
      cls: "cb-toolbar-btn",
      text: "Edit",
    });
    editBtn.addEventListener("click", () => this.toggleToEdit());

    // Open in source editor
    const openEditor = rightGroup.createEl("button", {
      cls: "cb-toolbar-btn",
      text: "⌘",
      attr: { title: "Open in source editor" },
    });
    openEditor.addEventListener("click", () => this.toggleToEdit());

    // Settings
    const settings = rightGroup.createEl("button", {
      cls: "cb-toolbar-btn",
      text: "⚙",
    });
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

  private getObsidianThemeName(): string {
    // @ts-ignore
    return this.app.getTheme?.() ?? "obsidian";
  }

  // === Left rail: nested cards ===

  private renderRail(parent: HTMLElement): void {
    if (!this.parsed) return;
    const tree = buildBeatTree(this.parsed.beats);
    const rootBeats = tree.get("") ?? [];
    if (rootBeats.length === 0) {
      parent.createDiv({ cls: "cb-rail-empty", text: "No beats yet. Press Tab or click + to add one." });
      return;
    }
    const stack = parent.createDiv({ cls: "cb-rail-stack" });
    for (const beat of rootBeats) {
      this.renderRailNode(stack, beat, tree, 0);
    }
  }

  private renderRailNode(
    parent: HTMLElement,
    beat: Beat,
    tree: Map<string, Beat[]>,
    depth: number
  ): void {
    const children = tree.get(beat.id) ?? [];
    const isCollapsed = this.collapsed.has(beat.id);
    const isActive = this.activeBeatId === beat.id;
    const depthIdx = Math.min(depth, 3) as 0 | 1 | 2 | 3;

    const card = parent.createDiv({ cls: "cb-rail-card" });
    card.style.setProperty("--cb-depth-idx", String(depthIdx));
    if (isActive) card.addClass("cb-rail-card-active");

    // Drop target for reparenting
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.addClass("cb-rail-card-drop");
    });
    card.addEventListener("dragleave", () => {
      card.removeClass("cb-rail-card-drop");
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.removeClass("cb-rail-card-drop");
      const movedId = e.dataTransfer?.getData("text/x-copy-blocks-beat");
      if (movedId && movedId !== beat.id) {
        void this.reparentBeat(movedId, beat.id);
      }
    });

    // Card header
    const header = card.createDiv({ cls: "cb-rail-card-header" });
    const status = this.settings.statuses.find((s) => s.key === beat.status);
    if (status) {
      const dot = header.createSpan({ cls: "cb-rail-card-dot" });
      dot.style.backgroundColor = status.color;
    }
    const idEl = header.createSpan({ cls: "cb-rail-card-id", text: beat.id });
    if (status) idEl.style.color = status.color;
    const title = extractBeatTitle(beat.content, beat.id);
    const titleEl = header.createDiv({ cls: "cb-rail-card-title", text: title });
    titleEl.addEventListener("click", () => this.setActiveBeat(beat.id));
    header.draggable = true;
    header.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/x-copy-blocks-beat", beat.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    if (children.length > 0) {
      const toggle = header.createSpan({
        cls: "cb-rail-card-toggle",
        text: isCollapsed ? "▶" : "▼",
      });
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCollapsed(beat.id);
      });
    }

    // Children
    if (!isCollapsed && children.length > 0) {
      const childContainer = card.createDiv({ cls: "cb-rail-children" });
      for (const child of children) {
        this.renderRailNode(childContainer, child, tree, depth + 1);
      }
    }
  }

  // === Prose pane ===

  private renderProse(parent: HTMLElement, activeBeat: Beat): void {
    const pane = parent.createDiv({ cls: "cb-prose-pane" });

    // Breadcrumb
    const crumbs = beatBreadcrumb(activeBeat.id);
    const breadcrumb = pane.createDiv({ cls: "cb-prose-breadcrumb" });
    crumbs.forEach((crumbId, i) => {
      const span = breadcrumb.createSpan({ text: crumbId, cls: "cb-prose-crumb" });
      if (i < crumbs.length - 1) {
        breadcrumb.createSpan({ text: " › ", cls: "cb-prose-sep" });
      }
    });

    // Status badge
    const status = this.settings.statuses.find((s) => s.key === activeBeat.status);
    if (status) {
      const badge = pane.createSpan({ cls: `cb-badge ${status.badgeClass}`, text: status.label });
    }

    // Beat id
    pane.createEl("h2", { text: `Beat ${activeBeat.id}`, cls: "cb-prose-id" });

    // Prose content (rendered as markdown)
    const contentEl = pane.createDiv({ cls: "cb-prose-content" });
    MarkdownRenderer.render(
      this.app,
      activeBeat.content.trim() || "_Empty beat. Press Tab to add a child, or click + to add a sibling._",
      contentEl,
      this.currentFile?.path ?? "",
      this
    );

    // Action bar at the bottom
    const actionBar = pane.createDiv({ cls: "cb-prose-actions" });
    const addChild = actionBar.createEl("button", { text: "+ Child (Tab)", cls: "cb-prose-action" });
    addChild.addEventListener("click", () => this.insertBeat(activeBeat.id));
    const addSibling = actionBar.createEl("button", { text: "+ Sibling (Shift+Enter)", cls: "cb-prose-action" });
    addSibling.addEventListener("click", () => this.insertBeat(parentBeatId(activeBeat.id)));
  }

  // === Status bar ===

  private renderStatusBar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "cb-status-bar" });
    if (!this.parsed) {
      bar.textContent = "No file loaded";
      return;
    }
    const total = this.parsed.beats.length;
    const activeIdx = this.parsed.beats.findIndex((b) => b.id === this.activeBeatId);
    bar.createSpan({ text: `Beat ${activeIdx + 1} of ${total}` });
    bar.createSpan({ text: "  •  " });
    bar.createSpan({ text: `${this.parsed.footnotes.length} footnotes  •  ${this.parsed.beats.filter((b) => b.status === "voice-locked").length} voice-locked` });
  }

  // === Empty state ===

  private renderEmpty(root: HTMLElement): void {
    this.renderToolbar(root);
    const main = root.createDiv({ cls: "cb-writing-main" });
    const empty = main.createDiv({ cls: "cb-rail-empty" });
    empty.createEl("h2", { text: "No beats yet" });
    empty.createEl("p", {
      text:
        "Add a <!--section: ...--> marker to start, or run the 'Insert new beat' " +
        "command. Once you have beats, switch to this view to write roam-style.",
    });
    this.renderStatusBar(root);
  }
}
