import { describe, expect, it } from "vitest";
import { SELECTABLE_MODELS, DEFAULT_MODEL, isSelectableModel } from "../generation/models";
import { buildGenerationDataSchema } from "../generation/generationSchema";
import { getSectionType } from "../registry/sectionTypes";

describe("SELECTABLE_MODELS — frontend-selectable allowlist", () => {
  it("includes the default and rejects unknown ids", () => {
    expect(SELECTABLE_MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
    expect(isSelectableModel(DEFAULT_MODEL)).toBe(true);
    expect(isSelectableModel("gpt-4o")).toBe(false);
    expect(isSelectableModel("claude-opus-4-8")).toBe(true);
  });
});

describe("buildGenerationDataSchema — structured-output-safe schema", () => {
  it("derives a strings-only schema for a text section with required + additionalProperties:false, no length bounds", () => {
    const schema = buildGenerationDataSchema(getSectionType("executive_summary")!) as any;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(["heading", "body"]));
    expect(schema.properties.heading).toEqual({ type: "string" });
    expect(schema.properties.body).toEqual({ type: "string" });
    // Structured Outputs does NOT support maxLength/maxItems — must be absent.
    expect(JSON.stringify(schema)).not.toContain("maxLength");
    expect(JSON.stringify(schema)).not.toContain("maxItems");
  });
});
