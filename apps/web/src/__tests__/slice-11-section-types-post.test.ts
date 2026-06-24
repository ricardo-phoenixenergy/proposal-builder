// apps/web/src/__tests__/slice-11-section-types-post.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { POST } from "../../app/api/section-types/route";

const def: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true, maxWords: 200 }],
  variants: [],
  schemaVersion: 1,
};
const post = (body: unknown) =>
  new Request("http://x/api/section-types", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let admin = true;
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  admin = true;
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: admin }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveRegistry();
});

describe("POST /api/section-types", () => {
  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(def))).status).toBe(403);
  });

  it("401s when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await POST(post(def))).status).toBe(401);
  });

  it("creates a valid type", async () => {
    const res = await POST(post(def));
    expect(res.status).toBe(201);
    expect((await getRepo().listSectionTypeRows()).map((r) => r.type)).toContain("case_study");
  });

  it("400s an invalid definition", async () => {
    expect((await POST(post({ ...def, fields: [] }))).status).toBe(400);
  });

  it("409s a duplicate key (built-in or existing authored)", async () => {
    expect((await POST(post({ ...def, type: "executive_summary" }))).status).toBe(409);
    await POST(post(def));
    expect((await POST(post(def))).status).toBe(409);
  });
});
