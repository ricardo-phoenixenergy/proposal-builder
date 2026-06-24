"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Section, SectionTypeSchema, Template } from "@proposal/shared";
import { fieldKind, isFieldLocked } from "@proposal/shared";
import { DataGrid } from "../DataGrid";
import { ColumnMapping } from "../ColumnMapping";
import { MatrixEditor } from "../MatrixEditor";
import { ImageField } from "../ImageField";

export function FieldArea({
  section,
  selectedIndex,
  typeSchema,
  template,
  busyFields,
  fieldInstr,
  setFieldInstr,
  setField,
  rewriteField,
}: {
  section: Section;
  selectedIndex: number;
  typeSchema: SectionTypeSchema;
  template: Template;
  busyFields: Set<string>;
  fieldInstr: Record<string, string>;
  setFieldInstr: Dispatch<SetStateAction<Record<string, string>>>;
  setField: (key: string, value: unknown) => void;
  rewriteField: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {typeSchema.fields.map((field) => {
        const kind = fieldKind(field);
        const locked = isFieldLocked(template, selectedIndex, section, field.key);
        const label = `${field.label ?? field.key}${field.required ? " *" : ""}${locked ? " · locked" : ""}`;

        if (kind === "data") {
          // Tabular fields use the dedicated editors (never AI).
          if (section.type === "data_table") {
            return (
              <div className="field" key={field.key}>
                <span className="field__label">{label}</span>
                <DataGrid sectionId={section.id} />
                <ColumnMapping sectionId={section.id} />
              </div>
            );
          }
          if (section.type === "commercial_comparison") {
            return (
              <div className="field" key={field.key}>
                <span className="field__label">{label}</span>
                <MatrixEditor sectionId={section.id} />
              </div>
            );
          }
          return null;
        }

        if (kind === "manual") {
          const value =
            typeof section.data[field.key] === "string" ? (section.data[field.key] as string) : "";
          if (field.type === "image") {
            return (
              <ImageField
                key={field.key}
                label={label}
                fieldKey={field.key}
                value={value}
                disabled={locked}
                onChange={(url) => setField(field.key, url)}
              />
            );
          }
          return (
            <label className="field" key={field.key}>
              <span className="field__label">{label}</span>
              <input
                aria-label={`field-${field.key}`}
                value={value}
                readOnly={locked}
                disabled={locked}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            </label>
          );
        }

        // kind === "ai": text | paragraph | list
        const raw = section.data[field.key];
        const isList = field.type === "list";
        const textValue = isList
          ? Array.isArray(raw)
            ? (raw as string[]).join("\n")
            : ""
          : typeof raw === "string"
            ? raw
            : "";
        const onChange = (v: string) =>
          setField(field.key, isList ? v.split("\n").filter((x) => x.length > 0) : v);

        return (
          <div className="field" key={field.key}>
            <span className="field__label">{label}</span>
            {field.type === "text" ? (
              <input
                aria-label={`field-${field.key}`}
                value={textValue}
                readOnly={locked}
                disabled={locked}
                onChange={(e) => onChange(e.target.value)}
              />
            ) : (
              <textarea
                aria-label={`field-${field.key}`}
                rows={isList ? 4 : 3}
                value={textValue}
                readOnly={locked}
                disabled={locked}
                placeholder={isList ? "One item per line" : undefined}
                onChange={(e) => onChange(e.target.value)}
              />
            )}
            {!locked ? (
              <div className="field field--row">
                <input
                  aria-label={`instruction-${field.key}`}
                  placeholder="Field instruction (optional)"
                  value={fieldInstr[field.key] ?? ""}
                  onChange={(e) => setFieldInstr((m) => ({ ...m, [field.key]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busyFields.has(field.key)}
                  onClick={() => rewriteField(field.key)}
                >
                  Rewrite field
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
