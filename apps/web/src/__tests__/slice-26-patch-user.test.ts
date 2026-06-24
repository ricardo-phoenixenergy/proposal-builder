// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("repo.patchUser", () => {
  it("applies isAdmin and disabled in a single call", async () => {
    const u = await getRepo().createUser({ email: "a@x.com", passwordHash: "h", isAdmin: false });
    const updated = await getRepo().patchUser(u.id, { isAdmin: true, disabled: true });
    expect(updated).toMatchObject({ id: u.id, isAdmin: true, disabled: true });
    const reread = await getRepo().getUserById(u.id);
    expect(reread).toMatchObject({ isAdmin: true, disabled: true });
  });

  it("returns null for an unknown id", async () => {
    expect(await getRepo().patchUser("nope", { disabled: true })).toBeNull();
  });
});
