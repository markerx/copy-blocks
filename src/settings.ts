import { App, PluginSettingTab, Setting } from "obsidian";
import { CopyBlocksSettings, StatusConfig } from "./types";

export class CopyBlocksSettingTab extends PluginSettingTab {
  private plugin: InstanceType<typeof import("./main").default>;

  constructor(app: App, plugin: InstanceType<typeof import("./main").default>) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Copy Blocks — Settings" });

    containerEl.createEl("p", {
      text:
        "Stage promo-copy beats with structured metadata, status tracking, " +
        "and cross-file threading.",
    });

    // Frontmatter detection
    new Setting(containerEl)
      .setName("Deck marker frontmatter key")
      .setDesc(
        "Frontmatter key used to identify a note as a deck file. " +
          "Default: 'type'."
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.deckMarkerKey)
          .onChange(async (value) => {
            this.plugin.settings.deckMarkerKey = value.trim() || "type";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Deck marker value")
      .setDesc(
        "The value the deck marker key must equal for a note to be " +
          "treated as a deck file. Default: 'copy-blocks'. " +
          "If you have existing files using a different value, change this " +
          "to match them, or update the files to use 'type: copy-blocks'."
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.deckMarkerValue)
          .onChange(async (value) => {
            this.plugin.settings.deckMarkerValue = value.trim() || "copy-blocks";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Deck id frontmatter key")
      .setDesc(
        "Frontmatter key that holds the deck name. Default: 'deck'. " +
          "If not set, the deck is inferred from the folder structure."
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.deckIdKey)
          .onChange(async (value) => {
            this.plugin.settings.deckIdKey = value.trim() || "deck";
            await this.plugin.saveSettings();
          })
      );

    // View defaults
    new Setting(containerEl)
      .setName("Show metadata sidebar in view mode")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSidebar)
          .onChange(async (value) => {
            this.plugin.settings.showSidebar = value;
            await this.plugin.saveSettings();
          })
      );

    // Drift threshold
    new Setting(containerEl)
      .setName("Drift threshold (days)")
      .setDesc(
        "How many days since a footnote's last verification date before it is " +
          "flagged as potentially stale."
      )
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.driftThresholdDays))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.driftThresholdDays = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // Status taxonomy
    containerEl.createEl("h3", { text: "Status taxonomy" });
    containerEl.createEl("p", {
      text:
        "Statuses are color-coded badges shown inline and in the dashboard. " +
        "Reorder by editing the list. Add or remove entries to match your " +
        "workflow.",
    });

    this.renderStatusList(containerEl);

    new Setting(containerEl)
      .setName("Add status")
      .addButton((button) =>
        button
          .setButtonText("Add")
          .setWarning()
          .onClick(async () => {
            const newKey = `custom-${this.plugin.settings.statuses.length}`;
            this.plugin.settings.statuses.push({
              key: newKey,
              label: "New status",
              badgeClass: "cb-badge-draft",
              color: "#888888",
              order: this.plugin.settings.statuses.length,
            });
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }

  private renderStatusList(containerEl: HTMLElement): void {
    const sorted = [...this.plugin.settings.statuses].sort((a, b) => a.order - b.order);

    sorted.forEach((status, idx) => {
      const setting = new Setting(containerEl)
        .setName(status.label)
        .addText((text) =>
          text
            .setPlaceholder("Key")
            .setValue(status.key)
            .onChange(async (value) => {
              status.key = value.trim();
              await this.plugin.saveSettings();
            })
        )
        .addText((text) =>
          text
            .setPlaceholder("Label")
            .setValue(status.label)
            .onChange(async (value) => {
              status.label = value.trim();
              await this.plugin.saveSettings();
            })
        )
        .addColorPicker((picker) =>
          picker.setValue(status.color).onChange(async (value) => {
            status.color = value;
            status.badgeClass = deriveBadgeClass(status.color);
            await this.plugin.saveSettings();
          })
        )
        .addButton((button) =>
          button
            .setButtonText("↑")
            .setTooltip("Move up")
            .onClick(async () => {
              if (idx > 0) {
                const prev = sorted[idx - 1]!;
                const tmp = prev.order;
                prev.order = status.order;
                status.order = tmp;
                await this.plugin.saveSettings();
                this.display();
              }
            })
        )
        .addButton((button) =>
          button
            .setButtonText("↓")
            .setTooltip("Move down")
            .onClick(async () => {
              if (idx < sorted.length - 1) {
                const next = sorted[idx + 1]!;
                const tmp = next.order;
                next.order = status.order;
                status.order = tmp;
                await this.plugin.saveSettings();
                this.display();
              }
            })
        )
        .addButton((button) =>
          button
            .setButtonText("Remove")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.statuses = this.plugin.settings.statuses.filter(
                (s: StatusConfig) => s.key !== status.key
              );
              await this.plugin.saveSettings();
              this.display();
            })
        );
      // Reference setting to avoid unused-var lint.
      void setting;
    });
  }
}

function deriveBadgeClass(hexColor: string): string {
  // Map hex to one of the predefined badge classes for visual consistency.
  // This is a simple heuristic; users can edit styles.css to add custom classes.
  const c = hexColor.toLowerCase();
  if (c.startsWith("#4a7c") || c.startsWith("#1a7f") || c.startsWith("#059669")) return "cb-badge-voice-locked";
  if (c.startsWith("#2d5a")) return "cb-badge-fact-checked";
  if (c.startsWith("#b8860b")) return "cb-badge-needs-primary";
  if (c.startsWith("#8b5cf6")) return "cb-badge-constructed";
  if (c.startsWith("#dc2626")) return "cb-badge-gated";
  if (c.startsWith("#1a1a1a")) return "cb-badge-final";
  return "cb-badge-draft";
}
