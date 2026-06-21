import type { ProposalDocument } from "../types/document";
import type { Section } from "../types/section";
import type { Template } from "../types/template";
import { getSectionType } from "../registry/sectionTypes";
import { emptyDataForType } from "../template/emptyData";

/**
 * Scaffold a fresh document from a template (§7). Each slot becomes a section:
 * choice slots use the default type; fixed slots use their type, seeded with the
 * canonical `data` and fully locked when `lock: "fixed"`, otherwise blank for the
 * user to fill. Theme + template ids are pinned from the template.
 */
export function applyTemplate(
  template: Template,
  opts?: { id?: string; title?: string; client?: { name: string; contact?: string } },
): ProposalDocument {
  const sections: Section[] = template.slots.map((slot, i) => {
    const id = `slot_${i}`;

    if (slot.kind === "choice") {
      return { id, type: slot.default, data: emptyDataForType(slot.default) };
    }

    const typeSchema = getSectionType(slot.type);
    const section: Section = { id, type: slot.type, data: emptyDataForType(slot.type) };
    if (slot.variant) section.variant = slot.variant;

    if (slot.lock === "fixed") {
      section.data = { ...section.data, ...(slot.data ?? {}) };
      const locked: Record<string, boolean> = {};
      for (const field of typeSchema?.fields ?? []) locked[field.key] = true;
      section.locked = locked;
    }
    return section;
  });

  return {
    id: opts?.id ?? "prop_new",
    title: opts?.title ?? template.name,
    client: opts?.client ?? { name: "" },
    themeId: template.themeId,
    templateId: template.id,
    sections,
  };
}
