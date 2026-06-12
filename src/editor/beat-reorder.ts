/**
 * Beat reorder extension — both drag-and-drop and keyboard reorder.
 *
 * Drag-and-drop:
 *   - The badge rendered by section-badges.ts is `draggable=true`
 *   - On `dragstart`, capture the beat id as data
 *   - On `dragover` over a different beat, show a drop indicator line
 *   - On `drop`, dispatch a transaction that moves the source beat
 *     to the target position
 *
 * Keyboard:
 *   - `Mod-Shift-ArrowUp` / `Mod-Shift-ArrowDown` swaps the beat
 *     containing the cursor with its neighbor
 */

import {
  EditorView,
  ViewPlugin,
  Decoration,
  DecorationSet,
  ViewUpdate,
  keymap,
} from "@codemirror/view";
import { Extension, StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { parseSections } from "../parser/section-parser";
import { Beat } from "../types";

const DRAG_MIME = "application/x-copy-blocks-beat-id";

/**
 * Find the beat that contains the given offset.
 */
function beatAt(beats: Beat[], offset: number): Beat | null {
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]!;
    if (offset >= beat.markerStart && offset < beat.contentEnd) {
      return beat;
    }
  }
  return null;
}

/**
 * Get the full text of a beat, from its marker to the next marker's start.
 */
function beatFullText(text: string, beat: Beat): string {
  return text.slice(beat.markerStart, beat.contentEnd);
}

/**
 * Swap two adjacent beats in the text.
 */
export function swapBeats(text: string, beats: Beat[], idxA: number, idxB: number): string {
  if (idxA < 0 || idxB < 0 || idxA >= beats.length || idxB >= beats.length) {
    return text;
  }
  const a = beats[idxA]!;
  const b = beats[idxB]!;

  const lo = Math.min(a.markerStart, b.markerStart);
  const hi = Math.max(a.contentEnd, b.contentEnd);

  const aText = text.slice(a.markerStart, a.contentEnd);
  const bText = text.slice(b.markerStart, b.contentEnd);

  const before = text.slice(0, lo);
  const after = text.slice(hi);

  // Capture the separator between a and b so we can preserve blank lines.
  const sepAB =
    a.markerStart < b.markerStart
      ? text.slice(a.contentEnd, b.markerStart)
      : text.slice(b.contentEnd, a.markerStart);

  // If a comes first, output b then a; if b comes first, output a then b.
  if (a.markerStart < b.markerStart) {
    return before + bText + sepAB + aText + after;
  } else {
    return before + aText + sepAB + bText + after;
  }
}

/**
 * Move the beat at fromIdx to the position before toIdx.
 */
export function moveBeatToPosition(
  text: string,
  beats: Beat[],
  fromIdx: number,
  toIdx: number
): string {
  if (fromIdx === toIdx) return text;
  if (fromIdx < 0 || fromIdx >= beats.length) return text;
  if (toIdx < 0 || toIdx > beats.length) return text;

  const beat = beats[fromIdx]!;
  const beatText = beatFullText(text, beat);

  // Delete from current position
  let result = text.slice(0, beat.markerStart) + text.slice(beat.contentEnd);

  // Recompute beats on the modified text
  const newBeats = parseSections(result).beats;

  if (toIdx >= newBeats.length) {
    // Append at end
    const last = newBeats[newBeats.length - 1];
    const insertAt = last ? last.contentEnd : result.length;
    const prefix = result.slice(0, insertAt);
    let sep = "";
    if (!prefix.endsWith("\n\n")) {
      sep = prefix.endsWith("\n") ? "\n" : "\n\n";
    }
    result = prefix + sep + beatText + result.slice(insertAt);
  } else {
    const target = newBeats[toIdx]!;
    result = result.slice(0, target.markerStart) + beatText + "\n\n" + result.slice(target.markerStart);
  }

  return result;
}

// === State effects for drag communication ===

const setDragSource = StateEffect.define<string | null>();
const dragSourceField = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => {
    for (const e of tr.effects) {
      if (e.is(setDragSource)) return e.value;
    }
    return value;
  },
});

const setDropTarget = StateEffect.define<string | null>();
const dropTargetField = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => {
    for (const e of tr.effects) {
      if (e.is(setDropTarget)) return e.value;
    }
    return value;
  },
});

// === Keyboard handlers ===

const moveBeatUpKeymap = {
  key: "Mod-Shift-ArrowUp",
  preventDefault: true,
  run: (view: EditorView): boolean => moveBeatAtCursor(view, -1),
};

const moveBeatDownKeymap = {
  key: "Mod-Shift-ArrowDown",
  preventDefault: true,
  run: (view: EditorView): boolean => moveBeatAtCursor(view, +1),
};

