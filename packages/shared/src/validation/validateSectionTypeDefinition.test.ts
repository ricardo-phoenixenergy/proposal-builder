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

  it("rejects a non-text field type this slice", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [{ key: "data", type: "dataset", label: "Data", required: true }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "/fields/0/type")).toBe(true);
  });

  it("rejects a non-positive or non-integer limit", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [{ key: "h", type: "text", label: "H", maxChars: 0 }],
    });
    expect(r.valid).toBe(false);
  });
});
