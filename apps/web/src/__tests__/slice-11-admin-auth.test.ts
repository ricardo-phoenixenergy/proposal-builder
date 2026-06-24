// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { hashPassword } from "../server/auth/password";
import { authenticateUser } from "../server/auth/credentials";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("admin flag through authentication", () => {
  it("defaults isAdmin to false and surfaces it on auth", async () => {
    await getRepo().createUser({ email: "u@x.test", passwordHash: hashPassword("pw") });
    const user = await authenticateUser("u@x.test", "pw");
    expect(user?.isAdmin).toBe(false);
  });

  it("carries isAdmin true when created as admin", async () => {
    await getRepo().createUser({
      email: "a@x.test",
      passwordHash: hashPassword("pw"),
      isAdmin: true,
    });
    expect((await authenticateUser("a@x.test", "pw"))?.isAdmin).toBe(true);
  });
});
