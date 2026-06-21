import type { FieldSchema, SectionTypeSchema } from "../types/section";
import { builtInSectionTypes } from "../registry/sectionTypes";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** Maximum characters for an option name in a comparison matrix (§14.2). */
const MATRIX_OPTION_NAME_MAX = 24;

type JSONSchema = Record<string, unknown>;

/**
 * Turn one field definition into its JSON Schema property. Character/array
 * bounds live here; word counts and cross-field invariants are deferred to the
 * app validation layer (§14.2 note).
 */
function fieldToProperty(field: FieldSchema): JSONSchema {
  switch (field.type) {
    case "text":
    case "paragraph": {
      const prop: JSONSchema = { type: "string" };
      // maxWords is intentionally NOT expressed here — JSON Schema can't count
      // words. maxChars (if present) maps cleanly to maxLength.
      if (field.maxChars !== undefined) prop["maxLength"] = field.maxChars;
      return prop;
    }
    case "list": {
      const prop: JSONSchema = { type: "array", items: { type: "string" } };
      if (field.maxRows !== undefined) prop["maxItems"] = field.maxRows;
      return prop;
    }
    case "dataset":
      return datasetProperty(field);
    case "matrix":
      return matrixProperty(field);
  }
}

function datasetProperty(field: FieldSchema): JSONSchema {
  const columns: JSONSchema = {
    type: "array",
    items: {
      type: "object",
      required: ["key", "label", "type"],
      additionalProperties: false,
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { enum: ["text", "number"] },
      },
    },
  };
  if (field.maxColumns !== undefined) columns["maxItems"] = field.maxColumns;

  const rows: JSONSchema = { type: "array", items: { type: "object" } };
  if (field.maxRows !== undefined) rows["maxItems"] = field.maxRows;

  return {
    type: "object",
    required: ["columns", "rows"],
    additionalProperties: false,
    properties: {
      columns,
      rows,
      mapping: {
        type: "object",
        additionalProperties: false,
        properties: {
          categoryColumn: { type: "string" },
          valueColumns: { type: "array", items: { type: "string" } },
        },
      },
      chartType: { enum: ["bar", "line", "pie", "area"] },
    },
  };
}

function matrixProperty(field: FieldSchema): JSONSchema {
  const metrics: JSONSchema = { type: "array", items: { type: "string" } };
  if (field.maxRows !== undefined) metrics["maxItems"] = field.maxRows;

  const options: JSONSchema = {
    type: "array",
    items: {
      type: "object",
      required: ["name", "values"],
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: MATRIX_OPTION_NAME_MAX },
        values: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  };
  if (field.maxColumns !== undefined) options["maxItems"] = field.maxColumns;

  return {
    type: "object",
    required: ["metrics", "options"],
    additionalProperties: false,
    properties: { metrics, options },
  };
}

/** Build the `data` subschema for one section type from its fields. */
function dataSchemaFor(typeSchema: SectionTypeSchema): JSONSchema {
  const properties: JSONSchema = {};
  const required: string[] = [];
  for (const field of typeSchema.fields) {
    properties[field.key] = fieldToProperty(field);
    if (field.required) required.push(field.key);
  }
  return {
    type: "object",
    required,
    additionalProperties: false,
    properties,
  };
}

/**
 * Build the section JSON Schema by deriving one if/then branch per registered
 * section type. The registry is the single source of truth (§5.1); this is the
 * §14.2 schema, generated rather than hand-maintained, so it cannot drift.
 */
export function buildSectionSchema(types: SectionTypeSchema[]): JSONSchema {
  const allOf = types.map((t) => ({
    if: { properties: { type: { const: t.type } }, required: ["type"] },
    then: { properties: { data: dataSchemaFor(t) } },
  }));

  return {
    $schema: DRAFT,
    $id: "https://proposal.studio/schemas/section.json",
    type: "object",
    required: ["id", "type", "data"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      type: { type: "string" },
      variant: { type: "string" },
      locked: { type: "object", additionalProperties: { type: "boolean" } },
      pageBreakBefore: { type: "boolean" },
      data: { type: "object" },
    },
    allOf,
  };
}

export const sectionSchema = buildSectionSchema(builtInSectionTypes);
