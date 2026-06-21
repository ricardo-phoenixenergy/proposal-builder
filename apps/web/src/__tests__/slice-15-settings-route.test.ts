// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { GET, PUT } from "../../app/api/admin/settings/route";

const put = (body: unknown) =>
  new Request("http://x/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("/api/admin/settings", () => {
  it("GET returns the default when unset", async () => {
    const body = (await (await GET()).json()) as { aiModel: string };
    expect(body.aiModel).toBe("claude-opus-4-8");
  });

  it("PUT sets a selectable model and GET reflects it", async () => {
    expect((await PUT(put({ aiModel: "claude-sonnet-4-6" }))).status).toBe(200);
    const body = (await (await GET()).json()) as { aiModel: string };
    expect(body.aiModel).toBe("claude-sonnet-4-6");
  });

  it("PUT 400s a non-selectable model", async () => {
    expect((await PUT(put({ aiModel: "gpt-4o" }))).status).toBe(400);
  });

  it("403s a non-admin and 401s when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await GET()).status).toBe(403);
    setSessionUserResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);
  });
});
