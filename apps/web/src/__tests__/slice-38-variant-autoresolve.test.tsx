import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  setActiveLayouts,
  resetLayoutsForTests,
  type SectionLayout,
  type SectionTypeSchema,
} from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";

// Authored cover type WITHOUT a defaultVariant — exactly how the Builder creates it.
const coverType: SectionTypeSchema = {
  type: "cover_page",
  label: "Cover page",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "hero", type: "image", label: "Hero image" },
  ],
  variants: [],
  schemaVersion: 1,
};

const heroLayout: SectionLayout = {
  type: "cover_page",
  variant: "hero",
  pageFormat: "a4_portrait",
  name: "Hero",
  root: { kind: "stack", children: [{ kind: "image", field: "hero" }] },
  version: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  resetLayoutsForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  resetSectionTypesForTests();
  resetLayoutsForTests();
});

const section = { id: "s1", type: "cover_page", data: { title: "Acme", hero: "x.png" } };

describe("resolveSection auto-resolves an authored layout when no variant is chosen", () => {
  it("uses the sole authored layout for the format even though the section has no variant", () => {
    setActiveLayouts([heroLayout]);
    const resolved = resolveSection(section, undefined, "a4_portrait");
    expect(resolved.unstyled).toBe(false);
    expect(resolved.variant).toBe("hero");
  });

  it("still falls back to unstyled when NO layout exists for this format", () => {
    setActiveLayouts([{ ...heroLayout, pageFormat: "a4_landscape" }]);
    const resolved = resolveSection(section, undefined, "a4_portrait");
    expect(resolved.unstyled).toBe(true);
  });

  it("respects an explicitly chosen variant over the auto-default", () => {
    setActiveLayouts([heroLayout, { ...heroLayout, variant: "minimal", name: "Minimal" }]);
    const resolved = resolveSection({ ...section, variant: "minimal" }, undefined, "a4_portrait");
    expect(resolved.variant).toBe("minimal");
  });
});
