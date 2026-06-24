import type { ProposalDocument } from "@proposal/shared";
import { emptyDataForType, getSectionType } from "@proposal/shared";

/**
 * Set a section's chosen variant, immutably. Touches only that section's
 * `variant` — never its `data` and never sibling sections — which is what makes
 * variant swapping safe under the three-layer split (§5.3).
 */
export function setSectionVariant(
  doc: ProposalDocument,
  sectionId: string,
  variant: string,
): ProposalDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === sectionId ? { ...section, variant } : section,
    ),
  };
}

/**
 * Replace a single section's `data`, immutably. Per-section regeneration and
 * grid/matrix edits both go through this — it never clobbers other sections.
 */
export function setSectionData(
  doc: ProposalDocument,
  sectionId: string,
  data: Record<string, unknown>,
): ProposalDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === sectionId ? { ...section, data } : section,
    ),
  };
}

/**
 * Switch a section's type — used by a choice slot's sanctioned-type toggle (§7.3).
 * Resets `data` to the new type's blanks and clears the chosen variant, since the
 * old variant/data belong to the old type.
 */
export function setSectionType(
  doc: ProposalDocument,
  sectionId: string,
  type: string,
): ProposalDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === sectionId ? { id: section.id, type, data: emptyDataForType(type) } : section,
    ),
  };
}

/** Append a new section of `type` with default data. Pure; returns a new document. */
export function appendSection(document: ProposalDocument, type: string): ProposalDocument {
  const schema = getSectionType(type);
  const id = `sec_${crypto.randomUUID().slice(0, 8)}`;
  const section = {
    id,
    type,
    ...(schema?.defaultVariant ? { variant: schema.defaultVariant } : {}),
    data: emptyDataForType(type),
  };
  return { ...document, sections: [...document.sections, section] };
}

/** Insert a new section of `type` (schema-default data) at `index` (clamped). Pure. */
export function insertSection(
  document: ProposalDocument,
  type: string,
  index: number,
): ProposalDocument {
  const schema = getSectionType(type);
  const id = `sec_${crypto.randomUUID().slice(0, 8)}`;
  const section = {
    id,
    type,
    ...(schema?.defaultVariant ? { variant: schema.defaultVariant } : {}),
    data: emptyDataForType(type),
  };
  const at = Math.max(0, Math.min(index, document.sections.length));
  return {
    ...document,
    sections: [...document.sections.slice(0, at), section, ...document.sections.slice(at)],
  };
}

/** Remove a section by id, immutably. No-op if the id is absent. */
export function removeSection(document: ProposalDocument, sectionId: string): ProposalDocument {
  return { ...document, sections: document.sections.filter((s) => s.id !== sectionId) };
}

/** Toggle a section's manual page break, immutably. */
export function setSectionPageBreak(
  doc: ProposalDocument,
  sectionId: string,
  value: boolean,
): ProposalDocument {
  return {
    ...doc,
    sections: doc.sections.map((s) => (s.id === sectionId ? { ...s, pageBreakBefore: value } : s)),
  };
}
