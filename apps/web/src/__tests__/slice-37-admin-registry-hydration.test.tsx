import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  getSectionType,
  resetSectionTypesForTests,
  builtInSectionTypes,
  type SectionTypeSchema,
} from "@proposal/shared";
import { AdminDashboard } from "../ui/admin/AdminDashboard";

// An AUTHORED (non-built-in) cover type with an image field — the user's scenario.
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

const props = {
  sectionTypes: [...builtInSectionTypes, coverType],
  inUse: [] as string[],
  currentUserId: "u1",
  templates: [],
  inUseTemplates: [] as string[],
  aiModel: "claude-sonnet-4-6" as const,
};

beforeEach(() => {
  // Start from built-ins ONLY — production never manually seeds the authored type;
  // the AdminDashboard itself must hydrate the registry.
  resetSectionTypesForTests();
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
});

describe("AdminDashboard hydrates the shared section-type registry", () => {
  it("makes authored types (with their fields) resolvable via getSectionType", () => {
    expect(getSectionType("cover_page")).toBeUndefined(); // precondition: not built-in
    render(<AdminDashboard {...props} />);
    const resolved = getSectionType("cover_page");
    expect(resolved).toBeDefined();
    expect(resolved?.fields.map((f) => f.key)).toContain("hero");
    expect(resolved?.fields.find((f) => f.key === "hero")?.type).toBe("image");
  });
});
