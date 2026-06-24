"use client";
import { useEffect } from "react";
import { useTemporal } from "../state/useTemporal";

export function UndoRedo() {
  const { undo, redo, canUndo, canRedo } = useTemporal();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="undoredo" role="group" aria-label="Undo and redo">
      <button
        type="button"
        className="btn btn--ghost"
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => undo()}
      >
        ↺ Undo
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={() => redo()}
      >
        ↻ Redo
      </button>
    </div>
  );
}
