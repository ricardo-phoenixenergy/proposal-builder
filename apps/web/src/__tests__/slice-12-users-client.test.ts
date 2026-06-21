// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUsers, createUser, updateUser, setUserPassword } from "../client/users";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const err = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const summary = { id: "u1", email: "a@x.test", isAdmin: false, disabled: false, createdAt: "2026-01-01T00:00:00.000Z" };

describe("client/users", () => {
  it("fetchUsers unwraps { users }", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok({ users: [summary] })));
    expect(await fetchUsers()).toEqual([summary]);
  });

  it("createUser posts and returns the new summary", async () => {
    const f = vi.fn(() => ok({ user: summary }));
    vi.stubGlobal("fetch", f);
    expect(await createUser({ email: "a@x.test", password: "longenough", isAdmin: false })).toEqual(summary);
    expect(f).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" }));
  });

  it("updateUser PATCHes and returns the summary", async () => {
    const f = vi.fn(() => ok({ user: { ...summary, disabled: true } }));
    vi.stubGlobal("fetch", f);
    expect((await updateUser("u1", { disabled: true })).disabled).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/users/u1", expect.objectContaining({ method: "PATCH" }));
  });

  it("throws the server error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => err(409, { error: "dup" })));
    await expect(createUser({ email: "a@x.test", password: "longenough", isAdmin: false })).rejects.toThrow("dup");
  });

  it("setUserPassword posts to the password sub-route", async () => {
    const f = vi.fn(() => ok({ ok: true }));
    vi.stubGlobal("fetch", f);
    await setUserPassword("u1", "brandnewpw");
    expect(f).toHaveBeenCalledWith("/api/users/u1/password", expect.objectContaining({ method: "POST" }));
  });
});
