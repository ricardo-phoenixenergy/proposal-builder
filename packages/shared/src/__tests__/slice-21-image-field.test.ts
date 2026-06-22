import { afterEach, describe, expect, it } from "vitest";
import { fieldKind, buildGenerationDataSchema } from "../generation/generationSchema";
import { buildSectionSchema } from "../schema/section.schema";
import { emptyDataForType } from "../template/emptyData";
import { validateSectionTypeDefinition } from "../validation/validateSectionTypeDefinition";
import { setActiveSectionTypes, resetSectionTypesForTests } from "../registry/sectionTypes";
import type { SectionTypeSchema } from "../types/section";

const coverType: SectionTypeSchema = {
  type: "cover_test",
  label: "Cover (test)",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title", required: true, maxChars: 60 },
    { key: "coverImage", type: "image", label: "Cover image" },
  ],
  variants: [],
  schemaVersion: 1,
};

afterEach(() => resetSectionTypesForTests());

describe("image field type", () => {
  it("classifies image as a manual (non-AI) field", () => {
    expect(fieldKind({ key: "coverImage", type: "image" })).toBe("manual");
  });

  it("derives a string JSON Schema property for an image field", () => {
    const schema = buildSectionSchema([coverType]) as {
      allOf: { then: { properties: { data: { properties: Record<string, unknown> } } } }[];
    };
    const dataProps = schema.allOf[0]!.then.properties.data.properties;
    expect(dataProps.coverImage).toEqual({ type: "string" });
  });

  it("excludes a type with an image field from AI data generation", () => {
    expect(buildGenerationDataSchema(coverType)).toBeNull();
  });

  it("scaffolds an empty image field as an empty string", () => {
    setActiveSectionTypes([coverType]);
    expect(emptyDataForType("cover_test").coverImage).toBe("");
  });

  it("accepts a section-type definition with an image field", () => {
    const result = validateSectionTypeDefinition({
      type: "cover_test",
      label: "Cover",
      category: "text",
      fields: [{ key: "coverImage", type: "image", label: "Cover image" }],
    });
    expect(result.valid).toBe(true);
  });
});
