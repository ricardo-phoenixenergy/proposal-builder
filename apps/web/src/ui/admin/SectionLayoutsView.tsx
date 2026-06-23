"use client";

import { useEffect, useState } from "react";
import { getSectionType, PAGE_FORMATS, type SectionLayout } from "@proposal/shared";
import { fetchLayouts, deleteLayout } from "../../client/layouts";
import { useProposalStore } from "../../state/proposalStore";
import { LayoutEditor } from "./LayoutEditor";

type EditorState = { mode: "create" | "edit"; pageFormat: string; initial?: SectionLayout };

export function SectionLayoutsView({ type, onBack }: { type: string; onBack: () => void }) {
  const notify = useProposalStore((s) => s.notify);
  const [all, setAll] = useState<SectionLayout[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [newFormat, setNewFormat] = useState(PAGE_FORMATS[0]!.id);
  const typeSchema = getSectionType(type);

  const refresh = async () => {
    try {
      setAll(await fetchLayouts());
    } catch {
      notify("error", "Couldn't load layouts.");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const mine = all.filter((l) => l.type === type);

  if (editor) {
    return (
      <LayoutEditor
        type={type}
        pageFormat={editor.pageFormat}
        mode={editor.mode}
        {...(editor.initial ? { initial: editor.initial } : {})}
        onDone={async () => {
          setEditor(null);
          await refresh();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  const remove = async (l: SectionLayout) => {
    try {
      await deleteLayout(l.type, l.variant, l.pageFormat);
      notify("success", "Layout deleted.");
      await refresh();
    } catch {
      notify("error", "Delete failed.");
    }
  };

  return (
    <div className="steditor">
      <div className="stlist__head">
        <h2>Layouts · {typeSchema?.label ?? type}</h2>
        <button type="button" className="btn btn--ghost" onClick={onBack}>← Back</button>
      </div>

      <div className="field field--row">
        <select aria-label="New layout format" value={newFormat} onChange={(e) => setNewFormat(e.target.value)}>
          {PAGE_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn--primary" onClick={() => setEditor({ mode: "create", pageFormat: newFormat })}>
          New layout
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="meter">No authored layouts yet. Code variants still apply.</p>
      ) : (
        <ul className="stlist__rows">
          {mine.map((l) => (
            <li key={`${l.variant}:${l.pageFormat}`} className="stlist__row">
              <div className="stlist__main">
                <span>{l.name}</span>
                <span className="stlist__key">{l.variant} · {l.pageFormat}</span>
              </div>
              <div className="stlist__actions">
                <button type="button" className="btn" onClick={() => setEditor({ mode: "edit", pageFormat: l.pageFormat, initial: l })}>
                  Edit
                </button>
                <button type="button" className="btn btn--ghost" aria-label={`delete-${l.variant}-${l.pageFormat}`} onClick={() => void remove(l)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
