import { describe, expect, it } from "vitest";
import {
  fieldKind,
  buildTextFieldsGenerationSchema,
  buildFieldGenerationSchema,
} from "../generation/generationSchema";
import { getSectionType } from "../registry/sectionTypes";

describe("fieldKind", () => {
  it("maps text-shaped fields to ai, tabular to data", () => {
    expect(fieldKind({ key: "h", type: "text" })).toBe("ai");
    expect(fieldKind({ key: "b", type: "paragraph" })).toBe("ai");
    expect(fieldKind({ key: "l", type: "list" })).toBe("ai");
    expect(fieldKind({ key: "d", type: "dataset" })).toBe("data");
    expect(fieldKind({ key: "m", type: "matrix" })).toBe("data");
  });
});

describe("buildTextFieldsGenerationSchema", () => {
  it("includes only AI-composable fields for a text type", () => {
    const schema = buildTextFieldsGenerationSchema(getSectionType("executive_summary")!) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).toEqual(["heading", "body"]);
  });

  it("is null for a tabular-only type", () => {
    expect(buildTextFieldsGenerationSchema(getSectionType("commercial_comparison")!)).toBeNull();
    expect(buildTextFieldsGenerationSchema(getSectionType("data_table")!)).toBeNull();
  });
});

describe("buildFieldGenerationSchema", () => {
  it("wraps a single AI field as { value }", () => {
    const field = getSectionType("executive_summary")!.fields[0]!;
    const schema = buildFieldGenerationSchema(field) as {
      properties: { value: unknown };
      required: string[];
    };
    expect(schema.required).toEqual(["value"]);
    expect(schema.properties.value).toEqual({ type: "string" });
  });

  it("is null for a non-AI field", () => {
    const field = getSectionType("commercial_comparison")!.fields[0]!;
    expect(buildFieldGenerationSchema(field)).toBeNull();
  });
});
