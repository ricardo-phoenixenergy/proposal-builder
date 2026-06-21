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
