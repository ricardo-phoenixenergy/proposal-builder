"use client";

import { useMemo, useState } from "react";
import {
  validateSectionTypeDefinition,
  type FieldSchema,
  type SectionTypeSchema,
} from "@proposal/shared";
import { createSectionType, updateSectionType } from "../../client/sectionTypes";
import { useProposalStore } from "../../state/proposalStore";

type DraftFieldType = "text" | "paragraph" | "list" | "dataset" | "matrix" | "image";
type LimitKey = "maxChars" | "maxWords" | "maxRows" | "maxColumns" | "maxSeries";

type DraftField = {
  key: string;
  label: string;
  type: DraftFieldType;
  required: boolean;
  maxChars: string;
  maxWords: string;
  maxRows: string;
  maxColumns: string;
  maxSeries: string;
};

const FIELD_TYPES: DraftFieldType[] = ["text", "paragraph", "list", "dataset", "matrix", "image"];

/** Which limit inputs apply to each field type, with friendly placeholders. */
function limitsFor(type: DraftFieldType): { key: LimitKey; placeholder: string }[] {
  switch (type) {
    case "text":
      return [{ key: "maxChars", placeholder: "max chars" }];
    case "paragraph":
      return [{ key: "maxWords", placeholder: "max words" }];
    case "list":
      return [{ key: "maxRows", placeholder: "max items" }];
    case "dataset":
      return [
        { key: "maxRows", placeholder: "max rows" },
        { key: "maxColumns", placeholder: "max cols" },
        { key: "maxSeries", placeholder: "max series" },
      ];
    case "matrix":
      return [
        { key: "maxRows", placeholder: "max metrics" },
        { key: "maxColumns", placeholder: "max options" },
      ];
    case "image":
      return []; // no limits for image fields
  }
}

/** A data type is one that carries a tabular field (dataset/matrix); everything else is text. */
function deriveCategory(fields: DraftField[]): "text" | "data" {
  return fields.some((f) => f.type === "dataset" || f.type === "matrix") ? "data" : "text";
}

function toDef(typeKey: string, label: string, fields: DraftField[]): SectionTypeSchema {
  const num = (s: string): number | undefined => (s.trim() !== "" ? Number(s) : undefined);
  return {
    type: typeKey.trim(),
    label: label.trim(),
    category: deriveCategory(fields),
    schemaVersion: 1,
    variants: [],
    fields: fields.map<FieldSchema>((f) => {
      const base: FieldSchema = {
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
      };
      for (const { key } of limitsFor(f.type)) {
        const v = num(f[key]);
        if (v !== undefined) base[key] = v;
      }
      return base;
    }),
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
      type: f.type,
      required: !!f.required,
      maxChars: String(f.maxChars ?? ""),
      maxWords: String(f.maxWords ?? ""),
      maxRows: String(f.maxRows ?? ""),
      maxColumns: String(f.maxColumns ?? ""),
      maxSeries: String(f.maxSeries ?? ""),
    })),
  );
  const [busy, setBusy] = useState(false);

  const def = useMemo(() => toDef(typeKey, label, fields), [typeKey, label, fields]);
  const result = useMemo(() => validateSectionTypeDefinition(def), [def]);

  const addField = () =>
    setFields((f) => [
      ...f,
      {
        key: "",
        label: "",
        type: "text",
        required: false,
        maxChars: "",
        maxWords: "",
        maxRows: "",
        maxColumns: "",
        maxSeries: "",
      },
    ]);
  const patch = (i: number, p: Partial<DraftField>) =>
    setFields((f) => f.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setFields((f) => f.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    try {
      if (editing && initial) {
        // Preserve developer-authored layout metadata the editor doesn't surface —
        // variants/ranges/defaultVariant and schemaVersion — while taking the
        // edited label, fields, and derived category. Key is immutable on edit.
        const merged: SectionTypeSchema = {
          ...initial,
          type: initial.type,
          label: def.label,
          category: def.category,
          fields: def.fields,
        };
        await updateSectionType(initial.type, merged);
      } else {
        await createSectionType(def);
      }
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
      <p className="meter">
        Types render unstyled (generic fallback) until a developer registers a component. Editing a
        built-in saves an override; the original stays as a fallback.
      </p>

      <label className="field">
        <span className="field__label">Type key</span>
        <input
          aria-label="Type key"
          value={typeKey}
          disabled={editing}
          onChange={(e) => setTypeKey(e.target.value)}
          placeholder="case_study"
        />
      </label>
      <label className="field">
        <span className="field__label">Label</span>
        <input
          aria-label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Case study"
        />
      </label>
      <p className="meter">
        Category: <strong>{def.category}</strong> (a dataset or matrix field makes a type “data”).
      </p>

      <div className="field">
        <span className="field__label">Fields</span>
        {fields.map((f, i) => (
          <div key={i} className="steditor__field">
            <input
              aria-label="Field key"
              value={f.key}
              onChange={(e) => patch(i, { key: e.target.value })}
              placeholder="key"
            />
            <input
              aria-label="Field label"
              value={f.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder="Label"
            />
            <select
              aria-label="Field type"
              value={f.type}
              onChange={(e) => patch(i, { type: e.target.value as DraftFieldType })}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {limitsFor(f.type).map((lim) => (
              <input
                key={lim.key}
                aria-label={`Field ${lim.placeholder}`}
                type="number"
                value={f[lim.key]}
                onChange={(e) => patch(i, { [lim.key]: e.target.value })}
                placeholder={lim.placeholder}
              />
            ))}
            <label className="steditor__req">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => patch(i, { required: e.target.checked })}
              />{" "}
              required
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
        <button
          type="button"
          className="btn btn--primary"
          disabled={!result.valid || busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
