// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { DuplicateEmailError, type Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

async function seed(email: string, opts: { isAdmin?: boolean; disabled?: boolean } = {}) {
  const u = await repo.createUser({ email, passwordHash: "h", isAdmin: opts.isAdmin ?? false });
  if (opts.disabled) await repo.setUserDisabled(u.id, true);
  return u;
}

describe("repo user management", () => {
  it("lists users without password hashes, oldest first", async () => {
    await seed("a@x.test", { isAdmin: true });
    await seed("b@x.test");
    const list = await repo.listUsers();
    expect(list.map((u) => u.email)).toEqual(["a@x.test", "b@x.test"]);
    expect(list[0]).not.toHaveProperty("passwordHash");
    expect(list[0]!.isAdmin).toBe(true);
    expect(list[0]!.disabled).toBe(false);
  });

  it("rejects a duplicate email (case-insensitive)", async () => {
    await seed("Owner@X.test");
    await expect(repo.createUser({ email: "owner@x.test", passwordHash: "h" })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it("toggles disabled and admin, returning a summary; null for unknown id", async () => {
    const u = await seed("a@x.test");
    expect((await repo.setUserDisabled(u.id, true))?.disabled).toBe(true);
    expect((await repo.setUserAdmin(u.id, true))?.isAdmin).toBe(true);
    expect(await repo.setUserDisabled("nope", true)).toBeNull();
    expect(await repo.setUserAdmin("nope", true)).toBeNull();
  });

  it("sets a password by id; false for unknown id", async () => {
    const u = await seed("a@x.test");
    expect(await repo.setUserPassword(u.id, "newhash")).toBe(true);
    expect((await repo.getUserById(u.id))?.passwordHash).toBe("newhash");
    expect(await repo.setUserPassword("nope", "x")).toBe(false);
  });

  it("counts only active admins (isAdmin && !disabled)", async () => {
    await seed("a@x.test", { isAdmin: true });
    await seed("b@x.test", { isAdmin: true, disabled: true });
    await seed("c@x.test");
    expect(await repo.countActiveAdmins()).toBe(1);
  });
});
