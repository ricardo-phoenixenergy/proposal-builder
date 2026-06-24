import type { SectionTypeSchema } from "../types/section";
import type { ValidationError, ValidationResult } from "./result";

const ID_KEY = /^[a-z][a-z0-9_]*$/;
const LOCKS = ["open", "fixed", "editable-copy", "editable-data"] as const;

/**
 * Meta-validation for an authored template (§11 Builder). v1 authors `kind:"fixed"`
 * slots only; `choice` slots and per-template overrides are not authorable yet.
 * The caller supplies the known section types + theme ids so this stays pure.
 */
export function validateTemplateDefinition(
  def: unknown,
  ctx: { sectionTypes: SectionTypeSchema[]; themeIds: string[] },
): ValidationResult {
  const errors: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message, source: "app" });

  if (typeof def !== "object" || def === null) {
    return {
      valid: false,
      errors: [{ path: "", message: "Expected a template object", source: "app" }],
    };
  }
  const d = def as Record<string, unknown>;

  if (typeof d["id"] !== "string" || !ID_KEY.test(d["id"])) {
    push(
      "/id",
      "id must be a lowercase slug (letters, digits, underscore; starting with a letter)",
    );
  }
  if (typeof d["name"] !== "string" || d["name"].trim() === "") push("/name", "name is required");
  if (typeof d["themeId"] !== "string" || !ctx.themeIds.includes(d["themeId"])) {
    push("/themeId", "themeId must reference a known theme");
  }
  if (typeof d["locked"] !== "boolean") push("/locked", "locked must be a boolean");

  const slots = d["slots"];
  if (!Array.isArray(slots) || slots.length === 0) {
    push("/slots", "at least one slot is required");
  } else {
    slots.forEach((slot, i) => {
      const s = slot as Record<string, unknown>;
      if (s["kind"] === "choice") {
        push(`/slots/${i}/kind`, "choice slots aren't authorable yet");
        return;
      }
      if (s["kind"] !== "fixed") {
        push(`/slots/${i}/kind`, 'slot kind must be "fixed"');
        return;
      }
      const type = s["type"];
      const typeSchema =
        typeof type === "string" ? ctx.sectionTypes.find((t) => t.type === type) : undefined;
      if (!typeSchema) push(`/slots/${i}/type`, "slot type must be a known section type");
      if (!LOCKS.includes(s["lock"] as (typeof LOCKS)[number])) {
        push(`/slots/${i}/lock`, "lock must be one of open, fixed, editable-copy, editable-data");
      }
      const data = s["data"];
      if (data !== undefined) {
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          push(`/slots/${i}/data`, "data must be an object");
        } else if (typeSchema) {
          const textKeys = new Set(
            typeSchema.fields
              .filter((f) => f.type === "text" || f.type === "paragraph")
              .map((f) => f.key),
          );
          for (const k of Object.keys(data)) {
            if (!textKeys.has(k))
              push(`/slots/${i}/data/${k}`, `"${k}" is not a text field on ${String(type)}`);
          }
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
