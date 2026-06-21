// apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { POST } from "../../app/api/section-types/[type]/deprecate/route";

const def: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};
const ctx = (type: string) => ({ params: Promise.resolve({ type }) });
const post = (deprecated: boolean) =>
  new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deprecated }) });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveRegistry();
});

describe("POST /api/section-types/[type]/deprecate", () => {
  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(true), ctx("case_study"))).status).toBe(403);
  });

  it("deprecates an authored type", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const res = await POST(post(true), ctx("case_study"));
    expect(res.status).toBe(200);
    expect((await getRepo().listSectionTypeRows())[0]!.deprecated).toBe(true);
  });

  it("deprecates a built-in via overlay row", async () => {
    const res = await POST(post(true), ctx("text"));
    expect(res.status).toBe(200);
  });

  it("404s un-deprecating an unknown key", async () => {
    expect((await POST(post(false), ctx("ghost"))).status).toBe(404);
  });
});
