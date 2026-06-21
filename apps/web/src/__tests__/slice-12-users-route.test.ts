// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { GET, POST } from "../../app/api/users/route";

const post = (body: unknown) =>
  new Request("http://x/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let admin = true;
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  admin = true;
  setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: admin }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("GET /api/users", () => {
  it("401s unauth, 403s non-admin, lists for admin without hashes", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);

    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: false }));
    expect((await GET()).status).toBe(403);

    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: true }));
    await getRepo().createUser({ email: "a@x.test", passwordHash: "h" });
    const body = (await (await GET()).json()) as { users: Array<Record<string, unknown>> };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).not.toHaveProperty("passwordHash");
  });
});

describe("POST /api/users", () => {
  it("creates an account (201) and stores a hash, not the plaintext", async () => {
    const res = await POST(post({ email: "New@X.test", password: "longenough", isAdmin: true }));
    expect(res.status).toBe(201);
    const stored = await getRepo().getUserByEmail("new@x.test");
    expect(stored?.isAdmin).toBe(true);
    expect(stored?.passwordHash).not.toContain("longenough");
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: false }));
    expect((await POST(post({ email: "a@x.test", password: "longenough" }))).status).toBe(403);
  });

  it("400s an invalid email or a short password", async () => {
    expect((await POST(post({ email: "nope", password: "longenough" }))).status).toBe(400);
    expect((await POST(post({ email: "a@x.test", password: "short" }))).status).toBe(400);
  });

  it("409s a duplicate email", async () => {
    await POST(post({ email: "dup@x.test", password: "longenough" }));
    expect((await POST(post({ email: "dup@x.test", password: "longenough" }))).status).toBe(409);
  });
});
