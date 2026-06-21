import type { ProposalDocument } from "../types/document";
import type { Template } from "../types/template";
import { getSectionType } from "../registry/sectionTypes";
import { validateDocument } from "./validateDocument";
import type { ValidationError, ValidationResult } from "./result";

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * The hard export gate (§9). Runs the full schema + app-layer validation, then —
 * for a locked template — enforces the template contract (§7): structure
 * conformance, choice-slot allowlist, immutable locked fields, and that every
 * editable-but-required field is filled. Returns field-pointed errors.
 */
export function validateForExport(document: ProposalDocument, template: Template): ValidationResult {
  const errors: ValidationError[] = [...validateDocument(document).errors];

  if (template.locked) {
    const slots = template.slots;
    if (document.sections.length !== slots.length) {
      errors.push({
        path: "/sections",
        message: `structure is locked: expected ${slots.length} sections, found ${document.sections.length}`,
        source: "app",
      });
    }

    document.sections.forEach((section, i) => {
      const slot = slots[i];
      if (!slot) return;
      const at = `/sections/${i}`;

      if (slot.kind === "fixed") {
        if (section.type !== slot.type) {
          errors.push({ path: `${at}/type`, message: `locked slot expects type "${slot.type}"`, source: "app" });
        }
        if (slot.lock === "fixed" && slot.data) {
          for (const [key, value] of Object.entries(slot.data)) {
            if (JSON.stringify(section.data[key]) !== JSON.stringify(value)) {
              errors.push({ path: `${at}/data/${key}`, message: `locked field "${key}" was changed`, source: "app" });
            }
          }
        }
      } else if (!slot.allowed.includes(section.type)) {
        errors.push({
          path: `${at}/type`,
          message: `choice slot allows only: ${slot.allowed.join(", ")}`,
          source: "app",
        });
      }

      // Editable-but-required must be filled (§7.2). Not checked on fully-fixed slots.
      const editable = slot.kind === "choice" || slot.lock !== "fixed";
      const typeSchema = getSectionType(section.type);
      if (editable && typeSchema) {
        for (const field of typeSchema.fields) {
          if (field.required && isEmpty(section.data[field.key])) {
            errors.push({
              path: `${at}/data/${field.key}`,
              message: `required field "${field.key}" must be filled`,
              source: "app",
            });
          }
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
