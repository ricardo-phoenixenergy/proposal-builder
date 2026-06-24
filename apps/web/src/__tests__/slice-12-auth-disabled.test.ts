// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../server/auth/password";
import { authenticateUser } from "../server/auth/credentials";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("authenticateUser — disabled accounts", () => {
  it("rejects a disabled account even with the correct password", async () => {
    const u = await getRepo().createUser({
      email: "a@x.test",
      passwordHash: await hashPassword("hunter2longpw"),
    });
    await getRepo().setUserDisabled(u.id, true);
    expect(await authenticateUser("a@x.test", "hunter2longpw")).toBeNull();
  });

  it("still authenticates an enabled account", async () => {
    await getRepo().createUser({
      email: "b@x.test",
      passwordHash: await hashPassword("hunter2longpw"),
    });
    expect((await authenticateUser("b@x.test", "hunter2longpw"))?.email).toBe("b@x.test");
  });
});
