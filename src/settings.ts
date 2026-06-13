import { App, PluginSettingTab, Setting } from "obsidian";
import { CopyBlocksSettings, StatusConfig, WritingTheme, DEFAULT_THEME, TYPEWRITER_THEME, DARK_THEME } from "./types";

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

    // Theme section at the top (so it's discoverable)
    containerEl.createEl("h3", { text: "Writing view theme" });
    containerEl.createEl("p", {
      text:
        "Customize the look of the writing view (roam-style cards + prose pane). " +
        "Changes apply live — open the writing view in another pane to see them.",
    });
    this.renderThemeSection(containerEl);

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

    containerEl.createEl("h3", { text: "General" });
    this.renderGeneralSection(containerEl);
  }

  private renderGeneralSection(containerEl: HTMLElement): void {
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
          "treated as a deck file. Default: 'copy-blocks'."
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
        "Frontmatter key that holds the deck name. Default: 'deck'."
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.deckIdKey)
          .onChange(async (value) => {
            this.plugin.settings.deckIdKey = value.trim() || "deck";
            await this.plugin.saveSettings();
          })
      );
  }

  /**
   * Theme settings UI. Includes:
   * - Preset picker (Default / Typewriter / Dark)
   * - Light/dark/match-obsidian toggle
   * - Color pickers for card bg (4 depths), borders, text
   * - Font controls (size, family)
   * - Padding + border-radius dropdowns
   * - Live preview pane showing what the cards look like
   */
  private renderThemeSection(containerEl: HTMLElement): void {
    const t = this.plugin.settings.theme;

    // Preset buttons
    new Setting(containerEl)
      .setName("Preset")
      .setDesc("Pick a starting point, then customize below.")
      .addButton((b) =>
        b.setButtonText("Default").onClick(async () => {
          this.plugin.settings.theme = { ...DEFAULT_THEME };
          await this.plugin.saveSettings();
          this.display();
        })
      )
      .addButton((b) =>
        b.setButtonText("Typewriter").onClick(async () => {
          this.plugin.settings.theme = { ...TYPEWRITER_THEME };
          await this.plugin.saveSettings();
          this.display();
        })
      )
      .addButton((b) =>
        b.setButtonText("Dark").onClick(async () => {
          this.plugin.settings.theme = { ...DARK_THEME };
          await this.plugin.saveSettings();
          this.display();
        })
      );

    // Mode
    new Setting(containerEl)
      .setName("Theme mode")
      .setDesc('"match-obsidian" inherits from your active Obsidian theme.')
      .addDropdown((dd) =>
        dd
          .addOption("match-obsidian", "Match Obsidian theme")
          .addOption("light", "Light")
          .addOption("dark", "Dark")
          .setValue(t.mode)
          .onChange(async (value) => {
            t.mode = value as WritingTheme["mode"];
            await this.plugin.saveSettings();
          })
      );

    // Editor background
    new Setting(containerEl)
      .setName("Editor background")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.editorBg)).onChange(async (value) => {
          t.editorBg = value;
          await this.plugin.saveSettings();
        })
      );

    // Card backgrounds by depth
    for (let i = 0; i < 4; i++) {
      new Setting(containerEl)
        .setName(`Card background — depth ${i + 1}`)
        .addColorPicker((cp) =>
          cp.setValue(this.colorToHex(t.cardBgByDepth[i])).onChange(async (value) => {
            t.cardBgByDepth[i] = value;
            await this.plugin.saveSettings();
          })
        );
    }

    // Card borders
    new Setting(containerEl)
      .setName("Card border (default)")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.cardBorder)).onChange(async (value) => {
          t.cardBorder = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Card border (active)")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.cardBorderActive)).onChange(async (value) => {
          t.cardBorderActive = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Card border (hover)")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.cardBorderHover)).onChange(async (value) => {
          t.cardBorderHover = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Card border (drop target)")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.cardBorderDrop)).onChange(async (value) => {
          t.cardBorderDrop = value;
          await this.plugin.saveSettings();
        })
      );

    // Text colors
    new Setting(containerEl)
      .setName("Card text color")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.cardText)).onChange(async (value) => {
          t.cardText = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Muted text color")
      .addColorPicker((cp) =>
        cp.setValue(this.colorToHex(t.cardMuted)).onChange(async (value) => {
          t.cardMuted = value;
          await this.plugin.saveSettings();
        })
      );

    // Padding
    new Setting(containerEl)
      .setName("Card padding")
      .addDropdown((dd) =>
        dd
          .addOption("compact", "Compact")
          .addOption("cozy", "Cozy")
          .addOption("spacious", "Spacious")
          .setValue(t.padding)
          .onChange(async (value) => {
            t.padding = value as WritingTheme["padding"];
            await this.plugin.saveSettings();
          })
      );

    // Border radius
    new Setting(containerEl)
      .setName("Card border radius")
      .addDropdown((dd) =>
        dd
          .addOption("none", "None (sharp)")
          .addOption("small", "Small")
          .addOption("round", "Round")
          .setValue(t.borderRadius)
          .onChange(async (value) => {
            t.borderRadius = value as WritingTheme["borderRadius"];
            await this.plugin.saveSettings();
          })
      );

    // Font size
    new Setting(containerEl)
      .setName("Font size (px)")
      .addText((text) =>
        text
          .setValue(String(t.fontSize))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 10 && n <= 32) {
              t.fontSize = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // Font family
    new Setting(containerEl)
      .setName("Font family")
      .setDesc("CSS font-family string. e.g. 'Inter, system-ui, sans-serif' or 'Courier New, monospace'")
      .addText((text) =>
        text
          .setValue(t.fontFamily)
          .onChange(async (value) => {
            t.fontFamily = value.trim() || "var(--font-interface)";
            await this.plugin.saveSettings();
          })
      );

    // === Live preview pane ===
    const previewWrap = containerEl.createDiv({ cls: "cb-theme-preview-wrap" });
    previewWrap.createEl("h4", { text: "Live preview" });
    const preview = previewWrap.createDiv({ cls: "cb-theme-preview" });
    this.renderPreview(preview);
  }

  private renderPreview(parent: HTMLElement): void {
    const t = this.plugin.settings.theme;
    // Apply theme via inline styles
    parent.style.background = t.editorBg;
    parent.style.fontFamily = t.fontFamily;
    parent.style.fontSize = `${t.fontSize}px`;
    parent.style.color = t.cardText;
    parent.style.padding = "12px";
    parent.style.borderRadius = "6px";
    parent.style.border = "1px solid var(--background-modifier-border)";

    // Sample card
    const card = parent.createDiv({ cls: "cb-preview-card" });
    card.style.background = t.cardBgByDepth[0];
    card.style.border = `1px solid ${t.cardBorder}`;
    card.style.borderRadius = t.borderRadius === "none" ? "0" : t.borderRadius === "round" ? "12px" : "6px";
    card.style.padding = t.padding === "compact" ? "6px 10px" : t.padding === "spacious" ? "14px 18px" : "10px 14px";
    card.style.color = t.cardText;
    card.style.marginBottom = "8px";

    const header = card.createDiv({ cls: "cb-preview-header" });
    header.style.display = "flex";
    header.style.gap = "8px";
    header.style.alignItems = "center";
    const dot = header.createSpan({ text: "●" });
    dot.style.color = "#4a7c59";
    dot.style.fontSize = "0.8em";
    const id = header.createSpan({ text: "1.2.4" });
    id.style.fontFamily = "monospace";
    id.style.fontSize = "0.7em";
    id.style.opacity = "0.7";
    id.style.color = t.cardMuted;
    const title = header.createDiv({ text: "Sample beat title" });
    title.style.flex = "1";
    title.style.fontWeight = "500";
    title.style.color = t.cardText;

    // Active card preview
    const active = parent.createDiv({ cls: "cb-preview-card-active" });
    active.style.background = "rgba(99, 102, 241, 0.08)";
    active.style.border = `2px solid ${t.cardBorderActive}`;
    active.style.borderRadius = t.borderRadius === "none" ? "0" : t.borderRadius === "round" ? "12px" : "6px";
    active.style.padding = t.padding === "compact" ? "6px 10px" : t.padding === "spacious" ? "14px 18px" : "10px 14px";
    active.style.color = t.cardText;
    const activeTitle = active.createDiv({ text: "Active beat (this is what you'd see when selected)" });
    activeTitle.style.fontWeight = "500";
  }

  /**
   * Convert any color (hex, rgba, var, etc.) to a hex string for the
   * color picker's setValue. Falls back to #888888 for non-hex values.
   */
  private colorToHex(color: string): string {
    if (color.startsWith("#")) return color;
    // Extract rgba values
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return "#888888";
    const parts = m[1]!.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length < 3) return "#888888";
    const [r, g, b] = parts;
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
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
