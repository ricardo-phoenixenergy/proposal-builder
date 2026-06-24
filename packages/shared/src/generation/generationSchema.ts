import type { FieldSchema, SectionTypeSchema } from "../types/section";

type JSONSchema = Record<string, unknown>;

/**
 * Map a field to a Structured-Outputs-safe schema. Structured Outputs supports
 * structure, enums, required, and `additionalProperties:false` — but NOT
 * `maxLength`/`maxItems`/numeric bounds, and NOT `additionalProperties` set to a
 * schema. So this emits structure only; the word/char/row limits are enforced
 * afterwards by validateSection (§9: constrain at generation, enforce at the gate).
 *
 * Only text-shaped fields are expressible here. Data fields (dataset/matrix) use
 * dynamic maps that Structured Outputs can't represent, and per §6.1 their data
 * comes from the user (grid/import), not the AI — so they're not generated.
 */
function fieldToGenerationSchema(field: FieldSchema): JSONSchema | null {
  switch (field.type) {
    case "text":
    case "paragraph":
      return { type: "string" };
    case "list":
      return { type: "array", items: { type: "string" } };
    case "image":
      return null; // user-uploaded, never AI-generated
    case "dataset":
    case "matrix":
      return null; // not AI-generated
  }
}

/**
 * Build the `data` schema for a text-category section type, suitable as a
 * Structured Outputs `json_schema` format. Returns null if any field can't be
 * generated (i.e. a data-category type).
 */
export function buildGenerationDataSchema(typeSchema: SectionTypeSchema): JSONSchema | null {
  const properties: JSONSchema = {};
  const required: string[] = [];
  for (const field of typeSchema.fields) {
    const fieldSchema = fieldToGenerationSchema(field);
    if (fieldSchema === null) return null;
    properties[field.key] = fieldSchema;
    if (field.required) required.push(field.key);
  }
  return { type: "object", required, additionalProperties: false, properties };
}

export type FieldKind = "ai" | "data" | "manual";

/** Classify a field: text-shaped = AI-composable; tabular = manual data; anything else = plain. */
export function fieldKind(field: FieldSchema): FieldKind {
  switch (field.type) {
    case "text":
    case "paragraph":
    case "list":
      return "ai";
    case "dataset":
    case "matrix":
      return "data";
    case "image":
      return "manual";
    default:
      return "manual";
  }
}

/** Generation schema over AI-composable fields ONLY (skips tabular). Null if none. */
export function buildTextFieldsGenerationSchema(typeSchema: SectionTypeSchema): JSONSchema | null {
  const properties: JSONSchema = {};
  const required: string[] = [];
  for (const field of typeSchema.fields) {
    if (fieldKind(field) !== "ai") continue;
    const fieldSchema = fieldToGenerationSchema(field);
    if (fieldSchema === null) continue;
    properties[field.key] = fieldSchema;
    if (field.required) required.push(field.key);
  }
  if (Object.keys(properties).length === 0) return null;
  return { type: "object", required, additionalProperties: false, properties };
}

/** Generation schema for one AI-composable field, as { value }. Null otherwise. */
export function buildFieldGenerationSchema(field: FieldSchema): JSONSchema | null {
  if (fieldKind(field) !== "ai") return null;
  const fieldSchema = fieldToGenerationSchema(field);
  if (fieldSchema === null) return null;
  return {
    type: "object",
    required: ["value"],
    additionalProperties: false,
    properties: { value: fieldSchema },
  };
}
