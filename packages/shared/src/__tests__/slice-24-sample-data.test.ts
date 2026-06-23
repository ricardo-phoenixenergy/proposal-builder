import { afterEach, describe, expect, it } from "vitest";
import { sampleDataForType } from "../render/sampleData";
import { setActiveSectionTypes, resetSectionTypesForTests } from "../registry/sectionTypes";
import type { SectionTypeSchema } from "../types/section";

const t: SectionTypeSchema = {
  type: "cover_s", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "body", type: "paragraph", label: "Body" },
    { key: "bullets", type: "list", label: "Bullets" },
    { key: "metrics", type: "dataset", label: "Metrics" },
    { key: "compare", type: "matrix", label: "Compare" },
    { key: "cover_image", type: "image", label: "Cover image" },
  ],
  variants: [], schemaVersion: 1,
};

afterEach(() => resetSectionTypesForTests());

describe("sampleDataForType", () => {
  it("produces representative placeholder data per field kind", () => {
    setActiveSectionTypes([t]);
    const d = sampleDataForType("cover_s");
    expect(typeof d.title).toBe("string");
    expect((d.title as string).length).toBeGreaterThan(0);
    expect(typeof d.body).toBe("string");
    expect(Array.isArray(d.bullets)).toBe(true);
    expect((d.bullets as string[]).length).toBeGreaterThan(0);
    expect(d.metrics).toMatchObject({ columns: expect.any(Array), rows: expect.any(Array) });
    expect((d.metrics as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    expect(d.compare).toMatchObject({ metrics: expect.any(Array), options: expect.any(Array) });
    expect(typeof d.cover_image).toBe("string");
    expect((d.cover_image as string).startsWith("http")).toBe(true);
  });

  it("returns {} for an unknown type", () => {
    expect(sampleDataForType("nope")).toEqual({});
  });
});
