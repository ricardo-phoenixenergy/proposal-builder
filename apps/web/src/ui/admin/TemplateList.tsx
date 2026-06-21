"use client";

import { useState } from "react";
import { builtInTemplates, type Template } from "@proposal/shared";
import { setTemplateDeprecated } from "../../client/templates";
import { useProposalStore } from "../../state/proposalStore";
import { TemplateEditor } from "./TemplateEditor";

function isBuiltIn(id: string): boolean {
  return builtInTemplates.some((t) => t.id === id);
}

export function TemplateList({
  templates,
  inUse,
  onChange,
}: {
  templates: Template[];
  inUse: string[];
  onChange: (t: Template[]) => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [editor, setEditor] = useState<{ initial?: Template; mode: "create" | "edit" } | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/templates");
    if (res.ok) onChange(((await res.json()) as { templates: Template[] }).templates);
  };

  const onDeprecate = async (id: string, deprecated: boolean) => {
    try {
      await setTemplateDeprecated(id, deprecated);
      await refresh();
    } catch {
      notify("error", "Couldn't update the template.");
    }
  };

  if (editor) {
    return (
      <TemplateEditor
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
        <h2>Templates</h2>
        <button type="button" className="btn btn--primary" onClick={() => setEditor({ mode: "create" })}>
          New template
        </button>
      </div>
      <ul className="stlist__rows">
        {templates.map((t) => {
          const builtin = isBuiltIn(t.id);
          const used = inUse.includes(t.id);
          return (
            <li key={t.id} data-template={t.id} className="stlist__row">
              <div className="stlist__main">
                <span className="stlist__label">{t.name}</span>
                <code className="stlist__key">{t.id}</code>
              </div>
              <div className="stlist__tags">
                <span className="tag">{builtin ? "built-in" : "authored"}</span>
                {used ? <span className="tag">in use</span> : null}
                {t.locked ? <span className="tag">locked</span> : null}
                {t.deprecated ? <span className="tag tag--unstyled">deprecated</span> : null}
              </div>
              <div className="stlist__actions">
                <button type="button" className="btn" onClick={() => setEditor({ initial: { ...t, id: `${t.id}_copy` }, mode: "create" })}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={builtin || used}
                  title={builtin ? "Built-ins are immutable — duplicate" : used ? "In use — duplicate to change" : undefined}
                  onClick={() => setEditor({ initial: t, mode: "edit" })}
                >
                  Edit
                </button>
                {builtin ? null : (
                  <button type="button" className="btn" onClick={() => void onDeprecate(t.id, !t.deprecated)}>
                    {t.deprecated ? "Restore" : "Deprecate"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
