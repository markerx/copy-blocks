import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, Component } from "obsidian";
import { Beat, CopyBlocksSettings, VerificationState } from "../types";
import { parseNote } from "../parser/note-parser";

export const BEAT_VIEW_TYPE = "copy-blocks-beat-view";

export class BeatView extends ItemView {
  private currentFile: TFile | null = null;
  private currentBeatIndex: number = 0;
  private parsed: ReturnType<typeof parseNote> | null = null;
  private settings: CopyBlocksSettings;

  constructor(leaf: WorkspaceLeaf, settings: CopyBlocksSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return BEAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.parsed && this.currentBeatIndex < this.parsed.beats.length) {
      const beat = this.parsed.beats[this.currentBeatIndex]!;
      return `Beat ${beat.id}${beat.label ? " — " + beat.label : ""}`;
    }
    return "Copy Blocks";
  }

  getIcon(): string {
    return "layout-list";
  }

  async onOpen(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      await this.loadFile(activeFile);
    }
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /**
   * Load a file into the view. Called by the "Open in Copy Blocks" command.
   */
  async loadFile(file: TFile): Promise<void> {
    this.currentFile = file;
    const raw = await this.app.vault.cachedRead(file);
    this.parsed = parseNote(file, raw);
    this.currentBeatIndex = 0;
    this.render();
  }

  /**
   * Navigate to the next beat. Returns true if navigation happened.
   */
  nextBeat(): boolean {
    if (!this.parsed) return false;
    if (this.currentBeatIndex < this.parsed.beats.length - 1) {
      this.currentBeatIndex++;
      this.render();
      return true;
    }
    return false;
  }

  prevBeat(): boolean {
    if (!this.parsed) return false;
    if (this.currentBeatIndex > 0) {
      this.currentBeatIndex--;
      this.render();
      return true;
    }
    return false;
  }

  jumpToBeat(beatId: string): boolean {
    if (!this.parsed) return false;
    const idx = this.parsed.beats.findIndex((b) => b.id === beatId);
    if (idx === -1) return false;
    this.currentBeatIndex = idx;
    this.render();
    return true;
  }

  jumpToNextWithStatus(status: string): boolean {
    if (!this.parsed) return false;
    const startIdx = this.currentBeatIndex + 1;
    for (let i = 0; i < this.parsed.beats.length; i++) {
      const idx = (startIdx + i) % this.parsed.beats.length;
      if (this.parsed.beats[idx]!.status === status) {
        this.currentBeatIndex = idx;
        this.render();
        return true;
      }
    }
    return false;
  }

  /**
   * Re-parse the current file (e.g. after edits). Preserves position.
   */
  async refresh(): Promise<void> {
    if (!this.currentFile) return;
    const raw = await this.app.vault.cachedRead(this.currentFile);
    this.parsed = parseNote(this.currentFile, raw);
    if (this.currentBeatIndex >= this.parsed.beats.length) {
      this.currentBeatIndex = Math.max(0, this.parsed.beats.length - 1);
    }
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("copy-blocks-view");

    if (!this.parsed || this.parsed.beats.length === 0) {
      this.renderEmptyState();
      return;
    }

    const beat = this.parsed.beats[this.currentBeatIndex]!;
    const beatArea = root.createDiv({ cls: "copy-blocks-beat-area" });
    const beatEl = beatArea.createDiv({ cls: "copy-blocks-beat" });

    // Beat id badge
    const idBadge = beatEl.createDiv({ cls: "copy-blocks-beat-id" });
    idBadge.setText(`Beat ${beat.id}`);

    if (beat.label) {
      const labelEl = beatEl.createEl("h2", { text: beat.label });
      labelEl.style.fontSize = "0.9em";
      labelEl.style.color = "var(--text-muted)";
      labelEl.style.fontWeight = "normal";
      labelEl.style.marginTop = "0";
    }

    // Status badge
    const statusConfig = this.settings.statuses.find((s) => s.key === beat.status);
    if (statusConfig) {
      const badge = beatEl.createSpan({ cls: `cb-badge ${statusConfig.badgeClass}` });
      badge.setText(statusConfig.label);
    } else {
      const badge = beatEl.createSpan({ cls: "cb-badge cb-badge-draft" });
      badge.setText(beat.status);
    }

    // Beat content (rendered as markdown)
    const contentEl = beatEl.createDiv({ cls: "copy-blocks-beat-content" });
    MarkdownRenderer.render(
      this.app,
      beat.content.trim(),
      contentEl,
      this.currentFile?.path ?? "",
      this
    );

    // Sidebar
    if (this.settings.showSidebar) {
      this.renderSidebar(root, beat);
    }

    // Nav bar
    this.renderNav(root);
  }

  private renderEmptyState(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("copy-blocks-view");
    const empty = root.createDiv({ cls: "copy-blocks-dashboard-empty" });
    empty.setText(
      "No beats found. This file doesn't contain any <!--section: ...--> markers. Add one to start staging beats."
    );
  }

  private renderSidebar(root: HTMLElement, beat: Beat): void {
    const sidebar = root.createDiv({ cls: "copy-blocks-sidebar" });

    // Status field
    const statusField = sidebar.createDiv({ cls: "copy-blocks-sidebar-field" });
    statusField.createEl("h3", { text: "Status" });
    statusField.createDiv({
      cls: "copy-blocks-sidebar-value",
      text: this.settings.statuses.find((s) => s.key === beat.status)?.label ?? beat.status,
    });

    // Verification field
    const verifField = sidebar.createDiv({ cls: "copy-blocks-sidebar-field" });
    verifField.createEl("h3", { text: "Verification" });
    const verifBadge = verifField.createSpan({ cls: `cb-badge cb-badge-${verificationToBadgeClass(beat.verification)}` });
    verifBadge.setText(verificationLabel(beat.verification));

    // Sources
    if (beat.sources.length > 0) {
      const sourcesField = sidebar.createDiv({ cls: "copy-blocks-sidebar-field copy-blocks-sidebar-sources" });
      sourcesField.createEl("h3", { text: "Sources" });
      for (const source of beat.sources) {
        const cleanSource = source.replace(/[\[\]]/g, "").trim();
        const link = sourcesField.createEl("a", { text: cleanSource, href: "#" });
        link.addEventListener("click", (e) => {
          e.preventDefault();
          this.openLink(cleanSource);
        });
      }
    }

    // Frontmatter context (act + section from file)
    if (this.parsed) {
      const ctxField = sidebar.createDiv({ cls: "copy-blocks-sidebar-field" });
      ctxField.createEl("h3", { text: "Context" });
      const ctxValue = ctxField.createDiv({ cls: "copy-blocks-sidebar-value" });
      const act = this.parsed.frontmatter["act"];
      const section = this.parsed.frontmatter["section"];
      if (act) ctxValue.createEl("div", { text: `Act: ${act}` });
      if (section) ctxValue.createEl("div", { text: section });
      if (!act && !section && this.parsed.basename) {
        ctxValue.createEl("div", { text: this.parsed.basename });
      }
    }

    // Footnote count
    if (this.parsed && this.parsed.footnotes.length > 0) {
      const fnField = sidebar.createDiv({ cls: "copy-blocks-sidebar-field" });
      fnField.createEl("h3", { text: "Footnotes" });
      fnField.createDiv({
        cls: "copy-blocks-sidebar-value",
        text: `${this.parsed.footnotes.length} in this file`,
      });
    }
  }

  private renderNav(root: HTMLElement): void {
    if (!this.parsed) return;

    const nav = root.createDiv({ cls: "copy-blocks-nav" });
    const prev = nav.createEl("button", { text: "← Previous" });
    const position = nav.createDiv({ cls: "copy-blocks-nav-position" });
    position.setText(
      `Beat ${this.currentBeatIndex + 1} of ${this.parsed.beats.length}`
    );
    const next = nav.createEl("button", { text: "Next →" });

    prev.disabled = this.currentBeatIndex === 0;
    next.disabled = this.currentBeatIndex === this.parsed.beats.length - 1;

    prev.addEventListener("click", () => this.prevBeat());
    next.addEventListener("click", () => this.nextBeat());
  }

  private openLink(linkText: string): void {
    // Try to find a file matching the wikilink basename.
    const allFiles = this.app.vault.getMarkdownFiles();
    const basename = linkText.split("|")[0]!.trim();
    const target = allFiles.find(
      (f) => f.basename === basename || f.path.endsWith(`/${basename}.md`)
    );
    if (target) {
      this.app.workspace.openLinkText(basename, "", false);
    } else {
      // File doesn't exist — try to create it as a stub.
      this.app.workspace.openLinkText(basename, "", true);
    }
  }
}

function verificationToBadgeClass(v: VerificationState): string {
  switch (v) {
    case "verified":
      return "verified";
    case "needs-primary":
      return "needs-primary";
    case "constructed":
      return "constructed";
    case "gated":
      return "gated";
    case "unknown":
      return "draft";
  }
}

function verificationLabel(v: VerificationState): string {
  switch (v) {
    case "verified":
      return "✓ Verified";
    case "needs-primary":
      return "⚠ Needs primary";
    case "constructed":
      return "🚧 Constructed";
    case "gated":
      return "🔒 Gated";
    case "unknown":
      return "Unknown";
  }
}
