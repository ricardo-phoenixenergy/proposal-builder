// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getSessionUser, setSessionUserResolverForTests } from "../server/auth/sessionUser";
import {
  invalidateUserActiveCache,
  resetUserActiveCacheForTests,
} from "../server/auth/sessionUser";

// Stub the NextAuth session to a fixed user id; the disabled-check is what we test.
vi.mock("../../auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", isAdmin: false } })),
}));

beforeEach(async () => {
  setRepoForTests(createMemoryRepo());
  setSessionUserResolverForTests(null); // use the REAL fromNextAuth resolver
  resetUserActiveCacheForTests();
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  resetUserActiveCacheForTests();
});

describe("session revocation on disable", () => {
  it("resolves an active user, then returns null once disabled (cache invalidated)", async () => {
    const u = await getRepo().createUser({ email: "u1@x.com", passwordHash: "h", isAdmin: false });
    // The mocked auth() returns id "u1"; align the created id for the lookup.
    await getRepo().setUserDisabled(u.id, false);
    // Point the mock at the real id:
    const { auth } = await import("../../auth");
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: u.id, isAdmin: false },
    });

    expect(await getSessionUser()).toMatchObject({ id: u.id });

    await getRepo().setUserDisabled(u.id, true);
    invalidateUserActiveCache(u.id);
    expect(await getSessionUser()).toBeNull();
  });
});
