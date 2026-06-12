# Copy Blocks

**Stage promo-copy beats with structured metadata, status tracking, and cross-file threading.**

An Obsidian plugin for copywriters working on multi-file promo decks (VSLs, sales pages, email sequences) where each note holds a chunk of copy with compliance state, sources, and cross-file dependencies.

## What it does

- **Read your copy one beat at a time** — each `<!--section: ...-->` marker in your note becomes a beat you can navigate with `←` / `→`
- **Show the metadata that matters** — beat ID, status, verification state (verified / needs primary / constructed / gated), linked source notes, footnote count
- **Track cross-file threading** — automatically detects "pays off in [[X]]" / "planted in [[X]]" / "MOVED TO [[X]]" patterns in your footnotes and links the beats
- **Dashboard view** — see all your promo decks at a glance with per-status rollup (3 voice-locked, 7 needs primary, 2 gated...)
- **Reading view / stage view export** — strip the markers, dump clean prose (or labeled stage blocks) to clipboard or a new note
- **Quick-jump to next problem** — "next beat needing primary source" / "next gated beat" / "next constructed beat"
- **Configurable status taxonomy** — defaults match the patterns from real promo copy, but you can add/remove/reorder/rename statuses
- **Inline status badges in the editor** — section markers render as color-coded pills (no more scanning long `<!--section: ...-->` comments)
- **Drag-to-reorder beats** — grab a badge, drop it on another beat, and the markdown updates instantly
- **Keyboard reorder** — `Cmd-Shift-Up` / `Cmd-Shift-Down` swaps the beat containing the cursor with its neighbor

## Quick start

### 1. Install via BRAT (recommended for personal use)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Open BRAT → "Add Beta plugin" → paste `https://github.com/markerx/copy-blocks`
3. Enable "Copy Blocks" in Settings → Community Plugins

### 2. Or install manually

1. Build the plugin: `npm install && npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to `<your-vault>/.obsidian/plugins/copy-blocks/`
3. Enable "Copy Blocks" in Settings → Community Plugins

## How to use

### Marker grammar

In any note with `type: promo-copy` in its frontmatter, add beat markers above each copy block:

```markdown
<!--section: 1 status:draft-v1 verified:unknown sources:"[[Big-Idea]]" label:"Cold Open"-->
**KIMBERLY:** Despite the **Iran war**, rising **inflation**, and growing worries...

<!--section: 2 status:voice-locked verified:yes sources:"[[Big-Idea_Citations]]"-->
**EREZ:** I'll name it. But not yet...
```

The marker grammar:

```
<!--section: <id> [status:<key>] [verified:<yes|no|constructed|gated>] [sources:"[[X]]", "[[Y]]"] [label:"<text>"]-->
```

- `id` is required (anything: `1`, `1.2`, `2.3.1`, etc.)
- All other fields are optional
- Status values can contain hyphens (e.g. `draft-v2-footnoted`, `voice-locked`)
- `sources` is a comma-separated list of wikilink-style refs

### What you see in the editor

When you add markers and reload the file, the raw `<!--section: ...-->` text gets replaced with a colored pill. For example:

```markdown
[4.1 DRAFT-V2-FOOTNOTED · ⚠]
**KIMBERLY:** Despite the **Iran war**...

