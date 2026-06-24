import { afterEach, describe, expect, it } from "vitest";
import {
  builtInSectionTypes,
  getSectionType,
  listSectionTypes,
  resetSectionTypesForTests,
  sectionTypeRevision,
  setActiveSectionTypes,
} from "./sectionTypes";
import { validateSection } from "../validation/validateSection";

afterEach(() => resetSectionTypesForTests());

const caseStudy = {
  type: "case_study",
  label: "Case study",
  category: "text" as const,
  fields: [
    { key: "body", type: "paragraph" as const, label: "Body", required: true, maxChars: 1000 },
  ],
  variants: [],
  schemaVersion: 1,
};

describe("active section-type registry", () => {
  it("starts with the built-ins", () => {
    expect(getSectionType("executive_summary")).toBeDefined();
    expect(getSectionType("case_study")).toBeUndefined();
  });

  it("adds authored types and bumps the revision", () => {
    const before = sectionTypeRevision();
    setActiveSectionTypes([caseStudy]);
    expect(sectionTypeRevision()).toBeGreaterThan(before);
    expect(getSectionType("case_study")?.label).toBe("Case study");
    expect(getSectionType("executive_summary")).toBeDefined(); // built-ins still present
  });

  it("authored type overrides a built-in by key", () => {
    const base = builtInSectionTypes[0]!;
    setActiveSectionTypes([{ ...base, type: "text", label: "Custom text" }]);
    expect(getSectionType("text")?.label).toBe("Custom text");
  });

  it("listSectionTypes hides deprecated by default", () => {
    setActiveSectionTypes([{ ...caseStudy, deprecated: true }]);
    expect(listSectionTypes().some((t) => t.type === "case_study")).toBe(false);
    expect(listSectionTypes({ includeDeprecated: true }).some((t) => t.type === "case_study")).toBe(
      true,
    );
  });

  it("validateSection picks up an authored type after hydration", () => {
    setActiveSectionTypes([caseStudy]);
    const ok = validateSection({ id: "s1", type: "case_study", data: { body: "hello" } });
    expect(ok.valid).toBe(true);
    const bad = validateSection({ id: "s2", type: "case_study", data: {} }); // missing required body
    expect(bad.valid).toBe(false);
  });
});
