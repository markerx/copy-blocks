import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { CopyBlocksSettings, ParsedNote, StatusConfig } from "../types";
import { indexVault } from "../parser/note-parser";

export const DASHBOARD_VIEW_TYPE = "copy-blocks-dashboard";

export class DeckDashboardView extends ItemView {
  private settings: CopyBlocksSettings;
  private refreshHandle: number | null = null;

  constructor(leaf: WorkspaceLeaf, settings: CopyBlocksSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Copy Blocks — Decks";
  }

  getIcon(): string {
    return "gauge";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async refresh(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("copy-blocks-dashboard");

    this.contentEl.createEl("h2", { text: "Decks" });

    // Index the vault
    const decks = await indexVault(
      this.app.vault,
      this.settings.deckMarkerKey,
      this.settings.deckIdKey
    );

    this.contentEl.empty();
    this.contentEl.addClass("copy-blocks-dashboard");

    this.contentEl.createEl("h2", { text: "Decks" });

    if (decks.size === 0) {
      const empty = this.contentEl.createDiv({ cls: "copy-blocks-dashboard-empty" });
      empty.setText(
        "No promo-copy decks found. Notes are detected by `type: promo-copy` in frontmatter. " +
          "Change the marker key in settings if you use a different convention."
      );
      return;
    }

    for (const [deckId, notes] of decks) {
      this.renderDeck(deckId, notes);
    }
  }

  private renderDeck(deckId: string, notes: ParsedNote[]): void {
    const deckEl = this.contentEl.createDiv({ cls: "copy-blocks-dashboard-deck" });
    deckEl.createDiv({ cls: "copy-blocks-dashboard-deck-name", text: deckId });

    // Status rollup
    const rollup = this.computeRollup(notes);
    const rollupEl = deckEl.createDiv({ cls: "copy-blocks-dashboard-rollup" });
    for (const status of this.settings.statuses) {
      const count = rollup[status.key] ?? 0;
      if (count > 0) {
        const pill = rollupEl.createSpan({ cls: "cb-rollup-pill", text: `${status.label}: ${count}` });
      }
    }

    // File list
    for (const note of notes) {
      const fileEl = deckEl.createEl("a", {
        cls: "copy-blocks-dashboard-file",
        text: `${note.basename}  (${note.beats.length} beats)`,
        href: "#",
      });
      fileEl.addEventListener("click", (e) => {
        e.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(note.filePath) as TFile | null;
        if (file) {
          this.app.workspace.openLinkText(file.basename, "", false);
        }
      });
    }
  }

  private computeRollup(notes: ParsedNote[]): Record<string, number> {
    const rollup: Record<string, number> = {};
    for (const note of notes) {
      for (const beat of note.beats) {
        rollup[beat.status] = (rollup[beat.status] ?? 0) + 1;
      }
    }
    return rollup;
  }
}