[4.2 VOICE-LOCKED · ✓]
**EREZ:** I'll name it.
```

The pill color matches the status taxonomy configured in settings. Hover the pill to see the full metadata (sources, verification, label) in a native Obsidian tooltip. Grab the pill to drag it onto another beat and reorder; or hit `Cmd-Shift-Up` / `Cmd-Shift-Down` while the cursor is inside a beat to swap it with its neighbor.

### Open in Copy Blocks

1. Open a `promo-copy` note in Obsidian
2. Click the **list icon** in the ribbon, or run the command "Open current file in Copy Blocks"
3. Use **← Previous** / **Next →** buttons (or the commands) to navigate beats
4. The sidebar shows the beat's status, verification, sources, and frontmatter context

### Commands

| Command | What it does |
|---|---|
| Open current file in Copy Blocks | Loads the active note into the beat view |
| Open deck dashboard | Shows all your promo decks with status rollups |
| Next beat / Previous beat | Navigate the current file's beats |
| Jump to next beat needing primary source | Find the next ⚠ beat |
| Jump to next beat needing editor re-voice | Find the next 🚧 beat |
| Jump to next gated beat | Find the next 🔒 beat |
| Copy reading view (clean prose) to clipboard | Strip markers, copy clean text |
| Copy stage view (with beat headers) to clipboard | Strip markers, copy with beat labels |
| Create reading view as new note | Export clean prose to `<file> — Reading View.md` |
| Create stage view as new note | Export stage blocks to `<file> — Stage View.md` |

### Editor shortcuts (inside any `type: promo-copy` note)

| Shortcut | What it does |
|---|---|
| `Cmd-Shift-Up` | Swap the beat containing the cursor with the one above it |
| `Cmd-Shift-Down` | Swap the beat containing the cursor with the one below it |
| Drag a section badge | Pick up a beat and drop it on another to reorder |
| Hover a section badge | Show tooltip with status, sources, verification, label |

### Cross-file threading

When your footnotes contain language like:

- `...pays off in [[04-Big-Idea-Reveal]]...`
- `...planted in [[01-Host-Monologue]]...`
- `...MOVED TO [[02-Erez-Greeting]]...`

The plugin detects these and builds a cross-file dependency graph. (Currently shown in the dashboard; full dependency view is coming in v0.2.)

## Configuration

Open **Settings → Copy Blocks** to configure:

- **Deck marker frontmatter key** — which frontmatter key marks a note as a promo-copy file (default: `type`)
- **Deck id frontmatter key** — which key holds the deck name (default: `deck`)
- **Show metadata sidebar in view mode** — toggle the right sidebar
- **Drift threshold (days)** — how stale a footnote can be before being flagged
- **Status taxonomy** — add, remove, rename, reorder, and recolor statuses

Default statuses (matches the patterns in the DefenseTech VSL copy):

| Key | Label | Color |
|---|---|---|
| `draft-v1` | Draft v1 | gray |
| `draft-v2-footnoted` | Draft v2 (footnoted) | gray |
| `voice-locked` | Voice-locked | green |
| `fact-checked` | Fact-checked | blue |
| `verified` | Verified | bright green |
| `needs-primary` | Needs primary | amber |
| `constructed` | Constructed | purple |
| `gated` | Gated | red |
| `compliance-passed` | Compliance-passed | emerald |
| `final` | Final | black |

## Development

```bash
npm install
npm run dev        # watch mode
npm run build      # production build → main.js
npm run lint       # eslint
```

Smoke tests (run against your real promo-copy files):

```bash
npx esbuild scripts/smoke-test.ts --bundle --platform=node --target=es2020 --outfile=scripts/smoke-test.js && node scripts/smoke-test.js
npx esbuild scripts/cross-file-test.ts --bundle --platform=node --target=es2020 --outfile=scripts/cross-file-test.js && node scripts/cross-file-test.js
npx esbuild scripts/reorder-test.ts --bundle --platform=node --target=es2020 --outfile=scripts/reorder-test.js && node scripts/reorder-test.js
```

The plugin is written in TypeScript, built with esbuild, and uses Obsidian's `ItemView` for the beat view + dashboard, and CodeMirror 6 `ViewPlugin` + `MatchDecorator` for the editor extensions.

### Verified against real data

The footnote parser was tested against the **DefenseTech VSL** draft files (`PorterCo/Copy/DefenseTech/Copy_Draft/01-05`). It successfully extracts:

- All `[^N]:` footnotes from a "Source Footnotes" section
- Verification state from inline markers: `✅ VERIFIED` / `⚠️` / `🚧` / `🔒` / `GATED` / `CONSTRUCTED`
- Cross-file loop relationships from these patterns:
  - `pays off in [[X]]` / `pays off as the Y reveal in [[X]]`
  - `planted in [[X]]` / `set up in [[X]]`
  - `MOVED TO [[X]]` / `held out of [[X]]`
  - `named in [[X]]` / `cited in [[X]]`
  - `→ pays off ... in [[X]]` (arrow-form)
- Free-form loop inventory from `## Open loops planted (pay off later)` sections
- Wikilinks (`[[...]]`) to source notes for every footnote

Sample output from `01-Host-Monologue.md` and `04-Big-Idea-Reveal.md`:

```
--- 01-Host-Monologue (1 loop-bearing footnotes) ---
  [^loops] pays off in [[04-Big-Idea-Reveal]]

--- 04-Big-Idea-Reveal (2 loop-bearing footnotes) ---
  [^2] held out of [[02-Erez-Greeting]]
  [^16] cited in [[05-War-Proof_Why-The-Mandate]]
```

## Roadmap

- [x] ~~Drag-to-reorder beats in edit mode~~
- [x] ~~Inline status badges in the CodeMirror editor~~
- [ ] Full cross-deck dependency graph view (Surfacer-style)
- [ ] Drift dashboard — list all stale claims across the deck
- [ ] Re-verify command — re-fetch cited URLs and diff against beat text
- [ ] Per-deck status history / audit log
- [ ] Detect "REMOVED 2026-06-08" footnote patterns and surface as re-work history
- [ ] Cross-file drag — drag a beat from one file's editor into another
- [ ] Right-click context menu on badges (change status inline)

## License

MIT
