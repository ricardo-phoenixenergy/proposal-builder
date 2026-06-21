// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../server/auth/password";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { POST } from "../../app/api/users/[id]/password/route";

const post = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/users/${id}/password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("POST /api/users/[id]/password", () => {
  it("resets the password (200) and stores a verifiable hash", async () => {
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = post(u.id, { password: "brandnewpw" });
    expect((await POST(req, ctx)).status).toBe(200);
    const stored = await getRepo().getUserById(u.id);
    expect(verifyPassword("brandnewpw", stored!.passwordHash)).toBe(true);
  });

  it("400s a short password", async () => {
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = post(u.id, { password: "short" });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it("404s an unknown id", async () => {
    const { req, ctx } = post("ghost", { password: "brandnewpw" });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "actor", isAdmin: false }));
    const { req, ctx } = post("any", { password: "brandnewpw" });
    expect((await POST(req, ctx)).status).toBe(403);
  });
});
