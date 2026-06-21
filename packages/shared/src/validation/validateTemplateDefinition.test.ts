import { describe, expect, it } from "vitest";
import { validateTemplateDefinition } from "./validateTemplateDefinition";
import type { SectionTypeSchema } from "../types/section";

const sectionTypes: SectionTypeSchema[] = [
  { type: "text", label: "Text", category: "text", variants: [], schemaVersion: 1,
    fields: [{ key: "heading", type: "text" }, { key: "body", type: "paragraph" }] },
  { type: "executive_summary", label: "Exec", category: "text", variants: [], schemaVersion: 1,
    fields: [{ key: "summary", type: "paragraph" }] },
];
const ctx = { sectionTypes, themeIds: ["theme_phoenix_default", "theme_midnight"] };

const valid = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [
    { kind: "fixed", type: "text", lock: "editable-copy" },
    { kind: "fixed", type: "text", lock: "fixed", data: { heading: "Terms", body: "..." } },
  ],
};

describe("validateTemplateDefinition", () => {
  it("accepts a well-formed fixed-slot template", () => {
    expect(validateTemplateDefinition(valid, ctx).valid).toBe(true);
  });

  it("rejects a bad id, empty name, and unknown theme", () => {
    expect(validateTemplateDefinition({ ...valid, id: "Bad Id" }, ctx).valid).toBe(false);
    expect(validateTemplateDefinition({ ...valid, name: "  " }, ctx).valid).toBe(false);
    expect(validateTemplateDefinition({ ...valid, themeId: "nope" }, ctx).valid).toBe(false);
  });

  it("requires a non-empty slots array", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [] }, ctx).valid).toBe(false);
  });

  it("rejects an unknown slot type and a bad lock", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "fixed", type: "ghost", lock: "open" }] }, ctx).valid).toBe(false);
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "fixed", type: "text", lock: "weird" }] }, ctx).valid).toBe(false);
  });

  it("rejects a choice slot (not authorable in v1)", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "choice", allowed: ["text"], default: "text", lock: "choice" }] }, ctx).valid).toBe(false);
  });

  it("rejects fixed data referencing a non-text or unknown field", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "fixed", type: "text", lock: "fixed", data: { nope: "x" } }] }, ctx).valid).toBe(false);
  });
});
