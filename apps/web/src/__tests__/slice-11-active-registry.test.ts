// apps/web/src/__tests__/slice-11-active-registry.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getSectionType,
  resetSectionTypesForTests,
  type SectionTypeSchema,
} from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import {
  getMergedSectionTypes,
  invalidateActiveRegistry,
  refreshActiveRegistry,
} from "../server/registry/activeRegistry";

const def: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [],
  schemaVersion: 1,
};

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  resetSectionTypesForTests();
});
afterEach(() => {
  setRepoForTests(null);
  resetSectionTypesForTests();
});

describe("server active-registry hydration", () => {
  it("merges authored rows (incl. deprecation overlay) into the shared registry", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    await getRepo().upsertSectionType({ type: "text", definition: null, deprecated: true }); // overlay
    await refreshActiveRegistry();
    expect(getSectionType("case_study")?.label).toBe("Case study");
    expect(getSectionType("text")?.deprecated).toBe(true); // built-in flagged deprecated
  });

  it("caches until invalidated", async () => {
    const first = await getMergedSectionTypes();
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    expect((await getMergedSectionTypes()).some((t) => t.type === "case_study")).toBe(false); // cached
    invalidateActiveRegistry();
    expect((await getMergedSectionTypes()).some((t) => t.type === "case_study")).toBe(true);
  });
});
