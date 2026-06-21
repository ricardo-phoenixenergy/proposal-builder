import type { Section } from "../types/section";
import type { Slot, Template } from "../types/template";

/** A locked template pins structure (no add/remove/reorder, variants read-only). */
export function isStructureLocked(template: Template): boolean {
  return template.locked;
}

/** A locked template pins the theme (theme controls read-only) — §7.1. */
export function isThemePinned(template: Template): boolean {
  return template.locked;
}

export function slotAt(template: Template, index: number): Slot | undefined {
  return template.slots[index];
}

/**
 * Whether a given field is locked for editing. Per-field `section.locked` wins;
 * otherwise a `lock: "fixed"` slot locks all its fields (§7.1, §7.2).
 */
export function isFieldLocked(
  template: Template,
  index: number,
  section: Section,
  fieldKey: string,
): boolean {
  if (section.locked?.[fieldKey]) return true;
  const slot = template.slots[index];
  return slot?.kind === "fixed" && slot.lock === "fixed";
}
