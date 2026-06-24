// packages/shared/src/validation/validateSectionTypeDefinition.test.ts
import { describe, expect, it } from "vitest";
import { validateSectionTypeDefinition } from "./validateSectionTypeDefinition";

const valid = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [
    { key: "heading", type: "text", label: "Heading", required: true, maxChars: 80 },
    { key: "body", type: "paragraph", label: "Body", maxWords: 200 },
  ],
  variants: [],
  schemaVersion: 1,
};

describe("validateSectionTypeDefinition (schema for schemas)", () => {
  it("accepts a well-formed text type", () => {
    expect(validateSectionTypeDefinition(valid)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a bad type key", () => {
    const r = validateSectionTypeDefinition({ ...valid, type: "Case Study" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "/type")).toBe(true);
  });

  it("rejects an empty label", () => {
    expect(validateSectionTypeDefinition({ ...valid, label: "" }).valid).toBe(false);
  });

  it("requires at least one field", () => {
    expect(validateSectionTypeDefinition({ ...valid, fields: [] }).valid).toBe(false);
  });

  it("rejects duplicate field keys", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [valid.fields[0], { ...valid.fields[0] }],
    });
    expect(r.valid).toBe(false);
  });

  it("accepts a data-category type with a dataset field and its limits", () => {
    const r = validateSectionTypeDefinition({
      type: "metrics_table",
      label: "Metrics table",
      category: "data",
      fields: [
        {
          key: "dataset",
          type: "dataset",
          label: "Dataset",
          required: true,
          maxRows: 50,
          maxColumns: 8,
          maxSeries: 6,
        },
      ],
      variants: [],
      schemaVersion: 1,
    });
    expect(r).toEqual({ valid: true, errors: [] });
  });

  it("accepts list and matrix field types", () => {
    expect(
      validateSectionTypeDefinition({
        ...valid,
        fields: [{ key: "points", type: "list", label: "Points", maxRows: 6 }],
      }).valid,
    ).toBe(true);
    expect(
      validateSectionTypeDefinition({
        type: "compare",
        label: "Compare",
        category: "data",
        fields: [
          {
            key: "matrix",
            type: "matrix",
            label: "Matrix",
            required: true,
            maxRows: 8,
            maxColumns: 4,
          },
        ],
        variants: [],
        schemaVersion: 1,
      }).valid,
    ).toBe(true);
  });

  it("rejects an unknown field type", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [{ key: "blob", type: "blob", label: "Blob", required: true }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "/fields/0/type")).toBe(true);
  });

  it("rejects an invalid category", () => {
    expect(validateSectionTypeDefinition({ ...valid, category: "widget" }).valid).toBe(false);
  });

  it("rejects a non-positive or non-integer limit", () => {
    expect(
      validateSectionTypeDefinition({
        ...valid,
        fields: [{ key: "h", type: "text", label: "H", maxChars: 0 }],
      }).valid,
    ).toBe(false);
    expect(
      validateSectionTypeDefinition({
        type: "t",
        label: "T",
        category: "data",
        fields: [{ key: "d", type: "dataset", label: "D", maxRows: -1 }],
        variants: [],
        schemaVersion: 1,
      }).valid,
    ).toBe(false);
  });
});