function moveBeatAtCursor(view: EditorView, direction: -1 | 1): boolean {
  const text = view.state.doc.toString();
  const cursorOffset = view.state.selection.main.head;
  const beats = parseSections(text).beats;
  if (beats.length === 0) return false;

  const currentIdx = beats.findIndex(
    (b) => cursorOffset >= b.markerStart && cursorOffset < b.contentEnd
  );
  if (currentIdx === -1) return false;

  const targetIdx = currentIdx + direction;
  if (targetIdx < 0 || targetIdx >= beats.length) return false;

  const newText = swapBeats(text, beats, currentIdx, targetIdx);
  if (newText === text) return false;

  view.dispatch({
    changes: { from: 0, to: text.length, insert: newText },
    selection: { anchor: cursorOffset },
  });
  return true;
}

// === Drag controller plugin ===

function dragControllerPlugin() {
  return ViewPlugin.fromClass(
    class {
      private domHandlers: Array<[string, EventListener]> = [];

      constructor(public view: EditorView) {
        this.attachListeners();
      }

      update(_update: ViewUpdate) {
        // No-op: handlers are stable for the lifetime of the view.
      }

      destroy() {
        this.detachListeners();
      }

      private attachListeners() {
        if (this.domHandlers.length > 0) return;
        const view = this.view;

        const onDragStart: EventListener = (rawEvent) => {
          const e = rawEvent as DragEvent;
          const target = e.target as HTMLElement | null;
          if (!target) return;
          const badge = target.closest(".cb-inline-badge") as HTMLElement | null;
          if (!badge) return;

          const beatId = badge.getAttribute("data-cb-beat-id");
          if (!beatId) return;

          e.dataTransfer?.setData(DRAG_MIME, beatId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";

          view.dispatch({ effects: setDragSource.of(beatId) });
        };

        const onDragEnd: EventListener = () => {
          view.dispatch({ effects: setDragSource.of(null) });
          view.dispatch({ effects: setDropTarget.of(null) });
        };

        const onDragOver: EventListener = (rawEvent) => {
          const e = rawEvent as DragEvent;
          if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return;
          const text = view.state.doc.toString();
          const beats = parseSections(text).beats;
          const beat = beatAt(beats, pos);
          if (beat) {
            view.dispatch({ effects: setDropTarget.of(beat.id) });
          }
        };

        const onDrop: EventListener = (rawEvent) => {
          const e = rawEvent as DragEvent;
          e.preventDefault();
          const sourceId = e.dataTransfer?.getData(DRAG_MIME);
          if (!sourceId) return;

          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return;

          const text = view.state.doc.toString();
          const beats = parseSections(text).beats;
          const fromIdx = beats.findIndex((b) => b.id === sourceId);
          const targetBeat = beatAt(beats, pos);
          if (fromIdx === -1 || !targetBeat) return;
          const toIdx = beats.findIndex((b) => b.id === targetBeat.id);
          if (fromIdx === toIdx) return;

          const newText = moveBeatToPosition(text, beats, fromIdx, toIdx);
          if (newText !== text) {
            view.dispatch({
              changes: { from: 0, to: text.length, insert: newText },
              selection: { anchor: pos },
            });
          }

          view.dispatch({ effects: setDragSource.of(null) });
          view.dispatch({ effects: setDropTarget.of(null) });
        };

        const onDragLeave: EventListener = () => {
          view.dispatch({ effects: setDropTarget.of(null) });
        };

        const dom = view.contentDOM;
        dom.addEventListener("dragstart", onDragStart);
        dom.addEventListener("dragend", onDragEnd);
        dom.addEventListener("dragover", onDragOver);
        dom.addEventListener("drop", onDrop);
        dom.addEventListener("dragleave", onDragLeave);

        this.domHandlers = [
          ["dragstart", onDragStart],
          ["dragend", onDragEnd],
          ["dragover", onDragOver],
          ["drop", onDrop],
          ["dragleave", onDragLeave],
        ];
      }

      private detachListeners() {
        const dom = this.view.contentDOM;
        for (const [event, handler] of this.domHandlers) {
          dom.removeEventListener(event, handler);
        }
        this.domHandlers = [];
      }
    }
  );
}

// === Drop indicator decoration ===

function dropIndicatorPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.compute(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.transactions.length > 0) {
          this.decorations = this.compute(update.view);
        }
      }
      compute(view: EditorView): DecorationSet {
        const dropTargetId = view.state.field(dropTargetField, false);
        const dragSourceId = view.state.field(dragSourceField, false);
        if (!dropTargetId || !dragSourceId || dropTargetId === dragSourceId) {
          return Decoration.none;
        }
        const text = view.state.doc.toString();
        const beats = parseSections(text).beats;
        const target = beats.find((b) => b.id === dropTargetId);
        if (!target) return Decoration.none;

        const builder = new RangeSetBuilder<Decoration>();
        builder.add(
          target.markerStart,
          target.markerStart,
          Decoration.line({
            attributes: { class: "cb-drop-indicator" },
          })
        );
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

/**
 * Factory: produce the full beat-reorder extension with drag/drop + keymap.
 */
export function beatReorderExtension(): Extension {
  return [
    dragSourceField,
    dropTargetField,
    dragControllerPlugin(),
    dropIndicatorPlugin(),
    keymap.of([moveBeatUpKeymap, moveBeatDownKeymap]),
  ];
}
