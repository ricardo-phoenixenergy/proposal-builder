// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { PATCH } from "../../app/api/users/[id]/route";

const patch = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

let actorId = "actor";
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  actorId = "actor";
  setSessionUserResolverForTests(async () => ({ id: actorId, isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("PATCH /api/users/[id]", () => {
  it("disables and re-enables another user", async () => {
    await getRepo().createUser({ email: "admin@x.test", passwordHash: "h", isAdmin: true }); // keeps an active admin
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = patch(u.id, { disabled: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { disabled: boolean } }).user.disabled).toBe(true);
  });

  it("promotes and demotes another user", async () => {
    await getRepo().createUser({ email: "admin@x.test", passwordHash: "h", isAdmin: true });
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const up = patch(u.id, { isAdmin: true });
    expect(((await (await PATCH(up.req, up.ctx)).json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true);
  });

  it("400s an empty change body", async () => {
    const u = await getRepo().createUser({ email: "u@x.test", passwordHash: "h" });
    const { req, ctx } = patch(u.id, {});
    expect((await PATCH(req, ctx)).status).toBe(400);
  });

  it("404s an unknown id", async () => {
    await getRepo().createUser({ email: "admin@x.test", passwordHash: "h", isAdmin: true });
    const { req, ctx } = patch("ghost", { disabled: true });
    expect((await PATCH(req, ctx)).status).toBe(404);
  });

  it("409s disabling your own account (self-lockout)", async () => {
    const me = await getRepo().createUser({ email: "me@x.test", passwordHash: "h", isAdmin: true });
    await getRepo().createUser({ email: "other@x.test", passwordHash: "h", isAdmin: true });
    actorId = me.id;
    const { req, ctx } = patch(me.id, { disabled: true });
    expect((await PATCH(req, ctx)).status).toBe(409);
  });

  it("409s demoting the only active admin", async () => {
    const a = await getRepo().createUser({ email: "a@x.test", passwordHash: "h", isAdmin: true });
    // actor is a separate (non-persisted) identity, so `a` is the sole active admin
    const { req, ctx } = patch(a.id, { isAdmin: false });
    expect((await PATCH(req, ctx)).status).toBe(409);
  });
});
