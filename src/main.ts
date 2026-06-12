import { Plugin, WorkspaceLeaf, TFile, Notice } from "obsidian";
import {
  BEAT_VIEW_TYPE,
  BeatView,
} from "./view/beat-view";
import { DASHBOARD_VIEW_TYPE, DeckDashboardView } from "./view/deck-dashboard";
import { CopyBlocksSettings, DEFAULT_SETTINGS } from "./types";
import { CopyBlocksSettingTab } from "./settings";
import { beatsToReadingView, beatsToStageView } from "./view/reading-view";

export default class CopyBlocksPlugin extends Plugin {
  settings: CopyBlocksSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register views
    this.registerView(BEAT_VIEW_TYPE, (leaf) => new BeatView(leaf, this.settings));
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DeckDashboardView(leaf, this.settings));

    // Ribbon icons
    this.addRibbonIcon("layout-list", "Open in Copy Blocks", async () => {
      await this.openActiveFileInBeatView();
    });
    this.addRibbonIcon("gauge", "Open deck dashboard", async () => {
      await this.activateDashboardView();
    });

    // Commands
    this.addCommand({
      id: "open-in-beat-view",
      name: "Open current file in Copy Blocks",
      callback: () => this.openActiveFileInBeatView(),
    });

    this.addCommand({
      id: "open-dashboard",
      name: "Open deck dashboard",
      callback: () => this.activateDashboardView(),
    });

    this.addCommand({
      id: "next-beat",
      name: "Next beat",
      checkCallback: (checking) => {
        const view = this.getActiveBeatView();
        if (view) {
          if (!checking) view.nextBeat();
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "prev-beat",
      name: "Previous beat",
      checkCallback: (checking) => {
        const view = this.getActiveBeatView();
        if (view) {
          if (!checking) view.prevBeat();
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "jump-to-needs-primary",
      name: "Jump to next beat needing primary source",
      checkCallback: (checking) => {
        const view = this.getActiveBeatView();
        if (view) {
          if (!checking) {
            const jumped = view.jumpToNextWithStatus("needs-primary");
            if (!jumped) new Notice("No beats with status 'needs-primary' in this file.");
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "jump-to-constructed",
      name: "Jump to next beat needing editor re-voice",
      checkCallback: (checking) => {
        const view = this.getActiveBeatView();
        if (view) {
          if (!checking) {
            const jumped = view.jumpToNextWithStatus("constructed");
            if (!jumped) new Notice("No beats with status 'constructed' in this file.");
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "jump-to-gated",
      name: "Jump to next gated beat",
      checkCallback: (checking) => {
        const view = this.getActiveBeatView();
        if (view) {
          if (!checking) {
            const jumped = view.jumpToNextWithStatus("gated");
            if (!jumped) new Notice("No gated beats in this file.");
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "copy-reading-view",
      name: "Copy reading view (clean prose) to clipboard",
      callback: async () => {
        const view = this.getActiveBeatView();
        if (!view) {
          new Notice("Open a file in Copy Blocks first.");
          return;
        }
        const parsed = (view as any).parsed;
        if (!parsed) return;
        const clean = beatsToReadingView(parsed.beats);
        await navigator.clipboard.writeText(clean);
        new Notice("Reading view copied to clipboard.");
      },
    });

    this.addCommand({
      id: "copy-stage-view",
      name: "Copy stage view (with beat headers) to clipboard",
      callback: async () => {
        const view = this.getActiveBeatView();
        if (!view) {
          new Notice("Open a file in Copy Blocks first.");
          return;
        }
        const parsed = (view as any).parsed;
        if (!parsed) return;
        const stage = beatsToStageView(parsed.beats);
        await navigator.clipboard.writeText(stage);
        new Notice("Stage view copied to clipboard.");
      },
    });

    this.addCommand({
      id: "create-reading-view-note",
      name: "Create reading view as new note",
      callback: async () => {
        const view = this.getActiveBeatView();
        if (!view) {
          new Notice("Open a file in Copy Blocks first.");
          return;
        }
        const parsed = (view as any).parsed;
        if (!parsed) return;
        const clean = beatsToReadingView(parsed.beats);
        const file = (view as any).currentFile as TFile | null;
        if (!file) return;
        const newPath = file.path.replace(/\.md$/, " — Reading View.md");
        await this.app.vault.create(newPath, clean);
        new Notice(`Reading view created: ${newPath}`);
      },
    });

    this.addCommand({
      id: "create-stage-view-note",
      name: "Create stage view as new note",
      callback: async () => {
        const view = this.getActiveBeatView();
        if (!view) {
          new Notice("Open a file in Copy Blocks first.");
          return;
        }
        const parsed = (view as any).parsed;
        if (!parsed) return;
        const stage = beatsToStageView(parsed.beats);
        const file = (view as any).currentFile as TFile | null;
        if (!file) return;
        const newPath = file.path.replace(/\.md$/, " — Stage View.md");
        await this.app.vault.create(newPath, stage);
        new Notice(`Stage view created: ${newPath}`);
      },
    });

    // Settings tab
    this.addSettingTab(new CopyBlocksSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    // Detach any open views
    this.app.workspace.detachLeavesOfType(BEAT_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async openActiveFileInBeatView(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active file to open.");
      return;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: BEAT_VIEW_TYPE, active: true });
    const view = leaf.view as BeatView;
    if (view && view.loadFile) {
      await view.loadFile(file);
    }
  }

  private async activateDashboardView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
  }

  private getActiveBeatView(): BeatView | null {
    const leaves = this.app.workspace.getLeavesOfType(BEAT_VIEW_TYPE);
    if (leaves.length === 0) return null;
    return leaves[0]!.view as BeatView;
  }
}
