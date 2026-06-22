import type { ValidationError, ValidationResult } from "./result";

const TYPE_KEY = /^[a-z][a-z0-9_]*$/;
const ALLOWED_FIELD_TYPES = ["text", "paragraph", "list", "dataset", "matrix", "image"] as const;
const ALLOWED_CATEGORIES = ["text", "data"] as const;
const LIMIT_KEYS = ["maxChars", "maxWords", "maxRows", "maxColumns", "maxSeries"] as const;

function isPositiveInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Meta-validation for an authored section-type definition (§5.1 Builder).
 * The "schema for schemas": guards what a user may author before it joins the
 * registry. Errors use field-pointer paths.
 */
export function validateSectionTypeDefinition(def: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message, source: "app" });

  if (typeof def !== "object" || def === null) {
    return { valid: false, errors: [{ path: "", message: "Expected a section-type object", source: "app" }] };
  }
  const d = def as Record<string, unknown>;

  if (typeof d["type"] !== "string" || !TYPE_KEY.test(d["type"])) {
    push("/type", "type must be a lowercase slug (letters, digits, underscore; starting with a letter)");
  }
  if (typeof d["label"] !== "string" || d["label"].trim() === "") {
    push("/label", "label is required");
  }
  if (!ALLOWED_CATEGORIES.includes(d["category"] as (typeof ALLOWED_CATEGORIES)[number])) {
    push("/category", 'category must be "text" or "data"');
  }

  const fields = d["fields"];
  if (!Array.isArray(fields) || fields.length === 0) {
    push("/fields", "at least one field is required");
  } else {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      const f = field as Record<string, unknown>;
      if (typeof f["key"] !== "string" || !TYPE_KEY.test(f["key"])) {
        push(`/fields/${i}/key`, "field key must be a lowercase slug");
      } else if (seen.has(f["key"])) {
        push(`/fields/${i}/key`, `duplicate field key "${f["key"]}"`);
      } else {
        seen.add(f["key"]);
      }
      if (typeof f["label"] !== "string" || f["label"].trim() === "") {
        push(`/fields/${i}/label`, "field label is required");
      }
      if (!ALLOWED_FIELD_TYPES.includes(f["type"] as (typeof ALLOWED_FIELD_TYPES)[number])) {
        push(`/fields/${i}/type`, "field type must be one of text, paragraph, list, dataset, matrix, image");
      }
      for (const limit of LIMIT_KEYS) {
        if (f[limit] !== undefined && !isPositiveInt(f[limit])) {
          push(`/fields/${i}/${limit}`, `${limit} must be a positive integer`);
        }
      }
    });
  }

  if (d["variants"] !== undefined) {
    if (!Array.isArray(d["variants"]) || d["variants"].some((v) => typeof v !== "string" || v === "")) {
      push("/variants", "variants must be an array of non-empty strings");
    }
  }

  return { valid: errors.length === 0, errors };
}
