// apps/web/src/__tests__/slice-11-section-types-get.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { GET } from "../../app/api/section-types/route";

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
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
  invalidateActiveRegistry();
});

describe("GET /api/section-types", () => {
  it("401s when unauthenticated", async () => {
    setOwnerResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);
  });

  it("returns built-ins plus authored types", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    invalidateActiveRegistry();
    const body = (await (await GET()).json()) as { sectionTypes: SectionTypeSchema[] };
    const keys = body.sectionTypes.map((t) => t.type);
    expect(keys).toContain("executive_summary");
    expect(keys).toContain("case_study");
  });
});
