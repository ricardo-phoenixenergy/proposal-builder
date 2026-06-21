"use client";

import { useMemo, useState } from "react";
import { validateSectionTypeDefinition, type FieldSchema, type SectionTypeSchema } from "@proposal/shared";
import { createSectionType, updateSectionType } from "../../client/sectionTypes";
import { useProposalStore } from "../../state/proposalStore";

type DraftField = { key: string; label: string; type: "text" | "paragraph"; required: boolean; limit: string };

function toDef(typeKey: string, label: string, fields: DraftField[]): SectionTypeSchema {
  return {
    type: typeKey.trim(),
    label: label.trim(),
    category: "text",
    schemaVersion: 1,
    variants: [],
    fields: fields.map<FieldSchema>((f) => ({
      key: f.key.trim(),
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      ...(f.limit.trim() !== "" && f.type === "text" ? { maxChars: Number(f.limit) } : {}),
      ...(f.limit.trim() !== "" && f.type === "paragraph" ? { maxWords: Number(f.limit) } : {}),
    })),
  };
}

export function SectionTypeEditor({
  initial,
  mode = "create",
  onDone,
  onCancel,
}: {
  initial?: SectionTypeSchema;
  mode?: "create" | "edit";
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const editing = mode === "edit";
  const [typeKey, setTypeKey] = useState(initial?.type ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [fields, setFields] = useState<DraftField[]>(
    (initial?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label ?? "",
      type: f.type === "paragraph" ? "paragraph" : "text",
      required: !!f.required,
      limit: String(f.maxChars ?? f.maxWords ?? ""),
    })),
  );
  const [busy, setBusy] = useState(false);

  const def = useMemo(() => toDef(typeKey, label, fields), [typeKey, label, fields]);
  const result = useMemo(() => validateSectionTypeDefinition(def), [def]);

  const addField = () =>
    setFields((f) => [...f, { key: "", label: "", type: "text", required: false, limit: "" }]);
  const patch = (i: number, p: Partial<DraftField>) =>
    setFields((f) => f.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setFields((f) => f.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await updateSectionType(def.type, def);
      else await createSectionType(def);
      notify("success", editing ? "Type updated." : "Type created.");
      await onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="steditor">
      <h2>{editing ? "Edit type" : "New section type"}</h2>
      <p className="meter">Authored types render unstyled (generic fallback) until a developer registers a component.</p>

      <label className="field">
        <span className="field__label">Type key</span>
        <input aria-label="Type key" value={typeKey} disabled={editing} onChange={(e) => setTypeKey(e.target.value)} placeholder="case_study" />
      </label>
      <label className="field">
        <span className="field__label">Label</span>
        <input aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Case study" />
      </label>

      <div className="field">
        <span className="field__label">Fields</span>
        {fields.map((f, i) => (
          <div key={i} className="steditor__field">
            <input aria-label="Field key" value={f.key} onChange={(e) => patch(i, { key: e.target.value })} placeholder="key" />
            <input aria-label="Field label" value={f.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Label" />
            <select aria-label="Field type" value={f.type} onChange={(e) => patch(i, { type: e.target.value as DraftField["type"] })}>
              <option value="text">text</option>
              <option value="paragraph">paragraph</option>
            </select>
            <input
              aria-label="Field limit"
              type="number"
              value={f.limit}
              onChange={(e) => patch(i, { limit: e.target.value })}
              placeholder={f.type === "text" ? "max chars" : "max words"}
            />
            <label className="steditor__req">
              <input type="checkbox" checked={f.required} onChange={(e) => patch(i, { required: e.target.checked })} /> required
            </label>
            <button type="button" className="btn btn--ghost" onClick={() => remove(i)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={addField}>
          Add field
        </button>
      </div>

      {!result.valid ? (
        <ul className="notice notice--warn">
          {result.errors.map((e, i) => (
            <li key={i}>
              <code>{e.path}</code> — {e.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="steditor__actions">
        <button type="button" className="btn btn--primary" disabled={!result.valid || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
