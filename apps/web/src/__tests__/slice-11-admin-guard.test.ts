// apps/web/src/__tests__/slice-11-admin-guard.test.ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { requireAdmin } from "../server/auth/guard";
import { getOwner } from "../server/auth/owner";

afterEach(() => setSessionUserResolverForTests(null));

describe("requireAdmin", () => {
  it("401s when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => null);
    const r = await requireAdmin();
    expect(r instanceof Response && r.status).toBe(401);
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    const r = await requireAdmin();
    expect(r instanceof Response && r.status).toBe(403);
  });

  it("returns the owner id for an admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
    expect(await requireAdmin()).toBe("u1");
  });

  it("getOwner still returns the id via the same seam", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u9", isAdmin: false }));
    expect(await getOwner()).toBe("u9");
  });
});
