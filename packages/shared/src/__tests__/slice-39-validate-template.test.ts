import { describe, expect, it } from "vitest";
import { validateLayout } from "../validation/validateLayout";
import type { SectionTypeSchema } from "../types/section";

const type: SectionTypeSchema = {
  type: "cover_page",
  label: "Cover",
  category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [],
  schemaVersion: 1,
};
const base = {
  type: "cover_page",
  variant: "hero",
  pageFormat: "a4_portrait",
  name: "Hero",
  version: 1,
};

describe("validateLayout — template layouts", () => {
  it("accepts a layout with a non-empty template", () => {
    expect(validateLayout({ ...base, template: "<h1>{{title}}</h1>", css: "" }, type).valid).toBe(
      true,
    );
  });
  it("rejects a layout with neither template nor root", () => {
    expect(validateLayout({ ...base }, type).valid).toBe(false);
  });
  it("still accepts a legacy block layout", () => {
    expect(validateLayout({ ...base, root: { kind: "stack", children: [] } }, type).valid).toBe(
      true,
    );
  });

  it("accepts a template with valid css", () => {
    expect(
      validateLayout({ ...base, template: "<h1>{{title}}</h1>", css: ".x{color:red}" }, type).valid,
    ).toBe(true);
  });

  it("rejects a template whose css has a syntax error (authoring gate)", () => {
    const result = validateLayout(
      { ...base, template: "<h1>{{title}}</h1>", css: ".x{color:red" },
      type,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "/css")).toBe(true);
  });
});
