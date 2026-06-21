import { describe, expect, it } from "vitest";
import type { Section } from "../types/section";
import type { ProposalDocument } from "../types/document";
import { buildSectionSchema } from "../schema/section.schema";
import { builtInSectionTypes } from "../registry/sectionTypes";
import { validateSection } from "../validation/validateSection";
import { validateDocument } from "../validation/validateDocument";
import { sampleProposal } from "../samples/sample-proposal";

/** Pull the `data` subschema for one section type out of the built allOf. */
function dataSchemaFor(type: string): any {
  const schema = buildSectionSchema(builtInSectionTypes) as any;
  const branch = schema.allOf.find(
    (b: any) => b.if?.properties?.type?.const === type,
  );
  return branch?.then?.properties?.data;
}

describe("buildSectionSchema — derives JSON Schema from the registry", () => {
  it("emits a draft-2020-12 section schema with id/type/data required and variant+locked allowed", () => {
    const schema = buildSectionSchema(builtInSectionTypes) as any;
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.required).toEqual(expect.arrayContaining(["id", "type", "data"]));
    expect(schema.properties).toHaveProperty("variant");
    expect(schema.properties).toHaveProperty("locked");
    expect(schema.additionalProperties).toBe(false);
  });

  it("derives executive_summary: heading maxLength 40, body has no maxLength (word limit is app-layer)", () => {
    const data = dataSchemaFor("executive_summary");
    expect(data.required).toEqual(expect.arrayContaining(["heading", "body"]));
    expect(data.additionalProperties).toBe(false);
    expect(data.properties.heading).toMatchObject({ type: "string", maxLength: 40 });
    expect(data.properties.body).toMatchObject({ type: "string" });
    expect(data.properties.body).not.toHaveProperty("maxLength");
  });

  it("derives commercial_comparison: metrics maxItems 8, options maxItems 4, option name maxLength 24", () => {
    const data = dataSchemaFor("commercial_comparison");
    const matrix = data.properties.matrix;
    expect(matrix.required).toEqual(expect.arrayContaining(["metrics", "options"]));
    expect(matrix.properties.metrics).toMatchObject({ type: "array", maxItems: 8 });
    expect(matrix.properties.options.maxItems).toBe(4);
    expect(matrix.properties.options.items.properties.name).toMatchObject({
      type: "string",
      maxLength: 24,
    });
  });
});

describe("validateSection — Ajv structure + app-layer rules", () => {
  it("accepts a well-formed executive_summary section", () => {
    const section: Section = {
      id: "s1",
      type: "executive_summary",
      data: { heading: "Summary", body: "Short and within limits." },
    };
    expect(validateSection(section)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a heading over maxChars (schema)", () => {
    const section: Section = {
      id: "s1",
      type: "executive_summary",
      data: { heading: "x".repeat(41), body: "ok" },
    };
    const result = validateSection(section);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("heading") && e.source === "schema")).toBe(true);
  });

  it("rejects a missing required field (schema)", () => {
    const section: Section = {
      id: "s1",
      type: "executive_summary",
      data: { heading: "Summary" },
    };
    const result = validateSection(section);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.toLowerCase().includes("body") || e.path.includes("body"))).toBe(true);
  });

  it("rejects unknown additional properties in data (schema)", () => {
    const section: Section = {
      id: "s1",
      type: "executive_summary",
      data: { heading: "Summary", body: "ok", colour: "#ff0000" },
    };
    const result = validateSection(section);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.source === "schema")).toBe(true);
  });

  it("rejects a paragraph over its word limit (app layer)", () => {
    const section: Section = {
      id: "s1",
      type: "executive_summary",
      data: { heading: "Summary", body: Array.from({ length: 151 }, () => "word").join(" ") },
    };
    const result = validateSection(section);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.source === "app" && e.path.includes("body"))).toBe(true);
  });

  it("rejects a 5th comparison option (schema maxItems)", () => {
    const opt = (name: string) => ({
      name,
      values: { "Upfront cost": "£0", "Unit rate": "—", Term: "—", Payback: "—" },
    });
    const section: Section = {
      id: "s1",
      type: "commercial_comparison",
      data: {
        matrix: {
          metrics: ["Upfront cost", "Unit rate", "Term", "Payback"],
          options: [opt("A"), opt("B"), opt("C"), opt("D"), opt("E")],
        },
      },
    };
    const result = validateSection(section);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.source === "schema")).toBe(true);
  });

  it("rejects a matrix option whose values keys don't match metrics (app layer)", () => {
    const section: Section = {
      id: "s1",
      type: "commercial_comparison",
      data: {
        matrix: {
          metrics: ["Upfront cost", "Payback"],
          options: [
            { name: "Capex", values: { "Upfront cost": "£280k", Payback: "6.2 yrs" } },
            { name: "PPA", values: { "Upfront cost": "£0", "Unit rate": "8.4p/kWh" } },
          ],
        },
      },
    };
    const result = validateSection(section);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.source === "app")).toBe(true);
  });
});

describe("validateDocument — the slice-1 validation point", () => {
  it("the sample ProposalDocument passes validation", () => {
    expect(validateDocument(sampleProposal)).toEqual({ valid: true, errors: [] });
  });

  it("reports section errors with a document-rooted path", () => {
    const broken: ProposalDocument = {
      ...sampleProposal,
      sections: [
        sampleProposal.sections[0]!,
        { id: "bad", type: "executive_summary", data: { heading: "x".repeat(41), body: "ok" } },
      ],
    };
    const result = validateDocument(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith("/sections/1/data"))).toBe(true);
  });

  it("rejects a malformed document envelope (missing title)", () => {
    const { title: _omit, ...rest } = sampleProposal;
    const result = validateDocument(rest as ProposalDocument);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.source === "schema")).toBe(true);
  });
});
