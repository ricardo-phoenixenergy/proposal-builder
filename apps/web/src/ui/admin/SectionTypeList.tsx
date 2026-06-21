"use client";

import { useState } from "react";
import { builtInSectionTypes, type SectionTypeSchema } from "@proposal/shared";
import { resolveSection } from "../../registry/componentRegistry";
import { setSectionTypeDeprecated } from "../../client/sectionTypes";
import { useProposalStore } from "../../state/proposalStore";
import { SectionTypeEditor } from "./SectionTypeEditor";

function isBuiltIn(type: string): boolean {
  return builtInSectionTypes.some((t) => t.type === type);
}
/** The schema editor only surfaces text/paragraph fields, so only such types can be edited faithfully. */
function canEditWithEditor(t: SectionTypeSchema): boolean {
  return t.category === "text" && t.fields.every((f) => f.type === "text" || f.type === "paragraph");
}
function hasComponent(type: string): boolean {
  // a type renders styled only if a non-fallback component resolves for some variant
  return !resolveSection({ id: "_probe", type, data: {} }).unstyled;
}

export function SectionTypeList({
  types,
  inUse,
  onChange,
}: {
  types: SectionTypeSchema[];
  inUse: string[];
  onChange: (t: SectionTypeSchema[]) => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [editor, setEditor] = useState<{ initial?: SectionTypeSchema; mode: "create" | "edit" } | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/section-types");
    if (res.ok) onChange(((await res.json()) as { sectionTypes: SectionTypeSchema[] }).sectionTypes);
  };

  const onDeprecate = async (type: string, deprecated: boolean) => {
    try {
      await setSectionTypeDeprecated(type, deprecated);
      await refresh();
    } catch {
      notify("error", "Couldn't update the type.");
    }
  };

  if (editor) {
    return (
      <SectionTypeEditor
        {...(editor.initial ? { initial: editor.initial } : {})}
        mode={editor.mode}
        onDone={async () => {
          setEditor(null);
          await refresh();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <div className="stlist">
      <div className="stlist__head">
        <h2>Section types</h2>
        <button type="button" className="btn btn--primary" onClick={() => setEditor({ mode: "create" })}>
          New type
        </button>
      </div>
      <ul className="stlist__rows">
        {types.map((t) => {
          const builtin = isBuiltIn(t.type);
          const used = inUse.includes(t.type);
          const unstyled = !hasComponent(t.type);
          const editable = canEditWithEditor(t);
          const editTitle = used
            ? "In use — duplicate to change"
            : !editable
              ? "Editing data/matrix types isn't supported yet — duplicate"
              : builtin
                ? "Saves an override (the built-in stays as a fallback)"
                : undefined;
          return (
            <li key={t.type} data-type={t.type} className="stlist__row">
              <div className="stlist__main">
                <span className="stlist__label">{t.label}</span>
                <code className="stlist__key">{t.type}</code>
              </div>
              <div className="stlist__tags">
                <span className="tag">{builtin ? "built-in" : "authored"}</span>
                {used ? <span className="tag">in use</span> : null}
                {t.deprecated ? <span className="tag tag--unstyled">deprecated</span> : null}
                {unstyled ? <span className="tag tag--unstyled">unstyled</span> : null}
              </div>
              <div className="stlist__actions">
                <button type="button" className="btn" onClick={() => setEditor({ initial: { ...t, type: `${t.type}_copy` }, mode: "create" })}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={used || !editable}
                  {...(editTitle ? { title: editTitle } : {})}
                  onClick={() => setEditor({ initial: t, mode: "edit" })}
                >
                  Edit
                </button>
                <button type="button" className="btn" onClick={() => void onDeprecate(t.type, !t.deprecated)}>
                  {t.deprecated ? "Restore" : "Deprecate"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
