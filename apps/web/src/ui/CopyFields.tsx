"use client";

import { getSectionType, isFieldLocked, openTemplate } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

/**
 * The "blanks to fill" surface (§7.2): editable text/paragraph fields for the
 * selected section. Locked fields (fixed content, or per-field locks) render
 * read-only; the export gate enforces immutability regardless.
 */
export function CopyFields({ sectionId, slotIndex }: { sectionId: string; slotIndex: number }) {
  const section = useProposalStore((s) => s.document.sections.find((x) => x.id === sectionId));
  const templateId = useProposalStore((s) => s.document.templateId);
  const templates = useProposalStore((s) => s.templates);
  const setSectionData = useProposalStore((s) => s.setSectionData);
  if (!section) return null;

  const template = templates.find((t) => t.id === templateId) ?? openTemplate;
  const fields = (getSectionType(section.type)?.fields ?? []).filter(
    (f) => f.type === "text" || f.type === "paragraph",
  );
  if (fields.length === 0) return null;

  const setField = (key: string, value: string) =>
    setSectionData(sectionId, { ...section.data, [key]: value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map((field) => {
        const locked = isFieldLocked(template, slotIndex, section, field.key);
        const value = typeof section.data[field.key] === "string" ? (section.data[field.key] as string) : "";
        const label = `${field.label ?? field.key}${field.required ? " *" : ""}${locked ? " · locked" : ""}`;
        return (
          <label className="field" key={field.key}>
            <span className="field__label">{label}</span>
            {field.type === "paragraph" ? (
              <textarea
                aria-label={`field-${field.key}`}
                rows={3}
                value={value}
                readOnly={locked}
                disabled={locked}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            ) : (
              <input
                aria-label={`field-${field.key}`}
                value={value}
                readOnly={locked}
                disabled={locked}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
